import type { Context, Next } from 'hono';
import { validateApiKey } from '../validator.js';
import type { ApiKey } from '../types.js';
import type { ProfilingContext } from './profiling.js';

export type AuthContext = {
  apiKey: ApiKey;
};

// Extract API key from headers
export function extractApiKey(headers: Headers): string | undefined {
  return headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
         headers.get('x-api-key') || undefined;
}

// Auth middleware - validates API key and attaches to context
export async function authMiddleware(c: Context<{ Variables: AuthContext & ProfilingContext }>, next: Next) {
  const apiKeyHeader = extractApiKey(c.req.raw.headers);

  // Mark auth start if profiler is available
  const profiler = c.get('profiler');
  if (profiler) {
    profiler.mark('auth_start');
  }

  const validation = await validateApiKey(apiKeyHeader);
  if (!validation.valid) {
    if (profiler) {
      profiler.mark('auth_failed');
      profiler.endMark('auth_start');
      profiler.addMetadata('authError', validation.error);
    }
    return c.json({ error: validation.error }, validation.statusCode as any);
  }

  // Attach validated API key to context
  c.set('apiKey', validation.apiKey!);

  // Mark auth success
  if (profiler) {
    profiler.mark('auth_success');
    profiler.endMark('auth_start');
    profiler.addMetadata('apiKey', validation.apiKey!.key.substring(0, 10) + '...');
  }

  await next();
}

// Helper to get API key from context
export function getApiKeyFromContext(c: Context<{ Variables: AuthContext & ProfilingContext }>): ApiKey {
  return c.get('apiKey');
}
