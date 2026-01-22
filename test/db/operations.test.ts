import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { getDb, closeDb, resetDb } from '../../src/db/connection.js';
import {
  findApiKey,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  updateApiKeyUsage,
  getKeyStats,
  getAllApiKeys,
  findKeysByModel,
  findExpiredKeys,
  findActiveKeys
} from '../../src/db/operations.js';
import type { ApiKey } from '../../src/types.js';

/**
 * CRUD Operations Tests
 *
 * This test suite verifies:
 * 1. Create, read, update, delete operations
 * 2. Transaction handling
 * 3. Edge cases (null values, duplicates)
 * 4. Error scenarios
 */

// Test data
const crudTestKey: ApiKey = {
  key: 'test-crud-key-001',
  name: 'Test CRUD Key',
  model: 'claude-3-5-sonnet-20241022',
  token_limit_per_5h: 50000,
  expiry_date: '2027-12-31T23:59:59Z',
  created_at: new Date().toISOString(),
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 0,
  usage_windows: [],
};

describe('Database CRUD Operations', () => {
  beforeAll(async () => {
    // Ensure database connection is initialized
    await getDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('CREATE Operations', () => {
    test('should create a new API key with all required fields', async () => {
      const created = await createApiKey(crudTestKey);

      expect(created).toBeDefined();
      expect(created.key).toBe(crudTestKey.key);
      expect(created.name).toBe(crudTestKey.name);
      expect(created.model).toBe(crudTestKey.model);
      expect(created.token_limit_per_5h).toBe(crudTestKey.token_limit_per_5h);
      expect(created.expiry_date).toBe(crudTestKey.expiry_date);
      expect(created.usage_windows).toEqual([]);
      expect(created.total_lifetime_tokens).toBe(0);
    });

    test('should reject duplicate keys with constraint error', async () => {
      await expect(createApiKey(crudTestKey)).rejects.toThrow('already exists');
    });

    test('should validate required fields: key cannot be empty', async () => {
      await expect(
        createApiKey({ ...crudTestKey, key: '' })
      ).rejects.toThrow('required');
    });

    test('should validate required fields: name cannot be empty', async () => {
      await expect(
        createApiKey({ ...crudTestKey, key: 'test-key-002', name: '' })
      ).rejects.toThrow('required');
    });

    test('should validate token_limit_per_5h is greater than 0', async () => {
      await expect(
        createApiKey({ ...crudTestKey, key: 'test-key-003', token_limit_per_5h: 0 })
      ).rejects.toThrow('greater than 0');

      await expect(
        createApiKey({ ...crudTestKey, key: 'test-key-004', token_limit_per_5h: -100 })
      ).rejects.toThrow('greater than 0');
    });

    test('should validate required fields: expiry_date cannot be empty', async () => {
      await expect(
        createApiKey({ ...crudTestKey, key: 'test-key-005', expiry_date: '' })
      ).rejects.toThrow('required');
    });

    test('should handle key without model (optional field)', async () => {
      const keyWithoutModel: ApiKey = {
        ...crudTestKey,
        key: 'test-key-no-model',
        model: undefined,
      };

      const created = await createApiKey(keyWithoutModel);
      expect(created.key).toBe(keyWithoutModel.key);
      expect(created.model).toBeUndefined();

      // Cleanup
      await deleteApiKey(keyWithoutModel.key);
    });

    test('should handle key with null model', async () => {
      const keyWithNullModel: ApiKey = {
        ...crudTestKey,
        key: 'test-key-null-model',
        model: null,
      };

      const created = await createApiKey(keyWithNullModel);
      expect(created.key).toBe(keyWithNullModel.key);
      expect(created.model).toBeNull();

      // Cleanup
      await deleteApiKey(keyWithNullModel.key);
    });
  });

  describe('READ Operations', () => {
    test('should find an existing key by key string', async () => {
      const found = await findApiKey(crudTestKey.key);

      expect(found).toBeDefined();
      expect(found?.key).toBe(crudTestKey.key);
      expect(found?.name).toBe(crudTestKey.name);
      expect(found?.model).toBe(crudTestKey.model);
      expect(found?.token_limit_per_5h).toBe(crudTestKey.token_limit_per_5h);
      expect(found?.expiry_date).toBe(crudTestKey.expiry_date);
    });

    test('should return null for non-existent key', async () => {
      const found = await findApiKey('non-existent-key-xyz');
      expect(found).toBeNull();
    });

    test('should validate key parameter: cannot be empty', async () => {
      await expect(findApiKey('')).rejects.toThrow('required and cannot be empty');
      await expect(findApiKey('   ')).rejects.toThrow('required and cannot be empty');
    });

    test('should include usage windows when finding key', async () => {
      // Add usage data
      await updateApiKeyUsage(crudTestKey.key, 1000, 'claude-3-5-sonnet-20241022');

      const found = await findApiKey(crudTestKey.key);
      expect(found?.usage_windows).toBeDefined();
      expect(found?.usage_windows.length).toBeGreaterThan(0);
      expect(found?.usage_windows[0].tokens_used).toBe(1000);
    });
  });

  describe('UPDATE Operations', () => {
    test('should update key name only', async () => {
      const updated = await updateApiKey(crudTestKey.key, {
        name: 'Updated CRUD Key Name',
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated CRUD Key Name');
      expect(updated?.model).toBe(crudTestKey.model);
      expect(updated?.token_limit_per_5h).toBe(crudTestKey.token_limit_per_5h);
    });

    test('should update key model only', async () => {
      const updated = await updateApiKey(crudTestKey.key, {
        model: 'claude-3-opus-20240229',
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Updated CRUD Key Name');
      expect(updated?.model).toBe('claude-3-opus-20240229');
    });

    test('should update token limit only', async () => {
      const updated = await updateApiKey(crudTestKey.key, {
        token_limit_per_5h: 100000,
      });

      expect(updated).toBeDefined();
      expect(updated?.token_limit_per_5h).toBe(100000);
      expect(updated?.name).toBe('Updated CRUD Key Name');
    });

    test('should update expiry date only', async () => {
      const newExpiry = '2028-12-31T23:59:59Z';
      const updated = await updateApiKey(crudTestKey.key, {
        expiry_date: newExpiry,
      });

      expect(updated).toBeDefined();
      expect(updated?.expiry_date).toBe(newExpiry);
    });

    test('should update multiple fields simultaneously', async () => {
      const updated = await updateApiKey(crudTestKey.key, {
        name: 'Final Updated Name',
        model: 'claude-3-5-sonnet-20241022',
        token_limit_per_5h: 75000,
        expiry_date: '2029-12-31T23:59:59Z',
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Final Updated Name');
      expect(updated?.model).toBe('claude-3-5-sonnet-20241022');
      expect(updated?.token_limit_per_5h).toBe(75000);
      expect(updated?.expiry_date).toBe('2029-12-31T23:59:59Z');
    });

    test('should handle setting model to null', async () => {
      const updated = await updateApiKey(crudTestKey.key, {
        model: null,
      });

      expect(updated).toBeDefined();
      expect(updated?.model).toBeUndefined();
    });

    test('should return null for non-existent key', async () => {
      const result = await updateApiKey('non-existent-key-xyz', {
        name: 'New Name',
      });
      expect(result).toBeNull();
    });

    test('should validate updates: name cannot be empty', async () => {
      await expect(
        updateApiKey(crudTestKey.key, { name: '' })
      ).rejects.toThrow('cannot be empty');

      await expect(
        updateApiKey(crudTestKey.key, { name: '   ' })
      ).rejects.toThrow('cannot be empty');
    });

    test('should validate updates: token_limit_per_5h must be greater than 0', async () => {
      await expect(
        updateApiKey(crudTestKey.key, { token_limit_per_5h: 0 })
      ).rejects.toThrow('greater than 0');

      await expect(
        updateApiKey(crudTestKey.key, { token_limit_per_5h: -100 })
      ).rejects.toThrow('greater than 0');
    });

    test('should validate updates: expiry_date cannot be empty', async () => {
      await expect(
        updateApiKey(crudTestKey.key, { expiry_date: '' })
      ).rejects.toThrow('cannot be empty');
    });
  });

  describe('DELETE Operations', () => {
    const deleteTestKey: ApiKey = {
      key: 'test-delete-key-001',
      name: 'Test Delete Key',
      model: 'claude-3-5-sonnet-20241022',
      token_limit_per_5h: 50000,
      expiry_date: '2027-12-31T23:59:59Z',
      created_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
      total_lifetime_tokens: 0,
      usage_windows: [],
    };

    test('should delete an existing key', async () => {
      await createApiKey(deleteTestKey);

      // Verify it exists
      const found = await findApiKey(deleteTestKey.key);
      expect(found).toBeDefined();

      // Delete it
      const deleted = await deleteApiKey(deleteTestKey.key);
      expect(deleted).toBe(true);

      // Verify it's gone
      const afterDelete = await findApiKey(deleteTestKey.key);
      expect(afterDelete).toBeNull();
    });

    test('should return false for non-existent key', async () => {
      const deleted = await deleteApiKey('non-existent-key-xyz');
      expect(deleted).toBe(false);
    });

    test('should validate key parameter: cannot be empty', async () => {
      await expect(deleteApiKey('')).rejects.toThrow('required and cannot be empty');
      await expect(deleteApiKey('   ')).rejects.toThrow('required and cannot be empty');
    });

    test('should cascade delete usage windows', async () => {
      const cascadeTestKey: ApiKey = {
        key: 'test-cascade-key-001',
        name: 'Test Cascade Key',
        model: 'claude-3-5-sonnet-20241022',
        token_limit_per_5h: 50000,
        expiry_date: '2027-12-31T23:59:59Z',
        created_at: new Date().toISOString(),
        last_used: new Date().toISOString(),
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(cascadeTestKey);

      // Add usage windows
      await updateApiKeyUsage(cascadeTestKey.key, 1000, 'claude-3-5-sonnet-20241022');
      await updateApiKeyUsage(cascadeTestKey.key, 2000, 'claude-3-5-sonnet-20241022');

      // Verify usage windows exist
      const beforeDelete = await findApiKey(cascadeTestKey.key);
      expect(beforeDelete?.usage_windows.length).toBeGreaterThan(0);

      // Delete the key
      await deleteApiKey(cascadeTestKey.key);

      // Verify key is deleted (and usage windows are cascade deleted)
      const afterDelete = await findApiKey(cascadeTestKey.key);
      expect(afterDelete).toBeNull();
    });
  });

  describe('TRANSACTION Handling', () => {
    const transactionTestKey: ApiKey = {
      key: 'test-transaction-key-001',
      name: 'Test Transaction Key',
      model: 'claude-3-5-sonnet-20241022',
      token_limit_per_5h: 50000,
      expiry_date: '2027-12-31T23:59:59Z',
      created_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
      total_lifetime_tokens: 0,
      usage_windows: [],
    };

    test('should atomically update last_used and total_lifetime_tokens', async () => {
      await createApiKey(transactionTestKey);

      const beforeUpdate = await findApiKey(transactionTestKey.key);
      const initialLastUsed = beforeUpdate?.last_used;
      const initialTotalTokens = beforeUpdate?.total_lifetime_tokens;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await updateApiKeyUsage(transactionTestKey.key, 5000, 'claude-3-5-sonnet-20241022');

      const afterUpdate = await findApiKey(transactionTestKey.key);

      // Both fields should be updated atomically
      expect(afterUpdate?.last_used).not.toBe(initialLastUsed);
      expect(afterUpdate?.total_lifetime_tokens).toBe((initialTotalTokens ?? 0) + 5000);
    });

    test('should accumulate tokens in same usage window', async () => {
      // First usage update
      await updateApiKeyUsage(transactionTestKey.key, 1500, 'claude-3-5-sonnet-20241022');

      let updated = await findApiKey(transactionTestKey.key);
      expect(updated?.total_lifetime_tokens).toBe(6500); // 5000 + 1500
      expect(updated?.usage_windows.length).toBe(1);
      expect(updated?.usage_windows[0].tokens_used).toBe(6500);

      // Second usage update within same window
      await updateApiKeyUsage(transactionTestKey.key, 500, 'claude-3-5-sonnet-20241022');

      updated = await findApiKey(transactionTestKey.key);
      expect(updated?.total_lifetime_tokens).toBe(7000); // 6500 + 500
      expect(updated?.usage_windows.length).toBe(1);
      expect(updated?.usage_windows[0].tokens_used).toBe(7000);
    });

    test('should clean up old usage windows in transaction', async () => {
      const cleanupTestKey: ApiKey = {
        key: 'test-cleanup-key-001',
        name: 'Test Cleanup Key',
        model: 'claude-3-5-sonnet-20241022',
        token_limit_per_5h: 50000,
        expiry_date: '2027-12-31T23:59:59Z',
        created_at: new Date().toISOString(),
        last_used: new Date().toISOString(),
        total_lifetime_tokens: 0,
        usage_windows: [],
      };

      await createApiKey(cleanupTestKey);

      // Manually create an old usage window (6 hours old)
      const oldWindow = {
        window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        tokens_used: 500,
      };

      const { db, type } = await getDb();
      const schema = await import('../../src/db/schema.js');
      const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

      await db.insert(usageTable).values({
        apiKey: cleanupTestKey.key,
        windowStart: oldWindow.window_start,
        tokensUsed: oldWindow.tokens_used,
      });

      // Add current usage (should trigger cleanup of old window)
      await updateApiKeyUsage(cleanupTestKey.key, 1500, 'claude-3-5-sonnet-20241022');

      const key = await findApiKey(cleanupTestKey.key);

      // Old window should be cleaned up
      const oldWindowExists = key?.usage_windows.some(
        w => w.window_start === oldWindow.window_start
      );
      expect(oldWindowExists).toBe(false);

      // Only current window should exist
      expect(key?.usage_windows.length).toBe(1);
      expect(key?.usage_windows[0].tokens_used).toBe(1500);

      // Cleanup
      await deleteApiKey(cleanupTestKey.key);
    });

    test('should rollback transaction on error', async () => {
      // This test verifies that if an error occurs during the transaction,
      // no partial updates are applied
      const key = await findApiKey(transactionTestKey.key);
      const totalTokensBefore = key?.total_lifetime_tokens ?? 0;

      // Try to update with negative tokens (should fail)
      try {
        await updateApiKeyUsage(transactionTestKey.key, -100, 'claude-3-5-sonnet-20241022');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Verify total_lifetime_tokens was not updated
      const keyAfter = await findApiKey(transactionTestKey.key);
      expect(keyAfter?.total_lifetime_tokens).toBe(totalTokensBefore);
    });

    test('cleanup: delete transaction test key', async () => {
      await deleteApiKey(transactionTestKey.key);
    });
  });

  describe('EDGE CASES', () => {
    const edgeCaseTestKey: ApiKey = {
      key: 'test-edge-case-key-001',
      name: 'Test Edge Case Key',
      model: 'claude-3-5-sonnet-20241022',
      token_limit_per_5h: 50000,
      expiry_date: '2027-12-31T23:59:59Z',
      created_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
      total_lifetime_tokens: 0,
      usage_windows: [],
    };

    test('should handle zero tokens in usage update', async () => {
      await createApiKey(edgeCaseTestKey);

      // Should work and just update timestamp
      await updateApiKeyUsage(edgeCaseTestKey.key, 0, 'claude-3-5-sonnet-20241022');

      const updated = await findApiKey(edgeCaseTestKey.key);
      expect(updated).toBeDefined();
      expect(updated?.total_lifetime_tokens).toBe(0);
      expect(updated?.last_used).toBeDefined();
    });

    test('should handle key at exact token limit', async () => {
      await updateApiKeyUsage(edgeCaseTestKey.key, 50000, 'claude-3-5-sonnet-20241022');

      const stats = await getKeyStats(edgeCaseTestKey.key);
      expect(stats?.current_usage.tokens_used_in_current_window).toBe(50000);
      expect(stats?.current_usage.remaining_tokens).toBe(0);
    });

    test('should handle exceeding token limit', async () => {
      await updateApiKeyUsage(edgeCaseTestKey.key, 10000, 'claude-3-5-sonnet-20241022');

      const stats = await getKeyStats(edgeCaseTestKey.key);
      expect(stats?.current_usage.tokens_used_in_current_window).toBe(60000);
      expect(stats?.current_usage.remaining_tokens).toBe(0); // Should be clamped to 0
    });

    test('should handle empty result set in getAllApiKeys', async () => {
      const keys = await getAllApiKeys({ limit: 1, offset: 999999 });
      expect(keys).toEqual([]);
    });

    test('should handle key with null/undefined model in queries', async () => {
      await updateApiKey(edgeCaseTestKey.key, { model: null });

      const allKeys = await getAllApiKeys();
      const keyWithoutModel = allKeys.find(k => k.key === edgeCaseTestKey.key);
      expect(keyWithoutModel).toBeDefined();
      expect(keyWithoutModel?.model).toBeUndefined();
    });

    test('cleanup: delete edge case test key', async () => {
      await deleteApiKey(edgeCaseTestKey.key);
    });
  });

  describe('ERROR SCENARIOS', () => {
    const errorTestKey: ApiKey = {
      key: 'test-error-key-001',
      name: 'Test Error Key',
      model: 'claude-3-5-sonnet-20241022',
      token_limit_per_5h: 50000,
      expiry_date: '2027-12-31T23:59:59Z',
      created_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
      total_lifetime_tokens: 0,
      usage_windows: [],
    };

    test('should throw error for non-existent key in updateApiKeyUsage', async () => {
      await expect(
        updateApiKeyUsage('non-existent-key-xyz', 1000, 'claude-3-5-sonnet-20241022')
      ).rejects.toThrow('not found');
    });

    test('should throw validation error for negative tokens', async () => {
      await createApiKey(errorTestKey);

      await expect(
        updateApiKeyUsage(errorTestKey.key, -100, 'claude-3-5-sonnet-20241022')
      ).rejects.toThrow('non-negative');
    });

    test('should return null for getKeyStats with non-existent key', async () => {
      const stats = await getKeyStats('non-existent-key-xyz');
      expect(stats).toBeNull();
    });

    test('should throw validation error for empty key in getKeyStats', async () => {
      await expect(getKeyStats('')).rejects.toThrow('required and cannot be empty');
      await expect(getKeyStats('   ')).rejects.toThrow('required and cannot be empty');
    });

    test('cleanup: delete error test key', async () => {
      await deleteApiKey(errorTestKey.key);
    });
  });

  describe('HELPER FUNCTIONS', () => {
    const helperTestKeys: ApiKey[] = [
      {
        key: 'test-helper-key-001',
        name: 'Test Helper Key 1',
        model: 'claude-3-5-sonnet-20241022',
        token_limit_per_5h: 50000,
        expiry_date: '2027-12-31T23:59:59Z', // Future date
        created_at: new Date().toISOString(),
        last_used: new Date().toISOString(),
        total_lifetime_tokens: 0,
        usage_windows: [],
      },
      {
        key: 'test-helper-key-002',
        name: 'Test Helper Key 2',
        model: 'claude-3-5-sonnet-20241022',
        token_limit_per_5h: 60000,
        expiry_date: '2027-12-31T23:59:59Z', // Future date
        created_at: new Date().toISOString(),
        last_used: new Date().toISOString(),
        total_lifetime_tokens: 0,
        usage_windows: [],
      },
      {
        key: 'test-helper-key-003',
        name: 'Test Helper Key 3',
        model: 'claude-3-opus-20240229',
        token_limit_per_5h: 70000,
        expiry_date: '2020-01-01T00:00:00Z', // Past date (expired)
        created_at: '2019-12-31T00:00:00Z',
        last_used: new Date().toISOString(),
        total_lifetime_tokens: 0,
        usage_windows: [],
      },
    ];

    beforeAll(async () => {
      // Create helper test keys
      for (const key of helperTestKeys) {
        try {
          await createApiKey(key);
        } catch (error) {
          // Ignore if key already exists
        }
      }
    });

    afterAll(async () => {
      // Cleanup helper test keys
      for (const key of helperTestKeys) {
        try {
          await deleteApiKey(key.key);
        } catch (error) {
          // Ignore if key doesn't exist
        }
      }
    });

    test('getAllApiKeys should return all keys with default pagination', async () => {
      const allKeys = await getAllApiKeys();

      expect(allKeys.length).toBeGreaterThan(0);

      // Should contain our test keys
      const foundKeys = allKeys.filter(k =>
        helperTestKeys.some(testKey => testKey.key === k.key)
      );
      expect(foundKeys.length).toBe(3);
    });

    test('getAllApiKeys should support pagination', async () => {
      // Get first 2 keys
      const page1 = await getAllApiKeys({ limit: 2, offset: 0 });
      expect(page1.length).toBeLessThanOrEqual(2);

      // Get next 2 keys
      const page2 = await getAllApiKeys({ limit: 2, offset: 2 });
      expect(page2.length).toBeLessThanOrEqual(2);

      // Ensure no overlap
      const page1Keys = page1.map(k => k.key);
      const page2Keys = page2.map(k => k.key);
      const overlap = page1Keys.filter(key => page2Keys.includes(key));
      expect(overlap.length).toBe(0);
    });

    test('getAllApiKeys should validate pagination parameters', async () => {
      await expect(getAllApiKeys({ limit: 0 })).rejects.toThrow('greater than 0');
      await expect(getAllApiKeys({ limit: -1 })).rejects.toThrow('greater than 0');
      await expect(getAllApiKeys({ offset: -1 })).rejects.toThrow('non-negative');
    });

    test('findKeysByModel should find keys by model', async () => {
      const sonnetKeys = await findKeysByModel('claude-3-5-sonnet-20241022');

      expect(sonnetKeys.length).toBeGreaterThanOrEqual(2);

      const foundKeys = sonnetKeys.filter(k =>
        helperTestKeys.some(
          testKey => testKey.key === k.key && testKey.model === 'claude-3-5-sonnet-20241022'
        )
      );
      expect(foundKeys.length).toBe(2);
    });

    test('findKeysByModel should validate model parameter', async () => {
      await expect(findKeysByModel('')).rejects.toThrow('required');
      await expect(findKeysByModel('   ')).rejects.toThrow('required');
    });

    test('findKeysByModel should return empty array for non-existent model', async () => {
      const keys = await findKeysByModel('non-existent-model');
      expect(keys).toEqual([]);
    });

    test('findExpiredKeys should find expired keys', async () => {
      const expiredKeys = await findExpiredKeys();

      expect(expiredKeys.length).toBeGreaterThanOrEqual(1);

      const foundExpiredKey = expiredKeys.find(k => k.key === 'test-helper-key-003');
      expect(foundExpiredKey).toBeDefined();
      expect(foundExpiredKey?.expiry_date).toBe('2020-01-01T00:00:00Z');
    });

    test('findActiveKeys should find active (non-expired) keys', async () => {
      const activeKeys = await findActiveKeys();

      expect(activeKeys.length).toBeGreaterThanOrEqual(2);

      const foundActiveKey1 = activeKeys.find(k => k.key === 'test-helper-key-001');
      const foundActiveKey2 = activeKeys.find(k => k.key === 'test-helper-key-002');

      expect(foundActiveKey1).toBeDefined();
      expect(foundActiveKey2).toBeDefined();

      // Should NOT contain the expired key
      const foundExpiredKey = activeKeys.find(k => k.key === 'test-helper-key-003');
      expect(foundExpiredKey).toBeUndefined();
    });
  });

  describe('INTEGRATION: Full CRUD Lifecycle', () => {
    const lifecycleTestKey: ApiKey = {
      key: 'test-lifecycle-key-001',
      name: 'Initial Lifecycle Name',
      model: 'claude-3-5-sonnet-20241022',
      token_limit_per_5h: 50000,
      expiry_date: '2027-12-31T23:59:59Z',
      created_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
      total_lifetime_tokens: 0,
      usage_windows: [],
    };

    test('should complete full CRUD lifecycle', async () => {
      // CREATE
      const created = await createApiKey(lifecycleTestKey);
      expect(created.key).toBe(lifecycleTestKey.key);

      // READ
      const found = await findApiKey(lifecycleTestKey.key);
      expect(found?.key).toBe(lifecycleTestKey.key);

      // UPDATE
      const updated = await updateApiKey(lifecycleTestKey.key, {
        name: 'Updated Lifecycle Name',
        token_limit_per_5h: 75000,
      });
      expect(updated?.name).toBe('Updated Lifecycle Name');
      expect(updated?.token_limit_per_5h).toBe(75000);

      // USAGE tracking
      await updateApiKeyUsage(lifecycleTestKey.key, 5000, 'claude-3-5-sonnet-20241022');
      const withUsage = await findApiKey(lifecycleTestKey.key);
      expect(withUsage?.total_lifetime_tokens).toBe(5000);

      // STATS
      const stats = await getKeyStats(lifecycleTestKey.key);
      expect(stats?.total_lifetime_tokens).toBe(5000);
      expect(stats?.current_usage.tokens_used_in_current_window).toBe(5000);
      expect(stats?.is_expired).toBe(false);

      // DELETE
      const deleted = await deleteApiKey(lifecycleTestKey.key);
      expect(deleted).toBe(true);

      // Verify deletion
      const finalCheck = await findApiKey(lifecycleTestKey.key);
      expect(finalCheck).toBeNull();
    });
  });

  describe('CLEANUP', () => {
    test('cleanup: delete main CRUD test key', async () => {
      await deleteApiKey(crudTestKey.key);
    });
  });
});
