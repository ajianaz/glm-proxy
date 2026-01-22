/**
 * Integration Tests for Admin API - POST and GET /admin/api/keys
 *
 * Tests the API key creation and listing endpoints including:
 * - Successful creation and listing
 * - Request validation
 * - Authentication
 * - Pagination
 * - Filtering
 * - Error handling
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { closeDatabase, resetDatabase } from '../../src/models/database';
import { resetConfig } from '../../src/config';
import { resetAdminKeyCache } from '../../src/utils/adminCredentials';
import keysRoutes from '../../src/routes/admin/keys';
import { generateAdminToken } from '../../src/utils/adminToken';
import { ApiKeyModel } from '../../src/models/apiKey';

const ADMIN_API_KEY = 'test-admin-key-12345';

describe('POST /admin/api/keys', () => {
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
   * Helper function to make authenticated requests to the POST endpoint
   */
  async function makeRequest(data: any, authToken?: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // Note: The keysRoutes app handles requests to the root path (/)
    // because it's mounted at /admin/api/keys in the main app
    const request = new Request(new URL('http://localhost/'), {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    return keysRoutes.fetch(request);
  }

  describe('Authentication', () => {
    it('should create API key with valid admin API key using Authorization header', async () => {
      const response = await makeRequest({
        key: 'sk-test-new-key-1234567890abcdefghijkl',
        name: 'Test Key',
        description: 'A test API key',
      }, ADMIN_API_KEY);

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('name', 'Test Key');
      expect(data).toHaveProperty('description', 'A test API key');
      expect(data).toHaveProperty('key_preview');
      expect(data).not.toHaveProperty('key');
      expect(data).not.toHaveProperty('key_hash');
      expect(data.is_active).toBe(true);
      expect(data.scopes).toEqual([]);
      expect(data.rate_limit).toBe(60); // default value
    });

    it('should create API key with valid admin token', async () => {
      const token = await generateAdminToken();

      const response = await makeRequest({
        key: 'sk-test-token-key-1234567890abcdefghijk',
        name: 'Token Test Key',
      }, token);

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('name', 'Token Test Key');
    });

    it('should return 401 when admin API key is missing', async () => {
      const response = await makeRequest({
        key: 'sk-test-key-1234567890abcdefghijklmnop',
        name: 'Test Key',
      });

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 401 when admin API key is invalid', async () => {
      const response = await makeRequest({
        key: 'sk-test-key-1234567890abcdefghijklmnop',
        name: 'Test Key',
      }, 'invalid-admin-key');

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('Request Validation', () => {
    it('should create API key with all optional fields', async () => {
      const response = await makeRequest({
        key: 'sk-test-complete-key-1234567890abcdefghij',
        name: 'Complete Test Key',
        description: 'A test API key with all fields',
        scopes: ['read', 'write', 'delete'],
        rate_limit: 120,
      }, ADMIN_API_KEY);

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.name).toBe('Complete Test Key');
      expect(data.description).toBe('A test API key with all fields');
      expect(data.scopes).toEqual(['read', 'write', 'delete']);
      expect(data.rate_limit).toBe(120);
    });

    it('should return 400 when key is too short', async () => {
      const response = await makeRequest({
        key: 'short',
        name: 'Test Key',
      }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data).toHaveProperty('details');
      expect(data.details).toBeInstanceOf(Array);
      expect(data.details.some((d: any) => d.field === 'key')).toBe(true);
    });

    it('should return 400 when key is too long', async () => {
      const response = await makeRequest({
        key: 'a'.repeat(257),
        name: 'Test Key',
      }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'key')).toBe(true);
    });

    it('should return 400 when key contains invalid characters', async () => {
      const response = await makeRequest({
        key: 'sk-test-key with spaces 123456789',
        name: 'Test Key',
      }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'key')).toBe(true);
    });

    it('should return 400 when name is missing', async () => {
      const response = await makeRequest({
        key: 'sk-test-key-1234567890abcdefghijklmnop',
      }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'name')).toBe(true);
    });

    it('should return 400 when name is empty string', async () => {
      const response = await makeRequest({
        key: 'sk-test-key-1234567890abcdefghijklmnop',
        name: '   ',
      }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'name')).toBe(true);
    });

    it('should return 400 when name is too long', async () => {
      const response = await makeRequest({
        key: 'sk-test-key-1234567890abcdefghijklmnop',
        name: 'a'.repeat(256),
      }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'name')).toBe(true);
    });

    it('should return 400 when description is too long', async () => {
      const response = await makeRequest({
        key: 'sk-test-key-1234567890abcdefghijklmnop',
        name: 'Test Key',
        description: 'a'.repeat(1001),
      }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'description')).toBe(true);
    });

    it('should return 400 when scopes is not an array', async () => {
      const response = await makeRequest({
        key: 'sk-test-key-1234567890abcdefghijklmnop',
        name: 'Test Key',
        scopes: 'not-an-array',
      }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'scopes')).toBe(true);
    });

    it('should return 400 when rate_limit is negative', async () => {
      const response = await makeRequest({
        key: 'sk-test-key-1234567890abcdefghijklmnop',
        name: 'Test Key',
        rate_limit: -1,
      }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'rate_limit')).toBe(true);
    });

    it('should return 400 when rate_limit exceeds maximum', async () => {
      const response = await makeRequest({
        key: 'sk-test-key-1234567890abcdefghijklmnop',
        name: 'Test Key',
        rate_limit: 10001,
      }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'rate_limit')).toBe(true);
    });

    it('should return 400 when rate_limit is not an integer', async () => {
      const response = await makeRequest({
        key: 'sk-test-key-1234567890abcdefghijklmnop',
        name: 'Test Key',
        rate_limit: 60.5,
      }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'rate_limit')).toBe(true);
    });

    it('should return 400 for malformed JSON', async () => {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${ADMIN_API_KEY}`,
        'Content-Type': 'application/json',
      };

      const request = new Request(new URL('http://localhost/'), {
        method: 'POST',
        headers,
        body: 'invalid json',
      });

      const response = await keysRoutes.fetch(request);

      expect(response.status).toBe(400);
    });
  });

  describe('Duplicate Key Handling', () => {
    it('should return 409 when API key hash already exists', async () => {
      const apiKeyData = {
        key: 'sk-test-duplicate-key-1234567890abcdefgh',
        name: 'First Key',
      };

      // Create first key
      const firstResponse = await makeRequest(apiKeyData, ADMIN_API_KEY);
      expect(firstResponse.status).toBe(201);

      // Try to create duplicate key
      const secondResponse = await makeRequest({
        ...apiKeyData,
        name: 'Second Key',
      }, ADMIN_API_KEY);

      expect(secondResponse.status).toBe(409);

      const data = await secondResponse.json();
      expect(data).toHaveProperty('error', 'Duplicate API key');
      expect(data).toHaveProperty('details');
      expect(data.details).toBeInstanceOf(Array);
    });
  });

  describe('Response Format', () => {
    it('should return correctly formatted response with all fields', async () => {
      const response = await makeRequest({
        key: 'sk-test-response-check-1234567890abcdefg',
        name: 'Response Check Key',
        description: 'Testing response format',
        scopes: ['admin', 'user'],
        rate_limit: 200,
      }, ADMIN_API_KEY);

      expect(response.status).toBe(201);

      const data = await response.json();

      // Check all expected fields are present
      expect(data).toHaveProperty('id');
      expect(typeof data.id).toBe('number');

      expect(data).toHaveProperty('name');
      expect(data.name).toBe('Response Check Key');

      expect(data).toHaveProperty('description');
      expect(data.description).toBe('Testing response format');

      expect(data).toHaveProperty('scopes');
      expect(Array.isArray(data.scopes)).toBe(true);
      expect(data.scopes).toEqual(['admin', 'user']);

      expect(data).toHaveProperty('rate_limit');
      expect(data.rate_limit).toBe(200);

      expect(data).toHaveProperty('is_active');
      expect(data.is_active).toBe(true);

      expect(data).toHaveProperty('created_at');
      expect(typeof data.created_at).toBe('string');

      expect(data).toHaveProperty('updated_at');
      expect(typeof data.updated_at).toBe('string');

      expect(data).toHaveProperty('key_preview');
      expect(typeof data.key_preview).toBe('string');

      // Check sensitive fields are NOT present
      expect(data).not.toHaveProperty('key');
      expect(data).not.toHaveProperty('key_hash');
    });

    it('should generate correct key preview format', async () => {
      const testKey = 'sk-test-preview-1234567890abcdefghijkl';

      const response = await makeRequest({
        key: testKey,
        name: 'Preview Test Key',
      }, ADMIN_API_KEY);

      expect(response.status).toBe(201);

      const data = await response.json();

      // Key preview is first 8 chars + asterisks (up to 20) + last 4 chars
      // For a 42-char key: 8 + min(42-12, 20) asterisks + 4 = 8 + 20 asterisks + 4
      const expectedAsteriskCount = Math.min(testKey.length - 12, 20);
      const expectedPreview = `${testKey.slice(0, 8)}${'*'.repeat(expectedAsteriskCount)}${testKey.slice(-4)}`;
      expect(data.key_preview).toBe(expectedPreview);
    });

    it('should allow null description', async () => {
      const response = await makeRequest({
        key: 'sk-test-null-desc-1234567890abcdefghij',
        name: 'Null Description Key',
        description: null,
      }, ADMIN_API_KEY);

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.description).toBeNull();
    });

    it('should allow missing optional fields', async () => {
      const response = await makeRequest({
        key: 'sk-test-minimal-1234567890abcdefghijklmn',
        name: 'Minimal Key',
      }, ADMIN_API_KEY);

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.name).toBe('Minimal Key');
      expect(data.description).toBeNull();
      expect(data.scopes).toEqual([]);
      expect(data.rate_limit).toBe(60); // default
    });
  });
});

describe('GET /admin/api/keys', () => {
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
   * Helper function to make authenticated requests to the GET endpoint
   */
  async function makeGetRequest(queryParams: Record<string, string> = {}, authToken?: string) {
    const headers: Record<string, string> = {};

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // Build query string
    const queryString = new URLSearchParams(queryParams).toString();
    const url = `http://localhost/${queryString ? '?' + queryString : ''}`;

    const request = new Request(new URL(url), {
      method: 'GET',
      headers,
    });

    return keysRoutes.fetch(request);
  }

  /**
   * Helper function to create test API keys
   */
  async function createTestKey(data: Partial<{
    key: string;
    name: string;
    description: string | null;
    scopes: string[];
    rate_limit: number;
    is_active: boolean;
  }> = {}) {
    const key = data.key || `sk-test-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
    return ApiKeyModel.create({
      key,
      name: data.name || 'Test Key',
      description: data.description ?? null,
      scopes: data.scopes ?? [],
      rate_limit: data.rate_limit ?? 60,
    });
  }

  describe('Authentication', () => {
    it('should list API keys with valid admin API key', async () => {
      // Create a test key first
      await createTestKey({ name: 'Test Key 1' });

      const response = await makeGetRequest({}, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('page');
      expect(data).toHaveProperty('limit');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('pages');
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
    });

    it('should list API keys with valid admin token', async () => {
      const token = await generateAdminToken();

      // Create a test key
      await createTestKey({ name: 'Token Test Key' });

      const response = await makeGetRequest({}, token);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
    });

    it('should return 401 when admin API key is missing', async () => {
      const response = await makeGetRequest({});

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 401 when admin API key is invalid', async () => {
      const response = await makeGetRequest({}, 'invalid-admin-key');

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('Pagination', () => {
    beforeEach(async () => {
      // Create 25 test keys for pagination testing
      for (let i = 1; i <= 25; i++) {
        await createTestKey({ name: `Key ${i}` });
      }
    });

    it('should return first page with default pagination', async () => {
      const response = await makeGetRequest({}, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.page).toBe(1);
      expect(data.limit).toBe(10);
      expect(data.data).toHaveLength(10);
      expect(data.total).toBe(25);
      expect(data.pages).toBe(3);
    });

    it('should return second page correctly', async () => {
      const response = await makeGetRequest({ page: '2' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.page).toBe(2);
      expect(data.limit).toBe(10);
      expect(data.data).toHaveLength(10);
      expect(data.total).toBe(25);
      expect(data.pages).toBe(3);
    });

    it('should return last page with remaining items', async () => {
      const response = await makeGetRequest({ page: '3' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.page).toBe(3);
      expect(data.limit).toBe(10);
      expect(data.data).toHaveLength(5); // Only 5 items on last page
      expect(data.total).toBe(25);
      expect(data.pages).toBe(3);
    });

    it('should respect custom limit parameter', async () => {
      const response = await makeGetRequest({ limit: '20' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.page).toBe(1);
      expect(data.limit).toBe(20);
      expect(data.data).toHaveLength(20);
      expect(data.pages).toBe(2);
    });

    it('should return empty array for page beyond total pages', async () => {
      const response = await makeGetRequest({ page: '10' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.page).toBe(10);
      expect(data.limit).toBe(10);
      expect(data.data).toHaveLength(0);
      expect(data.total).toBe(25);
      expect(data.pages).toBe(3);
    });

    it('should combine page and limit parameters', async () => {
      const response = await makeGetRequest({ page: '2', limit: '5' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.page).toBe(2);
      expect(data.limit).toBe(5);
      expect(data.data).toHaveLength(5);
      expect(data.pages).toBe(5); // 25 items / 5 per page = 5 pages
    });
  });

  describe('Query Parameter Validation', () => {
    it('should return 400 when page is not a positive integer', async () => {
      const response = await makeGetRequest({ page: '0' }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data).toHaveProperty('details');
      expect(data.details).toBeInstanceOf(Array);
    });

    it('should return 400 when page is negative', async () => {
      const response = await makeGetRequest({ page: '-1' }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'page')).toBe(true);
    });

    it('should return 400 when limit is less than 1', async () => {
      const response = await makeGetRequest({ limit: '0' }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'limit')).toBe(true);
    });

    it('should return 400 when limit exceeds maximum', async () => {
      const response = await makeGetRequest({ limit: '101' }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'limit')).toBe(true);
    });

    it('should return 400 when is_active is not true or false', async () => {
      const response = await makeGetRequest({ is_active: 'invalid' }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'is_active')).toBe(true);
    });

    it('should return 400 when page is not a number', async () => {
      const response = await makeGetRequest({ page: 'abc' }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'page')).toBe(true);
    });

    it('should return 400 when limit is not a number', async () => {
      const response = await makeGetRequest({ limit: 'abc' }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'limit')).toBe(true);
    });
  });

  describe('Filtering', () => {
    beforeEach(async () => {
      // Create test keys with different states
      await createTestKey({ name: 'Active Key 1' });
      await createTestKey({ name: 'Active Key 2' });
      await createTestKey({ name: 'Test Key 1' });
      await createTestKey({ name: 'Test Key 2' });
    });

    it('should filter by is_active=true', async () => {
      const response = await makeGetRequest({ is_active: 'true' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data).toHaveLength(4); // All keys are active by default
      data.data.forEach((key: any) => {
        expect(key.is_active).toBe(true);
      });
    });

    it('should filter by is_active=false', async () => {
      // Deactivate one key
      const allKeys = ApiKeyModel.list({});
      if (allKeys.data.length > 0) {
        ApiKeyModel.update(allKeys.data[0].id, { is_active: false });
      }

      const response = await makeGetRequest({ is_active: 'false' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data.length).toBeGreaterThan(0);
      data.data.forEach((key: any) => {
        expect(key.is_active).toBe(false);
      });
    });

    it('should search by name (partial match)', async () => {
      const response = await makeGetRequest({ search: 'Active' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data).toHaveLength(2);
      data.data.forEach((key: any) => {
        expect(key.name).toContain('Active');
      });
    });

    it('should search case-insensitively', async () => {
      const response = await makeGetRequest({ search: 'test' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data).toHaveLength(2);
      data.data.forEach((key: any) => {
        expect(key.name.toLowerCase()).toContain('test');
      });
    });

    it('should return empty array when search has no matches', async () => {
      const response = await makeGetRequest({ search: 'nonexistent' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data).toHaveLength(0);
      expect(data.total).toBe(0);
    });

    it('should combine is_active and search filters', async () => {
      const response = await makeGetRequest(
        { is_active: 'true', search: 'Key' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data.length).toBeGreaterThan(0);
      data.data.forEach((key: any) => {
        expect(key.is_active).toBe(true);
        expect(key.name).toContain('Key');
      });
    });

    it('should combine pagination with filters', async () => {
      // Create more keys
      for (let i = 0; i < 10; i++) {
        await createTestKey({ name: `Filter Key ${i}` });
      }

      const response = await makeGetRequest(
        { search: 'Filter', limit: '5', page: '1' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.page).toBe(1);
      expect(data.limit).toBe(5);
      expect(data.data).toHaveLength(5);
      expect(data.total).toBe(10);
      data.data.forEach((key: any) => {
        expect(key.name).toContain('Filter');
      });
    });
  });

  describe('Response Format', () => {
    beforeEach(async () => {
      await createTestKey({
        name: 'Response Test Key',
        description: 'Testing list response format',
        scopes: ['read', 'write'],
        rate_limit: 100,
      });
    });

    it('should return correctly formatted list response', async () => {
      const response = await makeGetRequest({}, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();

      // Check response structure
      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('page');
      expect(data).toHaveProperty('limit');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('pages');

      // Check types
      expect(Array.isArray(data.data)).toBe(true);
      expect(typeof data.page).toBe('number');
      expect(typeof data.limit).toBe('number');
      expect(typeof data.total).toBe('number');
      expect(typeof data.pages).toBe('number');
    });

    it('should return correct API key item structure', async () => {
      const response = await makeGetRequest({}, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      const key = data.data[0];

      // Check all expected fields are present
      expect(key).toHaveProperty('id');
      expect(typeof key.id).toBe('number');

      expect(key).toHaveProperty('name');
      expect(typeof key.name).toBe('string');

      expect(key).toHaveProperty('description');
      // description can be null or string

      expect(key).toHaveProperty('scopes');
      expect(Array.isArray(key.scopes)).toBe(true);

      expect(key).toHaveProperty('rate_limit');
      expect(typeof key.rate_limit).toBe('number');

      expect(key).toHaveProperty('is_active');
      expect(typeof key.is_active).toBe('boolean');

      expect(key).toHaveProperty('created_at');
      expect(typeof key.created_at).toBe('string');

      expect(key).toHaveProperty('updated_at');
      expect(typeof key.updated_at).toBe('string');

      // Check sensitive fields are NOT present
      expect(key).not.toHaveProperty('key');
      expect(key).not.toHaveProperty('key_hash');
      expect(key).not.toHaveProperty('key_preview');
    });

    it('should return items ordered by created_at DESC', async () => {
      // Reset database to ensure clean state
      closeDatabase();
      resetDatabase();

      // Create keys in sequence with delays to ensure different timestamps
      const key1 = await createTestKey({ name: 'First Ordering Key' });
      await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 second delay to ensure different timestamps
      const key2 = await createTestKey({ name: 'Second Ordering Key' });
      await new Promise(resolve => setTimeout(resolve, 1100)); // 1.1 second delay to ensure different timestamps
      const key3 = await createTestKey({ name: 'Third Ordering Key' });

      const response = await makeGetRequest({}, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();

      // Find our test keys in the response
      const testKeys = data.data.filter((k: any) =>
        ['First Ordering Key', 'Second Ordering Key', 'Third Ordering Key'].includes(k.name)
      );

      // Should be in reverse chronological order (most recent first)
      expect(testKeys.length).toBe(3);
      expect(testKeys[0].name).toBe('Third Ordering Key');
      expect(testKeys[1].name).toBe('Second Ordering Key');
      expect(testKeys[2].name).toBe('First Ordering Key');

      // Verify timestamps are in descending order (newest first)
      const time0 = new Date(testKeys[0].created_at).getTime();
      const time1 = new Date(testKeys[1].created_at).getTime();
      const time2 = new Date(testKeys[2].created_at).getTime();

      expect(time0).toBeGreaterThan(time1);
      expect(time1).toBeGreaterThan(time2);
    });

    it('should handle empty database', async () => {
      // Reset database to ensure it's empty
      closeDatabase();
      resetDatabase();

      const response = await makeGetRequest({}, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data).toHaveLength(0);
      expect(data.total).toBe(0);
      expect(data.pages).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in search', async () => {
      await createTestKey({ name: 'Key with (parentheses)' });
      await createTestKey({ name: 'Key with [brackets]' });
      await createTestKey({ name: 'Key with "quotes"' });

      const response = await makeGetRequest({ search: '(' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data).toHaveLength(1);
      expect(data.data[0].name).toContain('(');
    });

    it('should handle unicode characters in search', async () => {
      await createTestKey({ name: 'Key with emoji 🚀' });
      await createTestKey({ name: 'Key with chinese 中文' });

      const response = await makeGetRequest({ search: 'emoji' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data).toHaveLength(1);
      expect(data.data[0].name).toContain('emoji');
    });

    it('should trim whitespace from search parameter', async () => {
      await createTestKey({ name: 'Test Key' });

      const response = await makeGetRequest({ search: '  Test  ' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.data).toHaveLength(1);
      expect(data.data[0].name).toBe('Test Key');
    });

    it('should handle very large page numbers gracefully', async () => {
      const response = await makeGetRequest({ page: '999999' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.page).toBe(999999);
      expect(data.data).toHaveLength(0);
    });

    it('should handle minimum limit value', async () => {
      await createTestKey({ name: 'Test Key' });

      const response = await makeGetRequest({ limit: '1' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.limit).toBe(1);
      expect(data.data).toHaveLength(1);
    });

    it('should handle maximum limit value', async () => {
      // Create enough keys
      for (let i = 0; i < 105; i++) {
        await createTestKey({ name: `Key ${i}` });
      }

      const response = await makeGetRequest({ limit: '100' }, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.limit).toBe(100);
      expect(data.data).toHaveLength(100);
    });
  });
});

describe('GET /admin/api/keys/:id', () => {
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
   * Helper function to make authenticated requests to the GET by ID endpoint
   */
  async function makeGetByIdRequest(id: string, authToken?: string) {
    const headers: Record<string, string> = {};

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const url = `http://localhost/${id}`;
    const request = new Request(new URL(url), {
      method: 'GET',
      headers,
    });

    return keysRoutes.fetch(request);
  }

  /**
   * Helper function to create test API keys
   */
  async function createTestKey(data: Partial<{
    key: string;
    name: string;
    description: string | null;
    scopes: string[];
    rate_limit: number;
    is_active: boolean;
  }> = {}) {
    const key = data.key || `sk-test-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
    return ApiKeyModel.create({
      key,
      name: data.name || 'Test Key',
      description: data.description ?? null,
      scopes: data.scopes ?? [],
      rate_limit: data.rate_limit ?? 60,
    });
  }

  describe('Authentication', () => {
    it('should get API key with valid admin API key', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makeGetByIdRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('id', createdKey.id);
      expect(data).toHaveProperty('name', 'Test Key');
    });

    it('should get API key with valid admin token', async () => {
      const token = await generateAdminToken();
      const createdKey = await createTestKey({ name: 'Token Test Key' });

      const response = await makeGetByIdRequest(String(createdKey.id), token);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('id', createdKey.id);
      expect(data).toHaveProperty('name', 'Token Test Key');
    });

    it('should return 401 when admin API key is missing', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makeGetByIdRequest(String(createdKey.id));

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 401 when admin API key is invalid', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makeGetByIdRequest(String(createdKey.id), 'invalid-admin-key');

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('ID Parameter Validation', () => {
    it('should return 400 when ID is not a number', async () => {
      const response = await makeGetByIdRequest('abc', ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data).toHaveProperty('details');
      expect(data.details).toBeInstanceOf(Array);
      expect(data.details.some((d: any) => d.field === 'id')).toBe(true);
    });

    it('should return 400 when ID contains special characters', async () => {
      const response = await makeGetByIdRequest('1abc', ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'id')).toBe(true);
    });

    it('should return 400 when ID is negative', async () => {
      const response = await makeGetByIdRequest('-1', ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'id')).toBe(true);
    });

    it('should return 400 when ID is zero', async () => {
      const response = await makeGetByIdRequest('0', ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'id')).toBe(true);
    });

    it('should accept valid positive integer ID', async () => {
      const createdKey = await createTestKey({ name: 'Valid ID Test' });

      const response = await makeGetByIdRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('id', createdKey.id);
    });
  });

  describe('Not Found Scenarios', () => {
    it('should return 404 when API key does not exist', async () => {
      const response = await makeGetByIdRequest('99999', ADMIN_API_KEY);

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'API key with id 99999 not found');
      expect(data).toHaveProperty('details', 'id 99999');
    });

    it('should return 404 for non-existent ID with valid format', async () => {
      // Create a key, then try to get a different ID
      await createTestKey({ name: 'Existing Key' });

      const response = await makeGetByIdRequest('99999', ADMIN_API_KEY);

      expect(response.status).toBe(404);
    });
  });

  describe('Response Format', () => {
    it('should return correctly formatted API key response', async () => {
      const createdKey = await createTestKey({
        name: 'Response Format Test',
        description: 'Testing response format',
        scopes: ['read', 'write'],
        rate_limit: 100,
      });

      const response = await makeGetByIdRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();

      // Check all expected fields are present
      expect(data).toHaveProperty('id');
      expect(typeof data.id).toBe('number');
      expect(data.id).toBe(createdKey.id);

      expect(data).toHaveProperty('name');
      expect(data.name).toBe('Response Format Test');

      expect(data).toHaveProperty('description');
      expect(data.description).toBe('Testing response format');

      expect(data).toHaveProperty('scopes');
      expect(Array.isArray(data.scopes)).toBe(true);
      expect(data.scopes).toEqual(['read', 'write']);

      expect(data).toHaveProperty('rate_limit');
      expect(data.rate_limit).toBe(100);

      expect(data).toHaveProperty('is_active');
      expect(data.is_active).toBe(true);

      expect(data).toHaveProperty('created_at');
      expect(typeof data.created_at).toBe('string');

      expect(data).toHaveProperty('updated_at');
      expect(typeof data.updated_at).toBe('string');

      // Check sensitive fields are NOT present
      expect(data).not.toHaveProperty('key');
      expect(data).not.toHaveProperty('key_hash');
      expect(data).not.toHaveProperty('key_preview');
    });

    it('should handle API key with null description', async () => {
      const createdKey = await createTestKey({
        name: 'Null Description Key',
        description: null,
      });

      const response = await makeGetByIdRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('description');
      expect(data.description).toBeNull();
    });

    it('should handle API key with empty scopes array', async () => {
      const createdKey = await createTestKey({
        name: 'Empty Scopes Key',
        scopes: [],
      });

      const response = await makeGetByIdRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('scopes');
      expect(data.scopes).toEqual([]);
    });

    it('should handle API key with default rate limit', async () => {
      const createdKey = await createTestKey({
        name: 'Default Rate Limit Key',
      });

      const response = await makeGetByIdRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('rate_limit');
      expect(data.rate_limit).toBe(60); // default value
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large ID number', async () => {
      const response = await makeGetByIdRequest('999999999', ADMIN_API_KEY);

      expect(response.status).toBe(404); // Not found, but valid format
    });

    it('should handle ID with leading zeros', async () => {
      const createdKey = await createTestKey({ name: 'Leading Zero Test' });

      // Create a request with leading zeros (should be treated as the same number)
      const response = await makeGetByIdRequest(`0${createdKey.id}`, ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.id).toBe(createdKey.id);
    });

    it('should return consistent data for multiple requests', async () => {
      const createdKey = await createTestKey({
        name: 'Consistency Test',
        description: 'Testing data consistency',
      });

      const response1 = await makeGetByIdRequest(String(createdKey.id), ADMIN_API_KEY);
      const response2 = await makeGetByIdRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      const data1 = await response1.json();
      const data2 = await response2.json();

      // All fields should match exactly
      expect(data1.id).toBe(data2.id);
      expect(data1.name).toBe(data2.name);
      expect(data1.description).toBe(data2.description);
      expect(data1.scopes).toEqual(data2.scopes);
      expect(data1.rate_limit).toBe(data2.rate_limit);
      expect(data1.is_active).toBe(data2.is_active);
    });

    it('should handle inactive API keys', async () => {
      const createdKey = await createTestKey({ name: 'Inactive Key' });

      // Deactivate the key
      ApiKeyModel.update(createdKey.id, { is_active: false });

      const response = await makeGetByIdRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('is_active', false);
    });
  });
});

describe('PUT /admin/api/keys/:id', () => {
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
   * Helper function to make authenticated requests to the PUT endpoint
   */
  async function makePutRequest(id: string, data: any, authToken?: string) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const url = `http://localhost/${id}`;
    const request = new Request(new URL(url), {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });

    return keysRoutes.fetch(request);
  }

  /**
   * Helper function to create test API keys
   */
  async function createTestKey(data: Partial<{
    key: string;
    name: string;
    description: string | null;
    scopes: string[];
    rate_limit: number;
    is_active: boolean;
  }> = {}) {
    const key = data.key || `sk-test-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
    return ApiKeyModel.create({
      key,
      name: data.name || 'Test Key',
      description: data.description ?? null,
      scopes: data.scopes ?? [],
      rate_limit: data.rate_limit ?? 60,
    });
  }

  describe('Authentication', () => {
    it('should update API key with valid admin API key', async () => {
      const createdKey = await createTestKey({ name: 'Original Name' });

      const response = await makePutRequest(
        String(createdKey.id),
        { name: 'Updated Name' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('id', createdKey.id);
      expect(data).toHaveProperty('name', 'Updated Name');
    });

    it('should update API key with valid admin token', async () => {
      const token = await generateAdminToken();
      const createdKey = await createTestKey({ name: 'Original Name' });

      const response = await makePutRequest(
        String(createdKey.id),
        { name: 'Token Updated Name' },
        token
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('name', 'Token Updated Name');
    });

    it('should return 401 when admin API key is missing', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        String(createdKey.id),
        { name: 'Updated Name' }
      );

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should return 401 when admin API key is invalid', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        String(createdKey.id),
        { name: 'Updated Name' },
        'invalid-admin-key'
      );

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('ID Parameter Validation', () => {
    it('should return 400 when ID is not a number', async () => {
      const response = await makePutRequest('abc', { name: 'Updated' }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'id')).toBe(true);
    });

    it('should return 400 when ID contains special characters', async () => {
      const response = await makePutRequest('1abc', { name: 'Updated' }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.details.some((d: any) => d.field === 'id')).toBe(true);
    });

    it('should return 400 when ID is negative', async () => {
      const response = await makePutRequest('-1', { name: 'Updated' }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.details.some((d: any) => d.field === 'id')).toBe(true);
    });

    it('should return 400 when ID is zero', async () => {
      const response = await makePutRequest('0', { name: 'Updated' }, ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.details.some((d: any) => d.field === 'id')).toBe(true);
    });
  });

  describe('Request Body Validation', () => {
    it('should return 400 when name is empty string', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        String(createdKey.id),
        { name: '   ' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'name')).toBe(true);
    });

    it('should return 400 when name is too long', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        String(createdKey.id),
        { name: 'a'.repeat(256) },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.details.some((d: any) => d.field === 'name')).toBe(true);
    });

    it('should return 400 when description is too long', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        String(createdKey.id),
        { description: 'a'.repeat(1001) },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.details.some((d: any) => d.field === 'description')).toBe(true);
    });

    it('should return 400 when scopes is not an array', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        String(createdKey.id),
        { scopes: 'not-an-array' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.details.some((d: any) => d.field === 'scopes')).toBe(true);
    });

    it('should return 400 when rate_limit is negative', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        String(createdKey.id),
        { rate_limit: -1 },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.details.some((d: any) => d.field === 'rate_limit')).toBe(true);
    });

    it('should return 400 when rate_limit exceeds maximum', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        String(createdKey.id),
        { rate_limit: 10001 },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.details.some((d: any) => d.field === 'rate_limit')).toBe(true);
    });

    it('should return 400 when rate_limit is not an integer', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        String(createdKey.id),
        { rate_limit: 60.5 },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.details.some((d: any) => d.field === 'rate_limit')).toBe(true);
    });

    it('should return 400 when is_active is not a boolean', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        String(createdKey.id),
        { is_active: 'true' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.details.some((d: any) => d.field === 'is_active')).toBe(true);
    });

    it('should return 400 for malformed JSON', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${ADMIN_API_KEY}`,
        'Content-Type': 'application/json',
      };

      const url = `http://localhost/${createdKey.id}`;
      const request = new Request(new URL(url), {
        method: 'PUT',
        headers,
        body: 'invalid json',
      });

      const response = await keysRoutes.fetch(request);

      expect(response.status).toBe(400);
    });
  });

  describe('Successful Updates', () => {
    it('should update name field', async () => {
      const createdKey = await createTestKey({ name: 'Original Name' });

      const response = await makePutRequest(
        String(createdKey.id),
        { name: 'Updated Name' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.name).toBe('Updated Name');
      expect(data.id).toBe(createdKey.id);
    });

    it('should update description field', async () => {
      const createdKey = await createTestKey({ name: 'Test Key', description: 'Original' });

      const response = await makePutRequest(
        String(createdKey.id),
        { description: 'Updated description' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.description).toBe('Updated description');
    });

    it('should update description to null', async () => {
      const createdKey = await createTestKey({ name: 'Test Key', description: 'Original' });

      const response = await makePutRequest(
        String(createdKey.id),
        { description: null },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.description).toBeNull();
    });

    it('should update scopes field', async () => {
      const createdKey = await createTestKey({ name: 'Test Key', scopes: ['read'] });

      const response = await makePutRequest(
        String(createdKey.id),
        { scopes: ['read', 'write', 'delete'] },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.scopes).toEqual(['read', 'write', 'delete']);
    });

    it('should update rate_limit field', async () => {
      const createdKey = await createTestKey({ name: 'Test Key', rate_limit: 60 });

      const response = await makePutRequest(
        String(createdKey.id),
        { rate_limit: 120 },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.rate_limit).toBe(120);
    });

    it('should update is_active field to false', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        String(createdKey.id),
        { is_active: false },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.is_active).toBe(false);
    });

    it('should update is_active field back to true', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });
      ApiKeyModel.update(createdKey.id, { is_active: false });

      const response = await makePutRequest(
        String(createdKey.id),
        { is_active: true },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.is_active).toBe(true);
    });

    it('should update multiple fields at once', async () => {
      const createdKey = await createTestKey({
        name: 'Original Name',
        description: 'Original description',
        scopes: ['read'],
        rate_limit: 60,
      });

      const response = await makePutRequest(
        String(createdKey.id),
        {
          name: 'Updated Name',
          description: 'Updated description',
          scopes: ['read', 'write'],
          rate_limit: 100,
          is_active: false,
        },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.name).toBe('Updated Name');
      expect(data.description).toBe('Updated description');
      expect(data.scopes).toEqual(['read', 'write']);
      expect(data.rate_limit).toBe(100);
      expect(data.is_active).toBe(false);
    });

    it('should handle empty update body (no changes)', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        String(createdKey.id),
        {},
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.name).toBe('Test Key');
    });

    it('should trim whitespace from name', async () => {
      const createdKey = await createTestKey({ name: 'Original Name' });

      const response = await makePutRequest(
        String(createdKey.id),
        { name: '  Updated Name  ' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.name).toBe('Updated Name');
    });

    it('should trim whitespace from description', async () => {
      const createdKey = await createTestKey({ name: 'Test Key', description: 'Original' });

      const response = await makePutRequest(
        String(createdKey.id),
        { description: '  Updated description  ' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.description).toBe('Updated description');
    });
  });

  describe('Not Found Scenarios', () => {
    it('should return 404 when API key does not exist', async () => {
      const response = await makePutRequest(
        '99999',
        { name: 'Updated Name' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'API key with id 99999 not found');
      expect(data).toHaveProperty('details', 'id 99999');
    });

    it('should return 404 for non-existent ID with valid format', async () => {
      await createTestKey({ name: 'Existing Key' });

      const response = await makePutRequest(
        '99999',
        { name: 'Updated Name' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(404);
    });
  });

  describe('Response Format', () => {
    it('should return correctly formatted response with all fields', async () => {
      const createdKey = await createTestKey({
        name: 'Original Name',
        description: 'Original description',
        scopes: ['read'],
        rate_limit: 60,
      });

      const response = await makePutRequest(
        String(createdKey.id),
        {
          name: 'Updated Name',
          description: 'Updated description',
          scopes: ['read', 'write'],
          rate_limit: 100,
          is_active: false,
        },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();

      // Check all expected fields are present
      expect(data).toHaveProperty('id');
      expect(typeof data.id).toBe('number');
      expect(data.id).toBe(createdKey.id);

      expect(data).toHaveProperty('name');
      expect(data.name).toBe('Updated Name');

      expect(data).toHaveProperty('description');
      expect(data.description).toBe('Updated description');

      expect(data).toHaveProperty('scopes');
      expect(Array.isArray(data.scopes)).toBe(true);
      expect(data.scopes).toEqual(['read', 'write']);

      expect(data).toHaveProperty('rate_limit');
      expect(data.rate_limit).toBe(100);

      expect(data).toHaveProperty('is_active');
      expect(data.is_active).toBe(false);

      expect(data).toHaveProperty('created_at');
      expect(typeof data.created_at).toBe('string');

      expect(data).toHaveProperty('updated_at');
      expect(typeof data.updated_at).toBe('string');

      // Check sensitive fields are NOT present
      expect(data).not.toHaveProperty('key');
      expect(data).not.toHaveProperty('key_hash');
      expect(data).not.toHaveProperty('key_preview');
    });

    it('should return updated_at timestamp in response', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        String(createdKey.id),
        { name: 'Updated Name' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('updated_at');
      expect(typeof data.updated_at).toBe('string');

      // Verify it's a valid ISO 8601 timestamp (SQLite datetime format)
      const timestampRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
      expect(data.updated_at).toMatch(timestampRegex);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large ID number', async () => {
      const response = await makePutRequest(
        '999999999',
        { name: 'Updated' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(404); // Not found, but valid format
    });

    it('should handle ID with leading zeros', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        `0${createdKey.id}`,
        { name: 'Updated Name' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.id).toBe(createdKey.id);
      expect(data.name).toBe('Updated Name');
    });

    it('should allow setting all fields to minimal values', async () => {
      const createdKey = await createTestKey({
        name: 'Original',
        description: 'Original description',
        scopes: ['read', 'write', 'delete'],
        rate_limit: 1000,
      });

      const response = await makePutRequest(
        String(createdKey.id),
        {
          name: 'Min',
          description: null, // Empty strings are converted to null
          scopes: [],
          rate_limit: 0,
          is_active: false,
        },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.name).toBe('Min');
      expect(data.description).toBeNull(); // Empty strings become null
      expect(data.scopes).toEqual([]);
      expect(data.rate_limit).toBe(0);
      expect(data.is_active).toBe(false);
    });

    it('should allow setting all fields to maximum values', async () => {
      const createdKey = await createTestKey({ name: 'Original' });

      const response = await makePutRequest(
        String(createdKey.id),
        {
          name: 'a'.repeat(255),
          description: 'a'.repeat(1000),
          scopes: ['scope1', 'scope2', 'scope3'],
          rate_limit: 10000,
          is_active: true,
        },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.name.length).toBe(255);
      expect(data.description.length).toBe(1000);
      expect(data.scopes).toHaveLength(3);
      expect(data.rate_limit).toBe(10000);
      expect(data.is_active).toBe(true);
    });

    it('should handle special characters in name', async () => {
      const createdKey = await createTestKey({ name: 'Original' });

      const response = await makePutRequest(
        String(createdKey.id),
        { name: 'Key with (parentheses) and [brackets]' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.name).toBe('Key with (parentheses) and [brackets]');
    });

    it('should handle unicode characters in description', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makePutRequest(
        String(createdKey.id),
        { description: 'Description with emoji 🚀 and chinese 中文' },
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.description).toContain('emoji');
      expect(data.description).toContain('中文');
    });

    it('should handle consecutive updates correctly', async () => {
      const createdKey = await createTestKey({ name: 'Original' });

      // First update
      const response1 = await makePutRequest(
        String(createdKey.id),
        { name: 'First Update' },
        ADMIN_API_KEY
      );

      expect(response1.status).toBe(200);
      const data1 = await response1.json();
      expect(data1.name).toBe('First Update');

      // Second update
      const response2 = await makePutRequest(
        String(createdKey.id),
        { name: 'Second Update' },
        ADMIN_API_KEY
      );

      expect(response2.status).toBe(200);
      const data2 = await response2.json();
      expect(data2.name).toBe('Second Update');
    });
  });
});

describe('DELETE /admin/api/keys/:id', () => {
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
   * Helper function to make authenticated requests to the DELETE endpoint
   */
  async function makeDeleteRequest(id: string, authToken?: string) {
    const headers: Record<string, string> = {};

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const url = `http://localhost/${id}`;
    const request = new Request(new URL(url), {
      method: 'DELETE',
      headers,
    });

    return keysRoutes.fetch(request);
  }

  /**
   * Helper function to create test API keys
   */
  async function createTestKey(data: Partial<{
    key: string;
    name: string;
    description: string | null;
    scopes: string[];
    rate_limit: number;
    is_active: boolean;
  }> = {}) {
    const key = data.key || `sk-test-${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 15)}`;
    return ApiKeyModel.create({
      key,
      name: data.name || 'Test Key',
      description: data.description ?? null,
      scopes: data.scopes ?? [],
      rate_limit: data.rate_limit ?? 60,
    });
  }

  describe('Authentication', () => {
    it('should delete API key with valid admin API key', async () => {
      const createdKey = await createTestKey({ name: 'Key to Delete' });

      const response = await makeDeleteRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(204);
      expect(response.headers.get('Content-Type')).toBeNull(); // No content type for 204

      // Verify key is actually deleted
      const retrieved = ApiKeyModel.findById(createdKey.id);
      expect(retrieved).toBeNull();
    });

    it('should delete API key with valid admin token', async () => {
      const token = await generateAdminToken();
      const createdKey = await createTestKey({ name: 'Token Delete Key' });

      const response = await makeDeleteRequest(String(createdKey.id), token);

      expect(response.status).toBe(204);

      // Verify key is actually deleted
      const retrieved = ApiKeyModel.findById(createdKey.id);
      expect(retrieved).toBeNull();
    });

    it('should return 401 when admin API key is missing', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makeDeleteRequest(String(createdKey.id));

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');

      // Verify key is NOT deleted
      const retrieved = ApiKeyModel.findById(createdKey.id);
      expect(retrieved).not.toBeNull();
    });

    it('should return 401 when admin API key is invalid', async () => {
      const createdKey = await createTestKey({ name: 'Test Key' });

      const response = await makeDeleteRequest(String(createdKey.id), 'invalid-admin-key');

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');

      // Verify key is NOT deleted
      const retrieved = ApiKeyModel.findById(createdKey.id);
      expect(retrieved).not.toBeNull();
    });
  });

  describe('ID Parameter Validation', () => {
    it('should return 400 when ID is not a number', async () => {
      const response = await makeDeleteRequest('abc', ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data).toHaveProperty('details');
      expect(data.details).toBeInstanceOf(Array);
      expect(data.details.some((d: any) => d.field === 'id')).toBe(true);
    });

    it('should return 400 when ID contains special characters', async () => {
      const response = await makeDeleteRequest('1abc', ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'id')).toBe(true);
    });

    it('should return 400 when ID is negative', async () => {
      const response = await makeDeleteRequest('-1', ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'id')).toBe(true);
    });

    it('should return 400 when ID is zero', async () => {
      const response = await makeDeleteRequest('0', ADMIN_API_KEY);

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data.details.some((d: any) => d.field === 'id')).toBe(true);
    });

    it('should accept valid positive integer ID', async () => {
      const createdKey = await createTestKey({ name: 'Valid Delete ID' });

      const response = await makeDeleteRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(204);
    });

    it('should handle ID with leading zeros', async () => {
      const createdKey = await createTestKey({ name: 'Leading Zero Delete' });

      // Create a request with leading zeros (should be treated as the same number)
      const response = await makeDeleteRequest(`0${createdKey.id}`, ADMIN_API_KEY);

      expect(response.status).toBe(204);

      // Verify key is actually deleted
      const retrieved = ApiKeyModel.findById(createdKey.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Successful Deletion', () => {
    it('should return 204 No Content on successful deletion', async () => {
      const createdKey = await createTestKey({ name: 'Delete Test Key' });

      const response = await makeDeleteRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(204);
      expect(response.headers.get('Content-Type')).toBeNull(); // No content type for 204
    });

    it('should actually delete the key from database', async () => {
      const createdKey = await createTestKey({ name: 'Database Delete Test' });

      // Verify key exists before deletion
      const beforeDelete = ApiKeyModel.findById(createdKey.id);
      expect(beforeDelete).not.toBeNull();
      expect(beforeDelete?.id).toBe(createdKey.id);

      // Delete the key
      await makeDeleteRequest(String(createdKey.id), ADMIN_API_KEY);

      // Verify key is gone after deletion
      const afterDelete = ApiKeyModel.findById(createdKey.id);
      expect(afterDelete).toBeNull();
    });

    it('should delete key with all property types', async () => {
      const createdKey = await createTestKey({
        name: 'Complex Key',
        description: 'Key with all fields populated',
        scopes: ['read', 'write', 'admin'],
        rate_limit: 500,
        is_active: true,
      });

      const response = await makeDeleteRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(204);

      // Verify key is actually deleted
      const retrieved = ApiKeyModel.findById(createdKey.id);
      expect(retrieved).toBeNull();
    });

    it('should delete inactive keys', async () => {
      const createdKey = await createTestKey({ name: 'Inactive Key' });
      ApiKeyModel.update(createdKey.id, { is_active: false });

      const response = await makeDeleteRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(204);

      // Verify key is actually deleted
      const retrieved = ApiKeyModel.findById(createdKey.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Not Found Scenarios', () => {
    it('should return 404 when API key does not exist', async () => {
      const response = await makeDeleteRequest('99999', ADMIN_API_KEY);

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'API key with id 99999 not found');
      expect(data).toHaveProperty('details', 'id 99999');
    });

    it('should return 404 for non-existent ID with valid format', async () => {
      // Create a key, then try to delete a different ID
      await createTestKey({ name: 'Existing Key' });

      const response = await makeDeleteRequest('99999', ADMIN_API_KEY);

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data).toHaveProperty('error', 'API key with id 99999 not found');
    });

    it('should return 404 for very large non-existent ID', async () => {
      const response = await makeDeleteRequest('999999999', ADMIN_API_KEY);

      expect(response.status).toBe(404);
    });

    it('should return 404 when trying to delete already deleted key', async () => {
      const createdKey = await createTestKey({ name: 'Double Delete Test' });

      // First deletion
      const response1 = await makeDeleteRequest(String(createdKey.id), ADMIN_API_KEY);
      expect(response1.status).toBe(204);

      // Second deletion (should return 404)
      const response2 = await makeDeleteRequest(String(createdKey.id), ADMIN_API_KEY);
      expect(response2.status).toBe(404);

      const data = await response2.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('API key with id');
      expect(data.error).toContain('not found');
    });
  });

  describe('Edge Cases', () => {
    it('should handle deleting the only key in database', async () => {
      const createdKey = await createTestKey({ name: 'Only Key' });

      // Verify it's the only key
      const allKeys = ApiKeyModel.list({});
      expect(allKeys.total).toBe(1);

      const response = await makeDeleteRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(204);

      // Verify database is now empty
      const afterDelete = ApiKeyModel.list({});
      expect(afterDelete.total).toBe(0);
    });

    it('should handle deleting one of many keys', async () => {
      // Create multiple keys
      const key1 = await createTestKey({ name: 'Key 1' });
      const key2 = await createTestKey({ name: 'Key 2' });
      const key3 = await createTestKey({ name: 'Key 3' });

      // Delete middle key
      const response = await makeDeleteRequest(String(key2.id), ADMIN_API_KEY);

      expect(response.status).toBe(204);

      // Verify other keys still exist
      const remaining1 = ApiKeyModel.findById(key1.id);
      const remaining3 = ApiKeyModel.findById(key3.id);
      expect(remaining1).not.toBeNull();
      expect(remaining3).not.toBeNull();

      // Verify deleted key is gone
      const deleted = ApiKeyModel.findById(key2.id);
      expect(deleted).toBeNull();
    });

    it('should handle consecutive deletions', async () => {
      const key1 = await createTestKey({ name: 'First Delete' });
      const key2 = await createTestKey({ name: 'Second Delete' });
      const key3 = await createTestKey({ name: 'Third Delete' });

      // Delete keys one by one
      const response1 = await makeDeleteRequest(String(key1.id), ADMIN_API_KEY);
      expect(response1.status).toBe(204);

      const response2 = await makeDeleteRequest(String(key2.id), ADMIN_API_KEY);
      expect(response2.status).toBe(204);

      const response3 = await makeDeleteRequest(String(key3.id), ADMIN_API_KEY);
      expect(response3.status).toBe(204);

      // Verify all keys are deleted
      expect(ApiKeyModel.list({}).total).toBe(0);
    });

    it('should handle deletion of key with maximum ID', async () => {
      // Create a key, get its ID, then create another to ensure we have a valid max
      const keys = [
        await createTestKey({ name: 'Key 1' }),
        await createTestKey({ name: 'Key 2' }),
        await createTestKey({ name: 'Key 3' }),
      ];

      const maxId = Math.max(...keys.map(k => k.id));

      const response = await makeDeleteRequest(String(maxId), ADMIN_API_KEY);

      expect(response.status).toBe(204);

      // Verify the specific key is deleted
      const retrieved = ApiKeyModel.findById(maxId);
      expect(retrieved).toBeNull();
    });

    it('should handle special characters in key name during deletion', async () => {
      const createdKey = await createTestKey({
        name: 'Key with special chars: !@#$%^&*()',
      });

      const response = await makeDeleteRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(204);

      // Verify key is actually deleted
      const retrieved = ApiKeyModel.findById(createdKey.id);
      expect(retrieved).toBeNull();
    });

    it('should handle unicode characters in key properties during deletion', async () => {
      const createdKey = await createTestKey({
        name: 'Key with emoji 🚀 and chinese 中文',
        description: 'Description with unicode café',
      });

      const response = await makeDeleteRequest(String(createdKey.id), ADMIN_API_KEY);

      expect(response.status).toBe(204);

      // Verify key is actually deleted
      const retrieved = ApiKeyModel.findById(createdKey.id);
      expect(retrieved).toBeNull();
    });

    it('should verify deletion affects list endpoint', async () => {
      const key1 = await createTestKey({ name: 'List Test Key 1' });
      const key2 = await createTestKey({ name: 'List Test Key 2' });

      // Verify both keys are in list
      const beforeList = ApiKeyModel.list({});
      expect(beforeList.total).toBe(2);

      // Delete one key
      await makeDeleteRequest(String(key1.id), ADMIN_API_KEY);

      // Verify list updated
      const afterList = ApiKeyModel.list({});
      expect(afterList.total).toBe(1);
      expect(afterList.data[0].id).toBe(key2.id);
    });
  });
});
