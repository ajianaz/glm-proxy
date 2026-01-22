import type { ApiKey } from './types.js';
import { RollingWindow } from './rolling-window.js';

export function isKeyExpired(key: ApiKey): boolean {
  return new Date(key.expiry_date) < new Date();
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

export function checkRateLimit(key: ApiKey): RateLimitCheck {
  const now = new Date();
  let totalTokensUsed: number;
  let windowStart: string;

  // Use O(1) rolling window algorithm if cache exists
  if (key.rolling_window_cache) {
    const rollingWindow = RollingWindow.fromSerializable(key.rolling_window_cache);
    totalTokensUsed = rollingWindow.getTotalTokens(now);

    // Calculate window start from the oldest active bucket
    const oldestBucketTime = Array.from(rollingWindow['buckets'].values())
      .reduce((oldest: number | null, bucket) => {
        if (oldest === null || bucket.timestamp < oldest) {
          return bucket.timestamp;
        }
        return oldest;
      }, null);

    windowStart = oldestBucketTime !== null
      ? new Date(oldestBucketTime).toISOString()
      : now.toISOString();
  } else {
    // Fall back to O(n) algorithm for backwards compatibility
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();

    // Get all active windows (within 5 hours)
    const activeWindows = key.usage_windows.filter(
      w => w.window_start >= fiveHoursAgo
    );

    // Sum tokens from all active windows
    totalTokensUsed = activeWindows.reduce(
      (sum, w) => sum + w.tokens_used,
      0
    );

    // Find earliest window start for calculation
    windowStart = activeWindows.length > 0
      ? activeWindows[0].window_start
      : now.toISOString();
  }

  // Calculate when this window ends (5 hours from start)
  const startTime = new Date(windowStart);
  const windowEndTime = new Date(startTime.getTime() + 5 * 60 * 60 * 1000);
  const windowEnd = windowEndTime.toISOString();

  // Check if over limit
  if (totalTokensUsed > key.token_limit_per_5h) {
    const retryAfterSeconds = Math.max(0, Math.floor(
      (windowEndTime.getTime() - now.getTime()) / 1000
    ));

    return {
      allowed: false,
      reason: 'Token limit exceeded for 5-hour window',
      tokensUsed: totalTokensUsed,
      tokensLimit: key.token_limit_per_5h,
      windowStart,
      windowEnd,
      retryAfter: retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    tokensUsed: totalTokensUsed,
    tokensLimit: key.token_limit_per_5h,
    windowStart,
    windowEnd,
  };
}
