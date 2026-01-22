import type { ApiKey } from './types.js';
import { getModelForKey } from './validator.js';
import { updateApiKeyUsage } from './storage.js';
import { getZaiPool } from './pool/PoolManager.js';

const ZAI_API_BASE = process.env.ZAI_API_BASE || 'https://api.z.ai/api/coding/paas/v4';

export interface ProxyOptions {
  apiKey: ApiKey;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string | ReadableStream<Uint8Array> | null;
}

export interface ProxyResult {
  success: boolean;
  status: number;
  headers: Record<string, string>;
  body: string | ReadableStream<Uint8Array>;
  tokensUsed?: number;
  streamed?: boolean;
}

export async function proxyRequest(options: ProxyOptions): Promise<ProxyResult> {
  const { apiKey, path, method, headers, body } = options;

  // Runtime check for ZAI_API_KEY
  const ZAI_API_KEY = process.env.ZAI_API_KEY;
  if (!ZAI_API_KEY) {
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

  // Build target URL
  // Z.AI uses /v4 base, OpenAI compatibility but without /v1 prefix
  // e.g., /v1/chat/completions -> /chat/completions -> /v4/chat/completions
  const cleanPath = path.startsWith('/v1/') ? path.substring(4) : path;
  const slash = cleanPath.startsWith('/') ? '' : '/';
  const targetUrl = `${ZAI_API_BASE}${slash}${cleanPath}`;

  // Prepare headers for Z.AI - always forward Authorization with master key
  const proxyHeaders: Record<string, string> = {
    'Authorization': `Bearer ${process.env.ZAI_API_KEY}`,
  };

  // Forward relevant headers from client (but not Authorization)
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
      const bodyJson = JSON.parse(body);

      // Inject model for chat/completions endpoint
      if (path.includes('/chat/completions') || path.includes('/completions')) {
        bodyJson.model = model;
      }

      processedBody = JSON.stringify(bodyJson);
    } catch {
      // Body not JSON, leave as-is
    }
  }
  // For streaming bodies, we can't easily inject model without buffering
  // In production, you'd want to use a streaming JSON transformer
  // For now, we pass the stream through without modification

  // Make request to Z.AI
  try {
    let responseBody: string;
    let statusCode: number;
    let responseHeaders: Record<string, string>;

    // Try connection pool first, fall back to regular fetch
    // Enable streaming for non-streaming request bodies
    const useStreaming = typeof processedBody !== 'string' && processedBody instanceof ReadableStream;

    if (process.env.DISABLE_CONNECTION_POOL !== 'true') {
      try {
        const pool = getZaiPool();

        // Build the path for the pool (relative to base URL)
        const cleanPath = path.startsWith('/v1/') ? path.substring(4) : path;
        const poolPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

        const pooledResponse = await pool.request({
          method,
          path: poolPath,
          headers: proxyHeaders,
          body: processedBody,
          timeout: 30000,
          streamResponse: useStreaming, // Enable streaming response for streaming requests
        });

        responseBody = pooledResponse.body;
        statusCode = pooledResponse.status;
        responseHeaders = pooledResponse.headers;

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
        responseHeaders = {
          'content-type': response.headers.get('content-type') || 'application/json',
        };
      }
    } else {
      // Connection pool disabled, use regular fetch
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
      responseHeaders = {
        'content-type': response.headers.get('content-type') || 'application/json',
      };
    }

    // Extract token usage from response (only for non-streaming responses)
    if (typeof responseBody === 'string' && statusCode >= 200 && statusCode < 300) {
      try {
        const responseJson = JSON.parse(responseBody);

        // OpenAI format usage
        if (responseJson.usage) {
          tokensUsed = responseJson.usage.total_tokens || 0;
        }

        // Update usage after successful request
        if (tokensUsed > 0) {
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
  } catch (error: any) {
    return {
      success: false,
      status: 502,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: {
          message: `Upstream request failed: ${error.message}`,
          type: 'upstream_error',
        },
      }),
      tokensUsed: 0,
    };
  }
}
