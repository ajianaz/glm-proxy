import type { Context, Next } from 'hono';
import { validateApiKey } from '../validator.js';
import type { ApiKey } from '../types.js';

export type AuthContext = {
  apiKey: ApiKey;
};

// Extract API key from headers
export function extractApiKey(headers: Headers): string | undefined {
  return headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
         headers.get('x-api-key') || undefined;
}

// Auth middleware - validates API key and attaches to context
export async function authMiddleware(c: Context<{ Variables: AuthContext }>, next: Next) {
  const apiKeyHeader = extractApiKey(c.req.raw.headers);

  const validation = await validateApiKey(apiKeyHeader);
  if (!validation.valid) {
    return c.json({ error: validation.error }, validation.statusCode as any);
  }

  // Attach validated API key to context
  c.set('apiKey', validation.apiKey!);
  await next();
}

// Helper to get API key from context
export function getApiKeyFromContext(c: Context<{ Variables: AuthContext }>): ApiKey {
  return c.get('apiKey');
}
