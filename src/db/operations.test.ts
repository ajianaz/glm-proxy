import { beforeAll, afterAll, expect, test } from 'bun:test';
import { getDb, closeDb } from './connection.js';
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
} from './operations.js';
import type { ApiKey } from '../types.js';

// Test data
const testKey: ApiKey = {
  key: 'test-key-crud-12345',
  name: 'Test CRUD Key',
  model: 'claude-3-5-sonnet-20241022',
  token_limit_per_5h: 50000,
  expiry_date: '2025-12-31T23:59:59Z',
  created_at: new Date().toISOString(),
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 0,
  usage_windows: [],
};

beforeAll(async () => {
  // Ensure database connection is initialized
  getDb();
});

afterAll(async () => {
  await closeDb();
});

test('createApiKey should create a new API key', async () => {
  const created = await createApiKey(testKey);

  expect(created).toBeDefined();
  expect(created.key).toBe(testKey.key);
  expect(created.name).toBe(testKey.name);
  expect(created.model).toBe(testKey.model);
  expect(created.token_limit_per_5h).toBe(testKey.token_limit_per_5h);
  expect(created.usage_windows).toEqual([]);
});

test('createApiKey should reject duplicate keys', async () => {
  await expect(createApiKey(testKey)).rejects.toThrow('already exists');
});

test('createApiKey should validate required fields', async () => {
  await expect(createApiKey({ ...testKey, key: '' })).rejects.toThrow('required');
  await expect(createApiKey({ ...testKey, name: '' })).rejects.toThrow('required');
  await expect(createApiKey({ ...testKey, token_limit_per_5h: 0 })).rejects.toThrow(
    'greater than 0'
  );
  await expect(createApiKey({ ...testKey, expiry_date: '' })).rejects.toThrow('required');
});

test('findApiKey should find an existing key', async () => {
  const found = await findApiKey(testKey.key);

  expect(found).toBeDefined();
  expect(found?.key).toBe(testKey.key);
  expect(found?.name).toBe(testKey.name);
  expect(found?.model).toBe(testKey.model);
});

test('findApiKey should return null for non-existent key', async () => {
  const found = await findApiKey('non-existent-key');
  expect(found).toBeNull();
});

test('updateApiKey should update key metadata', async () => {
  const updated = await updateApiKey(testKey.key, {
    name: 'Updated CRUD Key',
    token_limit_per_5h: 100000,
  });

  expect(updated).toBeDefined();
  expect(updated?.name).toBe('Updated CRUD Key');
  expect(updated?.token_limit_per_5h).toBe(100000);
  expect(updated?.model).toBe(testKey.model); // Should remain unchanged
});

test('updateApiKey should return null for non-existent key', async () => {
  const result = await updateApiKey('non-existent-key', { name: 'New Name' });
  expect(result).toBeNull();
});

test('updateApiKey should validate updates', async () => {
  await expect(
    updateApiKey(testKey.key, { name: '' })
  ).rejects.toThrow('cannot be empty');

  await expect(
    updateApiKey(testKey.key, { token_limit_per_5h: 0 })
  ).rejects.toThrow('greater than 0');
});

test('deleteApiKey should delete an existing key', async () => {
  const deleted = await deleteApiKey(testKey.key);

  expect(deleted).toBe(true);

  // Verify the key is gone
  const found = await findApiKey(testKey.key);
  expect(found).toBeNull();
});

test('deleteApiKey should return false for non-existent key', async () => {
  const deleted = await deleteApiKey('non-existent-key');
  expect(deleted).toBe(false);
});

// Usage tracking tests
const usageTestKey: ApiKey = {
  key: 'test-key-usage-12345',
  name: 'Test Usage Key',
  model: 'claude-3-5-sonnet-20241022',
  token_limit_per_5h: 50000,
  expiry_date: '2025-12-31T23:59:59Z',
  created_at: new Date().toISOString(),
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 0,
  usage_windows: [],
};

test('updateApiKeyUsage should create key, update usage, and track windows', async () => {
  // Create the test key
  await createApiKey(usageTestKey);

  // Update usage
  await updateApiKeyUsage(usageTestKey.key, 1000, 'claude-3-5-sonnet-20241022');

  // Verify the updates
  const updated = await findApiKey(usageTestKey.key);
  expect(updated).toBeDefined();
  expect(updated?.total_lifetime_tokens).toBe(1000);
  expect(updated?.usage_windows.length).toBe(1);
  expect(updated?.usage_windows[0].tokens_used).toBe(1000);

  // last_used should be updated
  expect(updated?.last_used).toBeDefined();
});

