import type { Context } from 'hono';
import type { ApiKey } from '../types.js';
import type { AuthContext } from '../middleware/auth.js';

// Result type from proxy functions
export interface ProxyResult {
  success: boolean;
  status: number;
  headers: Record<string, string>;
  body: string;
  tokensUsed?: number;
}

// Proxy function signature
export type ProxyFunction = (options: {
  apiKey: ApiKey;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}) => Promise<ProxyResult>;

// Create a proxy handler from a proxy function
export function createProxyHandler(proxyFn: ProxyFunction) {
  return async (c: Context<{ Variables: AuthContext }>) => {
    const apiKey: ApiKey = c.get('apiKey');
    const path = c.req.path;
    const method = c.req.method;

    // Extract headers
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Extract body
    const body = c.req.raw.body ? await c.req.text() : null;

    // Call proxy function
    const result = await proxyFn({
      apiKey,
      path,
      method,
      headers,
      body,
    });

    // Set response headers
    Object.entries(result.headers).forEach(([key, value]) => {
      c.header(key, value);
    });

    return c.body(result.body, result.status as any);
  };
}
