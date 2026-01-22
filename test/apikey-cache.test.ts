/**
 * API Key Cache Tests
 *
 * Comprehensive test suite for ApiKeyCache functionality
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { ApiKeyCache, getApiKeyCache, resetApiKeyCache } from '../src/cache/ApiKeyCache.js';
import type { ApiKey } from '../src/types.js';

// Helper function to create a mock API key
function createMockApiKey(key: string, name: string): ApiKey {
  return {
    key,
    name,
    token_limit_per_5h: 100000,
    expiry_date: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
    created_at: new Date().toISOString(),
    last_used: new Date().toISOString(),
    total_lifetime_tokens: 0,
    usage_windows: [],
  };
}

describe('ApiKeyCache', () => {
  let cache: ApiKeyCache;

  beforeEach(() => {
    // Reset global cache before each test
    cache = new ApiKeyCache({
      maxSize: 5,
      ttl: 1000, // 1 second for testing
      enableMetrics: true,
    });
  });

  describe('Basic Cache Operations', () => {
    test('should store and retrieve API keys', () => {
      const apiKey = createMockApiKey('key1', 'Test Key 1');
      cache.set('key1', apiKey);

      const retrieved = cache.get('key1');
      expect(retrieved).not.toBeNull();
      expect(retrieved?.key).toBe('key1');
      expect(retrieved?.name).toBe('Test Key 1');
    });

    test('should return null for non-existent keys', () => {
      const retrieved = cache.get('nonexistent');
      expect(retrieved).toBeNull();
    });

    test('should overwrite existing keys', () => {
      const key1 = createMockApiKey('key1', 'Original');
      cache.set('key1', key1);

      const key2 = createMockApiKey('key1', 'Updated');
      cache.set('key1', key2);

      const retrieved = cache.get('key1');
      expect(retrieved?.name).toBe('Updated');
    });

    test('should check if key exists', () => {
      const apiKey = createMockApiKey('key1', 'Test Key 1');
      cache.set('key1', apiKey);

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    test('should delete keys', () => {
      const apiKey = createMockApiKey('key1', 'Test Key 1');
      cache.set('key1', apiKey);

      expect(cache.has('key1')).toBe(true);
      expect(cache.delete('key1')).toBe(true);
      expect(cache.has('key1')).toBe(false);
    });

    test('should return false when deleting non-existent key', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });

    test('should clear all keys', () => {
      cache.set('key1', createMockApiKey('key1', 'Key 1'));
      cache.set('key2', createMockApiKey('key2', 'Key 2'));
      cache.set('key3', createMockApiKey('key3', 'Key 3'));

      expect(cache.size()).toBe(3);
      cache.clear();
      expect(cache.size()).toBe(0);
    });

    test('should return correct size', () => {
      expect(cache.size()).toBe(0);

      cache.set('key1', createMockApiKey('key1', 'Key 1'));
      expect(cache.size()).toBe(1);

      cache.set('key2', createMockApiKey('key2', 'Key 2'));
      expect(cache.size()).toBe(2);

      cache.delete('key1');
      expect(cache.size()).toBe(1);
    });
  });

  describe('LRU Eviction', () => {
    test('should evict least recently used key when cache is full', () => {
      const maxSize = 3;
      const lruCache = new ApiKeyCache({ maxSize, ttl: 10000 });

      // Fill cache to max capacity
      lruCache.set('key1', createMockApiKey('key1', 'Key 1'));
      lruCache.set('key2', createMockApiKey('key2', 'Key 2'));
      lruCache.set('key3', createMockApiKey('key3', 'Key 3'));

      expect(lruCache.size()).toBe(maxSize);

      // Access key1 and key2 to make key3 the LRU
      lruCache.get('key1');
      lruCache.get('key2');

      // Add key4 - should evict key3 (LRU)
      lruCache.set('key4', createMockApiKey('key4', 'Key 4'));

      expect(lruCache.size()).toBe(maxSize);
      expect(lruCache.has('key1')).toBe(true);
      expect(lruCache.has('key2')).toBe(true);
      expect(lruCache.has('key3')).toBe(false); // Evicted
      expect(lruCache.has('key4')).toBe(true);
    });

    test('should update LRU order on access', () => {
      const maxSize = 3;
      const lruCache = new ApiKeyCache({ maxSize, ttl: 10000 });

      lruCache.set('key1', createMockApiKey('key1', 'Key 1'));
      lruCache.set('key2', createMockApiKey('key2', 'Key 2'));
      lruCache.set('key3', createMockApiKey('key3', 'Key 3'));

      // Access key1 to make it MRU
      lruCache.get('key1');

      // Add key4 - should evict key2 (now LRU)
      lruCache.set('key4', createMockApiKey('key4', 'Key 4'));

      expect(lruCache.has('key1')).toBe(true);
      expect(lruCache.has('key2')).toBe(false); // Evicted
      expect(lruCache.has('key3')).toBe(true);
      expect(lruCache.has('key4')).toBe(true);
    });

    test('should not evict when updating existing key', () => {
      const maxSize = 3;
      const lruCache = new ApiKeyCache({ maxSize, ttl: 10000 });

      lruCache.set('key1', createMockApiKey('key1', 'Key 1'));
      lruCache.set('key2', createMockApiKey('key2', 'Key 2'));
      lruCache.set('key3', createMockApiKey('key3', 'Key 3'));

      // Update key1 (should not cause eviction)
      lruCache.set('key1', createMockApiKey('key1', 'Updated Key 1'));

      expect(lruCache.size()).toBe(3);
      expect(lruCache.has('key1')).toBe(true);
      expect(lruCache.has('key2')).toBe(true);
      expect(lruCache.has('key3')).toBe(true);
    });
  });

  describe('TTL Expiration', () => {
    test('should expire entries after TTL', async () => {
      const ttl = 100; // 100ms
      const ttlCache = new ApiKeyCache({ maxSize: 100, ttl });

      const apiKey = createMockApiKey('key1', 'Test Key 1');
      ttlCache.set('key1', apiKey);

      // Should be available immediately
      expect(ttlCache.get('key1')).not.toBeNull();

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired now
      expect(ttlCache.get('key1')).toBeNull();
    });

    test('should refresh TTL on access', async () => {
      const ttl = 200; // 200ms
      const ttlCache = new ApiKeyCache({ maxSize: 100, ttl });

      const apiKey = createMockApiKey('key1', 'Test Key 1');
      ttlCache.set('key1', apiKey);

      // Wait 100ms
      await new Promise(resolve => setTimeout(resolve, 100));

      // Access the key - should refresh TTL
      const retrieved = ttlCache.get('key1');
      expect(retrieved).not.toBeNull();

      // Wait another 150ms (total 250ms from start, but 150ms from last access)
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should still be available because TTL was refreshed
      expect(ttlCache.get('key1')).not.toBeNull();
    });

    test('should cleanup expired entries', async () => {
      const ttl = 100; // 100ms
      const ttlCache = new ApiKeyCache({ maxSize: 100, ttl });

      ttlCache.set('key1', createMockApiKey('key1', 'Key 1'));
      ttlCache.set('key2', createMockApiKey('key2', 'Key 2'));

      expect(ttlCache.size()).toBe(2);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      const removed = ttlCache.cleanup();
      expect(removed).toBe(2);
      expect(ttlCache.size()).toBe(0);
    });
  });

  describe('Metrics Tracking', () => {
    test('should track cache hits and misses', () => {
      const apiKey = createMockApiKey('key1', 'Test Key 1');
      cache.set('key1', apiKey);

      // Hit
      cache.get('key1');

      // Misses
      cache.get('nonexistent1');
      cache.get('nonexistent2');

      const metrics = cache.getMetrics();
      expect(metrics.totalLookups).toBe(3);
      expect(metrics.hits).toBe(1);
      expect(metrics.misses).toBe(2);
      expect(metrics.hitRate).toBeCloseTo(1/3, 2);
    });

    test('should track cache hit rate', () => {
      const apiKey = createMockApiKey('key1', 'Test Key 1');
      cache.set('key1', apiKey);

      // 3 hits
      cache.get('key1');
      cache.get('key1');
      cache.get('key1');

      // 2 misses
      cache.get('nonexistent1');
      cache.get('nonexistent2');

      const metrics = cache.getMetrics();
      expect(metrics.hitRate).toBeCloseTo(0.6, 2); // 3/5 = 0.6
    });

    test('should track average lookup time', () => {
      const apiKey = createMockApiKey('key1', 'Test Key 1');
      cache.set('key1', apiKey);

      cache.get('key1');
      cache.get('key1');
      cache.get('key1');

      const metrics = cache.getMetrics();
      expect(metrics.totalLookups).toBe(3);
      expect(metrics.avgLookupTime).toBeGreaterThan(0);
    });

    test('should reset metrics', () => {
      const apiKey = createMockApiKey('key1', 'Test Key 1');
      cache.set('key1', apiKey);

      cache.get('key1');
      cache.get('nonexistent');

      cache.resetMetrics();

      const metrics = cache.getMetrics();
      expect(metrics.totalLookups).toBe(0);
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.hitRate).toBe(0);
    });

    test('should include timestamp in metrics', () => {
      const beforeTime = Date.now();
      const metrics = cache.getMetrics();
      const afterTime = Date.now();

      expect(metrics.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(metrics.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('Global Instance', () => {
    test('should return same instance on subsequent calls', () => {
      const instance1 = getApiKeyCache({ maxSize: 10 });
      const instance2 = getApiKeyCache();

      expect(instance1).toBe(instance2);
    });

    test('should create new instance when reset', () => {
      const instance1 = getApiKeyCache({ maxSize: 10 });
      const instance2 = resetApiKeyCache({ maxSize: 20 });

      expect(instance1).not.toBe(instance2);
    });

    test('should persist data across getApiKeyCache calls', () => {
      const cache1 = getApiKeyCache();
      cache1.set('key1', createMockApiKey('key1', 'Key 1'));

      const cache2 = getApiKeyCache();
      expect(cache2.has('key1')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty key string', () => {
      const apiKey = createMockApiKey('', 'Empty Key');
      cache.set('', apiKey);

      expect(cache.has('')).toBe(true);
      expect(cache.get('')?.name).toBe('Empty Key');
    });

    test('should handle special characters in key', () => {
      const specialKey = 'key-with-special.chars_123';
      const apiKey = createMockApiKey(specialKey, 'Special Key');
      cache.set(specialKey, apiKey);

      expect(cache.get(specialKey)?.key).toBe(specialKey);
    });

    test('should handle rapid set and get operations', () => {
      // Cache has maxSize of 5, so only last 5 items should remain
      for (let i = 0; i < 100; i++) {
        const key = `key${i}`;
        cache.set(key, createMockApiKey(key, `Key ${i}`));
      }

      // Only the last 5 items should be in the cache (due to LRU eviction)
      expect(cache.size()).toBe(5);

      // Check that the last 5 items are present
      for (let i = 95; i < 100; i++) {
        const key = `key${i}`;
        expect(cache.has(key)).toBe(true);
      }

      // Check that earlier items were evicted
      expect(cache.has('key0')).toBe(false);
      expect(cache.has('key50')).toBe(false);
    });

    test('should handle concurrent invalidations', () => {
      cache.set('key1', createMockApiKey('key1', 'Key 1'));
      cache.set('key2', createMockApiKey('key2', 'Key 2'));
      cache.set('key3', createMockApiKey('key3', 'Key 3'));

      cache.invalidate('key1');
      cache.invalidate('key2');
      cache.invalidate('key3');

      expect(cache.size()).toBe(0);
    });

    test('should handle very large cache size', () => {
      const largeCache = new ApiKeyCache({ maxSize: 10000 });

      for (let i = 0; i < 100; i++) {
        largeCache.set(`key${i}`, createMockApiKey(`key${i}`, `Key ${i}`));
      }

      expect(largeCache.size()).toBe(100);
    });
  });

  describe('Environment Variables', () => {
    test('should use environment variables for configuration', () => {
      process.env.APIKEY_CACHE_SIZE = '50';
      process.env.APIKEY_CACHE_TTL_MS = '5000';

      const envCache = new ApiKeyCache();
      const metrics = envCache.getMetrics();

      expect(metrics.maxSize).toBe(50);
      // Note: We can't easily test TTL without waiting, but it should be set

      // Clean up
      delete process.env.APIKEY_CACHE_SIZE;
      delete process.env.APIKEY_CACHE_TTL_MS;
    });
  });

  describe('Debug and Utility Methods', () => {
    test('should return all keys', () => {
      cache.set('key1', createMockApiKey('key1', 'Key 1'));
      cache.set('key2', createMockApiKey('key2', 'Key 2'));
      cache.set('key3', createMockApiKey('key3', 'Key 3'));

      const keys = cache.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });

    test('should return all entries', () => {
      const key1 = createMockApiKey('key1', 'Key 1');
      const key2 = createMockApiKey('key2', 'Key 2');

      cache.set('key1', key1);
      cache.set('key2', key2);

      const entries = cache.entries();
      expect(entries).toHaveLength(2);

      const entry1 = entries.find(e => e.key === 'key1');
      expect(entry1).toBeDefined();
      expect(entry1?.entry.apiKey.name).toBe('Key 1');
    });

    test('should track access count', () => {
      const apiKey = createMockApiKey('key1', 'Key 1');
      cache.set('key1', apiKey);

      cache.get('key1');
      cache.get('key1');
      cache.get('key1');

      const entries = cache.entries();
      const entry = entries.find(e => e.key === 'key1');

      expect(entry?.entry.accessCount).toBe(3);
    });

    test('should update last accessed time', async () => {
      const apiKey = createMockApiKey('key1', 'Key 1');
      cache.set('key1', apiKey);

      const firstAccess = cache.entries().find(e => e.key === 'key1')?.entry.lastAccessedAt;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      cache.get('key1');

      const secondAccess = cache.entries().find(e => e.key === 'key1')?.entry.lastAccessedAt;

      expect(secondAccess).toBeGreaterThan(firstAccess!);
    });
  });

  describe('Integration with Storage', () => {
    test('should work with storage layer caching pattern', async () => {
      // Simulate the pattern used in storage.ts
      const apiKey = createMockApiKey('cached-key', 'Cached Key');

      // First call - cache miss
      let result = cache.get('cached-key');
      expect(result).toBeNull();

      // Simulate storage read and cache population
      cache.set('cached-key', apiKey);

      // Second call - cache hit
      result = cache.get('cached-key');
      expect(result).not.toBeNull();
      expect(result?.key).toBe('cached-key');

      // Simulate storage update
      cache.invalidate('cached-key');

      // Third call - cache miss again
      result = cache.get('cached-key');
      expect(result).toBeNull();
    });
  });

  describe('Metrics Disabled', () => {
    test('should not track metrics when disabled', () => {
      const noMetricsCache = new ApiKeyCache({
        maxSize: 10,
        ttl: 1000,
        enableMetrics: false,
      });

      const apiKey = createMockApiKey('key1', 'Key 1');
      noMetricsCache.set('key1', apiKey);

      noMetricsCache.get('key1');
      noMetricsCache.get('nonexistent');

      const metrics = noMetricsCache.getMetrics();
      expect(metrics.totalLookups).toBe(0);
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
    });
  });
});
