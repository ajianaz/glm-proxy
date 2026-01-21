import type { ApiKey } from './types.js';

export function isKeyExpired(key: ApiKey): boolean {
  return new Date(key.expiryDate) < new Date();
}

export interface RateLimitCheck {
  allowed: boolean;
  reason?: string;
  tokensUsed: number;
  tokensLimit: number;
  windowStart: string;
  windowEnd: string;
  retryAfter?: number; // seconds
}

export function checkRateLimit(
  key: ApiKey,
  tokensUsedToday: number = 0
): RateLimitCheck {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const windowStart = startOfDay.toISOString();
  const windowEnd = endOfDay.toISOString();

  // TODO: Query daily_usage table to get actual tokens_used_today for this API key
  // This should join with daily_usage table on api_key_id and filter by today's date
  // For now, accepting tokensUsedToday as a parameter from the caller

  // Check if over limit
  if (tokensUsedToday > key.tokenLimitPerDay) {
    // Calculate seconds until tomorrow midnight
    const tomorrow = new Date(startOfDay);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const retryAfterSeconds = Math.max(0, Math.floor(
      (tomorrow.getTime() - now.getTime()) / 1000
    ));

    return {
      allowed: false,
      reason: 'Token limit exceeded for 24-hour window',
      tokensUsed: tokensUsedToday,
      tokensLimit: key.tokenLimitPerDay,
      windowStart,
      windowEnd,
      retryAfter: retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    tokensUsed: tokensUsedToday,
    tokensLimit: key.tokenLimitPerDay,
    windowStart,
    windowEnd,
  };
}
