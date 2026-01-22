/**
 * Integration Tests for Admin API Authentication
 *
 * Comprehensive authentication and authorization tests across all admin API endpoints.
 * Tests valid/invalid credentials, missing auth, and permission checks.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { closeDatabase, resetDatabase } from '../../src/models/database';
import { resetConfig } from '../../src/config';
import { resetAdminKeyCache } from '../../src/utils/adminCredentials';
import keysRoutes from '../../src/routes/admin/keys';
import { generateAdminToken } from '../../src/utils/adminToken';
import { ApiKeyModel } from '../../src/models/apiKey';

const ADMIN_API_KEY = 'test-admin-key-12345';
const INVALID_API_KEY = 'invalid-admin-key-67890';

describe('Admin API Authentication Integration Tests', () => {
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
   * Helper function to make authenticated requests
   */
  async function makeAuthenticatedRequest(
    method: string,
    path: string,
    authToken?: string,
    body?: any
  ): Promise<Response> {
    const headers: Record<string, string> = {};

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const url = new URL(`http://localhost${path}`);
    const request = new Request(url, {
      method,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    return keysRoutes.fetch(request);
  }

  describe('Valid Credentials - API Key Authentication', () => {
    it('should allow POST with valid admin API key', async () => {
      const response = await makeAuthenticatedRequest(
        'POST',
        '/',
        ADMIN_API_KEY,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data.name).toBe('Test Key');
    });

    it('should allow GET list with valid admin API key', async () => {
      const response = await makeAuthenticatedRequest('GET', '/', ADMIN_API_KEY);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('data');
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('page');
      expect(data).toHaveProperty('limit');
    });

    it('should allow GET by ID with valid admin API key', async () => {
      // First create a key
      const createResponse = await makeAuthenticatedRequest(
        'POST',
        '/',
        ADMIN_API_KEY,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );
      const created = await createResponse.json();

      // Then get it by ID
      const response = await makeAuthenticatedRequest(
        'GET',
        `/${created.id}`,
        ADMIN_API_KEY
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe(created.id);
    });

    it('should allow PUT with valid admin API key', async () => {
      // First create a key
      const createResponse = await makeAuthenticatedRequest(
        'POST',
        '/',
        ADMIN_API_KEY,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );
      const created = await createResponse.json();

      // Then update it
      const response = await makeAuthenticatedRequest(
        'PUT',
        `/${created.id}`,
        ADMIN_API_KEY,
        {
          name: 'Updated Key',
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.name).toBe('Updated Key');
    });

    it('should allow DELETE with valid admin API key', async () => {
      // First create a key
      const createResponse = await makeAuthenticatedRequest(
        'POST',
        '/',
        ADMIN_API_KEY,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );
      const created = await createResponse.json();

      // Then delete it
      const response = await makeAuthenticatedRequest(
        'DELETE',
        `/${created.id}`,
        ADMIN_API_KEY
      );

      expect(response.status).toBe(204);
    });
  });

  describe('Valid Credentials - Token Authentication', () => {
    it('should allow POST with valid admin token', async () => {
      const token = await generateAdminToken();

      const response = await makeAuthenticatedRequest(
        'POST',
        '/',
        token,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data.name).toBe('Test Key');
    });

    it('should allow GET list with valid admin token', async () => {
      const token = await generateAdminToken();

      const response = await makeAuthenticatedRequest('GET', '/', token);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('data');
    });

    it('should allow GET by ID with valid admin token', async () => {
      const token = await generateAdminToken();

      // First create a key
      const createResponse = await makeAuthenticatedRequest(
        'POST',
        '/',
        token,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );
      const created = await createResponse.json();

      // Then get it by ID
      const response = await makeAuthenticatedRequest(
        'GET',
        `/${created.id}`,
        token
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe(created.id);
    });

    it('should allow PUT with valid admin token', async () => {
      const token = await generateAdminToken();

      // First create a key
      const createResponse = await makeAuthenticatedRequest(
        'POST',
        '/',
        token,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );
      const created = await createResponse.json();

      // Then update it
      const response = await makeAuthenticatedRequest(
        'PUT',
        `/${created.id}`,
        token,
        {
          name: 'Updated Key',
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.name).toBe('Updated Key');
    });

    it('should allow DELETE with valid admin token', async () => {
      const token = await generateAdminToken();

      // First create a key
      const createResponse = await makeAuthenticatedRequest(
        'POST',
        '/',
        token,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );
      const created = await createResponse.json();

      // Then delete it
      const response = await makeAuthenticatedRequest(
        'DELETE',
        `/${created.id}`,
        token
      );

      expect(response.status).toBe(204);
    });
  });

  describe('Invalid Credentials - API Key', () => {
    it('should reject POST with invalid API key', async () => {
      const response = await makeAuthenticatedRequest(
        'POST',
        '/',
        INVALID_API_KEY,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject GET list with invalid API key', async () => {
      const response = await makeAuthenticatedRequest(
        'GET',
        '/',
        INVALID_API_KEY
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject GET by ID with invalid API key', async () => {
      const response = await makeAuthenticatedRequest(
        'GET',
        '/1',
        INVALID_API_KEY
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject PUT with invalid API key', async () => {
      const response = await makeAuthenticatedRequest(
        'PUT',
        '/1',
        INVALID_API_KEY,
        {
          name: 'Updated Key',
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject DELETE with invalid API key', async () => {
      const response = await makeAuthenticatedRequest(
        'DELETE',
        '/1',
        INVALID_API_KEY
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('Invalid Credentials - Token', () => {
    it('should reject POST with tampered token', async () => {
      const token = await generateAdminToken();
      const tamperedToken = token.slice(0, -5) + 'wrong';

      const response = await makeAuthenticatedRequest(
        'POST',
        '/',
        tamperedToken,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject GET list with tampered token', async () => {
      const token = await generateAdminToken();
      const tamperedToken = token.slice(0, -5) + 'wrong';

      const response = await makeAuthenticatedRequest(
        'GET',
        '/',
        tamperedToken
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject GET by ID with tampered token', async () => {
      const token = await generateAdminToken();
      const tamperedToken = token.slice(0, -5) + 'wrong';

      const response = await makeAuthenticatedRequest(
        'GET',
        '/1',
        tamperedToken
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject PUT with tampered token', async () => {
      const token = await generateAdminToken();
      const tamperedToken = token.slice(0, -5) + 'wrong';

      const response = await makeAuthenticatedRequest(
        'PUT',
        '/1',
        tamperedToken,
        {
          name: 'Updated Key',
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject DELETE with tampered token', async () => {
      const token = await generateAdminToken();
      const tamperedToken = token.slice(0, -5) + 'wrong';

      const response = await makeAuthenticatedRequest(
        'DELETE',
        '/1',
        tamperedToken
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject POST with invalid JWT format', async () => {
      const invalidToken = 'invalid.jwt.format';

      const response = await makeAuthenticatedRequest(
        'POST',
        '/',
        invalidToken,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('Missing Authentication', () => {
    it('should reject POST without authentication', async () => {
      const response = await makeAuthenticatedRequest('POST', '/', undefined, {
        key: 'sk-test-key-1234567890abcdefghijklmnop',
        name: 'Test Key',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('required');
    });

    it('should reject GET list without authentication', async () => {
      const response = await makeAuthenticatedRequest('GET', '/', undefined);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('required');
    });

    it('should reject GET by ID without authentication', async () => {
      const response = await makeAuthenticatedRequest('GET', '/1', undefined);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('required');
    });

    it('should reject PUT without authentication', async () => {
      const response = await makeAuthenticatedRequest(
        'PUT',
        '/1',
        undefined,
        {
          name: 'Updated Key',
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('required');
    });

    it('should reject DELETE without authentication', async () => {
      const response = await makeAuthenticatedRequest(
        'DELETE',
        '/1',
        undefined
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('required');
    });

    it('should reject POST with empty Authorization header', async () => {
      const response = await makeAuthenticatedRequest(
        'POST',
        '/',
        '',
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should reject GET with whitespace-only credential', async () => {
      const response = await makeAuthenticatedRequest(
        'GET',
        '/',
        '   '
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('Permission Checks - Admin API Disabled', () => {
    beforeEach(() => {
      process.env.ADMIN_API_ENABLED = 'false';
      resetConfig();
    });

    it('should reject POST when admin API is disabled (API key)', async () => {
      const response = await makeAuthenticatedRequest(
        'POST',
        '/',
        ADMIN_API_KEY,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Admin API is disabled');
    });

    it('should reject POST when admin API is disabled (token)', async () => {
      const token = await generateAdminToken();

      const response = await makeAuthenticatedRequest(
        'POST',
        '/',
        token,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Admin API is disabled');
    });

    it('should reject GET list when admin API is disabled (API key)', async () => {
      const response = await makeAuthenticatedRequest(
        'GET',
        '/',
        ADMIN_API_KEY
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Admin API is disabled');
    });

    it('should reject GET by ID when admin API is disabled (API key)', async () => {
      const response = await makeAuthenticatedRequest(
        'GET',
        '/1',
        ADMIN_API_KEY
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Admin API is disabled');
    });

    it('should reject PUT when admin API is disabled (API key)', async () => {
      const response = await makeAuthenticatedRequest(
        'PUT',
        '/1',
        ADMIN_API_KEY,
        {
          name: 'Updated Key',
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Admin API is disabled');
    });

    it('should reject DELETE when admin API is disabled (API key)', async () => {
      const response = await makeAuthenticatedRequest(
        'DELETE',
        '/1',
        ADMIN_API_KEY
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Admin API is disabled');
    });

    it('should reject GET list when admin API is disabled (token)', async () => {
      const token = await generateAdminToken();

      const response = await makeAuthenticatedRequest('GET', '/', token);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Admin API is disabled');
    });

    it('should reject GET by ID when admin API is disabled (token)', async () => {
      const token = await generateAdminToken();

      const response = await makeAuthenticatedRequest('GET', '/1', token);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Admin API is disabled');
    });

    it('should reject PUT when admin API is disabled (token)', async () => {
      const token = await generateAdminToken();

      const response = await makeAuthenticatedRequest(
        'PUT',
        '/1',
        token,
        {
          name: 'Updated Key',
        }
      );

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Admin API is disabled');
    });

    it('should reject DELETE when admin API is disabled (token)', async () => {
      const token = await generateAdminToken();

      const response = await makeAuthenticatedRequest('DELETE', '/1', token);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Admin API is disabled');
    });
  });

  describe('Credential Format Edge Cases', () => {
    it('should accept API key with leading/trailing whitespace', async () => {
      const response = await makeAuthenticatedRequest(
        'POST',
        '/',
        `  ${ADMIN_API_KEY}  `,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );

      expect(response.status).toBe(201);
    });

    it('should accept token with leading/trailing whitespace', async () => {
      const token = await generateAdminToken();

      const response = await makeAuthenticatedRequest(
        'POST',
        '/',
        `  ${token}  `,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );

      expect(response.status).toBe(201);
    });

    it('should handle special characters in invalid API key', async () => {
      const specialInvalidKey = '!@#$%^&*()';

      const response = await makeAuthenticatedRequest(
        'POST',
        '/',
        specialInvalidKey,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );

      expect(response.status).toBe(401);
    });

    it('should reject very long invalid API key', async () => {
      const longKey = 'a'.repeat(10000);

      const response = await makeAuthenticatedRequest(
        'POST',
        '/',
        longKey,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );

      expect(response.status).toBe(401);
    });
  });

  describe('Cross-Endpoint Authentication Consistency', () => {
    it('should use same authentication method across multiple requests', async () => {
      const token = await generateAdminToken();

      // Create with token
      const createResponse = await makeAuthenticatedRequest(
        'POST',
        '/',
        token,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );

      expect(createResponse.status).toBe(201);
      const created = await createResponse.json();

      // Get with same token
      const getResponse = await makeAuthenticatedRequest(
        'GET',
        `/${created.id}`,
        token
      );

      expect(getResponse.status).toBe(200);

      // Update with same token
      const updateResponse = await makeAuthenticatedRequest(
        'PUT',
        `/${created.id}`,
        token,
        {
          name: 'Updated Key',
        }
      );

      expect(updateResponse.status).toBe(200);

      // Delete with same token
      const deleteResponse = await makeAuthenticatedRequest(
        'DELETE',
        `/${created.id}`,
        token
      );

      expect(deleteResponse.status).toBe(204);
    });

    it('should consistently reject invalid credentials across all endpoints', async () => {
      const responses = await Promise.all([
        makeAuthenticatedRequest(
          'GET',
          '/',
          INVALID_API_KEY
        ),
        makeAuthenticatedRequest(
          'GET',
          '/1',
          INVALID_API_KEY
        ),
        makeAuthenticatedRequest(
          'POST',
          '/',
          INVALID_API_KEY,
          {
            key: 'sk-test-key-1234567890abcdefghijklmnop',
            name: 'Test Key',
          }
        ),
        makeAuthenticatedRequest(
          'PUT',
          '/1',
          INVALID_API_KEY,
          { name: 'Updated' }
        ),
        makeAuthenticatedRequest(
          'DELETE',
          '/1',
          INVALID_API_KEY
        ),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data).toHaveProperty('error');
      }
    });
  });

  describe('Security - Error Message Consistency', () => {
    it('should not leak information in error messages', async () => {
      // Missing credentials
      const missingResponse = await makeAuthenticatedRequest(
        'GET',
        '/',
        undefined
      );
      expect(missingResponse.status).toBe(401);

      // Invalid credentials
      const invalidResponse = await makeAuthenticatedRequest(
        'GET',
        '/',
        INVALID_API_KEY
      );
      expect(invalidResponse.status).toBe(401);

      // Both should return 401 (not differentiating between missing and invalid)
      expect(missingResponse.status).toBe(invalidResponse.status);

      const missingData = await missingResponse.json();
      const invalidData = await invalidResponse.json();

      // Both should have error messages
      expect(missingData.error).toBeTruthy();
      expect(invalidData.error).toBeTruthy();
    });

    it('should return consistent error response format', async () => {
      const response = await makeAuthenticatedRequest(
        'POST',
        '/',
        INVALID_API_KEY,
        {
          key: 'sk-test-key-1234567890abcdefghijklmnop',
          name: 'Test Key',
        }
      );

      expect(response.status).toBe(401);

      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(typeof data.error).toBe('string');
    });
  });
});
