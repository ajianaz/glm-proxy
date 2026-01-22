import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LRUCacheImpl, LRUCache, CacheStats } from '../src/cache.js';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCacheImpl<string>(3, 100); // maxSize: 3, TTL: 100ms for testing
  });

  describe('Basic get/set operations', () => {
    it('should set and get a value', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for non-existent key', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should update existing key', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
      expect(cache.size).toBe(1);
    });

    it('should store null values', () => {
      cache.set('key1', null);
      expect(cache.get('key1')).toBeNull();
      expect(cache.has('key1')).toBe(true);
    });

    it('should return correct size', () => {
      expect(cache.size).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);
    });

    it('should return correct maxSize', () => {
      expect(cache.maxSize).toBe(3);
    });
  });

  describe('TTL expiration', () => {
    it('should return value before TTL expires', () => {
      cache.set('key1', 'value1', 100);
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null after TTL expires', async () => {
      cache.set('key1', 'value1', 50); // 50ms TTL
      await new Promise(resolve => setTimeout(resolve, 60)); // Wait for expiration
      expect(cache.get('key1')).toBeNull();
    });

    it('should remove expired entries from cache', async () => {
      cache.set('key1', 'value1', 50);
      expect(cache.size).toBe(1);
      await new Promise(resolve => setTimeout(resolve, 60));
      cache.get('key1'); // Trigger expiration check
      expect(cache.size).toBe(0);
    });

    it('should count expired entries as cache misses', async () => {
      cache.set('key1', 'value1', 50);
      await new Promise(resolve => setTimeout(resolve, 60));
      cache.get('key1'); // Expired, should be a miss
      const stats = cache.getStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
    });

    it('should use default TTL when not specified', async () => {
      const defaultCache = new LRUCacheImpl<string>(10, 50); // 50ms default TTL
      defaultCache.set('key1', 'value1');
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(defaultCache.get('key1')).toBeNull();
    });

    it('should allow custom TTL override', async () => {
      const defaultCache = new LRUCacheImpl<string>(10, 50); // 50ms default TTL
      defaultCache.set('key1', 'value1', 200); // 200ms custom TTL
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(defaultCache.get('key1')).toBe('value1'); // Should still be valid
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry when cache is full', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      expect(cache.size).toBe(3);

      // This should evict key1 (least recently used)
      cache.set('key4', 'value4');
      expect(cache.size).toBe(3);
      expect(cache.get('key1')).toBeNull(); // key1 was evicted
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should update LRU order on get', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 to make it more recently used
      cache.get('key1');

      // Add key4, should evict key2 (now least recently used)
      cache.set('key4', 'value4');
      expect(cache.get('key2')).toBeNull(); // key2 was evicted
      expect(cache.get('key1')).toBe('value1'); // key1 still exists
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should update LRU order on set', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Update key1 to make it more recently used
      cache.set('key1', 'value1-updated');

      // Add key4, should evict key2 (now least recently used)
      cache.set('key4', 'value4');
      expect(cache.get('key2')).toBeNull(); // key2 was evicted
      expect(cache.get('key1')).toBe('value1-updated'); // key1 still exists
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should handle eviction correctly with repeated access', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 and key2 multiple times
      cache.get('key1');
      cache.get('key2');
      cache.get('key1');

      // Add key4, should evict key3
      cache.set('key4', 'value4');
      expect(cache.get('key3')).toBeNull(); // key3 was evicted
      expect(cache.get('key1')).toBe('value1');
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key4')).toBe('value4');
    });
  });

  describe('Cache statistics tracking', () => {
    beforeEach(() => {
      cache = new LRUCacheImpl<string>(10, 100);
    });

    it('should track cache hits', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // Hit
      cache.get('key1'); // Hit

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(0);
    });

    it('should track cache misses', () => {
      cache.get('nonexistent1'); // Miss
      cache.get('nonexistent2'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(2);
    });

    it('should calculate hit rate correctly', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.get('key1'); // Hit
      cache.get('key2'); // Hit
      cache.get('nonexistent'); // Miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });

    it('should return 0% hit rate when no operations', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('should track size in statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(10);
    });

    it('should reset statistics', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // Hit
      cache.get('nonexistent'); // Miss

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.size).toBe(1); // Size should remain
    });

    it('should track expired entries as misses', async () => {
      cache.set('key1', 'value1', 50);
      await new Promise(resolve => setTimeout(resolve, 60));
      cache.get('key1'); // Expired = miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
    });
  });

  describe('has operation', () => {
    it('should return true for existing key', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
    });

    it('should return false for non-existent key', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return false for expired entries', async () => {
      cache.set('key1', 'value1', 50);
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(cache.has('key1')).toBe(false);
    });

    it('should not update LRU order', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.has('key1'); // Should not update LRU order

      // Add key4, should evict key1 (least recently used, has() didn't update order)
      cache.set('key4', 'value4');
      expect(cache.get('key1')).toBeNull(); // key1 was evicted (was least recently used)
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('delete operation', () => {
    it('should delete existing key', () => {
      cache.set('key1', 'value1');
      cache.delete('key1');
      expect(cache.get('key1')).toBeNull();
      expect(cache.has('key1')).toBe(false);
      expect(cache.size).toBe(0);
    });

    it('should be no-op for non-existent key', () => {
      cache.delete('nonexistent');
      expect(cache.size).toBe(0);
    });

    it('should handle deleting from middle of cache', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.delete('key2');
      expect(cache.size).toBe(2);
      expect(cache.has('key2')).toBe(false);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key3')).toBe(true);
    });

    it('should handle deleting oldest entry', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.delete('key1');
      expect(cache.size).toBe(2);
      expect(cache.get('key1')).toBeNull();
    });

    it('should handle deleting newest entry', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.delete('key3');
      expect(cache.size).toBe(2);
      expect(cache.get('key3')).toBeNull();
    });
  });

  describe('clear operation', () => {
    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
      expect(cache.get('key3')).toBeNull();
    });

    it('should preserve statistics after clear', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // Hit
      cache.get('nonexistent'); // Miss

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(cache.size).toBe(0);
    });

    it('should allow adding entries after clear', () => {
      cache.set('key1', 'value1');
      cache.clear();
      expect(cache.size).toBe(0);

      cache.set('key2', 'value2');
      expect(cache.size).toBe(1);
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty cache', () => {
      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeNull();
      expect(cache.has('key1')).toBe(false);
    });

    it('should handle duplicate keys', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      cache.set('key1', 'value3');

      expect(cache.get('key1')).toBe('value3');
      expect(cache.size).toBe(1);
    });

    it('should handle special characters in keys', () => {
      const largeCache = new LRUCacheImpl<string>(10, 100);

      largeCache.set('key with spaces', 'value1');
      largeCache.set('key-with-dashes', 'value2');
      largeCache.set('key_with_underscores', 'value3');
      largeCache.set('key.with.dots', 'value4');

      expect(largeCache.get('key with spaces')).toBe('value1');
      expect(largeCache.get('key-with-dashes')).toBe('value2');
      expect(largeCache.get('key_with_underscores')).toBe('value3');
      expect(largeCache.get('key.with.dots')).toBe('value4');
    });

    it('should handle empty string as key', () => {
      cache.set('', 'empty-key-value');
      expect(cache.get('')).toBe('empty-key-value');
    });

    it('should handle very long keys', () => {
      const longKey = 'a'.repeat(1000);
      cache.set(longKey, 'value');
      expect(cache.get(longKey)).toBe('value');
    });

    it('should handle null values correctly', () => {
      cache.set('key1', null);
      expect(cache.get('key1')).toBeNull();
      expect(cache.has('key1')).toBe(true);

      // Distinguish between null value and missing key
      expect(cache.get('nonexistent')).toBeNull();
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should handle updating value from non-null to null', () => {
      cache.set('key1', 'value1');
      cache.set('key1', null);
      expect(cache.get('key1')).toBeNull();
      expect(cache.has('key1')).toBe(true);
    });

    it('should handle updating value from null to non-null', () => {
      cache.set('key1', null);
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should handle cache with maxSize of 1', () => {
      const smallCache = new LRUCacheImpl<string>(1, 100);

      smallCache.set('key1', 'value1');
      expect(smallCache.size).toBe(1);
      expect(smallCache.get('key1')).toBe('value1');

      smallCache.set('key2', 'value2');
      expect(smallCache.size).toBe(1);
      expect(smallCache.get('key1')).toBeNull(); // Evicted
      expect(smallCache.get('key2')).toBe('value2');
    });

    it('should handle very large maxSize', () => {
      const largeCache = new LRUCacheImpl<string>(10000, 100);

      for (let i = 0; i < 1000; i++) {
        largeCache.set(`key${i}`, `value${i}`);
      }

      expect(largeCache.size).toBe(1000);
      expect(largeCache.get('key0')).toBe('value0');
      expect(largeCache.get('key999')).toBe('value999');
    });
  });

  describe('Concurrent access simulation', () => {
    it('should handle rapid set operations', () => {
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i % 3}`, `value${i}`); // Only 3 keys due to maxSize
      }

      expect(cache.size).toBe(3);
      expect(cache.has('key0')).toBe(true);
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('key2')).toBe(true);
    });

    it('should handle rapid get operations', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      for (let i = 0; i < 100; i++) {
        cache.get('key1');
        cache.get('key2');
      }

      const stats = cache.getStats();
      expect(stats.hits).toBe(200);
      expect(stats.misses).toBe(0);
    });

    it('should handle interleaved operations', () => {
      cache.set('key1', 'value1');
      cache.get('key1'); // Hit
      cache.get('key2'); // Miss (doesn't exist yet)
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.delete('key1');
      cache.set('key4', 'value4'); // Should add without eviction (size is 2 after delete)

      expect(cache.size).toBe(3);
      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(true);
      expect(cache.has('key3')).toBe(true);
      expect(cache.has('key4')).toBe(true);

      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });
  });

  describe('Statistics accuracy', () => {
    it('should maintain accurate statistics across all operations', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.get('key1'); // Hit (1)
      cache.get('key2'); // Hit (2)
      cache.get('key3'); // Miss (1)

      cache.has('key1'); // No stats change
      cache.has('key4'); // No stats change

      cache.set('key3', 'value3');
      cache.get('key3'); // Hit (3)

      cache.delete('key1'); // No stats change
      cache.get('key1'); // Miss (2)

      cache.clear(); // No stats reset

      const stats = cache.getStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(60);
      expect(stats.size).toBe(0);
    });

    it('should track LRU eviction without affecting stats', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.get('key1'); // Hit (1)
      cache.get('key2'); // Hit (2)

      cache.set('key4', 'value4'); // Evicts key3

      cache.get('key3'); // Miss (1) - evicted
      cache.get('key4'); // Hit (3)

      const stats = cache.getStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(1);
    });
  });

  describe('TTL edge cases', () => {
    it('should handle zero TTL', async () => {
      cache.set('key1', 'value1', 0);
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(cache.get('key1')).toBeNull(); // Should expire immediately
    });

    it('should handle very short TTL', async () => {
      cache.set('key1', 'value1', 1); // 1ms TTL
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(cache.get('key1')).toBeNull();
    });

    it('should handle very long TTL', () => {
      cache.set('key1', 'value1', 999999999); // Very long TTL
      expect(cache.get('key1')).toBe('value1');
    });

    it('should refresh TTL on update', async () => {
      cache.set('key1', 'value1', 50);
      await new Promise(resolve => setTimeout(resolve, 30));

      cache.set('key1', 'value1-updated', 100); // Refresh TTL
      await new Promise(resolve => setTimeout(resolve, 30));

      // Original TTL would have expired, but updated one is still valid
      expect(cache.get('key1')).toBe('value1-updated');
    });
  });

  describe('Real-world scenarios', () => {
    it('should simulate API key caching pattern', () => {
      // Simulate API keys
      const apiKey1 = { key: 'pk_1', name: 'User1', model: 'glm-4.7' };
      const apiKey2 = { key: 'pk_2', name: 'User2', model: 'glm-4' };

      const apiCache = new LRUCacheImpl<typeof apiKey1>(10, 5000);

      // First request - cache miss
      let result = apiCache.get('pk_1');
      expect(result).toBeNull();

      // Populate cache
      apiCache.set('pk_1', apiKey1);
      apiCache.set('pk_2', apiKey2);

      // Subsequent requests - cache hits
      result = apiCache.get('pk_1');
      expect(result).toEqual(apiKey1);

      result = apiCache.get('pk_2');
      expect(result).toEqual(apiKey2);

      const stats = apiCache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });

    it('should simulate negative caching for invalid keys', () => {
      const invalidKeyCache = new LRUCacheImpl<string | null>(10, 5000);

      // Cache negative result (key not found)
      invalidKeyCache.set('pk_invalid', null);

      // Check - should find it (to avoid repeated disk lookups)
      expect(invalidKeyCache.has('pk_invalid')).toBe(true);
      expect(invalidKeyCache.get('pk_invalid')).toBeNull();

      // Distinguish from truly non-existent key
      expect(invalidKeyCache.has('pk_another_invalid')).toBe(false);
    });

    it('should handle cache warm-up scenario', () => {
      const warmCache = new LRUCacheImpl<string>(100, 5000);

      // Simulate loading many keys at startup
      for (let i = 0; i < 50; i++) {
        warmCache.set(`pk_${i}`, `key_data_${i}`);
      }

      expect(warmCache.size).toBe(50);
      expect(warmCache.get('pk_0')).toBe('key_data_0');
      expect(warmCache.get('pk_49')).toBe('key_data_49');
    });
  });
});
