/**
 * Performance Benchmarks: O(n) vs O(1) Rate Limiting
 *
 * This benchmark suite compares the performance of the old O(n) algorithm
 * (filter + reduce on usage_windows) vs the new O(1) algorithm (RollingWindow)
 * for rate limit checking.
 *
 * Scenarios:
 * - Small dataset: 10 windows (typical low-volume usage)
 * - Medium dataset: 100 windows (moderate volume over days)
 * - Large dataset: 1000 windows (high volume over weeks)
 */

import { bench, describe } from 'vitest';
import { checkRateLimit } from '../src/ratelimit.js';
import { RollingWindow } from '../src/rolling-window.js';
import type { ApiKey } from '../src/types.js';

// Helper to calculate bucket time (rounded down to nearest 5-minute boundary)
function getBucketTime(timestamp: number): number {
  const bucketSizeMs = 5 * 60 * 1000; // 5 minutes
  return Math.floor(timestamp / bucketSizeMs) * bucketSizeMs;
}

// Helper to create an API key with O(n) usage_windows only
function createKeyWithUsageWindows(windowCount: number): ApiKey {
  const now = Date.now();
  const usageWindows = [];

  // Distribute windows across the 5-hour period
  for (let i = 0; i < windowCount; i++) {
    const timeOffset = (i / windowCount) * 5 * 60 * 60 * 1000; // Spread across 5 hours
    const tokens = Math.floor(Math.random() * 1000) + 100; // Random tokens between 100-1100

    usageWindows.push({
      window_start: new Date(now - timeOffset).toISOString(),
      tokens_used: tokens,
    });
  }

  return {
    key: 'pk_test_key',
    name: 'Test User',
    model: 'glm-4.7',
    token_limit_per_5h: 1000000,
    expiry_date: '2026-12-31T23:59:59Z',
    created_at: '2026-01-18T00:00:00Z',
    last_used: '2026-01-18T00:00:00Z',
    total_lifetime_tokens: 0,
    usage_windows: usageWindows,
  };
}

// Helper to create an API key with O(1) rolling window cache
function createKeyWithRollingWindowCache(windowCount: number): ApiKey {
  const key = createKeyWithUsageWindows(windowCount);
  const now = Date.now();

  // Create rolling window cache from usage windows
  const rollingWindow = new RollingWindow(5 * 60 * 60 * 1000, 5 * 60 * 1000);

  for (const window of key.usage_windows) {
    const windowTime = new Date(window.window_start);
    rollingWindow.addTokens(windowTime, window.tokens_used);
  }

  key.rolling_window_cache = rollingWindow.toSerializable();

  return key;
}

describe('Rate Limiting Performance: O(n) vs O(1)', () => {
  describe('Small Dataset (10 windows)', () => {
    const keyON = createKeyWithUsageWindows(10);
    const keyO1 = createKeyWithRollingWindowCache(10);

    bench('O(n) algorithm - checkRateLimit with 10 windows', () => {
      checkRateLimit(keyON);
    });

    bench('O(1) algorithm - checkRateLimit with 10 windows', () => {
      checkRateLimit(keyO1);
    });
  });

  describe('Medium Dataset (100 windows)', () => {
    const keyON = createKeyWithUsageWindows(100);
    const keyO1 = createKeyWithRollingWindowCache(100);

    bench('O(n) algorithm - checkRateLimit with 100 windows', () => {
      checkRateLimit(keyON);
    });

    bench('O(1) algorithm - checkRateLimit with 100 windows', () => {
      checkRateLimit(keyO1);
    });
  });

  describe('Large Dataset (1000 windows)', () => {
    const keyON = createKeyWithUsageWindows(1000);
    const keyO1 = createKeyWithRollingWindowCache(1000);

    bench('O(n) algorithm - checkRateLimit with 1000 windows', () => {
      checkRateLimit(keyON);
    });

    bench('O(1) algorithm - checkRateLimit with 1000 windows', () => {
      checkRateLimit(keyO1);
    });
  });
});

describe('RollingWindow Operations Performance', () => {
  describe('getTotalTokens() - O(1) operation', () => {
    bench('getTotalTokens with 60 buckets (full 5-hour window)', () => {
      const window = new RollingWindow();
      const now = Date.now();

      // Add tokens across 60 buckets (5 hours / 5 minutes)
      for (let i = 0; i < 60; i++) {
        const time = new Date(now + i * 5 * 60 * 1000);
        window.addTokens(time, 100);
      }

      // Measure getTotalTokens performance
      window.getTotalTokens(new Date(now));
    });

    bench('getTotalTokens with cleanup (expired buckets)', () => {
      const window = new RollingWindow();
      const now = Date.now();

      // Add tokens across 72 buckets (6 hours), some will be expired
      for (let i = 0; i < 72; i++) {
        const time = new Date(now + i * 5 * 60 * 1000);
        window.addTokens(time, 100);
      }

      // Measure getTotalTokens with automatic cleanup
      window.getTotalTokens(new Date(now + 6 * 60 * 60 * 1000));
    });
  });

  describe('addTokens() - O(1) operation', () => {
    bench('addTokens to existing bucket', () => {
      const window = new RollingWindow();
      const now = new Date();

      // Add tokens to the same bucket repeatedly
      for (let i = 0; i < 100; i++) {
        window.addTokens(now, 10);
      }
    });

    bench('addTokens to different buckets', () => {
      const window = new RollingWindow();
      const now = Date.now();

      // Add tokens to different buckets
      for (let i = 0; i < 100; i++) {
        const time = new Date(now + i * 5 * 60 * 1000);
        window.addTokens(time, 10);
      }
    });
  });

  describe('Serialization Performance', () => {
    bench('toSerializable with 60 buckets', () => {
      const window = new RollingWindow();
      const now = Date.now();

      // Add tokens across 60 buckets
      for (let i = 0; i < 60; i++) {
        const time = new Date(now + i * 5 * 60 * 1000);
        window.addTokens(time, 100);
      }

      // Measure serialization performance
      window.toSerializable();
    });

    bench('fromSerializable with 60 buckets', () => {
      const window = new RollingWindow();
      const now = Date.now();

      // Add tokens across 60 buckets
      for (let i = 0; i < 60; i++) {
        const time = new Date(now + i * 5 * 60 * 1000);
        window.addTokens(time, 100);
      }

      const serialized = window.toSerializable();

      // Measure deserialization performance
      RollingWindow.fromSerializable(serialized);
    });
  });
});