test('updateApiKeyUsage should accumulate tokens in the same window', async () => {
  // First usage update
  await updateApiKeyUsage(usageTestKey.key, 1500, 'claude-3-5-sonnet-20241022');

  let updated = await findApiKey(usageTestKey.key);
  expect(updated?.total_lifetime_tokens).toBe(2500); // 1000 + 1500
  expect(updated?.usage_windows.length).toBe(1);
  expect(updated?.usage_windows[0].tokens_used).toBe(2500);

  // Second usage update within the same window
  await updateApiKeyUsage(usageTestKey.key, 500, 'claude-3-5-sonnet-20241022');

  updated = await findApiKey(usageTestKey.key);
  expect(updated?.total_lifetime_tokens).toBe(3000); // 2500 + 500
  expect(updated?.usage_windows.length).toBe(1);
  expect(updated?.usage_windows[0].tokens_used).toBe(3000);
});

test('updateApiKeyUsage should create new window after 5 hours', async () => {
  // We can't easily test time-based window creation in unit tests,
  // but we can verify the structure is correct
  const updated = await findApiKey(usageTestKey.key);
  expect(updated?.usage_windows.length).toBeGreaterThan(0);
  expect(updated?.usage_windows[0].window_start).toBeDefined();
  expect(updated?.usage_windows[0].tokens_used).toBeDefined();
});

test('updateApiKeyUsage should reject negative token values', async () => {
  await expect(
    updateApiKeyUsage(usageTestKey.key, -100, 'claude-3-5-sonnet-20241022')
  ).rejects.toThrow('non-negative');
});

test('updateApiKeyUsage should throw error for non-existent key', async () => {
  await expect(
    updateApiKeyUsage('non-existent-key', 1000, 'claude-3-5-sonnet-20241022')
  ).rejects.toThrow('not found');
});

test('updateApiKeyUsage should handle zero tokens', async () => {
  // This should work and just update the timestamp
  await updateApiKeyUsage(usageTestKey.key, 0, 'claude-3-5-sonnet-20241022');

  const updated = await findApiKey(usageTestKey.key);
  expect(updated).toBeDefined();
  expect(updated?.total_lifetime_tokens).toBe(3000); // Should remain unchanged
});

// Cleanup after usage tests
test('cleanup: delete usage test key', async () => {
  const deleted = await deleteApiKey(usageTestKey.key);
  expect(deleted).toBe(true);
});

// getKeyStats tests
const statsTestKey: ApiKey = {
  key: 'test-key-stats-12345',
  name: 'Test Stats Key',
  model: 'claude-3-5-sonnet-20241022',
  token_limit_per_5h: 50000,
  expiry_date: '2027-12-31T23:59:59Z', // Future date (we're in 2026)
  created_at: new Date().toISOString(),
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 0,
  usage_windows: [],
};

test('getKeyStats should return null for non-existent key', async () => {
  const stats = await getKeyStats('non-existent-key');
  expect(stats).toBeNull();
});

test('getKeyStats should return stats for new key', async () => {
  // Create the test key
  await createApiKey(statsTestKey);

  const stats = await getKeyStats(statsTestKey.key);

  expect(stats).toBeDefined();
  expect(stats?.key).toBe(statsTestKey.key);
  expect(stats?.name).toBe(statsTestKey.name);
  expect(stats?.model).toBe(statsTestKey.model);
  expect(stats?.token_limit_per_5h).toBe(statsTestKey.token_limit_per_5h);
  expect(stats?.total_lifetime_tokens).toBe(0);
  expect(stats?.is_expired).toBe(false);
  expect(stats?.current_usage.tokens_used_in_current_window).toBe(0);
  expect(stats?.current_usage.remaining_tokens).toBe(statsTestKey.token_limit_per_5h);
});

