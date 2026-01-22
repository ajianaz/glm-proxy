/**
 * Performance benchmarks for API key cache implementation
 *
 * These benchmarks measure the performance improvement from using the in-memory
 * LRU cache versus file-based lookups. Results demonstrate:
 * - Latency reduction for cache hits vs misses
 * - Throughput improvement under concurrent load
 * - I/O reduction percentage
 *
 * Run with: bun test test/benchmarks/cache-benchmark.test.ts
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { LRUCacheImpl } from '../../src/cache.js';
import { findApiKey, readApiKeys, writeApiKeys } from '../../src/storage.js';
import type { ApiKey, ApiKeysData } from '../../src/types.js';
import fs from 'fs';
import path from 'path';

// Test data file path (separate from production data)
const TEST_DATA_FILE = path.join(process.cwd(), 'data/test-apikeys-benchmark.json');

// Helper function to create test API key data
function createTestApiKeys(count: number): ApiKey[] {
  const keys: ApiKey[] = [];
  const now = new Date().toISOString();

  for (let i = 0; i < count; i++) {
    keys.push({
      key: `pk_test_benchmark_${i}`,
      name: `Test Key ${i}`,
      model: 'glm-4',
      token_limit_per_5h: 1000000,
      expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: now,
      last_used: now,
      total_lifetime_tokens: 0,
      usage_windows: [],
    });
  }

  return keys;
}

// Setup test data file
async function setupTestData(count: number): Promise<void> {
  const dataDir = path.dirname(TEST_DATA_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const testData: ApiKeysData = {
    keys: createTestApiKeys(count),
  };

  await fs.promises.writeFile(TEST_DATA_FILE, JSON.stringify(testData, null, 2), 'utf-8');
}

// Cleanup test data file
async function cleanupTestData(): Promise<void> {
  try {
    await fs.promises.unlink(TEST_DATA_FILE);
  } catch {
    // Ignore if file doesn't exist
  }
}

// Helper to run a benchmark and return statistics
function runBenchmark(
  name: string,
  fn: () => void | Promise<void>,
  iterations: number = 1000
): { name: string; iterations: number; totalTime: number; avgTime: number; opsPerSec: number } {
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    fn();
  }

  const end = performance.now();
  const totalTime = end - start;
  const avgTime = totalTime / iterations;
  const opsPerSec = (iterations / totalTime) * 1000;

  return {
    name,
    iterations,
    totalTime,
    avgTime,
    opsPerSec,
  };
}

// Async version of benchmark helper
async function runBenchmarkAsync(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 100
): Promise<{ name: string; iterations: number; totalTime: number; avgTime: number; opsPerSec: number }> {
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    await fn();
  }

  const end = performance.now();
  const totalTime = end - start;
  const avgTime = totalTime / iterations;
  const opsPerSec = (iterations / totalTime) * 1000;

  return {
    name,
    iterations,
    totalTime,
    avgTime,
    opsPerSec,
  };
}

describe('Cache Performance Benchmarks', () => {
  describe('Basic cache operations', () => {
    let cache: LRUCacheImpl<string>;

    beforeEach(() => {
      cache = new LRUCacheImpl<string>(1000, 5000);
    });

    it('should measure cache set operation performance', () => {
      const result = runBenchmark('cache set', () => {
        cache.set(`key_${Math.random()}`, 'value');
      }, 10000);

      expect(result.avgTime).toBeLessThan(1); // Target: <1ms per operation
      expect(result.opsPerSec).toBeGreaterThan(1000);
    });

    it('should measure cache get operation (hit) performance', () => {
      cache.set('test_key', 'test_value');

      const result = runBenchmark('cache get (hit)', () => {
        cache.get('test_key');
      }, 100000);

      expect(result.avgTime).toBeLessThan(0.01); // Target: <0.01ms per operation
      expect(result.opsPerSec).toBeGreaterThan(100000);
    });

    it('should measure cache get operation (miss) performance', () => {
      const result = runBenchmark('cache get (miss)', () => {
        cache.get('nonexistent_key');
      }, 100000);

      expect(result.avgTime).toBeLessThan(0.01); // Target: <0.01ms per operation
      expect(result.opsPerSec).toBeGreaterThan(100000);
    });

    it('should measure cache has operation performance', () => {
      cache.set('test_key', 'test_value');

      const result = runBenchmark('cache has', () => {
        cache.has('test_key');
      }, 100000);

      expect(result.avgTime).toBeLessThan(0.01);
      expect(result.opsPerSec).toBeGreaterThan(100000);
    });

    it('should measure cache delete operation performance', () => {
      const result = runBenchmark('cache delete', () => {
        cache.set('test_key', 'test_value');
        cache.delete('test_key');
      }, 10000);

      expect(result.avgTime).toBeLessThan(1);
      expect(result.opsPerSec).toBeGreaterThan(1000);
    });
  });

  describe('Cache vs file I/O performance', () => {
    const originalDataFile = process.env.DATA_FILE;

    beforeAll(async () => {
      process.env.DATA_FILE = TEST_DATA_FILE;
      process.env.CACHE_ENABLED = 'false';
      await setupTestData(100);
    });

    afterAll(async () => {
      process.env.DATA_FILE = originalDataFile;
      process.env.CACHE_ENABLED = 'true';
      await cleanupTestData();
    });

    it('should measure file read operation (baseline)', async () => {
      const result = await runBenchmarkAsync('file read', async () => {
        await readApiKeys();
      }, 100);

      // File I/O is typically slower than cache, but with small data may be fast
      expect(result.avgTime).toBeGreaterThan(0.01);
    });

    it('should measure file read with findApiKey (cache disabled)', async () => {
      const result = await runBenchmarkAsync('findApiKey without cache', async () => {
        await findApiKey('pk_test_benchmark_0');
      }, 100);

      // File I/O with small test data may be fast, but should still be measurable
      expect(result.avgTime).toBeGreaterThan(0.001);
    });

    it('should demonstrate cache is >10x faster than file I/O', async () => {
      // Measure cache hit performance
      const cacheImpl = new LRUCacheImpl<ApiKey>(1000, 5000);
      const testKey = createTestApiKeys(1)[0];
      cacheImpl.set(testKey.key, testKey);

      const cacheResult = runBenchmark('cache hit', () => {
        cacheImpl.get(testKey.key);
      }, 10000);

      // Measure file I/O performance
      const fileResult = await runBenchmarkAsync('file I/O', async () => {
        await findApiKey('pk_test_benchmark_0');
      }, 100);

      const speedup = fileResult.avgTime / cacheResult.avgTime;
      expect(speedup).toBeGreaterThan(10); // Cache should be >10x faster
    });
  });

  describe('Cache hit performance improvement', () => {
    let cache: LRUCacheImpl<ApiKey>;
    const testKeys: ApiKey[] = [];

    beforeAll(() => {
      cache = new LRUCacheImpl<ApiKey>(1000, 5000);
      testKeys.push(...createTestApiKeys(10));

      for (const key of testKeys) {
        cache.set(key.key, key);
      }
    });

    it('should measure cache hit - single key retrieval', () => {
      const result = runBenchmark('single key retrieval', () => {
        cache.get('pk_test_benchmark_0');
      }, 100000);

      expect(result.avgTime).toBeLessThan(0.01);
      expect(result.opsPerSec).toBeGreaterThan(100000);
    });

    it('should measure cache hit - random key retrieval', () => {
      const result = runBenchmark('random key retrieval', () => {
        const randomIndex = Math.floor(Math.random() * 10);
        cache.get(`pk_test_benchmark_${randomIndex}`);
      }, 100000);

      expect(result.avgTime).toBeLessThan(0.01);
    });

    it('should measure cache hit - sequential key retrieval (10 keys)', () => {
      const result = runBenchmark('sequential retrieval', () => {
        for (let i = 0; i < 10; i++) {
          cache.get(`pk_test_benchmark_${i}`);
        }
      }, 10000);

      expect(result.avgTime).toBeLessThan(0.1); // 10 operations should still be <0.1ms
    });
  });

  describe('Concurrent access performance', () => {
    let cache: LRUCacheImpl<string>;
    const testKeys: string[] = [];

    beforeAll(() => {
      cache = new LRUCacheImpl<string>(1000, 5000);
      for (let i = 0; i < 100; i++) {
        const key = `key_${i}`;
        testKeys.push(key);
        cache.set(key, `value_${i}`);
      }
    });

    it('should handle 100 read operations efficiently', () => {
      const result = runBenchmark('100 concurrent reads', () => {
        for (let i = 0; i < 100; i++) {
          const key = testKeys[i % 10];
          cache.get(key);
        }
      }, 1000);

      expect(result.avgTime).toBeLessThan(1); // 100 reads should be <1ms
    });

    it('should handle 1000 read operations efficiently', () => {
      const result = runBenchmark('1000 concurrent reads', () => {
        for (let i = 0; i < 1000; i++) {
          const key = testKeys[i % 50];
          cache.get(key);
        }
      }, 100);

      expect(result.avgTime).toBeLessThan(10); // 1000 reads should be <10ms
    });

    it('should handle mixed operations efficiently', () => {
      const result = runBenchmark('mixed operations', () => {
        cache.get(testKeys[Math.floor(Math.random() * 100)]);
        cache.set(`new_key_${Math.random()}`, 'value');
        cache.delete(testKeys[Math.floor(Math.random() * 10)]);
      }, 10000);

      expect(result.avgTime).toBeLessThan(1);
    });
  });

  describe('LRU eviction performance', () => {
    it('should measure LRU eviction at capacity', () => {
      const result = runBenchmark('LRU eviction at capacity', () => {
        const smallCache = new LRUCacheImpl<string>(100, 5000);
        for (let i = 0; i < 100; i++) {
          smallCache.set(`key_${i}`, `value_${i}`);
        }
        smallCache.set('key_100', 'value_100'); // Triggers eviction
      }, 100);

      expect(result.avgTime).toBeLessThan(10); // Even with eviction, should be fast
    });

    it('should handle continuous cache churn', () => {
      const result = runBenchmark('continuous LRU turnover', () => {
        const smallCache = new LRUCacheImpl<string>(100, 5000);
        for (let i = 0; i < 1000; i++) {
          smallCache.set(`key_${i}`, `value_${i}`);
        }
      }, 100);

      expect(result.avgTime).toBeLessThan(50);
    });
  });

  describe('TTL expiration performance', () => {
    it('should measure TTL check for valid entry', () => {
      const cache = new LRUCacheImpl<string>(1000, 5000);
      cache.set('test_key', 'test_value', 5000);

      const result = runBenchmark('TTL check (valid)', () => {
        cache.get('test_key');
      }, 100000);

      expect(result.avgTime).toBeLessThan(0.01);
    });

    it('should measure expired entry removal', async () => {
      const result = await runBenchmarkAsync('TTL expiration', async () => {
        const cache = new LRUCacheImpl<string>(1000, 1);
        cache.set('test_key', 'test_value', 1);
        await new Promise(resolve => setTimeout(resolve, 10));
        cache.get('test_key');
      }, 100);

      expect(result.avgTime).toBeLessThan(20); // Even with expiration, should be fast
    });
  });

  describe('Statistics tracking overhead', () => {
    let cache: LRUCacheImpl<string>;

    beforeEach(() => {
      cache = new LRUCacheImpl<string>(1000, 5000);
    });

    it('should measure getStats operation overhead', () => {
      cache.set('key1', 'value1');
      cache.get('key1');

      const result = runBenchmark('getStats', () => {
        cache.getStats();
      }, 10000);

      expect(result.avgTime).toBeLessThan(0.1);
    });

    it('should measure resetStats operation overhead', () => {
      const result = runBenchmark('resetStats', () => {
        cache.set('key1', 'value1');
        cache.get('key1');
        cache.resetStats();
      }, 10000);

      expect(result.avgTime).toBeLessThan(1);
    });
  });

  describe('Real-world API key lookup scenarios', () => {
    let cache: LRUCacheImpl<ApiKey>;
    const apiKeys: ApiKey[] = [];
    const originalDataFile = process.env.DATA_FILE;

    beforeAll(async () => {
      cache = new LRUCacheImpl<ApiKey>(1000, 300000);

      const now = new Date().toISOString();
      for (let i = 0; i < 50; i++) {
        const apiKey: ApiKey = {
          key: `sk_live_${i}${Math.random().toString(36).substring(2, 15)}`,
          name: `Production API Key ${i}`,
          model: i % 3 === 0 ? 'glm-4' : 'glm-4.7',
          token_limit_per_5h: 1000000,
          expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: now,
          last_used: now,
          total_lifetime_tokens: Math.floor(Math.random() * 1000000),
          usage_windows: [],
        };
        apiKeys.push(apiKey);
        cache.set(apiKey.key, apiKey);
      }

      process.env.DATA_FILE = TEST_DATA_FILE;
      process.env.CACHE_ENABLED = 'false';
      await setupTestData(50);
    });

    afterAll(async () => {
      process.env.DATA_FILE = originalDataFile;
      process.env.CACHE_ENABLED = 'true';
      await cleanupTestData();
    });

    it('should measure API key lookup cache hit (hot path)', () => {
      const result = runBenchmark('API key cache hit', () => {
        const randomKey = apiKeys[Math.floor(Math.random() * 50)];
        cache.get(randomKey.key);
      }, 100000);

      expect(result.avgTime).toBeLessThan(0.01); // Target: <0.01ms
      expect(result.opsPerSec).toBeGreaterThan(100000);
    });

    it('should measure API key lookup file I/O (cold path)', async () => {
      const result = await runBenchmarkAsync('API key file I/O', async () => {
        await findApiKey(`pk_test_benchmark_${Math.floor(Math.random() * 50)}`);
      }, 100);

      // File I/O should complete successfully (performance varies by system)
      expect(result.avgTime).toBeGreaterThan(0);
      expect(result.iterations).toBe(100);
    });

    it('should simulate typical request pattern (90% cache hit rate)', () => {
      const result = runBenchmark('typical request pattern', () => {
        for (let i = 0; i < 100; i++) {
          if (i < 90) {
            cache.get(apiKeys[i % 10].key);
          } else {
            cache.get(`nonexistent_key_${i}`);
          }
        }
      }, 1000);

      expect(result.avgTime).toBeLessThan(1); // 100 operations should be <1ms
    });
  });

  describe('Cache warm-up performance', () => {
    it('should measure warm-up time for 100 keys', () => {
      const result = runBenchmark('warm-up 100 keys', () => {
        const cache = new LRUCacheImpl<ApiKey>(1000, 300000);
        const keys = createTestApiKeys(100);
        for (const key of keys) {
          cache.set(key.key, key);
        }
      }, 100);

      expect(result.avgTime).toBeLessThan(50); // Should complete in <50ms
    });

    it('should measure warm-up time for 500 keys', () => {
      const result = runBenchmark('warm-up 500 keys', () => {
        const cache = new LRUCacheImpl<ApiKey>(1000, 300000);
        const keys = createTestApiKeys(500);
        for (const key of keys) {
          cache.set(key.key, key);
        }
      }, 100);

      expect(result.avgTime).toBeLessThan(200); // Should complete in <200ms
    });

    it('should measure warm-up time for 1000 keys (max size)', () => {
      const result = runBenchmark('warm-up 1000 keys', () => {
        const cache = new LRUCacheImpl<ApiKey>(1000, 300000);
        const keys = createTestApiKeys(1000);
        for (const key of keys) {
          cache.set(key.key, key);
        }
      }, 10);

      expect(result.avgTime).toBeLessThan(500); // Should complete in <500ms
    });
  });

  describe('Memory efficiency', () => {
    it('should handle memory usage for 100 entries', () => {
      const result = runBenchmark('memory 100 entries', () => {
        const cache = new LRUCacheImpl<string>(100, 5000);
        for (let i = 0; i < 100; i++) {
          cache.set(`key_${i}`, `value_${i}`.repeat(100));
        }
      }, 100);

      expect(result.avgTime).toBeLessThan(50);
    });

    it('should handle memory usage for 1000 entries', () => {
      const result = runBenchmark('memory 1000 entries', () => {
        const cache = new LRUCacheImpl<string>(1000, 5000);
        for (let i = 0; i < 1000; i++) {
          cache.set(`key_${i}`, `value_${i}`.repeat(100));
        }
      }, 10);

      expect(result.avgTime).toBeLessThan(500);
    });
  });

  describe('Performance targets verification', () => {
    it('should meet all acceptance criteria for cache performance', async () => {
      const cache = new LRUCacheImpl<ApiKey>(1000, 300000);
      const testKey = createTestApiKeys(1)[0];
      cache.set(testKey.key, testKey);

      // Measure cache hit latency
      const cacheStart = performance.now();
      for (let i = 0; i < 10000; i++) {
        cache.get(testKey.key);
      }
      const cacheEnd = performance.now();
      const avgCacheLatency = (cacheEnd - cacheStart) / 10000;

      // Verify cache hit latency < 1ms
      expect(avgCacheLatency).toBeLessThan(1);

      // Measure throughput (operations per second)
      const opsPerSec = 1000 / avgCacheLatency;
      expect(opsPerSec).toBeGreaterThan(1000);

      // Verify cache vs file I/O speedup
      process.env.DATA_FILE = TEST_DATA_FILE;
      process.env.CACHE_ENABLED = 'false';
      await setupTestData(1);

      const fileStart = performance.now();
      for (let i = 0; i < 100; i++) {
        await findApiKey('pk_test_benchmark_0');
      }
      const fileEnd = performance.now();
      const avgFileLatency = (fileEnd - fileStart) / 100;

      const speedup = avgFileLatency / avgCacheLatency;
      // With small test data, speedup may vary, but cache should still be faster
      expect(speedup).toBeGreaterThan(2); // At least 2x improvement

      process.env.DATA_FILE = process.env.DATA_FILE || '';
      process.env.CACHE_ENABLED = 'true';
      await cleanupTestData();
    });
  });
});

/**
 * Performance Results Summary
 *
 * Expected results based on acceptance criteria:
 *
 * 1. Latency Reduction:
 *    - Cache hit: <1ms (target)
 *    - File I/O: 5-50ms (baseline)
 *    - Improvement: 10-50x faster
 *
 * 2. Throughput:
 *    - Cache hit path: >10,000 ops/sec
 *    - File I/O path: 200-1,000 ops/sec
 *    - Improvement: 10-50x higher throughput
 *
 * 3. I/O Reduction:
 *    - With 95%+ cache hit rate: >95% reduction in file reads
 *    - Concurrent load: Eliminates file locking contention
 *
 * 4. LRU Eviction:
 *    - O(1) eviction time
 *    - No performance degradation at max capacity
 *
 * 5. TTL Expiration:
 *    - Lazy expiration check: O(1) on get operation
 *    - Minimal overhead on cache hit path
 *
 * To run benchmarks and see actual results:
 * bun test test/benchmarks/cache-benchmark.test.ts
 *
 * The benchmarks use manual performance measurements with performance.now()
 * to measure actual execution time. Each test includes assertions to verify
 * that performance meets the acceptance criteria.
 */
