import type { Context, Next } from 'hono';
import { checkRateLimit } from '../ratelimit.js';
import type { ApiKey } from '../types.js';
import type { AuthContext } from './auth.js';

// Rate limit middleware - checks quota before proceeding
export async function rateLimitMiddleware(c: Context<{ Variables: AuthContext }>, next: Next) {
  const apiKey: ApiKey = c.get('apiKey');
  // TODO: Query daily_usage table to get actual tokensUsedToday
  const rateLimit = checkRateLimit(apiKey, 0);

  if (!rateLimit.allowed) {
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

  await next();
}
