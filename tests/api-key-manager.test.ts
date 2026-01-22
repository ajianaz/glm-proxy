import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  getAllApiKeys,
  getApiKey,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  getApiKeyUsage,
  updateApiKeyUsage,
  isApiKeyExpired,
  getRemainingQuota,
  ValidationError,
  NotFoundError,
  LockError,
} from '../src/api-key-manager.js';
import type { ApiKey } from '../src/types.js';

const TEST_DATA_FILE = `${import.meta.dir}/../data/test-apikeys.json`;

// Override DATA_FILE for tests
const originalDataFile = process.env.DATA_FILE;

describe('API Key Manager', () => {
  beforeEach(async () => {
    process.env.DATA_FILE = TEST_DATA_FILE;

    // Clean up test file before each test
    try {
      await Bun.write(TEST_DATA_FILE, JSON.stringify({ keys: [] }, null, 2));
    } catch {
      // File doesn't exist, that's fine
    }
  });

  afterEach(async () => {
    // Clean up test file after each test
    try {
      await Bun.write(TEST_DATA_FILE, JSON.stringify({ keys: [] }, null, 2));
    } catch {
      // File doesn't exist, that's fine
    }

    process.env.DATA_FILE = originalDataFile;
  });

  describe('getAllApiKeys', () => {
    test('should return empty array when file does not exist', async () => {
      const keys = await getAllApiKeys();
      expect(keys).toEqual([]);
    });

    test('should return all API keys', async () => {
      const key1: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key 1',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(key1);
      const keys = await getAllApiKeys();
      expect(keys).toHaveLength(1);
      expect(keys[0]).toEqual(key1);
    });
  });

  describe('getApiKey', () => {
    test('should return null for non-existent key', async () => {
      const key = await getApiKey('non-existent');
      expect(key).toBeNull();
    });

    test('should return API key if found', async () => {
      const key1: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key 1',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(key1);
      const found = await getApiKey('pk_test_key1');
      expect(found).toEqual(key1);
    });
  });

  describe('createApiKey', () => {
    test('should create new API key', async () => {
      const key1: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key 1',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      const created = await createApiKey(key1);
      expect(created).toEqual(key1);

      const found = await getApiKey('pk_test_key1');
      expect(found).toEqual(key1);
    });

    test('should reject duplicate API keys', async () => {
      const key1: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key 1',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(key1);

      await expect(createApiKey(key1)).rejects.toThrow(ValidationError);
    });

    test('should validate key format', async () => {
      const invalidKey: ApiKey = {
        key: 'invalid key with spaces!',
        name: 'Invalid Key',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await expect(createApiKey(invalidKey)).rejects.toThrow(ValidationError);
    });

    test('should validate name', async () => {
      const invalidKey: ApiKey = {
        key: 'pk_test_key1',
        name: '', // Empty name
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await expect(createApiKey(invalidKey)).rejects.toThrow(ValidationError);
    });

    test('should validate quota', async () => {
      const invalidKey: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key',
        model: 'glm-4',
        token_limit_per_5h: -100, // Negative quota
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await expect(createApiKey(invalidKey)).rejects.toThrow(ValidationError);
    });

    test('should validate expiry date', async () => {
      const invalidKey: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2020-01-01T00:00:00Z', // Past date
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await expect(createApiKey(invalidKey)).rejects.toThrow(ValidationError);
    });
  });

  describe('updateApiKey', () => {
    test('should update API key', async () => {
      const key1: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key 1',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(key1);

      const updated = await updateApiKey('pk_test_key1', {
        name: 'Updated Name',
        token_limit_per_5h: 200000,
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.token_limit_per_5h).toBe(200000);
      expect(updated.key).toBe('pk_test_key1'); // Key unchanged

      const found = await getApiKey('pk_test_key1');
      expect(found?.name).toBe('Updated Name');
    });

    test('should reject updating non-existent key', async () => {
      await expect(
        updateApiKey('non-existent', { name: 'New Name' })
      ).rejects.toThrow(NotFoundError);
    });

    test('should reject changing API key value', async () => {
      const key1: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key 1',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(key1);

      await expect(
        updateApiKey('pk_test_key1', { key: 'new_key_value' })
      ).rejects.toThrow(ValidationError);
    });

    test('should reject duplicate names', async () => {
      const key1: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key 1',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      const key2: ApiKey = {
        key: 'pk_test_key2',
        name: 'Test Key 2',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(key1);
      await createApiKey(key2);

      await expect(
        updateApiKey('pk_test_key1', { name: 'Test Key 2' })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteApiKey', () => {
    test('should delete API key', async () => {
      const key1: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key 1',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(key1);
      await deleteApiKey('pk_test_key1');

      const found = await getApiKey('pk_test_key1');
      expect(found).toBeNull();
    });

    test('should reject deleting non-existent key', async () => {
      await expect(deleteApiKey('non-existent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateApiKeyUsage', () => {
    test('should update API key usage', async () => {
      const key1: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key 1',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(key1);
      await updateApiKeyUsage('pk_test_key1', 1000, 'glm-4');

      const updated = await getApiKey('pk_test_key1');
      expect(updated?.total_lifetime_tokens).toBe(1000);
      expect(updated?.usage_windows).toHaveLength(1);
      expect(updated?.usage_windows[0].tokens_used).toBe(1000);
    });

    test('should not throw error for non-existent key', async () => {
      // Should silently ignore
      await updateApiKeyUsage('non-existent', 1000, 'glm-4');
      // If we get here, the test passes
      expect(true).toBe(true);
    });

    test('should accumulate usage in same window', async () => {
      const key1: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key 1',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(key1);
      await updateApiKeyUsage('pk_test_key1', 1000, 'glm-4');
      await updateApiKeyUsage('pk_test_key1', 500, 'glm-4');

      const updated = await getApiKey('pk_test_key1');
      expect(updated?.total_lifetime_tokens).toBe(1500);
      expect(updated?.usage_windows).toHaveLength(1);
      expect(updated?.usage_windows[0].tokens_used).toBe(1500);
    });
  });

  describe('isApiKeyExpired', () => {
    test('should return true for expired key', async () => {
      const key1: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key 1',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z', // Future date
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(key1);

      // Update the expiry date to a past date
      await updateApiKey('pk_test_key1', { expiry_date: '2020-01-01T00:00:00Z' });

      const expired = await isApiKeyExpired('pk_test_key1');
      expect(expired).toBe(true);
    });

    test('should return false for valid key', async () => {
      const key1: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key 1',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z', // Future date
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(key1);
      const expired = await isApiKeyExpired('pk_test_key1');
      expect(expired).toBe(false);
    });

    test('should return true for non-existent key', async () => {
      const expired = await isApiKeyExpired('non-existent');
      expect(expired).toBe(true);
    });
  });

  describe('getRemainingQuota', () => {
    test('should return full quota for unused key', async () => {
      const key1: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key 1',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(key1);
      const quota = await getRemainingQuota('pk_test_key1');
      expect(quota).toBe(100000);
    });

    test('should calculate remaining quota after usage', async () => {
      const key1: ApiKey = {
        key: 'pk_test_key1',
        name: 'Test Key 1',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-01T00:00:00Z',
        last_used: '2026-01-01T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(key1);
      await updateApiKeyUsage('pk_test_key1', 25000, 'glm-4');

      const quota = await getRemainingQuota('pk_test_key1');
      expect(quota).toBe(75000);
    });

    test('should return 0 for non-existent key', async () => {
      const quota = await getRemainingQuota('non-existent');
      expect(quota).toBe(0);
    });
  });
});
