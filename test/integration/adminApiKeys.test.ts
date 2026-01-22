/**
 * Integration Tests for Admin API - POST /admin/api/keys
 *
 * Tests the API key creation endpoint including:
 * - Successful creation
 * - Request validation
 * - Authentication
 * - Error handling
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { closeDatabase, resetDatabase } from '../../src/models/database';
import { resetConfig } from '../../src/config';
import { resetAdminKeyCache } from '../../src/utils/adminCredentials';
import keysRoutes from '../../src/routes/admin/keys';
import { generateAdminToken } from '../../src/utils/adminToken';

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
