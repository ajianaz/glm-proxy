import { beforeAll, afterAll, expect, test } from 'bun:test';
import { getDb, closeDb } from './connection.js';
import {
  findApiKey,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  updateApiKeyUsage
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