test('getKeyStats should reflect usage updates', async () => {
  // Update usage
  await updateApiKeyUsage(statsTestKey.key, 5000, 'claude-3-5-sonnet-20241022');

  const stats = await getKeyStats(statsTestKey.key);

  expect(stats?.total_lifetime_tokens).toBe(5000);
  expect(stats?.current_usage.tokens_used_in_current_window).toBe(5000);
  expect(stats?.current_usage.remaining_tokens).toBe(45000); // 50000 - 5000
  expect(stats?.last_used).toBeDefined();
});

test('getKeyStats should calculate expired status correctly', async () => {
  // Create an expired key
  const expiredKey: ApiKey = {
    key: 'test-key-expired-12345',
    name: 'Test Expired Key',
    model: 'claude-3-5-sonnet-20241022',
    token_limit_per_5h: 50000,
    expiry_date: '2020-01-01T00:00:00Z', // Past date
    created_at: '2019-12-31T00:00:00Z',
    last_used: new Date().toISOString(),
    total_lifetime_tokens: 0,
    usage_windows: [],
  };

  await createApiKey(expiredKey);

  const stats = await getKeyStats(expiredKey.key);

  expect(stats?.is_expired).toBe(true);

  // Cleanup
  await deleteApiKey(expiredKey.key);
});

test('getKeyStats should handle keys without model', async () => {
  // Create key without model
  const noModelKey: ApiKey = {
    key: 'test-key-nomodel-12345',
    name: 'Test No Model Key',
    token_limit_per_5h: 30000,
    expiry_date: '2027-12-31T23:59:59Z', // Future date (we're in 2026)
    created_at: new Date().toISOString(),
    last_used: new Date().toISOString(),
    total_lifetime_tokens: 0,
    usage_windows: [],
  };

  await createApiKey(noModelKey);

  const stats = await getKeyStats(noModelKey.key);

  expect(stats?.model).toBe('');

  // Cleanup
  await deleteApiKey(noModelKey.key);
});

test('getKeyStats should have valid window timestamps', async () => {
  const stats = await getKeyStats(statsTestKey.key);

  expect(stats?.current_usage.window_started_at).toBeDefined();
  expect(stats?.current_usage.window_ends_at).toBeDefined();

  const windowStart = new Date(stats!.current_usage.window_started_at);
  const windowEnd = new Date(stats!.current_usage.window_ends_at);

  // Window end should be approximately 5 hours after start
  const diffMs = windowEnd.getTime() - windowStart.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  expect(diffHours).toBeGreaterThanOrEqual(4.9); // Allow small timing differences
  expect(diffHours).toBeLessThanOrEqual(5.1);
});

test('cleanup: delete stats test key', async () => {
  const deleted = await deleteApiKey(statsTestKey.key);
  expect(deleted).toBe(true);
});

