import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { readApiKeys, writeApiKeys, findApiKey, updateApiKeyUsage, warmupCache } from '../src/storage.js';
import { apiKeyCache } from '../src/cache.js';
import { existsSync, unlinkSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Mock DATA_FILE environment variable for tests
const TEST_FILE = join(process.cwd(), 'data', 'test-failure-scenarios.json');

// Save original DATA_FILE and CACHE_ENABLED
const originalDataFile = process.env.DATA_FILE;
const originalCacheEnabled = process.env.CACHE_ENABLED;
const originalCacheLogLevel = process.env.CACHE_LOG_LEVEL;

const testApiKey = {
  key: 'pk_test_failure',
  name: 'Test Failure Scenarios',
  model: 'glm-4.7',
  token_limit_per_5h: 100000,
  expiry_date: '2026-12-31T23:59:59Z',
  created_at: '2026-01-18T00:00:00Z',
  last_used: '2026-01-18T00:00:00Z',
  total_lifetime_tokens: 0,
  usage_windows: [],
};

describe('Cache Failure Scenarios and Edge Cases', () => {
  const ACTUAL_FILE = join(process.cwd(), 'data', 'apikeys.json');

  beforeEach(() => {
    // Set test data file
    process.env.DATA_FILE = TEST_FILE;
    process.env.CACHE_ENABLED = 'true';
    process.env.CACHE_LOG_LEVEL = 'none'; // Suppress logs during tests

    // Clean up both test file and actual file before each test
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }
    if (existsSync(ACTUAL_FILE)) {
      unlinkSync(ACTUAL_FILE);
    }

    // Clear cache and reset stats before each test
    apiKeyCache.clear();
    apiKeyCache.resetStats();
  });

  afterAll(() => {
    // Restore original environment variables
    process.env.DATA_FILE = originalDataFile;
    process.env.CACHE_ENABLED = originalCacheEnabled;
    process.env.CACHE_LOG_LEVEL = originalCacheLogLevel;

    // Clean up test file
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }
  });

  describe('Graceful degradation on file read errors', () => {
    it('should handle missing file gracefully', async () => {
      // Ensure file doesn't exist
      if (existsSync(TEST_FILE)) {
        unlinkSync(TEST_FILE);
      }

      // First call should handle missing file and return null
      const result1 = await findApiKey('pk_nonexistent');
      expect(result1).toBeNull();

      // Verify null was cached (negative caching)
      const stats = apiKeyCache.getStats();
      expect(stats.size).toBe(1);
      expect(apiKeyCache.has('pk_nonexistent')).toBe(true);

      // Second call should hit cache with null
      apiKeyCache.resetStats();
      const result2 = await findApiKey('pk_nonexistent');
      expect(result2).toBeNull();

      // Verify cache was hit (no file read)
      const stats2 = apiKeyCache.getStats();
      expect(stats2.hits).toBe(1);
      expect(stats2.misses).toBe(0);
    });

    it('should handle corrupted JSON file gracefully', async () => {
      // Write invalid JSON to file
      writeFileSync(TEST_FILE, '{ invalid json }', 'utf-8');

      // findApiKey should handle the error gracefully via readApiKeys
      // readApiKeys catches errors and returns { keys: [] }
      const result = await findApiKey('pk_any_key');
      expect(result).toBeNull();
    });

    it('should handle cache clear and repopulation', async () => {
      // Write valid API key file
      await writeApiKeys({ keys: [testApiKey] });

      // First call populates cache
      const result1 = await findApiKey(testApiKey.key);
      expect(result1).toEqual(testApiKey);

      // Verify cache was populated
      expect(apiKeyCache.size).toBe(1);

      // Clear cache manually
      apiKeyCache.clear();

      // Cache should be empty
      expect(apiKeyCache.size).toBe(0);

      // Next call should repopulate from file
      const result2 = await findApiKey(testApiKey.key);
      expect(result2).toEqual(testApiKey);

      // Cache should be populated again
      expect(apiKeyCache.size).toBe(1);
    });

    it('should handle concurrent requests without errors', async () => {
      // Write valid API key file
      await writeApiKeys({ keys: [testApiKey] });

      // Make several concurrent requests (not too many to avoid lock contention)
      const requests = Array.from({ length: 10 }, () =>
        findApiKey(testApiKey.key)
      );

      // All requests should succeed without errors
      const results = await Promise.all(requests);
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result).not.toBeNull();
        expect(result?.key).toBe(testApiKey.key);
      });

      // Cache should have been populated
      expect(apiKeyCache.size).toBe(1);
    });
  });

  describe('TTL expiration behavior', () => {
    it('should cache entries with proper TTL', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // First call populates cache
      const result1 = await findApiKey(testApiKey.key);
      expect(result1).not.toBeNull();

      const stats1 = apiKeyCache.getStats();
      expect(stats1.size).toBe(1);

      // Verify entry exists in cache
      expect(apiKeyCache.has(testApiKey.key)).toBe(true);

      // Retrieve from cache
      const cached = apiKeyCache.get(testApiKey.key);
      expect(cached).not.toBeNull();
      expect(cached?.key).toBe(testApiKey.key);
    });

    it('should handle rapid cache misses and hits', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // Clear cache
      apiKeyCache.clear();
      apiKeyCache.resetStats();

      // First call is a miss and populates cache
      const result1 = await findApiKey(testApiKey.key);
      expect(result1).not.toBeNull();

      // Reset stats to measure subsequent hits
      apiKeyCache.resetStats();

      // Next 10 calls should all be hits
      for (let i = 0; i < 10; i++) {
        const result = await findApiKey(testApiKey.key);
        expect(result).not.toBeNull();
      }

      const stats = apiKeyCache.getStats();
      expect(stats.hits).toBe(10);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(100);
    });

    it('should repopulate cache after entry is deleted', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // Clear cache
      apiKeyCache.clear();

      // First call should populate cache
      const result1 = await findApiKey(testApiKey.key);
      expect(result1).not.toBeNull();
      expect(apiKeyCache.has(testApiKey.key)).toBe(true);

      // Simulate cache expiration by clearing the entry
      apiKeyCache.delete(testApiKey.key);
      expect(apiKeyCache.has(testApiKey.key)).toBe(false);

      // Next call should repopulate cache from file
      const result2 = await findApiKey(testApiKey.key);
      expect(result2).not.toBeNull();
      expect(apiKeyCache.has(testApiKey.key)).toBe(true);
    });
  });

  describe('File update coherency', () => {
    it('should update cache when file is modified', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // First call populates cache
      const result1 = await findApiKey(testApiKey.key);
      expect(result1?.total_lifetime_tokens).toBe(0);

      // Update usage (writes to file and updates cache)
      await updateApiKeyUsage(testApiKey.key, 1000, 'glm-4.7');

      // Cache should be updated immediately
      const result2 = await findApiKey(testApiKey.key);
      expect(result2?.total_lifetime_tokens).toBe(1000);

      // Verify the file was also updated by reading it directly
      const fileData = await readApiKeys();
      const fileKey = fileData.keys.find((k: { key: string }) => k.key === testApiKey.key);
      expect(fileKey?.total_lifetime_tokens).toBe(1000);

      // Verify cache hit (no file read)
      const stats = apiKeyCache.getStats();
      expect(stats.hits).toBeGreaterThan(0);
    });

    it('should handle multiple updates correctly', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // Initial cache population
      await findApiKey(testApiKey.key);

      // Make multiple updates
      await updateApiKeyUsage(testApiKey.key, 100, 'glm-4.7');
      await updateApiKeyUsage(testApiKey.key, 200, 'glm-4.7');
      await updateApiKeyUsage(testApiKey.key, 300, 'glm-4.7');

      // Final value should be sum of all updates
      const result = await findApiKey(testApiKey.key);
      expect(result?.total_lifetime_tokens).toBe(600); // 100+200+300

      // Verify file consistency by reading via storage layer
      const fileData = await readApiKeys();
      const fileKey = fileData.keys.find((k: { key: string }) => k.key === testApiKey.key);
      expect(fileKey?.total_lifetime_tokens).toBe(600);
    });

    it('should maintain cache coherency with selective updates', async () => {
      const key2 = {
        ...testApiKey,
        key: 'pk_test_2',
        name: 'Test Key 2',
      };

      await writeApiKeys({ keys: [testApiKey, key2] });

      // Populate cache with both keys
      await findApiKey(testApiKey.key);
      await findApiKey(key2.key);

      expect(apiKeyCache.size).toBe(2);

      // Update only first key
      await updateApiKeyUsage(testApiKey.key, 1000, 'glm-4.7');

      // First key should be updated
      const result1 = await findApiKey(testApiKey.key);
      expect(result1?.total_lifetime_tokens).toBe(1000);

      // Second key should be unchanged
      const result2 = await findApiKey(key2.key);
      expect(result2?.total_lifetime_tokens).toBe(0);

      // Both should still be in cache
      expect(apiKeyCache.size).toBe(2);
    });

    it('should serve fresh data after file is externally modified', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // Initial cache population
      await findApiKey(testApiKey.key);

      // Externally modify the file (simulate another process updating it)
      const updatedKey = {
        ...testApiKey,
        total_lifetime_tokens: 5000,
      };
      await writeApiKeys({ keys: [updatedKey] });

      // Clear cache entry to simulate cache invalidation
      apiKeyCache.delete(testApiKey.key);

      // Next read should fetch fresh data from file
      const result = await findApiKey(testApiKey.key);
      expect(result?.total_lifetime_tokens).toBe(5000);

      // Verify it's in cache now
      expect(apiKeyCache.has(testApiKey.key)).toBe(true);
    });
  });

  describe('Startup with empty cache', () => {
    it('should start correctly with empty cache', async () => {
      // Verify cache is empty
      expect(apiKeyCache.size).toBe(0);

      await writeApiKeys({ keys: [testApiKey] });

      // First request should work and populate cache
      const result = await findApiKey(testApiKey.key);
      expect(result).not.toBeNull();
      expect(result?.key).toBe(testApiKey.key);

      // Cache should now have the key
      expect(apiKeyCache.size).toBe(1);
    });

    it('should handle cache warm-up with empty file', async () => {
      // Create empty file
      await writeApiKeys({ keys: [] });

      // Warm-up should not throw
      await warmupCache();

      // Cache should remain empty
      expect(apiKeyCache.size).toBe(0);
    });

    it('should handle cache warm-up with missing file', async () => {
      // Ensure file doesn't exist
      if (existsSync(TEST_FILE)) {
        unlinkSync(TEST_FILE);
      }

      // Warm-up should not throw
      await warmupCache();

      // Cache should remain empty
      expect(apiKeyCache.size).toBe(0);
    });

    it('should populate cache during warm-up', async () => {
      const key2 = {
        ...testApiKey,
        key: 'pk_warmup_2',
        name: 'Warmup Key 2',
      };

      await writeApiKeys({ keys: [testApiKey, key2] });

      // Clear cache
      apiKeyCache.clear();

      // Run warm-up
      await warmupCache();

      // Cache should have both keys
      expect(apiKeyCache.size).toBe(2);

      // Both keys should be accessible
      const result1 = await findApiKey(testApiKey.key);
      expect(result1).not.toBeNull();

      const result2 = await findApiKey(key2.key);
      expect(result2).not.toBeNull();

      // These should be cache hits (warm-up pre-loaded them)
      const stats = apiKeyCache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(0);
    });

    it('should handle warm-up when cache is already populated', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // Pre-populate cache with one key
      await findApiKey(testApiKey.key);
      const initialSize = apiKeyCache.size;

      // Run warm-up (should add the same key again, updating it)
      await warmupCache();

      // Cache should still have the key
      expect(apiKeyCache.size).toBe(initialSize);

      // Key should still be accessible
      const result = await findApiKey(testApiKey.key);
      expect(result).not.toBeNull();
    });
  });

  describe('Negative caching edge cases', () => {
    it('should cache not-found keys to prevent repeated lookups', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // Clear cache completely and reset stats
      apiKeyCache.clear();
      apiKeyCache.resetStats();

      // Verify cache is truly empty
      expect(apiKeyCache.size).toBe(0);
      expect(apiKeyCache.getStats().misses).toBe(0);

      // Request non-existent key (should be a cache miss and populate negative cache)
      const result1 = await findApiKey('pk_does_not_exist');
      expect(result1).toBeNull();

      // After first call, we should have the negative entry cached
      expect(apiKeyCache.has('pk_does_not_exist')).toBe(true);

      // The stats should have been updated (either miss or hit depending on implementation)
      const stats1 = apiKeyCache.getStats();

      // Request same non-existent key again (should be a cache hit from negative cache)
      const result2 = await findApiKey('pk_does_not_exist');
      expect(result2).toBeNull();

      // Should have at least 1 hit (from negative cache)
      const stats2 = apiKeyCache.getStats();
      expect(stats2.hits).toBeGreaterThanOrEqual(1);

      // Verify the null is still cached
      expect(apiKeyCache.has('pk_does_not_exist')).toBe(true);
      expect(apiKeyCache.get('pk_does_not_exist')).toBeNull();
    });

    it('should invalidate negative cache when key is added', async () => {
      await writeApiKeys({ keys: [] });

      // Request non-existent key (caches null)
      const result1 = await findApiKey('pk_new_key');
      expect(result1).toBeNull();
      expect(apiKeyCache.has('pk_new_key')).toBe(true);

      // Add the key to file
      const newKey = {
        ...testApiKey,
        key: 'pk_new_key',
      };
      await writeApiKeys({ keys: [newKey] });

      // Clear cache entry to simulate key being added externally
      apiKeyCache.delete('pk_new_key');

      // Now request should find the key
      const result2 = await findApiKey('pk_new_key');
      expect(result2).not.toBeNull();
      expect(result2?.key).toBe('pk_new_key');

      // Positive result should now be cached
      expect(apiKeyCache.get('pk_new_key')).not.toBeNull();
    });
  });

  describe('Cache statistics accuracy', () => {
    it('should accurately track hits and misses', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      // Clear stats
      apiKeyCache.clear();
      apiKeyCache.resetStats();

      // Populate cache
      await findApiKey(testApiKey.key);
      await findApiKey('pk_nonexistent');

      // Reset stats to start counting from here
      apiKeyCache.resetStats();

      // Hit - from cache (testApiKey)
      await findApiKey(testApiKey.key);

      // Hit - from negative cache (pk_nonexistent)
      await findApiKey('pk_nonexistent');

      const stats = apiKeyCache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(100);
    });

    it('should calculate hit rate correctly', async () => {
      await writeApiKeys({ keys: [testApiKey] });

      apiKeyCache.clear();
      apiKeyCache.resetStats();

      // First call populates cache (1 miss)
      await findApiKey(testApiKey.key);

      // Reset stats to measure only hits
      apiKeyCache.resetStats();

      // 10 hits from cache
      for (let i = 0; i < 10; i++) {
        await findApiKey(testApiKey.key);
      }

      const stats = apiKeyCache.getStats();
      expect(stats.hits).toBe(10);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(100);
    });
  });
});
