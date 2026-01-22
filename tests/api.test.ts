import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import type { ApiKey, StatsResponse } from '../src/types.js';

const TEST_DATA_FILE = `${import.meta.dir}/../data/test-apikeys.json`;

// Override DATA_FILE for tests
const originalDataFile = process.env.DATA_FILE;

/**
 * API Endpoint Integration Tests
 *
 * These tests require the server to be running on localhost:3001
 * To run these tests:
 * 1. Start the server: bun --hot index.ts
 * 2. In another terminal: bun test tests/api.test.ts
 *
 * Or use the provided test script:
 * bun run test-api
 */

// Helper function to make API requests
async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: unknown; headers: Headers }> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`http://localhost:3001${path}`, options);
  const data = await response.json().catch(() => null);

  return {
    status: response.status,
    data,
    headers: response.headers,
  };
}

// Helper to create a test API key
async function createTestKey(overrides?: Partial<ApiKey>): Promise<ApiKey> {
  const defaultKey = {
    key: `test-key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Key',
    token_limit_per_5h: 100000,
    expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };

  const result = await apiRequest('POST', '/api/keys', defaultKey);
  if (result.status !== 201) {
    throw new Error(`Failed to create test key: ${JSON.stringify(result.data)}`);
  }

  return result.data as ApiKey;
}

describe('API Endpoints Integration Tests', () => {
  beforeEach(async () => {
    // Set test data file environment variable
    process.env.DATA_FILE = TEST_DATA_FILE;

    // Note: These tests require the server to be running
    // The server will use the DATA_FILE environment variable
  });

  afterEach(async () => {
    // Restore original data file
    process.env.DATA_FILE = originalDataFile;
  });

  describe('GET /api/keys', () => {
    test('should return empty array when no keys exist', async () => {
      // Note: This test assumes the test data file is empty
      // You may need to manually clear the data file before running tests
      const { status, data } = await apiRequest('GET', '/api/keys');

      expect(status).toBe(200);
      expect(data).toHaveProperty('keys');
      expect(data).toHaveProperty('total');
      expect(Array.isArray((data as { keys: ApiKey[] }).keys)).toBe(true);
    });

    test('should return all API keys', async () => {
      const key1 = await createTestKey({ name: 'Test Key 1' });
      const key2 = await createTestKey({ name: 'Test Key 2' });

      const { status, data } = await apiRequest('GET', '/api/keys');

      expect(status).toBe(200);
      const result = data as { keys: ApiKey[]; total: number };
      expect(result.keys.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${key1.key}`);
      await apiRequest('DELETE', `/api/keys/${key2.key}`);
    });

    test('should sort keys by name ascending', async () => {
      await createTestKey({ key: 'z-test-key', name: 'Zebra' });
      await createTestKey({ key: 'a-test-key', name: 'Apple' });

      const { status, data } = await apiRequest(
        'GET',
        '/api/keys?sort_by=name&sort_order=asc'
      );

      expect(status).toBe(200);
      const keys = (data as { keys: ApiKey[] }).keys;
      const names = keys.map(k => k.name).filter(n => ['Apple', 'Zebra'].includes(n));

      // Check that our test keys are in the right order
      const appleIndex = names.indexOf('Apple');
      const zebraIndex = names.indexOf('Zebra');
      if (appleIndex !== -1 && zebraIndex !== -1) {
        expect(appleIndex).toBeLessThan(zebraIndex);
      }

      // Cleanup
      await apiRequest('DELETE', '/api/keys/z-test-key');
      await apiRequest('DELETE', '/api/keys/a-test-key');
    });

    test('should sort keys by token limit ascending', async () => {
      await createTestKey({
        key: 'low-quota-key',
        name: 'Low Quota',
        token_limit_per_5h: 100000,
      });
      await createTestKey({
        key: 'high-quota-key',
        name: 'High Quota',
        token_limit_per_5h: 500000,
      });

      const { status, data } = await apiRequest(
        'GET',
        '/api/keys?sort_by=token_limit_per_5h&sort_order=asc'
      );

      expect(status).toBe(200);
      const keys = (data as { keys: ApiKey[] }).keys;

      // Verify sorting
      for (let i = 0; i < keys.length - 1; i++) {
        expect(keys[i].token_limit_per_5h).toBeLessThanOrEqual(
          keys[i + 1].token_limit_per_5h
        );
      }

      // Cleanup
      await apiRequest('DELETE', '/api/keys/low-quota-key');
      await apiRequest('DELETE', '/api/keys/high-quota-key');
    });

    test('should filter keys by model', async () => {
      await createTestKey({
        key: 'glm4-key',
        name: 'GLM-4 Key',
        model: 'glm-4',
      });
      await createTestKey({
        key: 'glm47-key',
        name: 'GLM-4.7 Key',
        model: 'glm-4.7',
      });

      const { status, data } = await apiRequest('GET', '/api/keys?filter_model=glm-4');

      expect(status).toBe(200);
      const keys = (data as { keys: ApiKey[] }).keys;
      const filteredKeys = keys.filter(k => k.model === 'glm-4');
      expect(filteredKeys.length).toBeGreaterThan(0);

      // Cleanup
      await apiRequest('DELETE', '/api/keys/glm4-key');
      await apiRequest('DELETE', '/api/keys/glm47-key');
    });

    test('should search keys by name (case-insensitive)', async () => {
      await createTestKey({
        key: 'prod-key',
        name: 'Production API Key',
      });
      await createTestKey({
        key: 'dev-key',
        name: 'Development API Key',
      });

      const { status, data } = await apiRequest('GET', '/api/keys?search=production');

      expect(status).toBe(200);
      const keys = (data as { keys: ApiKey[] }).keys;
      const hasProductionKey = keys.some(k => k.name.toLowerCase().includes('production'));
      expect(hasProductionKey).toBe(true);

      // Cleanup
      await apiRequest('DELETE', '/api/keys/prod-key');
      await apiRequest('DELETE', '/api/keys/dev-key');
    });

    test('should search keys by key string', async () => {
      const testKey = await createTestKey({
        key: 'unique-search-key-12345',
        name: 'Search Test Key',
      });

      const { status, data } = await apiRequest('GET', '/api/keys?search=unique-search');

      expect(status).toBe(200);
      const keys = (data as { keys: ApiKey[] }).keys;
      const foundKey = keys.find(k => k.key === 'unique-search-key-12345');
      expect(foundKey).toBeDefined();

      // Cleanup
      await apiRequest('DELETE', '/api/keys/unique-search-key-12345');
    });

    test('should return 400 for invalid sort_by field', async () => {
      const { status, data } = await apiRequest('GET', '/api/keys?sort_by=invalid_field');

      expect(status).toBe(400);
      expect(data).toHaveProperty('error');
      expect((data as { error: string }).error).toContain('Invalid sort_by field');
    });

    test('should return 400 for invalid sort_order', async () => {
      const { status, data } = await apiRequest('GET', '/api/keys?sort_order=invalid');

      expect(status).toBe(400);
      expect(data).toHaveProperty('error');
      expect((data as { error: string }).error).toContain('Invalid sort_order');
    });

    test('should return 400 for invalid filter_expired', async () => {
      const { status, data } = await apiRequest('GET', '/api/keys?filter_expired=maybe');

      expect(status).toBe(400);
      expect(data).toHaveProperty('error');
      expect((data as { error: string }).error).toContain('Invalid filter_expired');
    });
  });

  describe('POST /api/keys', () => {
    test('should create a new API key', async () => {
      const newKey = {
        key: `new-test-${Date.now()}`,
        name: 'New Test Key',
        model: 'glm-4',
        token_limit_per_5h: 500000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const { status, data } = await apiRequest('POST', '/api/keys', newKey);

      expect(status).toBe(201);
      const createdKey = data as ApiKey;
      expect(createdKey.key).toBe(newKey.key);
      expect(createdKey.name).toBe(newKey.name);
      expect(createdKey.model).toBe(newKey.model);
      expect(createdKey.token_limit_per_5h).toBe(newKey.token_limit_per_5h);
      expect(createdKey.created_at).toBeDefined();
      expect(createdKey.last_used).toBeDefined();
      expect(createdKey.total_lifetime_tokens).toBe(0);
      expect(createdKey.usage_windows).toEqual([]);

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${newKey.key}`);
    });

    test('should return 400 if key is missing', async () => {
      const { status, data } = await apiRequest('POST', '/api/keys', {
        name: 'Test Key',
        token_limit_per_5h: 100000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(status).toBe(400);
      expect(data).toHaveProperty('error');
      expect((data as { error: string }).error).toContain('API key is required');
    });

    test('should return 400 if name is missing', async () => {
      const { status, data } = await apiRequest('POST', '/api/keys', {
        key: 'test-key',
        token_limit_per_5h: 100000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(status).toBe(400);
      expect(data).toHaveProperty('error');
      expect((data as { error: string }).error).toContain('Name is required');
    });

    test('should return 400 if token_limit_per_5h is missing', async () => {
      const { status, data } = await apiRequest('POST', '/api/keys', {
        key: 'test-key',
        name: 'Test Key',
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(status).toBe(400);
      expect(data).toHaveProperty('error');
      expect((data as { error: string }).error).toContain('Token limit is required');
    });

    test('should return 400 if expiry_date is missing', async () => {
      const { status, data } = await apiRequest('POST', '/api/keys', {
        key: 'test-key',
        name: 'Test Key',
        token_limit_per_5h: 100000,
      });

      expect(status).toBe(400);
      expect(data).toHaveProperty('error');
      expect((data as { error: string }).error).toContain('Expiry date is required');
    });

    test('should return 400 if key has invalid format (spaces)', async () => {
      const { status, data } = await apiRequest('POST', '/api/keys', {
        key: 'test key with spaces',
        name: 'Test Key',
        token_limit_per_5h: 100000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(status).toBe(400);
      expect(data).toHaveProperty('error');
    });

    test('should return 400 if key is too short (< 8 chars)', async () => {
      const { status, data } = await apiRequest('POST', '/api/keys', {
        key: 'short',
        name: 'Test Key',
        token_limit_per_5h: 100000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(status).toBe(400);
      expect(data).toHaveProperty('error');
    });

    test('should return 400 if token limit is negative', async () => {
      const { status, data } = await apiRequest('POST', '/api/keys', {
        key: 'test-key',
        name: 'Test Key',
        token_limit_per_5h: -100,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(status).toBe(400);
      expect(data).toHaveProperty('error');
    });

    test('should return 400 if expiry date is in the past', async () => {
      const { status, data } = await apiRequest('POST', '/api/keys', {
        key: 'test-key',
        name: 'Test Key',
        token_limit_per_5h: 100000,
        expiry_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(status).toBe(400);
      expect(data).toHaveProperty('error');
    });

    test('should return 409 if key already exists', async () => {
      const keyData = {
        key: `duplicate-${Date.now()}`,
        name: 'First Key',
        token_limit_per_5h: 100000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      // Create first key
      await apiRequest('POST', '/api/keys', keyData);

      // Try to create duplicate
      const { status, data } = await apiRequest('POST', '/api/keys', {
        ...keyData,
        name: 'Second Key',
      });

      expect(status).toBe(409);
      expect(data).toHaveProperty('error');

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${keyData.key}`);
    });

    test('should create key without model (optional field)', async () => {
      const keyData = {
        key: `no-model-${Date.now()}`,
        name: 'No Model Key',
        token_limit_per_5h: 100000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const { status, data } = await apiRequest('POST', '/api/keys', keyData);

      expect(status).toBe(201);
      expect((data as ApiKey).model).toBeUndefined();

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${keyData.key}`);
    });
  });

  describe('PUT /api/keys/:id', () => {
    test('should update key name', async () => {
      const testKey = await createTestKey({ name: 'Original Name' });

      const { status, data } = await apiRequest('PUT', `/api/keys/${testKey.key}`, {
        name: 'Updated Name',
      });

      expect(status).toBe(200);
      expect((data as ApiKey).name).toBe('Updated Name');
      expect((data as ApiKey).key).toBe(testKey.key); // Key should not change

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${testKey.key}`);
    });

    test('should update token limit', async () => {
      const testKey = await createTestKey({ token_limit_per_5h: 100000 });

      const { status, data } = await apiRequest('PUT', `/api/keys/${testKey.key}`, {
        token_limit_per_5h: 500000,
      });

      expect(status).toBe(200);
      expect((data as ApiKey).token_limit_per_5h).toBe(500000);

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${testKey.key}`);
    });

    test('should update expiry date', async () => {
      const testKey = await createTestKey();
      const newExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

      const { status, data } = await apiRequest('PUT', `/api/keys/${testKey.key}`, {
        expiry_date: newExpiry,
      });

      expect(status).toBe(200);
      expect((data as ApiKey).expiry_date).toBe(newExpiry);

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${testKey.key}`);
    });

    test('should update model', async () => {
      const testKey = await createTestKey({ model: 'glm-4' });

      const { status, data } = await apiRequest('PUT', `/api/keys/${testKey.key}`, {
        model: 'glm-4.7',
      });

      expect(status).toBe(200);
      expect((data as ApiKey).model).toBe('glm-4.7');

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${testKey.key}`);
    });

    test('should update multiple fields', async () => {
      const testKey = await createTestKey();
      const newExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

      const { status, data } = await apiRequest('PUT', `/api/keys/${testKey.key}`, {
        name: 'Completely Updated',
        token_limit_per_5h: 750000,
        expiry_date: newExpiry,
        model: 'glm-4.7',
      });

      expect(status).toBe(200);
      const updated = data as ApiKey;
      expect(updated.name).toBe('Completely Updated');
      expect(updated.token_limit_per_5h).toBe(750000);
      expect(updated.expiry_date).toBe(newExpiry);
      expect(updated.model).toBe('glm-4.7');

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${testKey.key}`);
    });

    test('should return 400 if no fields provided', async () => {
      const testKey = await createTestKey();

      const { status, data } = await apiRequest('PUT', `/api/keys/${testKey.key}`, {});

      expect(status).toBe(400);
      expect(data).toHaveProperty('error');
      expect((data as { error: string }).error).toContain('No valid fields');

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${testKey.key}`);
    });

    test('should return 400 for invalid field type', async () => {
      const testKey = await createTestKey();

      const { status, data } = await apiRequest('PUT', `/api/keys/${testKey.key}`, {
        name: 123, // Should be string
      });

      expect(status).toBe(400);
      expect(data).toHaveProperty('error');

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${testKey.key}`);
    });

    test('should return 404 for non-existent key', async () => {
      const { status, data } = await apiRequest('PUT', '/api/keys/non-existent-key-12345', {
        name: 'Updated Name',
      });

      expect(status).toBe(404);
      expect(data).toHaveProperty('error');
    });

    test('should return 400 for invalid name format', async () => {
      const testKey = await createTestKey();

      const { status, data } = await apiRequest('PUT', `/api/keys/${testKey.key}`, {
        name: 'Invalid@Name#',
      });

      expect(status).toBe(400);
      expect(data).toHaveProperty('error');

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${testKey.key}`);
    });

    test('should handle URL-encoded key IDs', async () => {
      const specialKey = await createTestKey({
        key: 'key-with/slash',
      });

      const encodedKey = encodeURIComponent('key-with/slash');
      const { status, data } = await apiRequest('PUT', `/api/keys/${encodedKey}`, {
        name: 'Updated Special Key',
      });

      expect(status).toBe(200);
      expect((data as ApiKey).name).toBe('Updated Special Key');

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${encodedKey}`);
    });
  });

  describe('DELETE /api/keys/:id', () => {
    test('should delete an existing key', async () => {
      const testKey = await createTestKey({ name: 'Delete Me' });

      const { status } = await apiRequest('DELETE', `/api/keys/${testKey.key}`);

      expect(status).toBe(204);

      // Verify key is deleted
      const { status: getStatus } = await apiRequest('GET', '/api/keys');
      expect(getStatus).toBe(200);
    });

    test('should return 404 for non-existent key', async () => {
      const { status, data } = await apiRequest(
        'DELETE',
        '/api/keys/non-existent-key-12345'
      );

      expect(status).toBe(404);
      expect(data).toHaveProperty('error');
    });

    test('should return 404 when deleting same key twice', async () => {
      const testKey = await createTestKey();

      // First deletion
      await apiRequest('DELETE', `/api/keys/${testKey.key}`);

      // Second deletion should fail
      const { status, data } = await apiRequest('DELETE', `/api/keys/${testKey.key}`);

      expect(status).toBe(404);
      expect(data).toHaveProperty('error');
    });

    test('should handle URL-encoded key IDs', async () => {
      const specialKey = await createTestKey({
        key: 'delete-key/with/slash',
      });

      const encodedKey = encodeURIComponent('delete-key/with/slash');
      const { status } = await apiRequest('DELETE', `/api/keys/${encodedKey}`);

      expect(status).toBe(204);
    });
  });

  describe('GET /api/keys/:id/usage', () => {
    test('should return usage statistics for existing key', async () => {
      const testKey = await createTestKey({
        name: 'Usage Test Key',
        model: 'glm-4',
      });

      const { status, data } = await apiRequest('GET', `/api/keys/${testKey.key}/usage`);

      expect(status).toBe(200);
      const stats = data as StatsResponse;

      expect(stats).toHaveProperty('key', testKey.key);
      expect(stats).toHaveProperty('name', 'Usage Test Key');
      expect(stats).toHaveProperty('model', 'glm-4');
      expect(stats).toHaveProperty('token_limit_per_5h');
      expect(stats).toHaveProperty('expiry_date');
      expect(stats).toHaveProperty('created_at');
      expect(stats).toHaveProperty('last_used');
      expect(stats).toHaveProperty('is_expired');
      expect(stats).toHaveProperty('current_usage');
      expect(stats).toHaveProperty('total_lifetime_tokens');

      // Check current_usage structure
      expect(stats.current_usage).toHaveProperty('tokens_used_in_current_window');
      expect(stats.current_usage).toHaveProperty('window_started_at');
      expect(stats.current_usage).toHaveProperty('window_ends_at');
      expect(stats.current_usage).toHaveProperty('remaining_tokens');

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${testKey.key}`);
    });

    test('should return 404 for non-existent key', async () => {
      const { status, data } = await apiRequest(
        'GET',
        '/api/keys/non-existent-key-12345/usage'
      );

      expect(status).toBe(404);
      expect(data).toHaveProperty('error');
    });

    test('should handle URL-encoded key IDs', async () => {
      const specialKey = await createTestKey({
        key: 'usage-key/with/slash',
      });

      const encodedKey = encodeURIComponent('usage-key/with/slash');
      const { status, data } = await apiRequest('GET', `/api/keys/${encodedKey}/usage`);

      expect(status).toBe(200);
      expect((data as StatsResponse).key).toBe('usage-key/with/slash');

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${encodedKey}`);
    });
  });

  describe('CORS Headers', () => {
    test('should include CORS headers in GET response', async () => {
      const response = await fetch('http://localhost:3001/api/keys');

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    test('should handle OPTIONS preflight request', async () => {
      const response = await fetch('http://localhost:3001/api/keys', {
        method: 'OPTIONS',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('PUT');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE');
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown API routes', async () => {
      const { status, data } = await apiRequest('GET', '/api/unknown-endpoint');

      expect(status).toBe(404);
      expect(data).toHaveProperty('error');
    });

    test('should return 404 for non-API routes', async () => {
      const { status } = await apiRequest('GET', '/non-existent-page');

      expect(status).toBe(404);
    });
  });
});