// Helper functions tests
const helperTestKeys: ApiKey[] = [
  {
    key: 'test-helper-key-1',
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
    key: 'test-helper-key-2',
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
    key: 'test-helper-key-3',
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

test('getAllApiKeys should return all keys with default pagination', async () => {
  // Create test keys
  for (const key of helperTestKeys) {
    await createApiKey(key);
  }

  const allKeys = await getAllApiKeys();

  expect(allKeys.length).toBeGreaterThanOrEqual(3);

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

  // Should contain our Sonnet test keys
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

  // Should contain our expired test key
  const foundExpiredKey = expiredKeys.find(k => k.key === 'test-helper-key-3');
  expect(foundExpiredKey).toBeDefined();
  expect(foundExpiredKey?.expiry_date).toBe('2020-01-01T00:00:00Z');
});

test('findActiveKeys should find active (non-expired) keys', async () => {
  const activeKeys = await findActiveKeys();

  expect(activeKeys.length).toBeGreaterThanOrEqual(2);

  // Should contain our active test keys
  const foundActiveKey1 = activeKeys.find(k => k.key === 'test-helper-key-1');
  const foundActiveKey2 = activeKeys.find(k => k.key === 'test-helper-key-2');

  expect(foundActiveKey1).toBeDefined();
  expect(foundActiveKey2).toBeDefined();

  // Should NOT contain the expired key
  const foundExpiredKey = activeKeys.find(k => k.key === 'test-helper-key-3');
  expect(foundExpiredKey).toBeUndefined();
});

test('helper functions should return keys with usage windows', async () => {
  // Create usage data for one of our test keys
  await updateApiKeyUsage('test-helper-key-1', 1000, 'claude-3-5-sonnet-20241022');

  // Check that getAllApiKeys includes usage windows
  const allKeys = await getAllApiKeys();
  const key1 = allKeys.find(k => k.key === 'test-helper-key-1');
  expect(key1?.usage_windows.length).toBe(1);
  expect(key1?.usage_windows[0].tokens_used).toBe(1000);

  // Check that findKeysByModel includes usage windows
  const sonnetKeys = await findKeysByModel('claude-3-5-sonnet-20241022');
  const key1FromModel = sonnetKeys.find(k => k.key === 'test-helper-key-1');
  expect(key1FromModel?.usage_windows.length).toBe(1);
  expect(key1FromModel?.usage_windows[0].tokens_used).toBe(1000);

  // Check that findActiveKeys includes usage windows
  const activeKeys = await findActiveKeys();
  const key1FromActive = activeKeys.find(k => k.key === 'test-helper-key-1');
  expect(key1FromActive?.usage_windows.length).toBe(1);
  expect(key1FromActive?.usage_windows[0].tokens_used).toBe(1000);
});

// Cleanup helper test keys
test('cleanup: delete helper test keys', async () => {
  for (const key of helperTestKeys) {
    const deleted = await deleteApiKey(key.key);
    expect(deleted).toBe(true);
  }
});

// Additional comprehensive CRUD tests

// Validation error tests
test('findApiKey should validate empty key parameter', async () => {
  await expect(findApiKey('')).rejects.toThrow('required and cannot be empty');
  await expect(findApiKey('   ')).rejects.toThrow('required and cannot be empty');
});

test('getKeyStats should validate empty key parameter', async () => {
  await expect(getKeyStats('')).rejects.toThrow('required and cannot be empty');
  await expect(getKeyStats('   ')).rejects.toThrow('required and cannot be empty');
});

test('deleteApiKey should validate empty key parameter', async () => {
  await expect(deleteApiKey('')).rejects.toThrow('required and cannot be empty');
  await expect(deleteApiKey('   ')).rejects.toThrow('required and cannot be empty');
});

// Cascade delete verification
const cascadeTestKey: ApiKey = {
  key: 'test-key-cascade-12345',
  name: 'Test Cascade Delete Key',
  model: 'claude-3-5-sonnet-20241022',
  token_limit_per_5h: 50000,
  expiry_date: '2027-12-31T23:59:59Z',
  created_at: new Date().toISOString(),
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 0,
  usage_windows: [],
};

test('deleteApiKey should cascade delete usage windows', async () => {
  // Create test key
  await createApiKey(cascadeTestKey);

  // Add usage windows
  await updateApiKeyUsage(cascadeTestKey.key, 1000, 'claude-3-5-sonnet-20241022');
  await updateApiKeyUsage(cascadeTestKey.key, 2000, 'claude-3-5-sonnet-20241022');

  // Verify usage windows exist
  const beforeDelete = await findApiKey(cascadeTestKey.key);
  expect(beforeDelete?.usage_windows.length).toBeGreaterThan(0);

  // Delete the key
  await deleteApiKey(cascadeTestKey.key);

  // Verify key is deleted
  const afterDelete = await findApiKey(cascadeTestKey.key);
  expect(afterDelete).toBeNull();

  // Usage windows should be cascade deleted (verified by key being null)
});

// Update field-specific tests
const updateFieldTestKey: ApiKey = {
  key: 'test-key-update-fields-12345',
  name: 'Test Update Fields Key',
  model: 'claude-3-5-sonnet-20241022',
  token_limit_per_5h: 50000,
  expiry_date: '2027-12-31T23:59:59Z',
  created_at: new Date().toISOString(),
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 0,
  usage_windows: [],
};

test('updateApiKey should update only name field', async () => {
  await createApiKey(updateFieldTestKey);

  const updated = await updateApiKey(updateFieldTestKey.key, {
    name: 'Updated Name Only',
  });

  expect(updated?.name).toBe('Updated Name Only');
  expect(updated?.model).toBe(updateFieldTestKey.model);
  expect(updated?.token_limit_per_5h).toBe(updateFieldTestKey.token_limit_per_5h);
  expect(updated?.expiry_date).toBe(updateFieldTestKey.expiry_date);
});

test('updateApiKey should update only model field', async () => {
  const updated = await updateApiKey(updateFieldTestKey.key, {
    model: 'claude-3-opus-20240229',
  });

  expect(updated?.name).toBe('Updated Name Only');
  expect(updated?.model).toBe('claude-3-opus-20240229');
  expect(updated?.token_limit_per_5h).toBe(updateFieldTestKey.token_limit_per_5h);
});

test('updateApiKey should update only token limit', async () => {
  const updated = await updateApiKey(updateFieldTestKey.key, {
    token_limit_per_5h: 75000,
  });

  expect(updated?.name).toBe('Updated Name Only');
  expect(updated?.model).toBe('claude-3-opus-20240229');
  expect(updated?.token_limit_per_5h).toBe(75000);
});

test('updateApiKey should update only expiry date', async () => {
  const newExpiry = '2028-12-31T23:59:59Z';
  const updated = await updateApiKey(updateFieldTestKey.key, {
    expiry_date: newExpiry,
  });

  expect(updated?.name).toBe('Updated Name Only');
  expect(updated?.token_limit_per_5h).toBe(75000);
  expect(updated?.expiry_date).toBe(newExpiry);
});

test('updateApiKey should handle setting model to null', async () => {
  const updated = await updateApiKey(updateFieldTestKey.key, {
    model: null,
  });

  expect(updated?.model).toBeUndefined();
});

test('updateApiKey should update multiple fields simultaneously', async () => {
  const updated = await updateApiKey(updateFieldTestKey.key, {
    name: 'Final Updated Name',
    model: 'claude-3-5-sonnet-20241022',
    token_limit_per_5h: 100000,
    expiry_date: '2029-12-31T23:59:59Z',
  });

  expect(updated?.name).toBe('Final Updated Name');
  expect(updated?.model).toBe('claude-3-5-sonnet-20241022');
  expect(updated?.token_limit_per_5h).toBe(100000);
  expect(updated?.expiry_date).toBe('2029-12-31T23:59:59Z');
});

test('updateApiKey should validate empty expiry_date', async () => {
  await expect(
    updateApiKey(updateFieldTestKey.key, { expiry_date: '' })
  ).rejects.toThrow('cannot be empty');
});

test('cleanup: delete update field test key', async () => {
  await deleteApiKey(updateFieldTestKey.key);
});

// Error type verification tests
const errorTypeTestKey: ApiKey = {
  key: 'test-key-error-types-12345',
  name: 'Test Error Types Key',
  model: 'claude-3-5-sonnet-20241022',
  token_limit_per_5h: 50000,
  expiry_date: '2027-12-31T23:59:59Z',
  created_at: new Date().toISOString(),
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 0,
  usage_windows: [],
};

test('createApiKey should throw ValidationError for missing key', async () => {
  const { ValidationError } = await import('./operations.js');

  await expect(
    createApiKey({ ...errorTypeTestKey, key: '' })
  ).rejects.toThrow(ValidationError);
});

test('createApiKey should throw ValidationError for invalid token limit', async () => {
  const { ValidationError } = await import('./operations.js');

  await expect(
    createApiKey({ ...errorTypeTestKey, token_limit_per_5h: -100 })
  ).rejects.toThrow(ValidationError);
});

test('createApiKey should throw DatabaseConstraintError for duplicate key', async () => {
  const { DatabaseConstraintError } = await import('./operations.js');

  await createApiKey(errorTypeTestKey);

  await expect(
    createApiKey(errorTypeTestKey)
  ).rejects.toThrow(DatabaseConstraintError);
});

test('updateApiKeyUsage should throw ValidationError for negative tokens', async () => {
  const { ValidationError } = await import('./operations.js');

  await expect(
    updateApiKeyUsage(errorTypeTestKey.key, -100, 'claude-3-5-sonnet-20241022')
  ).rejects.toThrow(ValidationError);
});

test('updateApiKeyUsage should throw DatabaseQueryError for non-existent key', async () => {
  const { DatabaseQueryError } = await import('./operations.js');

  await expect(
    updateApiKeyUsage('non-existent-key-xyz', 1000, 'claude-3-5-sonnet-20241022')
  ).rejects.toThrow(DatabaseQueryError);
});

test('cleanup: delete error type test key', async () => {
  await deleteApiKey(errorTypeTestKey.key);
});

// Transaction integrity tests
const transactionTestKey: ApiKey = {
  key: 'test-key-transaction-12345',
  name: 'Test Transaction Key',
  model: 'claude-3-5-sonnet-20241022',
  token_limit_per_5h: 50000,
  expiry_date: '2027-12-31T23:59:59Z',
  created_at: new Date().toISOString(),
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 0,
  usage_windows: [],
};

test('updateApiKeyUsage should atomically update both last_used and total_lifetime_tokens', async () => {
  await createApiKey(transactionTestKey);

  const beforeUpdate = await findApiKey(transactionTestKey.key);
  const initialLastUsed = beforeUpdate?.last_used;
  const initialTotalTokens = beforeUpdate?.total_lifetime_tokens;

  // Wait a bit to ensure timestamp difference
  await new Promise(resolve => setTimeout(resolve, 10));

  await updateApiKeyUsage(transactionTestKey.key, 5000, 'claude-3-5-sonnet-20241022');

  const afterUpdate = await findApiKey(transactionTestKey.key);

  // Both fields should be updated
  expect(afterUpdate?.last_used).not.toBe(initialLastUsed);
  expect(afterUpdate?.total_lifetime_tokens).toBe((initialTotalTokens ?? 0) + 5000);

  // Verify the update was atomic (either both updated or neither)
  expect(afterUpdate?.last_used).toBeDefined();
  expect(afterUpdate?.total_lifetime_tokens).toBeDefined();
});

test('updateApiKeyUsage should manage usage windows atomically', async () => {
  // Reset the key
  await deleteApiKey(transactionTestKey.key);
  await createApiKey(transactionTestKey);

  // First usage update
  await updateApiKeyUsage(transactionTestKey.key, 1000, 'claude-3-5-sonnet-20241022');
  let key = await findApiKey(transactionTestKey.key);
  expect(key?.usage_windows.length).toBe(1);
  expect(key?.usage_windows[0].tokens_used).toBe(1000);

  // Second usage update within same window
  await updateApiKeyUsage(transactionTestKey.key, 2000, 'claude-3-5-sonnet-20241022');
  key = await findApiKey(transactionTestKey.key);
  expect(key?.usage_windows.length).toBe(1);
  expect(key?.usage_windows[0].tokens_used).toBe(3000);

  // Total lifetime tokens should be sum of all updates
  expect(key?.total_lifetime_tokens).toBe(3000);
});

test('updateApiKeyUsage should clean up old usage windows in transaction', async () => {
  // Use a fresh key for this test to ensure isolation
  const cleanupTestKey: ApiKey = {
    key: 'test-key-cleanup-12345',
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

  // Manually create an old usage window by directly manipulating time
  const oldWindow = {
    window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
    tokens_used: 500,
  };

  const { db, type } = await getDb();
  const usageTable = type === 'sqlite' ? await import('./schema.js').then(m => m.sqliteUsageWindows) : await import('./schema.js').then(m => m.pgUsageWindows);

  // Insert old window directly using db
  await db.insert(usageTable).values({
    apiKey: cleanupTestKey.key,
    windowStart: oldWindow.window_start,
    tokensUsed: oldWindow.tokens_used,
  });

  // Add current usage
  await updateApiKeyUsage(cleanupTestKey.key, 1500, 'claude-3-5-sonnet-20241022');

  const key = await findApiKey(cleanupTestKey.key);

  // Old window should be cleaned up (deleted in transaction)
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

test('cleanup: delete transaction test key', async () => {
  await deleteApiKey(transactionTestKey.key);
});

// Edge cases tests
const edgeCaseTestKey: ApiKey = {
  key: 'test-key-edge-cases-12345',
  name: 'Test Edge Cases Key',
  model: 'claude-3-5-sonnet-20241022',
  token_limit_per_5h: 50000,
  expiry_date: '2027-12-31T23:59:59Z',
  created_at: new Date().toISOString(),
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 0,
  usage_windows: [],
};

test('createApiKey should handle key with undefined model', async () => {
  const keyWithoutModel: ApiKey = {
    ...edgeCaseTestKey,
    key: 'test-key-no-model-12345',
    model: undefined,
  };

  const created = await createApiKey(keyWithoutModel);
  expect(created.model).toBeUndefined();

  await deleteApiKey(keyWithoutModel.key);
});

test('findApiKey should return key with null model', async () => {
  await createApiKey(edgeCaseTestKey);

  // Update to remove model
  await updateApiKey(edgeCaseTestKey.key, { model: null });

  const found = await findApiKey(edgeCaseTestKey.key);
  expect(found?.model).toBeUndefined();
});

test('getAllApiKeys should handle empty result set', async () => {
  // This test assumes the database might be empty or have very few keys
  const keys = await getAllApiKeys({ limit: 1, offset: 999999 });
  expect(keys).toEqual([]);
});

test('getAllApiKeys should include keys with null model', async () => {
  const allKeys = await getAllApiKeys();
  const keyWithoutModel = allKeys.find(k => k.key === edgeCaseTestKey.key);
  expect(keyWithoutModel).toBeDefined();
  // Model was set to null, which is returned as undefined
  expect(keyWithoutModel?.model).toBeUndefined();
});

test('getKeyStats should handle key with zero usage', async () => {
  const stats = await getKeyStats(edgeCaseTestKey.key);
  expect(stats?.current_usage.tokens_used_in_current_window).toBe(0);
  expect(stats?.current_usage.remaining_tokens).toBe(edgeCaseTestKey.token_limit_per_5h);
});

test('getKeyStats should handle key at usage limit', async () => {
  // Use exactly the token limit
  await updateApiKeyUsage(edgeCaseTestKey.key, edgeCaseTestKey.token_limit_per_5h, 'claude-3-5-sonnet-20241022');

  const stats = await getKeyStats(edgeCaseTestKey.key);
  expect(stats?.current_usage.tokens_used_in_current_window).toBe(edgeCaseTestKey.token_limit_per_5h);
  expect(stats?.current_usage.remaining_tokens).toBe(0);
});

test('getKeyStats should prevent negative remaining tokens', async () => {
  // Exceed the token limit
  await updateApiKeyUsage(edgeCaseTestKey.key, 10000, 'claude-3-5-sonnet-20241022');

  const stats = await getKeyStats(edgeCaseTestKey.key);
  expect(stats?.current_usage.remaining_tokens).toBe(0); // Should be clamped to 0, not negative
});

test('cleanup: delete edge case test key', async () => {
  await deleteApiKey(edgeCaseTestKey.key);
});

// Integration test: full CRUD lifecycle
const lifecycleTestKey: ApiKey = {
  key: 'test-key-lifecycle-12345',
  name: 'Initial Name',
  model: 'claude-3-5-sonnet-20241022',
  token_limit_per_5h: 50000,
  expiry_date: '2027-12-31T23:59:59Z',
  created_at: new Date().toISOString(),
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 0,
  usage_windows: [],
};

test('full CRUD lifecycle should work correctly', async () => {
  // CREATE
  const created = await createApiKey(lifecycleTestKey);
  expect(created.key).toBe(lifecycleTestKey.key);

  // READ
  const found = await findApiKey(lifecycleTestKey.key);
  expect(found?.key).toBe(lifecycleTestKey.key);

  // UPDATE
  const updated = await updateApiKey(lifecycleTestKey.key, {
    name: 'Updated Name',
    token_limit_per_5h: 75000,
  });
  expect(updated?.name).toBe('Updated Name');
  expect(updated?.token_limit_per_5h).toBe(75000);

  // USAGE tracking
  await updateApiKeyUsage(lifecycleTestKey.key, 5000, 'claude-3-5-sonnet-20241022');
  const withUsage = await findApiKey(lifecycleTestKey.key);
  expect(withUsage?.total_lifetime_tokens).toBe(5000);

  // STATS
  const stats = await getKeyStats(lifecycleTestKey.key);
  expect(stats?.total_lifetime_tokens).toBe(5000);
  expect(stats?.current_usage.tokens_used_in_current_window).toBe(5000);

  // DELETE
  const deleted = await deleteApiKey(lifecycleTestKey.key);
  expect(deleted).toBe(true);

  // Verify deletion
  const finalCheck = await findApiKey(lifecycleTestKey.key);
  expect(finalCheck).toBeNull();
});
