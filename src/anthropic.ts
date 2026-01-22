import type { ApiKey } from './types.js';
import { getModelForKey } from './validator.js';
import { updateApiKeyUsage } from './storage.js';
import { getAnthropicPool } from './pool/PoolManager.js';
import { injectModel, extractTokens } from './json/index.js';

const ZAI_ANTHROPIC_BASE = 'https://open.bigmodel.cn/api/anthropic';

export interface AnthropicProxyOptions {
  apiKey: ApiKey;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string | ReadableStream<Uint8Array> | null;
}

export interface AnthropicProxyResult {
  success: boolean;
  status: number;
  headers: Record<string, string>;
  body: string | ReadableStream<Uint8Array>;
  tokensUsed?: number;
  streamed?: boolean;
}

export async function proxyAnthropicRequest(options: AnthropicProxyOptions): Promise<AnthropicProxyResult> {
  const { apiKey, path, method, headers, body } = options;

  // Runtime check for ZAI_API_KEY
  if (!process.env.ZAI_API_KEY) {
    return {
      success: false,
      status: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: {
          message: 'ZAI_API_KEY environment variable is not configured',
          type: 'configuration_error',
        },
      }),
      tokensUsed: 0,
    };
  }

  const model = getModelForKey(apiKey);

  // Build target URL for Anthropic API
  // Path will be /v1/messages, so we use it directly
  const targetUrl = `${ZAI_ANTHROPIC_BASE}${path}`;

  // Prepare headers for Z.AI Anthropic API
  const proxyHeaders: Record<string, string> = {
    'x-api-key': process.env.ZAI_API_KEY,
    'anthropic-version': headers['anthropic-version'] || '2023-06-01',
  };

  // Forward relevant headers from client (but not x-api-key)
  const forwardHeaders = ['content-type', 'accept', 'user-agent'];
  for (const h of forwardHeaders) {
    const key = Object.keys(headers).find(k => k.toLowerCase() === h);
    if (key) {
      proxyHeaders[key] = headers[key];
    }
  }

  // Inject/override model in request body
  let processedBody: string | ReadableStream<Uint8Array> | null = body;
  let tokensUsed = 0;

  // For non-streaming requests with body, inject model
  if (body && typeof body === 'string' && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    try {
      // Use optimized model injection (avoids full parse+stringify cycle)
      const injectionResult = injectModel(body, model);

      // Only use modified body if injection was successful
      if (injectionResult.modified) {
        processedBody = injectionResult.json;
      }
    } catch {
      // Body not JSON or injection failed, leave as-is
    }
  }
  // For streaming bodies, we can't easily inject model without buffering
  // In production, you'd want to use a streaming JSON transformer
  // For now, we pass the stream through without modification

  // Make request to Z.AI
  try {
    let responseBody: string | ReadableStream<Uint8Array>;
    let statusCode: number;
    let responseHeaders: Record<string, string>;
    let contentType: string | null;

    // Enable streaming for streaming request bodies
    const useStreaming = typeof processedBody !== 'string' && processedBody instanceof ReadableStream;

    // Try connection pool first, fall back to regular fetch
    if (process.env.DISABLE_CONNECTION_POOL !== 'true') {
      try {
        const pool = getAnthropicPool();

        const pooledResponse = await pool.request({
          method,
          path,
          headers: proxyHeaders,
          body: processedBody,
          timeout: 30000,
          streamResponse: useStreaming, // Enable streaming response for streaming requests
        });

        responseBody = pooledResponse.body;
        statusCode = pooledResponse.status;
        responseHeaders = pooledResponse.headers;
        contentType = responseHeaders['content-type'] || null;

        // Mark if response is streamed
        if (pooledResponse.streamed) {
          return {
            success: statusCode >= 200 && statusCode < 300,
            status: statusCode,
            headers: responseHeaders,
            body: responseBody as ReadableStream<Uint8Array>,
            streamed: true,
          };
        }
      } catch (poolError) {
        // Pool failed, fall back to regular fetch
        const response = await fetch(targetUrl, {
          method,
          headers: proxyHeaders,
          body: processedBody,
          // @ts-ignore - Bun supports duplex for streaming
          duplex: 'half',
        });

        // For streaming requests, stream the response
        if (useStreaming && response.body) {
          return {
            success: response.ok,
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            body: response.body,
            streamed: true,
          };
        }

        responseBody = await response.text();
        statusCode = response.status;
        contentType = response.headers.get('content-type');
        responseHeaders = {
          'content-type': contentType || 'application/json',
        };
      }
    } else {
      // Connection pool disabled via env var, use regular fetch
      const response = await fetch(targetUrl, {
        method,
        headers: proxyHeaders,
        body: processedBody,
        // @ts-ignore - Bun supports duplex for streaming
        duplex: 'half',
      });

      // For streaming requests, stream the response
      if (useStreaming && response.body) {
        return {
          success: response.ok,
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: response.body,
          streamed: true,
        };
      }

      responseBody = await response.text();
      statusCode = response.status;
      contentType = response.headers.get('content-type');
      responseHeaders = {
        'content-type': contentType || 'application/json',
      };
    }

    // Handle streaming response
    if (contentType?.includes('text/event-stream')) {
      responseHeaders['content-type'] = 'text/event-stream';
    }

    // Extract token usage from response (only for non-streaming responses)
    if (typeof responseBody === 'string' && statusCode >= 200 && statusCode < 300) {
      try {
        // Use optimized token extraction (avoids full parse when possible)
        const tokenResult = extractTokens(responseBody);

        if (tokenResult.tokensUsed !== null && tokenResult.tokensUsed > 0) {
          tokensUsed = tokenResult.tokensUsed;

          // Don't await - fire and forget for performance
          updateApiKeyUsage(apiKey.key, tokensUsed, model).catch(console.error);
        }
      } catch {
        // Response not JSON or no usage field
      }
    }

    return {
      success: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      headers: responseHeaders,
      body: responseBody,
      tokensUsed,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      status: 502,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: {
          message: `Upstream request failed: ${errorMessage}`,
          type: 'upstream_error',
        },
      }),
      tokensUsed: 0,
    };
  }
}
