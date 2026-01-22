import type { Context, Next } from 'hono';
import { validateApiKey } from '../validator.js';
import type { ApiKey } from '../types.js';
import type { ProfilingContext } from './profiling.js';
import { Profiler } from '../profiling/Profiler.js';

export type AuthContext = {
  apiKey: ApiKey;
  _cachedApiKeyHeader?: string;
};

// Extract API key from headers - optimized with single lookup
export function extractApiKey(headers: Headers): string | undefined {
  const authHeader = headers.get('authorization');
  if (authHeader) {
    // Fast path for Bearer token (case-insensitive)
    const bearerIndex = authHeader.toLowerCase().indexOf('bearer ');
    if (bearerIndex === 0) {
      return authHeader.slice(7);
    }
  }
  // Fallback to x-api-key
  return headers.get('x-api-key') || undefined;
}

/**
 * Auth middleware - validates API key and attaches to context
 *
 * Optimizations:
 * - Single profiler lookup and null check
 * - Early exit on auth failure
 * - Cached API key header in context for reuse
 * - Minimal profiler operations
 */
export async function authMiddleware(c: Context<{ Variables: AuthContext & ProfilingContext }>, next: Next) {
  // Extract API key (single header lookup)
  const apiKeyHeader = extractApiKey(c.req.raw.headers);

  // Cache in context for potential reuse
  c.set('_cachedApiKeyHeader', apiKeyHeader);

  // Get profiler once (uses lazy initialization from profilingMiddleware)
  const profiler = c.get('profiler');

  // Mark auth start (only if profiler is enabled)
  if (profiler) {
    profiler.mark('auth_start');
  }

  // Validate API key
  const validation = await validateApiKey(apiKeyHeader);

  // Early exit on auth failure
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

  // Mark auth success (only if profiler is enabled)
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
