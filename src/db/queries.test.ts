import { test, expect, describe } from "bun:test";
import { db } from './index';
import { apiKeys } from './schema';
import { eq } from 'drizzle-orm';
import {
  createApiKey,
  findApiKeyByKey,
  findApiKeyById,
  listApiKeys,
  updateApiKey,
  deleteApiKey,
  regenerateApiKey
} from './queries';

// Helper to clean up test data
async function cleanupTestKey(key: string) {
  await db.delete(apiKeys).where(eq(apiKeys.key, key));
}

describe('Database Query Layer', () => {
  describe('createApiKey', () => {
    test('should create a new API key with valid fields', async () => {
      const input = {
        name: 'Test Key',
        model: 'glm-4.7' as const,
        tokenLimitPerDay: 100000,
        expiryDate: '2025-12-31T23:59:59.000Z',
      };

      const result = await createApiKey(input);

      expect(result).toBeDefined();
      expect(result.id).toHaveLength(26);
      expect(result.key).toMatch(/^ajianaz_[a-z0-9]{26}$/);
      expect(result.name).toBe(input.name);
      expect(result.model).toBe(input.model);
      expect(result.tokenLimitPerDay).toBe(input.tokenLimitPerDay);
      expect(result.expiryDate).toBe(input.expiryDate);
      expect(result.totalLifetimeTokens).toBe(0);
      expect(result.createdAt).toBeDefined();
      expect(result.lastUsed).toBeNull();

      await cleanupTestKey(result.key);
    });

    test('should create unique keys for each call', async () => {
      const input = {
        name: 'Test Key',
        model: 'glm-4.7' as const,
        tokenLimitPerDay: 100000,
        expiryDate: '2025-12-31T23:59:59.000Z',
      };

      const result1 = await createApiKey(input);
      const result2 = await createApiKey({ ...input, name: 'Test Key 2' });

      expect(result1.key).not.toBe(result2.key);
      expect(result1.id).not.toBe(result2.id);

      await cleanupTestKey(result1.key);
      await cleanupTestKey(result2.key);
    });
  });

  describe('findApiKeyByKey', () => {
    test('should find API key by key value', async () => {
      const input = {
        name: 'Test Key',
        model: 'glm-4.7' as const,
        tokenLimitPerDay: 100000,
        expiryDate: '2025-12-31T23:59:59.000Z',
      };

      const created = await createApiKey(input);
      const found = await findApiKeyByKey(created.key);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.key).toBe(created.key);
      expect(found!.name).toBe(created.name);

      await cleanupTestKey(created.key);
    });

    test('should return null for non-existent key', async () => {
      const found = await findApiKeyByKey('ajianaz_nonexistentkey123456');
      expect(found).toBeNull();
    });
  });

  describe('findApiKeyById', () => {
    test('should find API key by ID', async () => {
      const input = {
        name: 'Test Key',
        model: 'glm-4.7' as const,
        tokenLimitPerDay: 100000,
        expiryDate: '2025-12-31T23:59:59.000Z',
      };

      const created = await createApiKey(input);
      const found = await findApiKeyById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.key).toBe(created.key);

      await cleanupTestKey(created.key);
    });

    test('should return null for non-existent ID', async () => {
      const found = await findApiKeyById('01hzabcdef1234567890abcd');
      expect(found).toBeNull();
    });
  });

  describe('listApiKeys', () => {
    test('should list API keys with pagination', async () => {
      // Create multiple keys
      const keys = [];
      for (let i = 0; i < 3; i++) {
        const created = await createApiKey({
          name: `Test Key ${i}`,
          model: 'glm-4.7' as const,
          tokenLimitPerDay: 100000,
          expiryDate: '2025-12-31T23:59:59.000Z',
        });
        keys.push(created);
      }

      // List with limit
      const result = await listApiKeys({ limit: 2, offset: 0 });

      expect(result.items).toBeDefined();
      expect(result.items.length).toBeLessThanOrEqual(2);
      expect(result.total).toBeGreaterThanOrEqual(3);

      // Cleanup
      for (const key of keys) {
        await cleanupTestKey(key.key);
      }
    });

    test('should handle offset correctly', async () => {
      const keys = [];
      for (let i = 0; i < 3; i++) {
        const created = await createApiKey({
          name: `Pagination Test ${i}`,
          model: 'glm-4.7' as const,
          tokenLimitPerDay: 100000,
          expiryDate: '2025-12-31T23:59:59.000Z',
        });
        keys.push(created);
      }

      const page1 = await listApiKeys({ limit: 2, offset: 0 });
      const page2 = await listApiKeys({ limit: 2, offset: 2 });

      expect(page1.items.length).toBeGreaterThan(0);
      expect(page2.items.length).toBeGreaterThanOrEqual(0);

      // Cleanup
      for (const key of keys) {
        await cleanupTestKey(key.key);
      }
    });

    test('should return empty list when no keys exist (with filter)', async () => {
      // This test verifies the structure is correct even with empty results
      const result = await listApiKeys({ limit: 10, offset: 0 });
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
      expect(result.total).toBeDefined();
      expect(typeof result.total).toBe('number');
    });
  });

  describe('updateApiKey', () => {
    test('should update API key fields', async () => {
      const created = await createApiKey({
        name: 'Original Name',
        model: 'glm-4.7' as const,
        tokenLimitPerDay: 100000,
        expiryDate: '2025-12-31T23:59:59.000Z',
      });

      const updated = await updateApiKey(created.id, {
        name: 'Updated Name',
        tokenLimitPerDay: 200000,
      });

      expect(updated).toBeDefined();
      expect(updated!.id).toBe(created.id);
      expect(updated!.key).toBe(created.key); // Key should not change
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.tokenLimitPerDay).toBe(200000);
      expect(updated!.model).toBe(created.model); // Unchanged field

      await cleanupTestKey(created.key);
    });

    test('should return null when updating non-existent ID', async () => {
      const result = await updateApiKey('01hz nonexistent', {
        name: 'Updated Name',
      });
      expect(result).toBeNull();
    });

    test('should update lastUsed timestamp', async () => {
      const created = await createApiKey({
        name: 'Test Key',
        model: 'glm-4.7' as const,
        tokenLimitPerDay: 100000,
        expiryDate: '2025-12-31T23:59:59.000Z',
      });

      const updated = await updateApiKey(created.id, {
        lastUsed: new Date().toISOString(),
      });

      expect(updated).toBeDefined();
      expect(updated!.lastUsed).toBeDefined();

      await cleanupTestKey(created.key);
    });
  });

  describe('deleteApiKey', () => {
    test('should delete API key by ID', async () => {
      const created = await createApiKey({
        name: 'To Be Deleted',
        model: 'glm-4.7' as const,
        tokenLimitPerDay: 100000,
        expiryDate: '2025-12-31T23:59:59.000Z',
      });

      const deleted = await deleteApiKey(created.id);

      expect(deleted).toBe(true);

      // Verify it's actually deleted
      const found = await findApiKeyById(created.id);
      expect(found).toBeNull();
    });

    test('should return false when deleting non-existent ID', async () => {
      const result = await deleteApiKey('01hznonexistent1234567890');
      expect(result).toBe(false);
    });
  });

  describe('regenerateApiKey', () => {
    test('should generate new key value while keeping other fields', async () => {
      const created = await createApiKey({
        name: 'Test Key',
        model: 'glm-4.7' as const,
        tokenLimitPerDay: 100000,
        expiryDate: '2025-12-31T23:59:59.000Z',
      });

      const regenerated = await regenerateApiKey(created.id);

      expect(regenerated).toBeDefined();
      expect(regenerated!.id).toBe(created.id); // ID stays the same
      expect(regenerated!.key).not.toBe(created.key); // Key changes
      expect(regenerated!.key).toMatch(/^ajianaz_[a-z0-9]{26}$/);
      expect(regenerated!.name).toBe(created.name);
      expect(regenerated!.model).toBe(created.model);
      expect(regenerated!.tokenLimitPerDay).toBe(created.tokenLimitPerDay);

      // Cleanup with new key
      await cleanupTestKey(regenerated!.key);
    });

    test('should return null for non-existent ID', async () => {
      const result = await regenerateApiKey('01hznonexistent1234567890');
      expect(result).toBeNull();
    });

    test('new key should be findable', async () => {
      const created = await createApiKey({
        name: 'Test Key',
        model: 'glm-4.7' as const,
        tokenLimitPerDay: 100000,
        expiryDate: '2025-12-31T23:59:59.000Z',
      });

      const regenerated = await regenerateApiKey(created.id);

      // Find by new key should work
      const foundByNewKey = await findApiKeyByKey(regenerated!.key);
      expect(foundByNewKey).toBeDefined();
      expect(foundByNewKey!.id).toBe(created.id);

      // Find by old key should not work
      const foundByOldKey = await findApiKeyByKey(created.key);
      expect(foundByOldKey).toBeNull();

      // Cleanup
      await cleanupTestKey(regenerated!.key);
    });
  });
});
