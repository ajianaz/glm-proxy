/**
 * Health Endpoint Integration Tests
 *
 * Tests the /health endpoint for correct status, format, and CORS handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, makeRequest, validateHealthResponse } from './helpers';
import { setupTestEnvironment, teardownTestEnvironment } from './setup';
import type { TestServer } from './helpers';

describe('Health Endpoint Integration Tests', () => {
  let testServer: TestServer;
  let testEnv: ReturnType<typeof setupTestEnvironment>;

  beforeAll(async () => {
    // Set up test environment
    testEnv = setupTestEnvironment();

    // Start test server
    testServer = await startTestServer();
  });

  afterAll(async () => {
    // Stop test server
    await testServer.stop();

    // Tear down test environment
    teardownTestEnvironment(testEnv);
  });

  describe('GET /health', () => {
    it('should return 200 OK status', async () => {
      const response = await makeRequest(`${testServer.url}/health`);

      expect(response.status).toBe(200);
    });

    it('should return correct response format with status and timestamp', async () => {
      const response = await makeRequest(`${testServer.url}/health`);
      const body = response.json();

      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');
    });

    it('should return status as "ok"', async () => {
      const response = await makeRequest(`${testServer.url}/health`);
      const body = response.json();

      expect(body.status).toBe('ok');
    });

    it('should return valid ISO 8601 timestamp', async () => {
      const response = await makeRequest(`${testServer.url}/health`);
      const body = response.json();

      expect(body.timestamp).toBeTruthy();
      expect(typeof body.timestamp).toBe('string');

      // Verify it's a valid ISO date string
      const date = new Date(body.timestamp);
      expect(date.toISOString()).toBe(body.timestamp);

      // Verify timestamp is recent (within last 5 seconds)
      const now = new Date();
      const timeDiff = Math.abs(now.getTime() - date.getTime());
      expect(timeDiff).toBeLessThan(5000); // 5 seconds in milliseconds
    });

    it('should return JSON content type', async () => {
      const response = await makeRequest(`${testServer.url}/health`);

      expect(response.headers.get('content-type')).toContain('application/json');
    });

    it('should handle CORS with proper headers', async () => {
      const response = await makeRequest(`${testServer.url}/health`, {
        method: 'GET',
      });

      // Check for common CORS headers
      const corsHeaders = [
        'access-control-allow-origin',
      ];

      // At minimum, should have allow-origin header
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('should handle OPTIONS preflight request', async () => {
      const response = await makeRequest(`${testServer.url}/health`, {
        method: 'OPTIONS',
      });

      // OPTIONS requests should be handled by CORS middleware
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);

      // Should have CORS headers
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });

    it('should work without authentication', async () => {
      // Health endpoint should be public (no auth required)
      const response = await makeRequest(`${testServer.url}/health`);

      expect(response.status).toBe(200);
      expect(response.json().status).toBe('ok');
    });

    it('should work with different origins', async () => {
      const origins = [
        'http://localhost:3000',
        'https://example.com',
        'http://localhost:5173',
      ];

      for (const origin of origins) {
        const response = await makeRequest(`${testServer.url}/health`, {
          headers: {
            Origin: origin,
          },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
      }
    });

    it('should handle requests from different methods', async () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE'];

      for (const method of methods) {
        const response = await makeRequest(`${testServer.url}/health`, {
          method: method as any,
        });

        // Should handle all methods (CORS allows them)
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(500);
      }
    });

    it('should validate health response using helper function', async () => {
      const response = await makeRequest(`${testServer.url}/health`);

      // Use the validation helper from helpers.ts
      expect(() => validateHealthResponse(response)).not.toThrow();
    });

    it('should be consistent across multiple requests', async () => {
      const responses = await Promise.all([
        makeRequest(`${testServer.url}/health`),
        makeRequest(`${testServer.url}/health`),
        makeRequest(`${testServer.url}/health`),
      ]);

      // All should return 200
      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(response.json().status).toBe('ok');
        expect(response.json()).toHaveProperty('timestamp');
      }

      // All timestamps should be recent and valid
      const now = Date.now();
      for (const response of responses) {
        const timestamp = new Date(response.json().timestamp).getTime();
        const timeDiff = Math.abs(now - timestamp);
        expect(timeDiff).toBeLessThan(1000); // Within 1 second
      }
    });
  });

  describe('Health Endpoint Edge Cases', () => {
    it('should handle requests with query parameters', async () => {
      const response = await makeRequest(`${testServer.url}/health?test=1&foo=bar`);

      expect(response.status).toBe(200);
      expect(response.json().status).toBe('ok');
    });

    it('should handle requests with trailing slash', async () => {
      const response = await makeRequest(`${testServer.url}/health/`);

      // This might 404 since the route is '/health' not '/health/'
      // But we test to ensure behavior is consistent
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    it('should handle requests with custom headers', async () => {
      const response = await makeRequest(`${testServer.url}/health`, {
        headers: {
          'X-Custom-Header': 'test-value',
          'User-Agent': 'Test-Agent/1.0',
        },
      });

      expect(response.status).toBe(200);
      expect(response.json().status).toBe('ok');
    });

    it('should be fast to respond', async () => {
      const start = Date.now();
      await makeRequest(`${testServer.url}/health`);
      const duration = Date.now() - start;

      // Should respond within 100ms (even in test environment)
      expect(duration).toBeLessThan(100);
    });
  });
});
