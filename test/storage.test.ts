import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { readApiKeys, writeApiKeys, migrateToRollingWindow } from '../src/storage.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { ApiKey } from '../src/types.js';

// Mock DATA_FILE environment variable for tests
const TEST_FILE = join(process.cwd(), 'data', 'test-apikeys.json');

// Save original DATA_FILE
const originalDataFile = process.env.DATA_FILE;

describe('Storage', () => {
  beforeEach(() => {
    // Set test data file
    process.env.DATA_FILE = TEST_FILE;

    // Clean up test file before each test
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }
  });

  afterAll(() => {
    // Restore original DATA_FILE
    process.env.DATA_FILE = originalDataFile;

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
        keys: [
          {
            key: 'pk_test',
            name: 'Test',
            model: 'glm-4.7',
            token_limit_per_5h: 100000,
            expiry_date: '2026-12-31T23:59:59Z',
            created_at: '2026-01-18T00:00:00Z',
            last_used: '2026-01-18T00:00:00Z',
            total_lifetime_tokens: 0,
            usage_windows: [],
          },
        ],
      };

      await writeApiKeys(data);
      const read = await readApiKeys();

      expect(read.keys).toHaveLength(1);
      expect(read.keys[0].key).toBe('pk_test');
    });
  });

  describe('migrateToRollingWindow', () => {
    it('should create rolling window cache from usage_windows', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const apiKey: ApiKey = {
        key: 'pk_test',
        name: 'Test Key',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-18T00:00:00Z',
        last_used: now.toISOString(),
        total_lifetime_tokens: 3000,
        usage_windows: [
          { window_start: twoHoursAgo.toISOString(), tokens_used: 1000 },
          { window_start: oneHourAgo.toISOString(), tokens_used: 2000 },
        ],
      };

      // Initially no cache
      expect(apiKey.rolling_window_cache).toBeUndefined();

      // Migrate
      migrateToRollingWindow(apiKey);

      // Cache should now exist
      expect(apiKey.rolling_window_cache).toBeDefined();
      expect(apiKey.rolling_window_cache!.buckets).toHaveLength(2);
      expect(apiKey.rolling_window_cache!.runningTotal).toBe(3000);
    });

    it('should not migrate if cache already exists', () => {
      const now = new Date();
      const apiKey: ApiKey = {
        key: 'pk_test',
        name: 'Test Key',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-18T00:00:00Z',
        last_used: now.toISOString(),
        total_lifetime_tokens: 1000,
        usage_windows: [
          { window_start: now.toISOString(), tokens_used: 1000 },
        ],
        rolling_window_cache: {
          buckets: [{ timestamp: now.getTime(), tokens: 500 }],
          runningTotal: 500,
          lastUpdated: now.toISOString(),
          windowDurationMs: 5 * 60 * 60 * 1000,
          bucketSizeMs: 5 * 60 * 1000,
        },
      };

      const originalCache = apiKey.rolling_window_cache;

      // Migrate should not modify existing cache
      migrateToRollingWindow(apiKey);

      expect(apiKey.rolling_window_cache).toEqual(originalCache);
    });

    it('should handle empty usage_windows', () => {
      const apiKey: ApiKey = {
        key: 'pk_test',
        name: 'Test Key',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-18T00:00:00Z',
        last_used: '2026-01-18T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      migrateToRollingWindow(apiKey);

      expect(apiKey.rolling_window_cache).toBeDefined();
      expect(apiKey.rolling_window_cache!.buckets).toHaveLength(0);
      expect(apiKey.rolling_window_cache!.runningTotal).toBe(0);
    });
  });
});
