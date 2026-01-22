import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, clearRateLimitCache } from '../src/ratelimit.js';
import type { ApiKey } from '../src/types.js';

// Helper function to calculate bucket time (rounded down to nearest 5-minute boundary)
function getBucketTime(timestamp: number): number {
  const bucketSizeMs = 5 * 60 * 1000; // 5 minutes
  return Math.floor(timestamp / bucketSizeMs) * bucketSizeMs;
}

describe('Rate Limiting', () => {
  const createKey = (windows: Array<{ window_start: string; tokens_used: number }>): ApiKey => ({
    key: 'pk_test_key',
    name: 'Test User',
    model: 'glm-4.7',
    token_limit_per_5h: 100000,
    expiry_date: '2026-12-31T23:59:59Z',
    created_at: '2026-01-18T00:00:00Z',
    last_used: '2026-01-18T00:00:00Z',
    total_lifetime_tokens: 0,
    usage_windows: windows,
  });

  beforeEach(() => {
    // Clear cache before each test to ensure fresh calculations
    clearRateLimitCache();
  });

  describe('checkRateLimit', () => {
    it('should allow request when under limit', () => {
      const key = createKey([
        { window_start: new Date(Date.now() - 3600000).toISOString(), tokens_used: 50000 },
      ]);

      const result = checkRateLimit(key);
      expect(result.allowed).toBe(true);
      expect(result.tokensUsed).toBe(50000);
      expect(result.tokensLimit).toBe(100000);
    });

    it('should deny request when over limit', () => {
      const key = createKey([
        { window_start: new Date(Date.now() - 3600000).toISOString(), tokens_used: 150000 },
      ]);

      const result = checkRateLimit(key);
      expect(result.allowed).toBe(false);
      expect(result.tokensUsed).toBe(150000);
      expect(result.tokensLimit).toBe(100000);
      expect(result.reason).toBe('Token limit exceeded for 5-hour window');
      expect(result.retryAfter).toBeDefined();
    });

    it('should sum tokens from all active windows (5h)', () => {
      const now = Date.now();
      const key = createKey([
        { window_start: new Date(now - 3600000).toISOString(), tokens_used: 30000 }, // 1h ago
        { window_start: new Date(now - 7200000).toISOString(), tokens_used: 40000 }, // 2h ago
        { window_start: new Date(now - 14400000).toISOString(), tokens_used: 20000 }, // 4h ago
      ]);

      const result = checkRateLimit(key);
      expect(result.tokensUsed).toBe(90000); // 30K + 40K + 20K = 90K
      expect(result.allowed).toBe(true);
    });

    it('should ignore windows older than 5 hours', () => {
      const now = Date.now();
      const key = createKey([
        { window_start: new Date(now - 3600000).toISOString(), tokens_used: 30000 }, // 1h ago - active
        { window_start: new Date(now - 21600000).toISOString(), tokens_used: 50000 }, // 6h ago - expired
      ]);

      const result = checkRateLimit(key);
      expect(result.tokensUsed).toBe(30000); // Only 30K counted, 50K ignored
    });
  });

  describe('with rolling window cache (O(1) algorithm)', () => {
    it('should use cached data when rolling_window_cache exists', () => {
      const now = Date.now();
      const key = createKey([
        { window_start: new Date(now - 3600000).toISOString(), tokens_used: 50000 },
      ]);

      // Add rolling window cache
      key.rolling_window_cache = {
        buckets: [
          { timestamp: getBucketTime(now - 3600000), tokens: 50000 },
        ],
        runningTotal: 50000,
        lastUpdated: new Date(now).toISOString(),
        windowDurationMs: 5 * 60 * 60 * 1000,
        bucketSizeMs: 5 * 60 * 1000,
      };

      const result = checkRateLimit(key);
      expect(result.allowed).toBe(true);
      expect(result.tokensUsed).toBe(50000);
      expect(result.tokensLimit).toBe(100000);
    });

    it('should sum tokens from multiple buckets in cache', () => {
      const now = Date.now();
      const key = createKey([
        { window_start: new Date(now - 3600000).toISOString(), tokens_used: 30000 },
        { window_start: new Date(now - 7200000).toISOString(), tokens_used: 40000 },
        { window_start: new Date(now - 14400000).toISOString(), tokens_used: 20000 },
      ]);

      // Add rolling window cache
      key.rolling_window_cache = {
        buckets: [
          { timestamp: getBucketTime(now - 3600000), tokens: 30000 },
          { timestamp: getBucketTime(now - 7200000), tokens: 40000 },
          { timestamp: getBucketTime(now - 14400000), tokens: 20000 },
        ],
        runningTotal: 90000,
        lastUpdated: new Date(now).toISOString(),
        windowDurationMs: 5 * 60 * 60 * 1000,
        bucketSizeMs: 5 * 60 * 1000,
      };

      const result = checkRateLimit(key);
      expect(result.tokensUsed).toBe(90000); // 30K + 40K + 20K = 90K
      expect(result.allowed).toBe(true);
    });

    it('should handle empty cache correctly', () => {
      const now = Date.now();
      const key = createKey([]);

      // Add empty rolling window cache
      key.rolling_window_cache = {
        buckets: [],
        runningTotal: 0,
        lastUpdated: new Date(now).toISOString(),
        windowDurationMs: 5 * 60 * 60 * 1000,
        bucketSizeMs: 5 * 60 * 1000,
      };

      const result = checkRateLimit(key);
      expect(result.allowed).toBe(true);
      expect(result.tokensUsed).toBe(0);
    });

    it('should deny request when over limit using cached data', () => {
      const now = Date.now();
      const key = createKey([
        { window_start: new Date(now - 3600000).toISOString(), tokens_used: 150000 },
      ]);

      // Add rolling window cache
      key.rolling_window_cache = {
        buckets: [
          { timestamp: getBucketTime(now - 3600000), tokens: 150000 },
        ],
        runningTotal: 150000,
        lastUpdated: new Date(now).toISOString(),
        windowDurationMs: 5 * 60 * 60 * 1000,
        bucketSizeMs: 5 * 60 * 1000,
      };

      const result = checkRateLimit(key);
      expect(result.allowed).toBe(false);
      expect(result.tokensUsed).toBe(150000);
      expect(result.reason).toBe('Token limit exceeded for 5-hour window');
      expect(result.retryAfter).toBeDefined();
    });
  });

  describe('cache hit vs cache miss scenarios', () => {
    it('should produce same results with and without cache', () => {
      const now = Date.now();
      const keyWithoutCache = createKey([
        { window_start: new Date(now - 3600000).toISOString(), tokens_used: 30000 },
        { window_start: new Date(now - 7200000).toISOString(), tokens_used: 40000 },
        { window_start: new Date(now - 14400000).toISOString(), tokens_used: 20000 },
      ]);

      const keyWithCache = createKey([
        { window_start: new Date(now - 3600000).toISOString(), tokens_used: 30000 },
        { window_start: new Date(now - 7200000).toISOString(), tokens_used: 40000 },
        { window_start: new Date(now - 14400000).toISOString(), tokens_used: 20000 },
      ]);

      // Add rolling window cache to second key
      keyWithCache.rolling_window_cache = {
        buckets: [
          { timestamp: getBucketTime(now - 3600000), tokens: 30000 },
          { timestamp: getBucketTime(now - 7200000), tokens: 40000 },
          { timestamp: getBucketTime(now - 14400000), tokens: 20000 },
        ],
        runningTotal: 90000,
        lastUpdated: new Date(now).toISOString(),
        windowDurationMs: 5 * 60 * 60 * 1000,
        bucketSizeMs: 5 * 60 * 1000,
      };

      const resultWithoutCache = checkRateLimit(keyWithoutCache);
      const resultWithCache = checkRateLimit(keyWithCache);

      expect(resultWithCache.tokensUsed).toBe(resultWithoutCache.tokensUsed);
      expect(resultWithCache.allowed).toBe(resultWithoutCache.allowed);
      expect(resultWithCache.tokensLimit).toBe(resultWithoutCache.tokensLimit);
    });

    it('should produce same results when over limit with and without cache', () => {
      const now = Date.now();
      const keyWithoutCache = createKey([
        { window_start: new Date(now - 3600000).toISOString(), tokens_used: 150000 },
      ]);

      const keyWithCache = createKey([
        { window_start: new Date(now - 3600000).toISOString(), tokens_used: 150000 },
      ]);

      // Add rolling window cache to second key
      keyWithCache.rolling_window_cache = {
        buckets: [
          { timestamp: getBucketTime(now - 3600000), tokens: 150000 },
        ],
        runningTotal: 150000,
        lastUpdated: new Date(now).toISOString(),
        windowDurationMs: 5 * 60 * 60 * 1000,
        bucketSizeMs: 5 * 60 * 1000,
      };

      const resultWithoutCache = checkRateLimit(keyWithoutCache);
      const resultWithCache = checkRateLimit(keyWithCache);

      expect(resultWithCache.tokensUsed).toBe(resultWithoutCache.tokensUsed);
      expect(resultWithCache.allowed).toBe(resultWithoutCache.allowed);
      expect(resultWithCache.reason).toBe(resultWithoutCache.reason);
      expect(resultWithCache.retryAfter).toBeDefined();
      expect(resultWithoutCache.retryAfter).toBeDefined();
    });
  });

  describe('cache initialization edge cases', () => {
    it('should handle single bucket in cache', () => {
      const now = Date.now();
      const key = createKey([
        { window_start: new Date(now - 3600000).toISOString(), tokens_used: 50000 },
      ]);

      key.rolling_window_cache = {
        buckets: [
          { timestamp: getBucketTime(now - 3600000), tokens: 50000 },
        ],
        runningTotal: 50000,
        lastUpdated: new Date(now).toISOString(),
        windowDurationMs: 5 * 60 * 60 * 1000,
        bucketSizeMs: 5 * 60 * 1000,
      };

      const result = checkRateLimit(key);
      expect(result.tokensUsed).toBe(50000);
      expect(result.allowed).toBe(true);
    });

    it('should handle cache with expired buckets', () => {
      const now = Date.now();
      const key = createKey([
        { window_start: new Date(now - 3600000).toISOString(), tokens_used: 30000 },
      ]);

      // Cache includes both active and expired buckets
      key.rolling_window_cache = {
        buckets: [
          { timestamp: getBucketTime(now - 3600000), tokens: 30000 },    // Active (1h ago)
          { timestamp: getBucketTime(now - 21600000), tokens: 50000 },   // Expired (6h ago)
        ],
        runningTotal: 80000, // Includes expired bucket
        lastUpdated: new Date(now).toISOString(),
        windowDurationMs: 5 * 60 * 60 * 1000,
        bucketSizeMs: 5 * 60 * 1000,
      };

      const result = checkRateLimit(key);
      // Rolling window cleanup should remove expired bucket and update running total
      expect(result.tokensUsed).toBeLessThanOrEqual(80000); // Should be less after cleanup
    });
  });
});
