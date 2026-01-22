import type { Context, Next } from 'hono';
import { checkRateLimit } from '../ratelimit.js';
import type { ApiKey } from '../types.js';
import type { AuthContext } from './auth.js';
import type { ProfilingContext } from './profiling.js';

/**
 * Rate limit middleware - checks quota before proceeding
 *
 * Optimizations:
 * - Single profiler lookup and null check
 * - Early exit on rate limit exceeded
 * - Batch profiler metadata additions
 * - Minimal context lookups
 */
export async function rateLimitMiddleware(c: Context<{ Variables: AuthContext & ProfilingContext }>, next: Next) {
  // Get API key from context (cached by auth middleware)
  const apiKey: ApiKey = c.get('apiKey');

  // Get profiler once (uses lazy initialization from profilingMiddleware)
  const profiler = c.get('profiler');

  // Mark rate limit check start (only if profiler is enabled)
  if (profiler) {
    profiler.mark('rate_limit_start');
  }

  // Check rate limit
  const rateLimit = checkRateLimit(apiKey);

  // Early exit if rate limit exceeded
  if (!rateLimit.allowed) {
    if (profiler) {
      profiler.mark('rate_limit_exceeded');
      profiler.endMark('rate_limit_start');
      profiler.addMetadata('rateLimitError', rateLimit.reason);
    }

    // Build headers only if needed
    const headers: Record<string, string> = {};
    if (rateLimit.retryAfter) {
      headers['Retry-After'] = rateLimit.retryAfter.toString();
    }

    return c.json({
      error: {
        message: rateLimit.reason,
        type: 'rate_limit_exceeded',
        tokens_used: rateLimit.tokensUsed,
        tokens_limit: rateLimit.tokensLimit,
        window_ends_at: rateLimit.windowEnd,
      },
    }, 429, headers as any);
  }

  // Mark rate limit success (only if profiler is enabled)
  if (profiler) {
    profiler.mark('rate_limit_success');
    profiler.endMark('rate_limit_start');
    // Batch metadata additions
    profiler.addMetadata('tokensUsed', rateLimit.tokensUsed);
    profiler.addMetadata('tokensRemaining', rateLimit.tokensLimit - rateLimit.tokensUsed);
  }

  await next();
}
