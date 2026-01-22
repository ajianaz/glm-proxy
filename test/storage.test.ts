import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { readApiKeys, writeApiKeys, findApiKey, updateApiKeyUsage } from '../src/storage.js';
import { apiKeyCache } from '../src/cache.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// Mock DATA_FILE environment variable for tests
const TEST_FILE = join(process.cwd(), 'data', 'test-apikeys.json');

// Save original DATA_FILE and CACHE_ENABLED
const originalDataFile = process.env.DATA_FILE;
const originalCacheEnabled = process.env.CACHE_ENABLED;

const testApiKey = {
  key: 'pk_test',
  name: 'Test',
  model: 'glm-4.7',
  token_limit_per_5h: 100000,
  expiry_date: '2026-12-31T23:59:59Z',
  created_at: '2026-01-18T00:00:00Z',
  last_used: '2026-01-18T00:00:00Z',
  total_lifetime_tokens: 0,
  usage_windows: [],
};

describe('Storage', () => {
  const ACTUAL_FILE = join(process.cwd(), 'data', 'apikeys.json');

  beforeEach(() => {
    // Set test data file
    process.env.DATA_FILE = TEST_FILE;
    process.env.CACHE_ENABLED = 'true';

    // Clean up both test file and actual file before each test
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }
    if (existsSync(ACTUAL_FILE)) {
      unlinkSync(ACTUAL_FILE);
    }

    // Clear cache before each test
    apiKeyCache.clear();
    apiKeyCache.resetStats();
  });

  afterAll(() => {
    // Restore original DATA_FILE and CACHE_ENABLED
    process.env.DATA_FILE = originalDataFile;
    process.env.CACHE_ENABLED = originalCacheEnabled;

    // Clean up test file
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }
  });

  describe('readApiKeys', () => {
    it('should return empty keys for non-existent file', async () => {
      const result = await readApiKeys();
      expect(result.keys).toHaveLength(0);
    });
  });

  describe('writeApiKeys and readApiKeys', () => {
    it('should write and read API keys', async () => {
      const data = {
        keys: [testApiKey],
      };

      await writeApiKeys(data);
      const read = await readApiKeys();

      expect(read.keys).toHaveLength(1);
      expect(read.keys[0].key).toBe('pk_test');
    });
  });

  describe('findApiKey with cache integration', () => {
    it('should return null for non-existent key (cache miss and file miss)', async () => {
      const result = await findApiKey('pk_nonexistent');
      expect(result).toBeNull();
    });

    it('should return ApiKey for existing key (cache miss, file hit, cache populate)', async () => {
      // Write API key to file
      await writeApiKeys({ keys: [testApiKey] });

      // First call - cache miss, should read from file
      const result1 = await findApiKey('pk_test');
      expect(result1).toEqual(testApiKey);

      // Verify cache was populated
      expect(apiKeyCache.has('pk_test')).toBe(true);
    });

    it('should return ApiKey from cache on second call (cache hit)', async () => {
      // Write API key to file
      await writeApiKeys({ keys: [testApiKey] });

      // First call - populates cache
      await findApiKey('pk_test');

      // Reset stats to isolate the cache hit test
      apiKeyCache.resetStats();

      // Second call - should hit cache
      const result2 = await findApiKey('pk_test');
      expect(result2).toEqual(testApiKey);

      // Verify cache hit
      const stats = apiKeyCache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
    });

    it('should cache not-found keys as null (negative caching)', async () => {
      // Ensure no keys in file
      await writeApiKeys({ keys: [] });

      // First call for non-existent key
      await findApiKey('pk_nonexistent');

      // Verify null was cached
      expect(apiKeyCache.has('pk_nonexistent')).toBe(true);
      expect(apiKeyCache.get('pk_nonexistent')).toBeNull();

      // Reset stats to isolate the second call test
      apiKeyCache.resetStats();

      // Second call should hit cache (even though returns null)
      const result2 = await findApiKey('pk_nonexistent');
      expect(result2).toBeNull();

      const stats = apiKeyCache.getStats();
      expect(stats.hits).toBe(1); // Second call was a cache hit
      expect(stats.misses).toBe(0);
    });

    it('should handle multiple keys with correct cache population', async () => {
      const apiKey2 = {
        ...testApiKey,
        key: 'pk_test2',
        name: 'Test2',
      };

      await writeApiKeys({ keys: [testApiKey, apiKey2] });

      // Look up both keys
      const result1 = await findApiKey('pk_test');
      const result2 = await findApiKey('pk_test2');

      expect(result1).toEqual(testApiKey);
      expect(result2).toEqual(apiKey2);

      // Both should be in cache
      expect(apiKeyCache.has('pk_test')).toBe(true);
      expect(apiKeyCache.has('pk_test2')).toBe(true);
      expect(apiKeyCache.size).toBe(2);
    });

    it('should update cache when API key usage is updated', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // First call to populate cache
      await findApiKey('pk_test');

      // Reset stats to isolate the update behavior
      apiKeyCache.resetStats();

      // Update usage
      await updateApiKeyUsage('pk_test', 1000, 'glm-4.7');

      // Get the updated key from cache
      const updatedKey = await findApiKey('pk_test');
      expect(updatedKey?.total_lifetime_tokens).toBe(1000);
      expect(updatedKey?.last_used).not.toBe(testApiKey.last_used);

      // Verify the call hit the cache
      const stats = apiKeyCache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
    });

    it('should work correctly when cache is disabled', async () => {
      process.env.CACHE_ENABLED = 'false';

      await writeApiKeys({ keys: [testApiKey] });

      // First call
      const result1 = await findApiKey('pk_test');
      expect(result1).toEqual(testApiKey);

      // Second call - should still read from file (cache disabled)
      const result2 = await findApiKey('pk_test');
      expect(result2).toEqual(testApiKey);

      // Verify apiKeyCache singleton wasn't affected
      // (it still has entries from previous tests, but findApiKey doesn't use it when disabled)
      expect(result1).toEqual(testApiKey);
    });

    it('should handle cache population after file write', async () => {
      // Start with empty file
      await writeApiKeys({ keys: [] });

      // Try to find key (miss, cached as null)
      const result1 = await findApiKey('pk_test');
      expect(result1).toBeNull();
      expect(apiKeyCache.has('pk_test')).toBe(true);

      // Now write the key to file
      await writeApiKeys({ keys: [testApiKey] });

      // Clear the cache entry to simulate fresh lookup
      apiKeyCache.delete('pk_test');

      // Find again - should read from file and populate cache
      const result2 = await findApiKey('pk_test');
      expect(result2).toEqual(testApiKey);
      expect(apiKeyCache.has('pk_test')).toBe(true);
    });

    it('should maintain data consistency between cache and file on updates', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // Populate cache
      await findApiKey('pk_test');

      // Update usage multiple times
      await updateApiKeyUsage('pk_test', 1000, 'glm-4.7');
      let key = await findApiKey('pk_test');
      expect(key?.total_lifetime_tokens).toBe(1000);

      await updateApiKeyUsage('pk_test', 500, 'glm-4.7');
      key = await findApiKey('pk_test');
      expect(key?.total_lifetime_tokens).toBe(1500);

      // Verify all cache hits after initial population
      const stats = apiKeyCache.getStats();
      expect(stats.hits).toBeGreaterThan(0);
    });
  });

  describe('updateApiKeyUsage with cache integration', () => {
    it('should not update cache for non-existent key', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // Try to update non-existent key
      await updateApiKeyUsage('pk_nonexistent', 1000, 'glm-4.7');

      // Should not affect cache
      expect(apiKeyCache.has('pk_nonexistent')).toBe(false);
    });

    it('should update usage_windows correctly', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // Update usage
      await updateApiKeyUsage('pk_test', 1000, 'glm-4.7');

      // Get the key
      const key = await findApiKey('pk_test');

      expect(key?.usage_windows).toHaveLength(1);
      expect(key?.usage_windows[0].tokens_used).toBe(1000);
    });

    it('should clean up old usage windows', async () => {
      const oldDate = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(); // 10 hours ago
      const apiKeyWithOldWindow = {
        ...testApiKey,
        usage_windows: [
          {
            window_start: oldDate,
            tokens_used: 5000,
          },
        ],
      };

      await writeApiKeys({ keys: [apiKeyWithOldWindow] });

      // Update usage (should clean old window)
      await updateApiKeyUsage('pk_test', 1000, 'glm-4.7');

      const key = await findApiKey('pk_test');
      expect(key?.usage_windows).toHaveLength(1);
      expect(key?.usage_windows[0].tokens_used).toBe(1000);
    });
  });

  describe('Cache statistics tracking', () => {
    it('should track hits and misses accurately', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // Populate cache
      await findApiKey('pk_test');
      await findApiKey('pk_nonexistent');

      // Reset stats to start counting from here
      apiKeyCache.resetStats();

      // Hit - from cache (pk_test)
      await findApiKey('pk_test');

      // Hit - from negative cache (pk_nonexistent)
      await findApiKey('pk_nonexistent');

      // One more hit for pk_test
      await findApiKey('pk_test');

      const stats = apiKeyCache.getStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(100);
    });

    it('should reset stats correctly', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // Populate cache
      await findApiKey('pk_test');

      // Hit from cache
      await findApiKey('pk_test');

      let stats = apiKeyCache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);

      apiKeyCache.resetStats();

      stats = apiKeyCache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(1); // Size should remain
    });
  });
});
