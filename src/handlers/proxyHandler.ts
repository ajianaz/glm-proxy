import type { Context } from 'hono';
import type { ApiKey } from '../types.js';
import type { AuthContext } from '../middleware/auth.js';
import type { ProfilingContext } from '../middleware/profiling.js';

// Result type from proxy functions
export interface ProxyResult {
  success: boolean;
  status: number;
  headers: Record<string, string>;
  body: string | ReadableStream<Uint8Array>;
  tokensUsed?: number;
  streamed?: boolean;
}

// Proxy function signature
export type ProxyFunction = (options: {
  apiKey: ApiKey;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string | ReadableStream<Uint8Array> | null;
}) => Promise<ProxyResult>;

/**
 * Create a proxy handler from a proxy function
 *
 * Optimizations:
 * - Single profiler lookup and null check
 * - Batched profiler metadata additions
 * - Cached context values to avoid repeated lookups
 * - Conditional profiler operations
 */
export function createProxyHandler(proxyFn: ProxyFunction) {
  return async (c: Context<{ Variables: AuthContext & ProfilingContext }>) => {
    // Get all context values upfront (single lookup)
    const apiKey: ApiKey = c.get('apiKey');
    const profiler = c.get('profiler');
    const path = c.req.path;
    const method = c.req.method;

    // Start proxy profiling (only if enabled)
    if (profiler) {
      profiler.mark('proxy_start');
      profiler.addMetadata('targetModel', apiKey.model || 'default');
    }

    // Extract headers (single pass)
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Extract body - support streaming
    if (profiler) {
      profiler.mark('body_extraction');
    }

    const useStreaming = !!c.req.raw.body;
    const body = c.req.raw.body || null;

    if (profiler) {
      profiler.endMark('body_extraction');
      profiler.addMetadata('bodySize', typeof body === 'string' ? body.length : 'stream');
      profiler.addMetadata('streaming', useStreaming);
    }

    // Call proxy function
    if (profiler) {
      profiler.mark('upstream_request');
    }

    const result = await proxyFn({
      apiKey,
      path,
      method,
      headers,
      body,
    });

    if (profiler) {
      profiler.endMark('upstream_request');
      // Batch all metadata additions
      profiler.addMetadata('upstreamStatus', result.status);
      profiler.addMetadata('upstreamSuccess', result.success);
      profiler.addMetadata('responseStreamed', result.streamed ?? false);
      if (result.tokensUsed) {
        profiler.addMetadata('tokensUsed', result.tokensUsed);
      }
    }

    // Set response headers
    if (profiler) {
      profiler.mark('response_build');
    }

    Object.entries(result.headers).forEach(([key, value]) => {
      c.header(key, value);
    });

    if (profiler) {
      profiler.endMark('response_build');
      profiler.endMark('proxy_start');
    }

    // Return response (stream or buffer)
    if (result.streamed && result.body instanceof ReadableStream) {
      return new Response(result.body, {
        status: result.status,
        headers: result.headers as any,
      });
    } else {
      return c.body(result.body as string, result.status as any);
    }
  };
}