describe('Memory Efficiency', () => {
  describe('Sparse bucket distribution', () => {
    bench('O(n) algorithm - sparse windows (10 windows spread over 5 hours)', () => {
      const key = createKeyWithUsageWindows(10);
      checkRateLimit(key);
    });

    bench('O(1) algorithm - sparse buckets (10 buckets spread over 5 hours)', () => {
      const key = createKeyWithRollingWindowCache(10);
      checkRateLimit(key);
    });
  });

  describe('Dense bucket distribution', () => {
    bench('O(n) algorithm - dense windows (100 windows spread over 5 hours)', () => {
      const key = createKeyWithUsageWindows(100);
      checkRateLimit(key);
    });

    bench('O(1) algorithm - dense buckets (100 buckets spread over 5 hours)', () => {
      const key = createKeyWithRollingWindowCache(100);
      checkRateLimit(key);
    });
  });
});

describe('Worst-case Scenarios', () => {
  describe('All windows in single bucket (best case for O(1))', () => {
    const now = Date.now();

    const keyON: ApiKey = {
      key: 'pk_test_key',
      name: 'Test User',
      model: 'glm-4.7',
      token_limit_per_5h: 1000000,
      expiry_date: '2026-12-31T23:59:59Z',
      created_at: '2026-01-18T00:00:00Z',
      last_used: '2026-01-18T00:00:00Z',
      total_lifetime_tokens: 0,
      usage_windows: Array.from({ length: 100 }, () => ({
        window_start: new Date(now).toISOString(),
        tokens_used: 100,
      })),
    };

    const rollingWindow = new RollingWindow();
    for (let i = 0; i < 100; i++) {
      rollingWindow.addTokens(new Date(now), 100);
    }

    const keyO1: ApiKey = {
      ...keyON,
      rolling_window_cache: rollingWindow.toSerializable(),
    };

    bench('O(n) algorithm - 100 windows in single bucket', () => {
      checkRateLimit(keyON);
    });

    bench('O(1) algorithm - 100 windows collapsed to 1 bucket', () => {
      checkRateLimit(keyO1);
    });
  });

  describe('Windows evenly distributed across all buckets', () => {
    bench('O(n) algorithm - 720 windows (12 per bucket)', () => {
      const key = createKeyWithUsageWindows(720);
      checkRateLimit(key);
    });

    bench('O(1) algorithm - 720 windows collapsed to 60 buckets', () => {
      const key = createKeyWithRollingWindowCache(720);
      checkRateLimit(key);
    });
  });
});

describe('Cleanup Performance', () => {
  bench('Cleanup with 50% expired buckets', () => {
    const window = new RollingWindow();
    const now = Date.now();

    // Add 120 buckets (10 hours worth)
    for (let i = 0; i < 120; i++) {
      const time = new Date(now + i * 5 * 60 * 1000);
      window.addTokens(time, 100);
    }

    // Check at 5 hour mark (should clean up 60 buckets)
    window.getTotalTokens(new Date(now + 5 * 60 * 60 * 1000));
  });

  bench('Cleanup with 90% expired buckets', () => {
    const window = new RollingWindow();
    const now = Date.now();

    // Add 600 buckets (50 hours worth)
    for (let i = 0; i < 600; i++) {
      const time = new Date(now + i * 5 * 60 * 1000);
      window.addTokens(time, 100);
    }

    // Check at 5 hour mark (should clean up 540 buckets)
    window.getTotalTokens(new Date(now + 5 * 60 * 60 * 1000));
  });
});

describe('Throughput Comparison', () => {
  const iterations = 10000;

  bench(`O(n) algorithm - ${iterations} iterations with 100 windows`, () => {
    const key = createKeyWithUsageWindows(100);
    for (let i = 0; i < iterations; i++) {
      checkRateLimit(key);
    }
  });

  bench(`O(1) algorithm - ${iterations} iterations with 100 windows`, () => {
    const key = createKeyWithRollingWindowCache(100);
    for (let i = 0; i < iterations; i++) {
      checkRateLimit(key);
    }
  });
});
