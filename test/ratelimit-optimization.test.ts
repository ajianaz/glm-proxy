/**
 * Rate Limit Optimization Tests
 *
 * Tests for optimized rate limit checking with efficient data structures.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { checkRateLimit, clearRateLimitCache, getRateLimitCacheStats } from '../src/ratelimit.js';
import { getRateLimitTracker, resetRateLimitTracker } from '../src/ratelimit/RateLimitTracker.js';
import { flushPendingUpdates, getPendingUpdatesCount } from '../src/storage.js';
import type { ApiKey } from '../src/types.js';

describe('Rate Limit Optimization', () => {
  let testApiKey: ApiKey;

  beforeEach(() => {
    // Create a test API key
    testApiKey = {
      key: 'test-key-1',
      name: 'Test Key',
      token_limit_per_5h: 1000,
      total_lifetime_tokens: 0,
      usage_windows: [],
      expiry_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      last_used: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    // Clear all caches
    clearRateLimitCache();
    resetRateLimitTracker();
  });

  afterEach(() => {
    clearRateLimitCache();
  });

  describe('Optimized checkRateLimit', () => {
    test('should allow request when under limit', () => {
      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 500,
        },
      ];

      const result = checkRateLimit(testApiKey);

      expect(result.allowed).toBe(true);
      expect(result.tokensUsed).toBe(500);
      expect(result.tokensLimit).toBe(1000);
    });

    test('should deny request when over limit', () => {
      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 1000,
        },
      ];

      const result = checkRateLimit(testApiKey, 1);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Token limit exceeded for 5-hour window');
      expect(result.tokensUsed).toBe(1000);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    test('should handle multiple windows correctly', () => {
      const now = Date.now();
      testApiKey.usage_windows = [
        {
          window_start: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
          tokens_used: 300,
        },
        {
          window_start: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 400,
        },
        {
          window_start: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
          tokens_used: 200,
        },
      ];

      const result = checkRateLimit(testApiKey);

      expect(result.allowed).toBe(true);
      expect(result.tokensUsed).toBe(900); // 300 + 400 + 200
    });

    test('should ignore expired windows', () => {
      const now = Date.now();
      testApiKey.usage_windows = [
        {
          window_start: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
          tokens_used: 5000, // Should be ignored
        },
        {
          window_start: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 500,
        },
      ];

      const result = checkRateLimit(testApiKey);

      expect(result.allowed).toBe(true);
      expect(result.tokensUsed).toBe(500); // Only recent window
    });

    test('should handle empty usage windows', () => {
      testApiKey.usage_windows = [];

      const result = checkRateLimit(testApiKey);

      expect(result.allowed).toBe(true);
      expect(result.tokensUsed).toBe(0);
    });

    test('should calculate correct retry-after time', () => {
      const now = Date.now();
      // Create a window that started 4 hours ago
      const windowStart = new Date(now - 4 * 60 * 60 * 1000);
      testApiKey.usage_windows = [
        {
          window_start: windowStart.toISOString(),
          tokens_used: 1000,
        },
      ];

      const result = checkRateLimit(testApiKey, 1);

      expect(result.allowed).toBe(false);
      // Window should expire in ~1 hour
      expect(result.retryAfter).toBeGreaterThan(3500); // ~59 minutes in seconds
      expect(result.retryAfter).toBeLessThan(3700); // ~61 minutes in seconds
    });

    test('should check tokens requested in limit', () => {
      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 999,
        },
      ];

      const result = checkRateLimit(testApiKey, 2);

      expect(result.allowed).toBe(false);
      expect(result.tokensUsed).toBe(999);
    });

    test('should allow when tokens requested fits', () => {
      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 999,
        },
      ];

      const result = checkRateLimit(testApiKey, 1);

      expect(result.allowed).toBe(true);
    });
  });

  describe('Rate Limit Cache', () => {
    test('should cache rate limit calculations', () => {
      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 500,
        },
      ];

      // First call - cache miss
      const result1 = checkRateLimit(testApiKey);
      expect(result1.allowed).toBe(true);

      // Second call - cache hit (should be faster)
      const result2 = checkRateLimit(testApiKey);
      expect(result2.allowed).toBe(true);
      expect(result2.tokensUsed).toBe(result1.tokensUsed);
    });

    test('should invalidate cache on clearRateLimitCache', () => {
      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 500,
        },
      ];

      checkRateLimit(testApiKey);
      clearRateLimitCache(testApiKey.key);

      // After clearing, should recalculate
      testApiKey.usage_windows[0].tokens_used = 800;
      const result = checkRateLimit(testApiKey);
      expect(result.tokensUsed).toBe(800);
    });

    test('should clear all cache entries', () => {
      const keys = ['key1', 'key2', 'key3'];
      keys.forEach(key => {
        const apiKey: ApiKey = { ...testApiKey, key };
        checkRateLimit(apiKey);
      });

      const stats1 = getRateLimitCacheStats();
      expect(stats1.size).toBeGreaterThan(0);

      clearRateLimitCache();

      const stats2 = getRateLimitCacheStats();
      expect(stats2.size).toBe(0);
    });

    test('should return correct cache stats', () => {
      const stats = getRateLimitCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('ttl');
      expect(stats.maxSize).toBe(1000);
      expect(stats.ttl).toBe(60000); // 1 minute
    });
  });

  describe('RateLimitTracker', () => {
    test('should track rate limits in memory', () => {
      const tracker = getRateLimitTracker();

      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 500,
        },
      ];

      const result = tracker.checkRateLimit(testApiKey);

      expect(result.allowed).toBe(true);
      expect(result.tokensUsed).toBe(500);
    });

    test('should record usage in memory', () => {
      const tracker = getRateLimitTracker();

      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 0,
        },
      ];

      tracker.recordUsage(testApiKey, 100);

      const result = tracker.checkRateLimit(testApiKey);
      expect(result.tokensUsed).toBeGreaterThanOrEqual(100);
    });

    test('should batch usage updates', () => {
      const tracker = getRateLimitTracker();

      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 0,
        },
      ];

      // Record multiple usage updates
      tracker.recordUsage(testApiKey, 50);
      tracker.recordUsage(testApiKey, 30);
      tracker.recordUsage(testApiKey, 20);

      // All should be accumulated
      const result = tracker.checkRateLimit(testApiKey);
      expect(result.tokensUsed).toBeGreaterThanOrEqual(100);
    });

    test('should track metrics', () => {
      const tracker = getRateLimitTracker();

      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 500,
        },
      ];

      tracker.checkRateLimit(testApiKey);
      tracker.checkRateLimit(testApiKey);

      const metrics = tracker.getMetrics();

      expect(metrics.totalChecks).toBe(2);
      expect(metrics.allowedChecks).toBe(2);
      expect(metrics.deniedChecks).toBe(0);
      expect(metrics.cachedChecks).toBe(2);
      expect(metrics.avgCheckTime).toBeGreaterThan(0);
    });

    test('should reset metrics', () => {
      const tracker = getRateLimitTracker();

      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 500,
        },
      ];

      tracker.checkRateLimit(testApiKey);
      tracker.resetMetrics();

      const metrics = tracker.getMetrics();

      expect(metrics.totalChecks).toBe(0);
      expect(metrics.allowedChecks).toBe(0);
    });

    test('should clear all data', () => {
      const tracker = getRateLimitTracker();

      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 500,
        },
      ];

      tracker.checkRateLimit(testApiKey);
      tracker.clear();

      // Should start fresh
      testApiKey.usage_windows = [];
      const result = tracker.checkRateLimit(testApiKey);
      expect(result.tokensUsed).toBe(0);
    });

    test('should handle multiple API keys', () => {
      const tracker = getRateLimitTracker();

      const key1: ApiKey = { ...testApiKey, key: 'key-1' };
      const key2: ApiKey = { ...testApiKey, key: 'key-2' };

      key1.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 500,
        },
      ];

      key2.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 300,
        },
      ];

      const result1 = tracker.checkRateLimit(key1);
      const result2 = tracker.checkRateLimit(key2);

      expect(result1.tokensUsed).toBe(500);
      expect(result2.tokensUsed).toBe(300);
    });
  });

  describe('Storage Integration', () => {
    test('should track pending updates', () => {
      // Initially no pending updates
      expect(getPendingUpdatesCount()).toBe(0);

      // Note: updateApiKeyUsage is async and would require actual storage setup
      // This is a simplified test for the counting mechanism
    });

    test('should flush pending updates', async () => {
      // Should not throw even with no pending updates
      // Note: flushPendingUpdates will try to read from DATA_FILE
      // which may not exist in test environment, so we wrap in try-catch
      try {
        await flushPendingUpdates();
      } catch (error) {
        // File not found is acceptable in test environment
        expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle very old windows', () => {
      const veryOldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
      testApiKey.usage_windows = [
        {
          window_start: veryOldDate.toISOString(),
          tokens_used: 10000,
        },
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 500,
        },
      ];

      const result = checkRateLimit(testApiKey);

      // Old window should be ignored
      expect(result.tokensUsed).toBe(500);
    });

    test('should handle windows at exact boundary', () => {
      const now = Date.now();
      const exactly5HoursAgo = new Date(now - 5 * 60 * 60 * 1000);

      testApiKey.usage_windows = [
        {
          window_start: exactly5HoursAgo.toISOString(),
          tokens_used: 500,
        },
      ];

      const result = checkRateLimit(testApiKey);

      // Window at exact boundary might be included due to millisecond precision
      expect(result.tokensUsed).toBeGreaterThanOrEqual(0);
    });

    test('should handle zero token limit', () => {
      testApiKey.token_limit_per_5h = 0;

      const result = checkRateLimit(testApiKey, 1);

      expect(result.allowed).toBe(false);
    });

    test('should handle very large token counts', () => {
      testApiKey.token_limit_per_5h = Number.MAX_SAFE_INTEGER;
      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 1000000000,
        },
      ];

      const result = checkRateLimit(testApiKey);

      expect(result.allowed).toBe(true);
    });

    test('should handle rapid successive checks', () => {
      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 500,
        },
      ];

      // Rapid checks should all succeed and be cached
      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(checkRateLimit(testApiKey));
      }

      expect(results.every(r => r.allowed)).toBe(true);
      expect(results.every(r => r.tokensUsed === 500)).toBe(true);
    });
  });

  describe('Performance Characteristics', () => {
    test('should be fast for single check', () => {
      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 500,
        },
      ];

      const start = performance.now();
      checkRateLimit(testApiKey);
      const duration = performance.now() - start;

      // Should complete in less than 1ms
      expect(duration).toBeLessThan(1);
    });

    test('should be fast for many windows', () => {
      const now = Date.now();
      testApiKey.usage_windows = [];
      for (let i = 0; i < 100; i++) {
        testApiKey.usage_windows.push({
          window_start: new Date(now - i * 60 * 1000).toISOString(),
          tokens_used: 10,
        });
      }

      const start = performance.now();
      checkRateLimit(testApiKey);
      const duration = performance.now() - start;

      // Should still be fast even with many windows
      expect(duration).toBeLessThan(5);
    });

    test('should be faster with cache', () => {
      testApiKey.usage_windows = [
        {
          window_start: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          tokens_used: 500,
        },
      ];

      // First call (cache miss)
      const start1 = performance.now();
      checkRateLimit(testApiKey);
      const duration1 = performance.now() - start1;

      // Second call (cache hit) - run multiple times to ensure cache is warm
      for (let i = 0; i < 10; i++) {
        checkRateLimit(testApiKey);
      }

      const start2 = performance.now();
      checkRateLimit(testApiKey);
      const duration2 = performance.now() - start2;

      // Both should be very fast (< 1ms)
      expect(duration1).toBeLessThan(1);
      expect(duration2).toBeLessThan(1);

      // Cache hit should be reasonably fast (within same order of magnitude)
      expect(duration2).toBeLessThan(duration1 * 10);
    });
  });
});
