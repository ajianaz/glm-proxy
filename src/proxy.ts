import type { ApiKey } from './types.js';
import { getModelForKey } from './validator.js';
import { updateApiKeyUsage } from './storage.js';

const ZAI_API_BASE = 'https://api.z.ai/api/coding/paas/v4';
const ZAI_API_KEY = process.env.ZAI_API_KEY;

export interface ProxyOptions {
  apiKey: ApiKey;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface ProxyResult {
  success: boolean;
  status: number;
  headers: Record<string, string>;
  body: string;
  tokensUsed?: number;
}

export async function proxyRequest(options: ProxyOptions): Promise<ProxyResult> {
  const { apiKey, path, method, headers, body } = options;

  // Runtime check for ZAI_API_KEY
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
  const targetUrl = `${ZAI_API_BASE}${path}`;

  // Prepare headers for Z.AI
  const proxyHeaders: Record<string, string> = {
    'Authorization': `Bearer ${ZAI_API_KEY}`,
    'Content-Type': 'application/json',
  };

  // Forward relevant headers
  const forwardHeaders = ['content-type', 'accept', 'user-agent'];
  for (const h of forwardHeaders) {
    const key = Object.keys(headers).find(k => k.toLowerCase() === h);
    if (key && key !== 'authorization') {
      proxyHeaders[key] = headers[key];
    }
  }

  // Inject/override model in request body
  let processedBody = body;
  let tokensUsed = 0;

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    try {
      const bodyJson = JSON.parse(body);

      // Inject model for chat/completions endpoint
      if (path.includes('/chat/completions') || path.includes('/completions')) {
        bodyJson.model = model;
      }

      processedBody = JSON.stringify(bodyJson);
    } catch (e) {
      // Body not JSON, leave as-is
    }
  }

  // Make request to Z.AI
  try {
    const response = await fetch(targetUrl, {
      method,
      headers: proxyHeaders,
      body: processedBody,
    });

    // Get response body
    const responseBody = await response.text();

    // Extract token usage from response
    if (response.ok) {
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
      } catch (e) {
        // Response not JSON or no usage field
      }
    }

    // Build response headers
    const responseHeaders: Record<string, string> = {
      'content-type': response.headers.get('content-type') || 'application/json',
    };

    return {
      success: response.ok,
      status: response.status,
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
