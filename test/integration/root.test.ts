/**
 * Root Endpoint Integration Tests
 *
 * Tests the root endpoint for correct API documentation and endpoint listing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, makeRequest } from './helpers';
import { setupTestEnvironment, teardownTestEnvironment } from './setup';
import type { TestServer } from './helpers';

describe('Root Endpoint Integration Tests', () => {
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

  describe('GET /', () => {
    it('should return 200 OK status', async () => {
      const response = await makeRequest(testServer.url);

      expect(response.status).toBe(200);
    });

    it('should return JSON content type', async () => {
      const response = await makeRequest(testServer.url);

      expect(response.headers.get('content-type')).toContain('application/json');
    });

    it('should return correct response structure with name, version, and endpoints', async () => {
      const response = await makeRequest(testServer.url);
      const body = response.json();

      expect(body).toHaveProperty('name');
      expect(body).toHaveProperty('version');
      expect(body).toHaveProperty('endpoints');
    });

    it('should return "Proxy Gateway" as the name', async () => {
      const response = await makeRequest(testServer.url);
      const body = response.json();

      expect(body.name).toBe('Proxy Gateway');
    });

    it('should return version as "1.0.0"', async () => {
      const response = await makeRequest(testServer.url);
      const body = response.json();

      expect(body.version).toBe('1.0.0');
    });

    it('should return endpoints object with all required endpoint listings', async () => {
      const response = await makeRequest(testServer.url);
      const body = response.json();

      expect(body.endpoints).toHaveProperty('health');
      expect(body.endpoints).toHaveProperty('stats');
      expect(body.endpoints).toHaveProperty('openai_compatible');
      expect(body.endpoints).toHaveProperty('anthropic_compatible');
    });

    it('should return correct health endpoint documentation', async () => {
      const response = await makeRequest(testServer.url);
      const body = response.json();

      expect(body.endpoints.health).toBe('GET /health');
    });

    it('should return correct stats endpoint documentation', async () => {
      const response = await makeRequest(testServer.url);
      const body = response.json();

      expect(body.endpoints.stats).toBe('GET /stats');
    });

    it('should return correct OpenAI compatible endpoint documentation', async () => {
      const response = await makeRequest(testServer.url);
      const body = response.json();

      expect(body.endpoints.openai_compatible).toBe('ALL /v1/* (except /v1/messages)');
    });

    it('should return correct Anthropic compatible endpoint documentation', async () => {
      const response = await makeRequest(testServer.url);
      const body = response.json();

      expect(body.endpoints.anthropic_compatible).toBe('POST /v1/messages');
    });

    it('should work without authentication', async () => {
      // Root endpoint should be public (no auth required)
      const response = await makeRequest(testServer.url);

      expect(response.status).toBe(200);
      expect(response.json()).toHaveProperty('name');
      expect(response.json()).toHaveProperty('version');
    });

    it('should handle CORS with proper headers', async () => {
      const response = await makeRequest(testServer.url);

      // Check for common CORS headers
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('should work with different origins', async () => {
      const origins = [
        'http://localhost:3000',
        'https://example.com',
        'http://localhost:5173',
      ];

      for (const origin of origins) {
        const response = await makeRequest(testServer.url, {
          headers: {
            Origin: origin,
          },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
      }
    });
  });

  describe('Root Endpoint Edge Cases', () => {
    it('should handle OPTIONS preflight request', async () => {
      const response = await makeRequest(testServer.url, {
        method: 'OPTIONS',
      });

      // OPTIONS requests should be handled by CORS middleware
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);

      // Should have CORS headers
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });

    it('should handle requests with query parameters', async () => {
      const response = await makeRequest(`${testServer.url}?test=1&foo=bar`);

      expect(response.status).toBe(200);
      expect(response.json()).toHaveProperty('name');
    });

    it('should handle requests with trailing slash', async () => {
      const response = await makeRequest(`${testServer.url}/`);

      // Should handle trailing slash gracefully
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });

    it('should handle requests with custom headers', async () => {
      const response = await makeRequest(testServer.url, {
        headers: {
          'X-Custom-Header': 'test-value',
          'User-Agent': 'Test-Agent/1.0',
        },
      });

      expect(response.status).toBe(200);
      expect(response.json()).toHaveProperty('name');
    });

    it('should be fast to respond', async () => {
      const start = Date.now();
      await makeRequest(testServer.url);
      const duration = Date.now() - start;

      // Should respond within 100ms (even in test environment)
      expect(duration).toBeLessThan(100);
    });

    it('should be consistent across multiple requests', async () => {
      const responses = await Promise.all([
        makeRequest(testServer.url),
        makeRequest(testServer.url),
        makeRequest(testServer.url),
      ]);

      // All should return 200 with the same structure
      for (const response of responses) {
        expect(response.status).toBe(200);
        const body = response.json();
        expect(body.name).toBe('Proxy Gateway');
        expect(body.version).toBe('1.0.0');
        expect(body).toHaveProperty('endpoints');
      }
    });

    it('should reject POST requests to root endpoint', async () => {
      const response = await makeRequest(testServer.url, {
        method: 'POST',
        body: JSON.stringify({ test: 'data' }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should not accept POST requests (might 404 or 405)
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject PUT requests to root endpoint', async () => {
      const response = await makeRequest(testServer.url, {
        method: 'PUT',
        body: JSON.stringify({ test: 'data' }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Should not accept PUT requests
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should reject DELETE requests to root endpoint', async () => {
      const response = await makeRequest(testServer.url, {
        method: 'DELETE',
      });

      // Should not accept DELETE requests
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it('should return valid JSON that can be parsed', async () => {
      const response = await makeRequest(testServer.url);

      // Should not throw when parsing
      expect(() => {
        const body = response.json();
        expect(body).toBeTruthy();
      }).not.toThrow();
    });

    it('should have exactly 4 documented endpoints', async () => {
      const response = await makeRequest(testServer.url);
      const body = response.json();

      const endpointCount = Object.keys(body.endpoints).length;
      expect(endpointCount).toBe(4);
    });

    it('should document all major API endpoints', async () => {
      const response = await makeRequest(testServer.url);
      const body = response.json();

      const endpoints = body.endpoints;

      // Check all documented endpoints are present
      expect(endpoints.health).toContain('/health');
      expect(endpoints.stats).toContain('/stats');
      expect(endpoints.openai_compatible).toContain('/v1/');
      expect(endpoints.anthropic_compatible).toContain('/v1/messages');
    });

    it('should not include sensitive information in response', async () => {
      const response = await makeRequest(testServer.url);
      const body = response.json();
      const bodyStr = JSON.stringify(body);

      // Should not contain API keys, internal paths, etc.
      expect(bodyStr.toLowerCase()).not.toContain('api_key');
      expect(bodyStr.toLowerCase()).not.toContain('password');
      expect(bodyStr.toLowerCase()).not.toContain('secret');
      expect(bodyStr.toLowerCase()).not.toContain('token');
    });

    it('should handle HEAD requests', async () => {
      const response = await makeRequest(testServer.url, {
        method: 'HEAD',
      });

      // Should handle HEAD (might return 200 or 405 depending on implementation)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('Root Endpoint Documentation Quality', () => {
    it('should provide clear and descriptive endpoint names', async () => {
      const response = await makeRequest(testServer.url);
      const body = response.json();

      // Endpoint names should be clear
      const endpointNames = Object.keys(body.endpoints);
      expect(endpointNames.length).toBeGreaterThan(0);

      // Each endpoint name should be descriptive
      endpointNames.forEach(name => {
        expect(name.length).toBeGreaterThan(0);
        expect(typeof name).toBe('string');
      });
    });

    it('should include HTTP methods in endpoint documentation', async () => {
      const response = await makeRequest(testServer.url);
      const body = response.json();

      const endpoints = body.endpoints;

      // Check that HTTP methods are documented
      expect(endpoints.health).toMatch(/^GET /i);
      expect(endpoints.stats).toMatch(/^GET /i);
      expect(endpoints.anthropic_compatible).toMatch(/^POST /i);
    });

    it('should provide accurate endpoint paths', async () => {
      const response = await makeRequest(testServer.url);
      const body = response.json();

      const endpoints = body.endpoints;

      // All endpoint paths should start with /
      Object.values(endpoints).forEach(doc => {
        const match = doc.match(/\/[a-z0-9\/_\-]*/i);
        expect(match).toBeTruthy();
      });
    });
  });
});
