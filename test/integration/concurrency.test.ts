/**
 * Concurrency Tests for Admin API
 *
 * Tests atomic operations with concurrent requests to verify:
 * - No race conditions during updates
 * - Transaction isolation works correctly
 * - Concurrent operations are serialized properly
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { closeDatabase, resetDatabase } from '../../src/models/database';
import { resetConfig } from '../../src/config';
import { resetAdminKeyCache } from '../../src/utils/adminCredentials';
import { ApiKeyModel } from '../../src/models/apiKey';

const ADMIN_API_KEY = 'test-admin-key-12345';

describe('Concurrency Tests - Atomic Operations', () => {
  beforeEach(async () => {
    // Reset config and caches
    resetConfig();
    resetAdminKeyCache();

    // Set up environment for testing
    process.env.ADMIN_API_KEY = ADMIN_API_KEY;
    process.env.ADMIN_API_ENABLED = 'true';
    process.env.ZAI_API_KEY = 'test-zai-key';
    process.env.DATABASE_PATH = ':memory:';

    // Close and reset database for clean state
    closeDatabase();
    resetDatabase();
  });

  /**
   * Test concurrent updates to the same API key
   * Verifies that updates are atomic and no race conditions occur
   */
  it('should handle concurrent updates to the same API key atomically', async () => {
    // Create an initial API key
    const created = ApiKeyModel.create({
      key: 'sk-test-concurrent-1-1234567890abcdef',
      name: 'Concurrent Test Key',
      description: 'Initial description',
      rate_limit: 100,
      scopes: ['read', 'write'],
    });

    expect(created).toHaveProperty('id');
    const keyId = created.id;

    // Simulate concurrent updates
    const updatePromises = [];

    // Update 1: Change name
    updatePromises.push(
      Promise.resolve().then(() =>
        ApiKeyModel.update(keyId, {
          name: 'Updated Name 1',
        })
      )
    );

    // Update 2: Change description
    updatePromises.push(
      Promise.resolve().then(() =>
        ApiKeyModel.update(keyId, {
          description: 'Updated description 2',
        })
      )
    );

    // Update 3: Change rate_limit
    updatePromises.push(
      Promise.resolve().then(() =>
        ApiKeyModel.update(keyId, {
          rate_limit: 200,
        })
      )
    );

    // Wait for all updates to complete
    const results = await Promise.all(updatePromises);

    // All updates should succeed
    results.forEach((result) => {
      expect(result).toHaveProperty('id', keyId);
      expect(result).toHaveProperty('updated_at');
    });

    // Final state should be valid and consistent
    // Note: With concurrent updates, the final state depends on commit order
    // The key is that all transactions complete without errors
    const finalState = ApiKeyModel.findById(keyId);
    expect(finalState).toBeDefined();

    // At least one of the updates should have been applied
    const nameChanged = finalState?.name === 'Updated Name 1';
    const descChanged = finalState?.description === 'Updated description 2';
    const rateChanged = finalState?.rate_limit === 200;

    // Verify at least some changes were applied
    const changesApplied = [nameChanged, descChanged, rateChanged].filter(Boolean).length;
    expect(changesApplied).toBeGreaterThan(0);

    // Verify the data is valid
    expect(finalState?.id).toBe(keyId);
    expect(['Concurrent Test Key', 'Updated Name 1']).toContain(finalState?.name);
    expect(['Initial description', 'Updated description 2']).toContain(finalState?.description);
    expect([100, 200]).toContain(finalState?.rate_limit);
  });

  /**
   * Test rapid consecutive updates to verify atomicity
   */
  it('should handle rapid consecutive updates without race conditions', async () => {
    // Create an API key
    const created = ApiKeyModel.create({
      key: 'sk-test-rapid-2-1234567890abcdefghijklmn',
      name: 'Rapid Update Test',
      rate_limit: 50,
    });

    const keyId = created.id;
    const updateCount = 10;
    const updatePromises: Promise<any>[] = [];

    // Perform rapid updates
    for (let i = 0; i < updateCount; i++) {
      updatePromises.push(
        Promise.resolve().then(() =>
          ApiKeyModel.update(keyId, {
            rate_limit: 50 + i * 10,
          })
        )
      );
    }

    // Wait for all updates to complete
    const results = await Promise.all(updatePromises);

    // All updates should succeed
    results.forEach((result) => {
      expect(result).toHaveProperty('id', keyId);
    });

    // Final rate_limit should be one of the updated values
    const finalState = ApiKeyModel.findById(keyId);
    expect(finalState).toBeDefined();
    expect(finalState?.rate_limit).toBeGreaterThanOrEqual(50);
    expect(finalState?.rate_limit).toBeLessThanOrEqual(50 + updateCount * 10);

    // Verify the value is one of the expected values (multiple of 10, starting from 50)
    const isValidRateLimit = finalState!.rate_limit % 10 === 0 && finalState!.rate_limit >= 50;
    expect(isValidRateLimit).toBe(true);
  });

  /**
   * Test concurrent creates with unique constraint
   */
  it('should handle concurrent creates with duplicate detection', async () => {
    const sameKey = 'sk-test-duplicate-3-1234567890abcdefghijkl';

    // Try to create two API keys with the same key concurrently
    const createPromises = [
      Promise.resolve().then(() =>
        ApiKeyModel.create({
          key: sameKey,
          name: 'First Create',
        })
      ).catch((error) => {
        // Expected to fail with duplicate error
        expect(error.name).toBe('ApiKeyDuplicateError');
        throw error;
      }),
      Promise.resolve().then(() =>
        ApiKeyModel.create({
          key: sameKey,
          name: 'Second Create',
        })
      ).catch((error) => {
        // Expected to fail with duplicate error
        expect(error.name).toBe('ApiKeyDuplicateError');
        throw error;
      }),
    ];

    const results = await Promise.allSettled(createPromises);

    // One should succeed, one should fail
    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    const failureCount = results.filter((r) => r.status === 'rejected').length;

    expect(successCount).toBe(1);
    expect(failureCount).toBe(1);

    // Verify only one key was created
    const keys = ApiKeyModel.list({ limit: 100 });
    expect(keys.total).toBe(1);
    expect(keys.data[0].name).toBe('First Create'); // First one wins
  });

  /**
   * Test concurrent deletes
   */
  it('should handle concurrent delete operations atomically', async () => {
    // Create an API key
    const created = ApiKeyModel.create({
      key: 'sk-test-delete-4-1234567890abcdefghijklmn',
      name: 'Delete Test Key',
    });

    const keyId = created.id;

    // Try to delete the same key twice concurrently
    const deletePromises = [
      Promise.resolve().then(() => ApiKeyModel.delete(keyId)),
      Promise.resolve().then(() => ApiKeyModel.delete(keyId)),
    ];

    const results = await Promise.all(deletePromises);

    // One should return true (deleted), one should return false (not found)
    expect(results).toContain(true);
    expect(results).toContain(false);

    // Verify key is deleted
    const finalState = ApiKeyModel.findById(keyId);
    expect(finalState).toBeNull();
  });

  /**
   * Test concurrent read and update operations
   */
  it('should handle concurrent reads and updates safely', async () => {
    // Create an API key
    const created = ApiKeyModel.create({
      key: 'sk-test-read-update-5-1234567890abcdefghij',
      name: 'Read Update Test',
      rate_limit: 100,
    });

    const keyId = created.id;
    const operations: Promise<any>[] = [];

    // Mix of reads and updates
    for (let i = 0; i < 5; i++) {
      // Read operations
      operations.push(
        Promise.resolve().then(() => ApiKeyModel.findById(keyId))
      );

      // Update operations
      operations.push(
        Promise.resolve().then(() =>
          ApiKeyModel.update(keyId, {
            rate_limit: 100 + i * 10,
          })
        )
      );
    }

    // Wait for all operations
    const results = await Promise.all(operations);

    // All reads should return valid data
    const readResults = results.filter((r) => r !== null && typeof r === 'object');
    expect(readResults.length).toBeGreaterThan(0);

    // All updates should succeed
    results.forEach((result) => {
      if (result && typeof result === 'object' && result.id) {
        expect(result.id).toBe(keyId);
      }
    });

    // Final state should be valid
    const finalState = ApiKeyModel.findById(keyId);
    expect(finalState).toBeDefined();
    expect(finalState?.id).toBe(keyId);
  });

  /**
   * Test concurrent updates on different keys
   */
  it('should handle concurrent updates on different keys independently', async () => {
    // Create multiple API keys
    const key1 = ApiKeyModel.create({
      key: 'sk-test-multi-6-1234567890abcdefghijklm',
      name: 'Key 1',
      rate_limit: 100,
    });

    const key2 = ApiKeyModel.create({
      key: 'sk-test-multi-7-1234567890abcdefghijklm',
      name: 'Key 2',
      rate_limit: 200,
    });

    // Update both keys concurrently
    const updatePromises = [
      Promise.resolve().then(() =>
        ApiKeyModel.update(key1.id, {
          name: 'Updated Key 1',
          rate_limit: 150,
        })
      ),
      Promise.resolve().then(() =>
        ApiKeyModel.update(key2.id, {
          name: 'Updated Key 2',
          rate_limit: 250,
        })
      ),
    ];

    const results = await Promise.all(updatePromises);

    // Both updates should succeed independently
    expect(results[0].name).toBe('Updated Key 1');
    expect(results[0].rate_limit).toBe(150);
    expect(results[1].name).toBe('Updated Key 2');
    expect(results[1].rate_limit).toBe(250);

    // Verify final states
    const finalKey1 = ApiKeyModel.findById(key1.id);
    const finalKey2 = ApiKeyModel.findById(key2.id);

    expect(finalKey1?.name).toBe('Updated Key 1');
    expect(finalKey1?.rate_limit).toBe(150);
    expect(finalKey2?.name).toBe('Updated Key 2');
    expect(finalKey2?.rate_limit).toBe(250);
  });

  /**
   * Test that transactions rollback on error
   */
  it('should rollback transaction on validation error', async () => {
    // Create an API key
    const created = ApiKeyModel.create({
      key: 'sk-test-rollback-8-1234567890abcdefghijk',
      name: 'Rollback Test',
      rate_limit: 100,
      scopes: ['read', 'write'],
    });

    const keyId = created.id;
    const originalRateLimit = created.rate_limit;
    const originalScopes = created.scopes;

    // Try to update with invalid data (rate_limit too high)
    expect(() => {
      ApiKeyModel.update(keyId, {
        rate_limit: 20000, // Exceeds max of 10000
      });
    }).toThrow();

    // Verify the update was rolled back - no changes should have been applied
    const finalState = ApiKeyModel.findById(keyId);
    expect(finalState?.rate_limit).toBe(originalRateLimit);
    expect(finalState?.scopes).toEqual(originalScopes);
  });

  /**
   * Test update with no changes is atomic
   */
  it('should handle no-op updates atomically', async () => {
    // Create an API key
    const created = ApiKeyModel.create({
      key: 'sk-test-noop-9-1234567890abcdefghijklmn',
      name: 'Noop Test',
      rate_limit: 100,
    });

    const keyId = created.id;
    const originalUpdatedAt = created.updated_at;

    // Wait a bit to ensure timestamp would differ
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Update with no actual changes (empty object)
    const result = ApiKeyModel.update(keyId, {});

    // Should return the existing key without errors
    expect(result.id).toBe(keyId);
    expect(result.updated_at).toBe(originalUpdatedAt);
  });

  /**
   * Test concurrent list and update operations
   */
  it('should handle concurrent list and update operations', async () => {
    // Create multiple keys
    for (let i = 0; i < 5; i++) {
      ApiKeyModel.create({
        key: `sk-test-list-update-${i}-1234567890abcdefghijk`,
        name: `Key ${i}`,
        rate_limit: 100 + i * 10,
      });
    }

    const operations: Promise<any>[] = [];

    // Concurrent list operations
    for (let i = 0; i < 3; i++) {
      operations.push(
        Promise.resolve().then(() =>
          ApiKeyModel.list({ page: 1, limit: 10 })
        )
      );
    }

    // Concurrent update operations
    operations.push(
      Promise.resolve().then(() =>
        ApiKeyModel.update(1, { name: 'Updated Key 1' })
      )
    );
    operations.push(
      Promise.resolve().then(() =>
        ApiKeyModel.update(2, { name: 'Updated Key 2' })
      )
    );

    // Wait for all operations
    const results = await Promise.all(operations);

    // All operations should succeed
    results.forEach((result) => {
      expect(result).toBeDefined();
    });

    // Verify list operations returned consistent data
    const listResults = results.slice(0, 3);
    listResults.forEach((list) => {
      expect(list).toHaveProperty('data');
      expect(list).toHaveProperty('total', 5);
    });
  });
});
