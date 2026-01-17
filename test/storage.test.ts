import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { readApiKeys, writeApiKeys } from '../src/storage.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

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
});
