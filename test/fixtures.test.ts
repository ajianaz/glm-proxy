/**
 * Tests for Test Fixtures
 *
 * Verifies that the centralized test utilities work correctly.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  setupTestEnvironment,
  createTestApiKey,
  createTestRequest,
  delay,
  cleanupTestDatabase,
  TEST_ENV,
} from './fixtures';
import { getDatabase } from '../src/models/database';
import { getConfig } from '../src/config';
import { generateAdminToken } from '../src/utils/adminToken';

describe('Test Fixtures', () => {
  describe('setupTestEnvironment', () => {
    it('should set up default test environment', () => {
      setupTestEnvironment();

      // Verify environment variables are set
      expect(process.env.ADMIN_API_KEY).toBe(TEST_ENV.ADMIN_API_KEY);
      expect(process.env.ZAI_API_KEY).toBe(TEST_ENV.ZAI_API_KEY);
      expect(process.env.ADMIN_API_ENABLED).toBe(TEST_ENV.ADMIN_API_ENABLED);
      expect(process.env.DATABASE_PATH).toBe(TEST_ENV.DATABASE_PATH);
    });

    it('should allow custom environment variables', () => {
      setupTestEnvironment({
        ADMIN_API_ENABLED: 'false',
        DATABASE_PATH: './custom-test.db',
      });

      expect(process.env.ADMIN_API_ENABLED).toBe('false');
      expect(process.env.DATABASE_PATH).toBe('./custom-test.db');
    });

    it('should initialize database with clean state', () => {
      setupTestEnvironment();

      // Database should be accessible
      const db = getDatabase();
      expect(db).toBeDefined();

      // Should be able to query the api_keys table
      const keys = db.query('SELECT COUNT(*) as count FROM api_keys').get() as { count: number };
      expect(keys.count).toBe(0);
    });
  });

  describe('createTestApiKey', () => {
    it('should create a test API key with defaults', () => {
      const apiKey = createTestApiKey();

      expect(apiKey).toHaveProperty('key');
      expect(apiKey).toHaveProperty('name', 'Test Key');
      expect(apiKey).toHaveProperty('description', 'A test API key');
      expect(apiKey).toHaveProperty('scopes');
      expect(apiKey).toHaveProperty('rate_limit', 60);
      expect(apiKey.scopes).toEqual([]);
    });

    it('should allow overriding test API key properties', () => {
      const apiKey = createTestApiKey({
        name: 'Custom Key',
        rate_limit: 100,
        scopes: ['read', 'write'],
      });

      expect(apiKey.name).toBe('Custom Key');
      expect(apiKey.rate_limit).toBe(100);
      expect(apiKey.scopes).toEqual(['read', 'write']);
    });
  });

  describe('createTestRequest', () => {
    it('should create a GET request', () => {
      const request = createTestRequest({
        method: 'GET',
        path: '/test',
      });

      expect(request.method).toBe('GET');
      expect(request.url).toContain('/test');
    });

    it('should create a POST request with body', () => {
      const body = { key: 'test-key', name: 'Test' };
      const request = createTestRequest({
        method: 'POST',
        path: '/',
        body,
      });

      expect(request.method).toBe('POST');
      expect(request.headers.get('Content-Type')).toBe('application/json');
    });

    it('should create a request with auth token', () => {
      const request = createTestRequest({
        method: 'GET',
        authToken: 'test-token',
      });

      expect(request.headers.get('Authorization')).toBe('Bearer test-token');
    });

    it('should allow custom headers', () => {
      const request = createTestRequest({
        method: 'GET',
        headers: {
          'X-Custom-Header': 'custom-value',
        },
      });

      expect(request.headers.get('X-Custom-Header')).toBe('custom-value');
    });
  });

  describe('delay', () => {
    it('should delay execution for the specified time', async () => {
      const start = Date.now();
      await delay(100);
      const end = Date.now();

      // Should be at least 100ms (allowing some tolerance)
      expect(end - start).toBeGreaterThanOrEqual(95);
    });
  });

  describe('integration with other utilities', () => {
    beforeEach(() => {
      setupTestEnvironment();
    });

    it('should work with generateAdminToken', async () => {
      const token = await generateAdminToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Token should have 3 parts (JWT format)
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should work with config', () => {
      const config = getConfig();

      expect(config).toBeDefined();
      expect(config.adminApiKey).toBe(TEST_ENV.ADMIN_API_KEY);
      expect(config.adminApiEnabled).toBe(true);
    });
  });
});
