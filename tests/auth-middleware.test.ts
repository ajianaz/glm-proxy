import { describe, test, expect, beforeEach } from 'bun:test';
import { authenticateRequest, createUnauthorizedResponse, requireAuth } from '../src/auth-middleware.js';

describe('Authentication Middleware', () => {
  beforeEach(() => {
    // Clear all auth environment variables before each test
    delete process.env.DASHBOARD_AUTH_TOKEN;
    delete process.env.DASHBOARD_AUTH_USERNAME;
    delete process.env.DASHBOARD_AUTH_PASSWORD;
  });

  describe('authenticateRequest', () => {
    test('should allow access when no auth is configured', () => {
      const headers = new Headers();
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    test('should allow access with valid bearer token', () => {
      process.env.DASHBOARD_AUTH_TOKEN = 'test-token-123';
      const headers = new Headers({ Authorization: 'Bearer test-token-123' });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    test('should reject access with invalid bearer token', () => {
      process.env.DASHBOARD_AUTH_TOKEN = 'correct-token';
      const headers = new Headers({ Authorization: 'Bearer wrong-token' });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Invalid credentials');
    });

    test('should reject access when bearer token is required but missing', () => {
      process.env.DASHBOARD_AUTH_TOKEN = 'required-token';
      const headers = new Headers();
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Authorization header required');
    });

    test('should allow access with valid basic auth', () => {
      process.env.DASHBOARD_AUTH_USERNAME = 'admin';
      process.env.DASHBOARD_AUTH_PASSWORD = 'secret';
      const credentials = Buffer.from('admin:secret').toString('base64');
      const headers = new Headers({ Authorization: `Basic ${credentials}` });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    test('should reject access with invalid username', () => {
      process.env.DASHBOARD_AUTH_USERNAME = 'admin';
      process.env.DASHBOARD_AUTH_PASSWORD = 'secret';
      const credentials = Buffer.from('wronguser:secret').toString('base64');
      const headers = new Headers({ Authorization: `Basic ${credentials}` });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Invalid credentials');
    });

    test('should reject access with invalid password', () => {
      process.env.DASHBOARD_AUTH_USERNAME = 'admin';
      process.env.DASHBOARD_AUTH_PASSWORD = 'secret';
      const credentials = Buffer.from('admin:wrongpass').toString('base64');
      const headers = new Headers({ Authorization: `Basic ${credentials}` });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Invalid credentials');
    });

    test('should allow access with valid username when only username is configured', () => {
      process.env.DASHBOARD_AUTH_USERNAME = 'admin';
      const credentials = Buffer.from('admin:any-password').toString('base64');
      const headers = new Headers({ Authorization: `Basic ${credentials}` });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    test('should allow access with valid password when only password is configured', () => {
      process.env.DASHBOARD_AUTH_PASSWORD = 'secret';
      const credentials = Buffer.from('any-user:secret').toString('base64');
      const headers = new Headers({ Authorization: `Basic ${credentials}` });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    test('should reject access when basic auth is required but missing', () => {
      process.env.DASHBOARD_AUTH_USERNAME = 'admin';
      const headers = new Headers();
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Authorization header required');
    });

    test('should reject invalid authorization header format', () => {
      process.env.DASHBOARD_AUTH_TOKEN = 'test-token';
      const headers = new Headers({ Authorization: 'InvalidFormat token' });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toContain('Invalid authorization header format');
    });

    test('should handle bearer token with extra spaces', () => {
      process.env.DASHBOARD_AUTH_TOKEN = 'test-token';
      const headers = new Headers({ Authorization: 'Bearer   test-token   ' });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    test('should handle basic auth with extra spaces', () => {
      process.env.DASHBOARD_AUTH_USERNAME = 'admin';
      process.env.DASHBOARD_AUTH_PASSWORD = 'secret';
      const credentials = Buffer.from('admin:secret').toString('base64');
      const headers = new Headers({ Authorization: `Basic   ${credentials}` });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    test('should be case-insensitive for auth type', () => {
      process.env.DASHBOARD_AUTH_TOKEN = 'test-token';
      const headers = new Headers({ Authorization: 'bearer test-token' });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(true);
      expect(result.statusCode).toBe(200);
    });
  });

  describe('createUnauthorizedResponse', () => {
    test('should create proper 401 response', () => {
      const response = createUnauthorizedResponse('Test error message');

      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('WWW-Authenticate')).toContain('Bearer');
      expect(response.headers.get('WWW-Authenticate')).toContain('Basic');
    });

    test('should include error message in response body', async () => {
      const response = createUnauthorizedResponse('Custom error message');
      const body = await response.json();

      expect(body.error).toBe('Unauthorized');
      expect(body.message).toBe('Custom error message');
    });
  });

  describe('requireAuth', () => {
    test('should return null for authenticated requests', () => {
      process.env.DASHBOARD_AUTH_TOKEN = 'test-token';
      const req = new Request('http://localhost:3001/', {
        headers: { Authorization: 'Bearer test-token' },
      });

      const result = requireAuth(req);

      expect(result).toBeNull();
    });

    test('should return 401 response for unauthenticated requests', () => {
      process.env.DASHBOARD_AUTH_TOKEN = 'test-token';
      const req = new Request('http://localhost:3001/', {
        headers: {},
      });

      const result = requireAuth(req);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
    });

    test('should return null when no auth is configured', () => {
      const req = new Request('http://localhost:3001/', {
        headers: {},
      });

      const result = requireAuth(req);

      expect(result).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty bearer token', () => {
      process.env.DASHBOARD_AUTH_TOKEN = '';
      const headers = new Headers({ Authorization: 'Bearer ' });
      const result = authenticateRequest(headers);

      // Empty token configuration means empty string is required
      expect(result.authenticated).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    test('should handle malformed base64 in basic auth', () => {
      process.env.DASHBOARD_AUTH_USERNAME = 'admin';
      const headers = new Headers({ Authorization: 'Basic not-valid-base64!@#' });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    test('should handle basic auth without colon separator', () => {
      process.env.DASHBOARD_AUTH_USERNAME = 'adminonly';
      const credentials = Buffer.from('adminonly').toString('base64');
      const headers = new Headers({ Authorization: `Basic ${credentials}` });
      const result = authenticateRequest(headers);

      // Should treat entire string as username and validate it
      expect(result.authenticated).toBe(true);
    });

    test('should handle special characters in password', () => {
      process.env.DASHBOARD_AUTH_PASSWORD = 'p@ssw0rd!#$%';
      const credentials = Buffer.from('user:p@ssw0rd!#$%').toString('base64');
      const headers = new Headers({ Authorization: `Basic ${credentials}` });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(true);
    });

    test('should handle very long bearer tokens', () => {
      const longToken = 'a'.repeat(1000);
      process.env.DASHBOARD_AUTH_TOKEN = longToken;
      const headers = new Headers({ Authorization: `Bearer ${longToken}` });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(true);
    });

    test('should handle unicode in credentials', () => {
      process.env.DASHBOARD_AUTH_USERNAME = 'админ';
      process.env.DASHBOARD_AUTH_PASSWORD = 'пароль';
      const credentials = Buffer.from('админ:пароль').toString('base64');
      const headers = new Headers({ Authorization: `Basic ${credentials}` });
      const result = authenticateRequest(headers);

      expect(result.authenticated).toBe(true);
    });
  });
});
