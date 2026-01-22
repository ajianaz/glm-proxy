import type { Context, Next } from 'hono';
import { checkRateLimit } from '../ratelimit.js';
import type { ApiKey } from '../types.js';
import type { AuthContext } from './auth.js';
import type { ProfilingContext } from './profiling.js';

// Rate limit middleware - checks quota before proceeding
export async function rateLimitMiddleware(c: Context<{ Variables: AuthContext & ProfilingContext }>, next: Next) {
  const apiKey: ApiKey = c.get('apiKey');

  // Mark rate limit check start if profiler is available
  const profiler = c.get('profiler');
  if (profiler) {
    profiler.mark('rate_limit_start');
  }

  const rateLimit = checkRateLimit(apiKey);

  if (!rateLimit.allowed) {
    if (profiler) {
      profiler.mark('rate_limit_exceeded');
      profiler.endMark('rate_limit_start');
      profiler.addMetadata('rateLimitError', rateLimit.reason);
    }
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

  // Mark rate limit success
  if (profiler) {
    profiler.mark('rate_limit_success');
    profiler.endMark('rate_limit_start');
    profiler.addMetadata('tokensUsed', rateLimit.tokensUsed);
    profiler.addMetadata('tokensRemaining', rateLimit.tokensLimit - rateLimit.tokensUsed);
  }

  await next();
}
