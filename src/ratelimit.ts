/**
 * Rate Limit - Optimized rate limit checking
 *
 * Optimized with pre-computed window boundaries and efficient data structures.
 */

import type { ApiKey } from './types.js';

// Pre-computed constants for performance
const WINDOW_DURATION_MS = 5 * 60 * 60 * 1000; // 5 hours
const WINDOW_DURATION_SECONDS = 5 * 60 * 60; // 5 hours in seconds

/**
 * Check if an API key is expired
 *
 * @param key - API key to check
 * @returns Whether key is expired
 */
export function isKeyExpired(key: ApiKey): boolean {
  return new Date(key.expiry_date) < new Date();
}

/**
 * Rate limit check result
 */
export interface RateLimitCheck {
  allowed: boolean;
  reason?: string;
  tokensUsed: number;
  tokensLimit: number;
  windowStart: string;
  windowEnd: string;
  retryAfter?: number; // seconds
}

/**
 * Window information for caching
 */
interface CachedWindowInfo {
  windowStart: string;
  windowEnd: string;
  windowStartTime: number;
  windowEndTime: number;
  totalTokensUsed: number;
  timestamp: number;
}

// Cache for window calculations to avoid repeated computations
const windowCache = new Map<string, CachedWindowInfo>();
const WINDOW_CACHE_TTL = 60000; // 1 minute
const MAX_CACHE_SIZE = 1000;

/**
 * Check rate limit for an API key (optimized version)
 *
 * Optimizations:
 * - Pre-computed window boundaries
 * - Single pass through windows
 * - Cached calculations for repeated checks
 * - O(n) where n is active windows (typically small)
 *
 * @param key - API key to check
 * @param tokensRequested - Optional token count being requested (default: 0)
 * @returns Rate limit check result
 */
export function checkRateLimit(
  key: ApiKey,
  tokensRequested: number = 0
): RateLimitCheck {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // Check cache first
  const cacheKey = key.key;
  const cached = windowCache.get(cacheKey);

  if (cached && (now - cached.timestamp) < WINDOW_CACHE_TTL) {
    // Cache hit - verify still valid
    if (cached.windowEndTime > now) {
      const allowed = cached.totalTokensUsed + tokensRequested <= key.token_limit_per_5h;

      if (!allowed) {
        const retryAfterSeconds = Math.max(0, Math.floor(
          (cached.windowEndTime - now) / 1000
        ));

        return {
          allowed: false,
          reason: 'Token limit exceeded for 5-hour window',
          tokensUsed: cached.totalTokensUsed,
          tokensLimit: key.token_limit_per_5h,
          windowStart: cached.windowStart,
          windowEnd: cached.windowEnd,
          retryAfter: retryAfterSeconds,
        };
      }

      return {
        allowed: true,
        tokensUsed: cached.totalTokensUsed,
        tokensLimit: key.token_limit_per_5h,
        windowStart: cached.windowStart,
        windowEnd: cached.windowEnd,
      };
    }
  }

  // Cache miss or expired - calculate from scratch
  // Pre-compute cutoff time once
  const cutoffTime = now - WINDOW_DURATION_MS;

  let totalTokensUsed = 0;
  let earliestWindowStart = now;
  let latestWindowEnd = now;

  // Single pass through windows (O(n) but n is typically small)
  const windows = key.usage_windows;
  for (let i = 0; i < windows.length; i++) {
    const window = windows[i];
    const windowStartTime = new Date(window.window_start).getTime();

    // Skip expired windows
    if (windowStartTime < cutoffTime) {
      continue;
    }

    totalTokensUsed += window.tokens_used;

    // Track boundaries
    if (windowStartTime < earliestWindowStart) {
      earliestWindowStart = windowStartTime;
    }

    const windowEndTime = windowStartTime + WINDOW_DURATION_MS;
    if (windowEndTime > latestWindowEnd) {
      latestWindowEnd = windowEndTime;
    }
  }

  // Calculate window boundaries
  const windowStartIso = new Date(earliestWindowStart).toISOString();
  const windowEndIso = new Date(latestWindowEnd).toISOString();

  // Update cache
  if (windowCache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry (FIFO)
    const firstKey = windowCache.keys().next().value;
    if (firstKey) {
      windowCache.delete(firstKey);
    }
  }

  windowCache.set(cacheKey, {
    windowStart: windowStartIso,
    windowEnd: windowEndIso,
    windowStartTime: earliestWindowStart,
    windowEndTime: latestWindowEnd,
    totalTokensUsed,
    timestamp: now,
  });

  // Check if over limit
  const allowed = totalTokensUsed + tokensRequested <= key.token_limit_per_5h;

  if (!allowed) {
    const retryAfterSeconds = Math.max(0, Math.floor(
      (latestWindowEnd - now) / 1000
    ));

    return {
      allowed: false,
      reason: 'Token limit exceeded for 5-hour window',
      tokensUsed: totalTokensUsed,
      tokensLimit: key.token_limit_per_5h,
      windowStart: windowStartIso,
      windowEnd: windowEndIso,
      retryAfter: retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    tokensUsed: totalTokensUsed,
    tokensLimit: key.token_limit_per_5h,
    windowStart: windowStartIso,
    windowEnd: windowEndIso,
  };
}

/**
 * Clear the rate limit cache
 *
 * Should be called when API key usage is updated.
 */
export function clearRateLimitCache(apiKey?: string): void {
  if (apiKey) {
    windowCache.delete(apiKey);
  } else {
    windowCache.clear();
  }
}

/**
 * Get cache statistics (for monitoring)
 */
export function getRateLimitCacheStats(): {
  size: number;
  maxSize: number;
  ttl: number;
} {
  return {
    size: windowCache.size,
    maxSize: MAX_CACHE_SIZE,
    ttl: WINDOW_CACHE_TTL,
  };
}
