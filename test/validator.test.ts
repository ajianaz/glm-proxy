import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { validateApiKey, getModelForKey } from '../src/validator.js';
import { writeApiKeys } from '../src/storage.js';
import type { ApiKey } from '../src/types.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// Mock DATA_FILE environment variable for tests
const TEST_FILE = join(process.cwd(), 'data', 'test-validator.json');

// Save original DATA_FILE
const originalDataFile = process.env.DATA_FILE;

const validKey: ApiKey = {
  key: 'pk_valid_key',
  name: 'Test User',
  model: 'glm-4.7',
  token_limit_per_5h: 100000,
  expiry_date: '2026-12-31T23:59:59Z',
  created_at: '2026-01-18T00:00:00Z',
  last_used: '2026-01-18T00:00:00Z',
  total_lifetime_tokens: 0,
  usage_windows: [],
};

const expiredKey: ApiKey = {
  key: 'pk_expired_key',
  name: 'Expired User',
  model: 'glm-4.7',
  token_limit_per_5h: 100000,
  expiry_date: '2024-01-01T00:00:00Z',
  created_at: '2023-01-18T00:00:00Z',
  last_used: '2023-01-18T00:00:00Z',
  total_lifetime_tokens: 0,
  usage_windows: [],
};

describe('Validator', () => {
  beforeEach(async () => {
    // Set test data file
    process.env.DATA_FILE = TEST_FILE;

    // Clean up test file
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }

    // Write test keys
    await writeApiKeys({ keys: [validKey, expiredKey] });
  });

  afterAll(() => {
    // Restore original DATA_FILE
    process.env.DATA_FILE = originalDataFile;

    // Clean up test file
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }
  });
  describe('validateApiKey', () => {
    it('should return valid for existing non-expired key', async () => {
      const result = await validateApiKey('Bearer pk_valid_key');
      expect(result.valid).toBe(true);
      expect(result.apiKey).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for expired key', async () => {
      const result = await validateApiKey('Bearer pk_expired_key');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
      expect(result.statusCode).toBe(403);
    });

    it('should return invalid for missing key', async () => {
      const result = await validateApiKey(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
      expect(result.statusCode).toBe(401);
    });

    it('should return invalid for invalid key', async () => {
      const result = await validateApiKey('Bearer pk_invalid_key');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid API key');
      expect(result.statusCode).toBe(401);
    });
  });

  describe('validateApiKey', () => {
    it('should return valid for existing non-expired key', async () => {
      const result = await validateApiKey('Bearer pk_valid_key');
      expect(result.valid).toBe(true);
      expect(result.apiKey).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for expired key', async () => {
      const result = await validateApiKey('Bearer pk_expired_key');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
      expect(result.statusCode).toBe(403);
    });

    it('should return invalid for missing key', async () => {
      const result = await validateApiKey(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
      expect(result.statusCode).toBe(401);
    });

    it('should return invalid for invalid key', async () => {
      const result = await validateApiKey('Bearer pk_invalid_key');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid API key');
      expect(result.statusCode).toBe(401);
    });
  });

  describe('getModelForKey', () => {
    it('should return model from API key', () => {
      const key: ApiKey = {
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
      const model = getModelForKey(key);
      expect(model).toBe('glm-4.7');
    });

    it('should return default model when key has no model', () => {
      const key: ApiKey = {
        key: 'pk_test',
        name: 'Test',
        model: '',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-18T00:00:00Z',
        last_used: '2026-01-18T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };
      const model = getModelForKey(key);
      expect(model).toBe('glm-4.7'); // DEFAULT_MODEL fallback
    });
  });
});
