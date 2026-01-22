import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import {
  adminAuthMiddleware,
  extractAdminApiKey,
  validateAdminApiKey,
  isAdminAuthenticated,
  getAuthMethod,
  type AdminAuthContext,
} from '../../src/middleware/adminAuth';
import { generateAdminToken } from '../../src/utils/adminToken';
import { resetConfig } from '../../src/config';
import { resetAdminKeyCache } from '../../src/utils/adminCredentials';

describe('Admin Authentication Middleware', () => {
  const testAdminKey = 'test-admin-key-12345';
  const differentKey = 'different-key-67890';

  beforeEach(() => {
    // Reset config before each test
    resetConfig();
    resetAdminKeyCache();

    // Set up environment for testing
    process.env.ADMIN_API_KEY = testAdminKey;
    process.env.ADMIN_API_ENABLED = 'true';
    process.env.ZAI_API_KEY = 'test-zai-key';
    process.env.DATABASE_PATH = ':memory:';
  });

  describe('extractAdminApiKey', () => {
    it('should extract API key from Authorization header with Bearer prefix', () => {
      const headers = new Headers({
        authorization: 'Bearer my-secret-key',
      });
      const result = extractAdminApiKey(headers);
      expect(result).toBe('my-secret-key');
    });

    it('should extract API key from Authorization header with lowercase bearer', () => {
      const headers = new Headers({
        authorization: 'bearer my-secret-key',
      });
      const result = extractAdminApiKey(headers);
      expect(result).toBe('my-secret-key');
    });

    it('should extract API key from x-api-key header', () => {
      const headers = new Headers({
        'x-api-key': 'my-secret-key',
      });
      const result = extractAdminApiKey(headers);
      expect(result).toBe('my-secret-key');
    });

    it('should prioritize Authorization header over x-api-key', () => {
      const headers = new Headers({
        authorization: 'Bearer auth-header-key',
        'x-api-key': 'x-api-key-value',
      });
      const result = extractAdminApiKey(headers);
      expect(result).toBe('auth-header-key');
    });

    it('should return null when no API key is provided', () => {
      const headers = new Headers();
      const result = extractAdminApiKey(headers);
      expect(result).toBeNull();
    });

    it('should handle empty Authorization header', () => {
      const headers = new Headers({
        authorization: '',
      });
      const result = extractAdminApiKey(headers);
      expect(result).toBeNull();
    });

    it('should handle malformed Authorization header without Bearer prefix', () => {
      const headers = new Headers({
        authorization: 'my-secret-key',
      });
      const result = extractAdminApiKey(headers);
      expect(result).toBeNull();
    });
  });

  describe('validateAdminApiKey', () => {
    it('should validate correct admin API key', () => {
      const result = validateAdminApiKey(testAdminKey);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.statusCode).toBeUndefined();
    });

    it('should reject incorrect admin API key', () => {
      const result = validateAdminApiKey(differentKey);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid admin API key');
      expect(result.statusCode).toBe(401);
    });

    it('should reject missing API key', () => {
      const result = validateAdminApiKey(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Admin API key required. Use Authorization: Bearer <key> or x-api-key: <key>');
      expect(result.statusCode).toBe(401);
    });

    it('should reject empty string API key', () => {
      const result = validateAdminApiKey('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Admin API key cannot be empty');
      expect(result.statusCode).toBe(401);
    });

    it('should reject whitespace-only API key', () => {
      const result = validateAdminApiKey('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Admin API key cannot be empty');
      expect(result.statusCode).toBe(401);
    });

    it('should trim whitespace from API key before validation', () => {
      const result = validateAdminApiKey(`  ${testAdminKey}  `);
      expect(result.valid).toBe(true);
    });

    it('should return 403 when admin API is disabled', () => {
      process.env.ADMIN_API_ENABLED = 'false';
      resetConfig();

      const result = validateAdminApiKey(testAdminKey);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Admin API is disabled');
      expect(result.statusCode).toBe(403);
    });

    it('should handle API key with leading/trailing spaces', () => {
      const result = validateAdminApiKey(` ${testAdminKey} `);
      expect(result.valid).toBe(true);
    });
  });

  describe('adminAuthMiddleware', () => {
    it('should allow request with valid admin API key in Authorization header', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => {
        const isAuthenticated = isAdminAuthenticated(c);
        return c.json({ success: true, authenticated: isAuthenticated });
      });

      const res = await app.request('/admin/test', {
        headers: {
          authorization: `Bearer ${testAdminKey}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.authenticated).toBe(true);
    });

    it('should allow request with valid admin API key in x-api-key header', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => {
        return c.json({ success: true });
      });

      const res = await app.request('/admin/test', {
        headers: {
          'x-api-key': testAdminKey,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('should reject request with invalid admin API key', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', {
        headers: {
          authorization: `Bearer ${differentKey}`,
        },
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Invalid admin API key or token');
    });

    it('should reject request without API key', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test');

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Admin API key or token required. Use Authorization: Bearer <credential> or x-api-key: <credential>');
    });

    it('should reject request with empty API key', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', {
        headers: {
          authorization: 'Bearer   ',
        },
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      // When Bearer format exists but key is empty/just spaces, it's treated as invalid
      expect(json.error).toBe('Invalid admin API key or token');
    });

    it('should return 403 when admin API is disabled', async () => {
      process.env.ADMIN_API_ENABLED = 'false';
      resetConfig();

      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', {
        headers: {
          authorization: `Bearer ${testAdminKey}`,
        },
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe('Admin API is disabled');
    });

    it('should attach authentication status to context', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => {
        const isAuthenticated = c.get('isAuthenticated');
        return c.json({ isAuthenticated });
      });

      const res = await app.request('/admin/test', {
        headers: {
          authorization: `Bearer ${testAdminKey}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.isAuthenticated).toBe(true);
    });

    it('should handle case-insensitive Bearer prefix', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', {
        headers: {
          authorization: 'bearer ' + testAdminKey,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('should allow access to multiple protected routes', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/*', adminAuthMiddleware);
      app.get('/admin/test1', (c) => c.json({ route: 'test1' }));
      app.get('/admin/test2', (c) => c.json({ route: 'test2' }));

      const res1 = await app.request('/admin/test1', {
        headers: {
          authorization: `Bearer ${testAdminKey}`,
        },
      });

      const res2 = await app.request('/admin/test2', {
        headers: {
          authorization: `Bearer ${testAdminKey}`,
        },
      });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });

    it('should reject access to protected route with wrong key in x-api-key', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', {
        headers: {
          'x-api-key': differentKey,
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('isAdminAuthenticated', () => {
    it('should return true when request is authenticated', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => {
        const authenticated = isAdminAuthenticated(c);
        return c.json({ authenticated });
      });

      const res = await app.request('/admin/test', {
        headers: {
          authorization: `Bearer ${testAdminKey}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
    });

    it('should return false when isAuthenticated is not set in context', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.get('/admin/test', (c) => {
        const authenticated = isAdminAuthenticated(c);
        return c.json({ authenticated });
      });

      const res = await app.request('/admin/test');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(false);
    });
  });

  describe('Security edge cases', () => {
    it('should not reveal correct vs incorrect key in error messages', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => c.json({ success: true }));

      // Test missing key
      const res1 = await app.request('/admin/test');
      expect(res1.status).toBe(401);

      // Test invalid key
      const res2 = await app.request('/admin/test', {
        headers: {
          authorization: 'Bearer wrong-key',
        },
      });
      expect(res2.status).toBe(401);

      // Both should return 401 without revealing information about the key
      const json1 = await res1.json();
      const json2 = await res2.json();
      expect(json1.error).toBeTruthy();
      expect(json2.error).toBeTruthy();
    });

    it('should handle very long API keys', async () => {
      const longKey = 'a'.repeat(10000);
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => c.json({ success: true }));

      const res = await app.request('/admin/test', {
        headers: {
          authorization: `Bearer ${longKey}`,
        },
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Invalid admin API key or token');
    });

    it('should handle special characters in API key', () => {
      // Test with special characters that might be used in API keys
      const specialKey = 'test-key-123!@#$%^&*()';
      process.env.ADMIN_API_KEY = specialKey;
      resetConfig();
      resetAdminKeyCache();

      const result = validateAdminApiKey(specialKey);
      expect(result.valid).toBe(true);
    });
  });

  describe('Token Authentication', () => {
    it('should accept valid admin token', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => {
        return c.json({ success: true, authMethod: getAuthMethod(c) });
      });

      const token = await generateAdminToken();
      const res = await app.request('/admin/test', {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.authMethod).toBe('token');
    });

    it('should accept valid admin token via x-api-key header', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => {
        return c.json({ success: true, authMethod: getAuthMethod(c) });
      });

      const token = await generateAdminToken();
      const res = await app.request('/admin/test', {
        headers: {
          'x-api-key': token,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.authMethod).toBe('token');
    });

    it('should reject tampered tokens', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => c.json({ success: true }));

      const token = await generateAdminToken();
      const tamperedToken = token.slice(0, -5) + 'wrong';

      const res = await app.request('/admin/test', {
        headers: {
          authorization: `Bearer ${tamperedToken}`,
        },
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBeDefined();
    });

    it('should reject invalid JWT format', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => c.json({ success: true }));

      const invalidToken = 'invalid.jwt.token';

      const res = await app.request('/admin/test', {
        headers: {
          authorization: `Bearer ${invalidToken}`,
        },
      });

      expect(res.status).toBe(401);
    });

    it('should prioritize API key over token validation', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      app.use('/admin/test', adminAuthMiddleware);
      app.get('/admin/test', (c) => {
        return c.json({ success: true, authMethod: getAuthMethod(c) });
      });

      const res = await app.request('/admin/test', {
        headers: {
          authorization: `Bearer ${testAdminKey}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authMethod).toBe('api_key');
    });
  });
});
