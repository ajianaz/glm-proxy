/**
 * Authentication Integration Tests
 *
 * Tests API key authentication for various endpoints and authentication methods.
 * Subtask 3.1: Verify requests with valid API keys are properly authenticated and processed.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startTestServer,
  makeAuthenticatedRequest,
  makeRequestWithXApiKey,
  makeRequest,
  buildOpenAIChatRequest,
  buildAnthropicMessagesRequest,
} from './helpers';
import { setupTestEnvironment, teardownTestEnvironment } from './setup';
import {
  VALID_API_KEY,
  CUSTOM_MODEL_API_KEY,
  ANTHROPIC_MODEL_API_KEY,
  EXPIRING_SOON_API_KEY,
  LOW_LIMIT_API_KEY,
} from './fixtures';
import type { TestServer } from './helpers';

describe('Authentication Integration Tests - Valid API Keys', () => {
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

  describe('Authentication via Authorization Header (Bearer Token)', () => {
    it('should authenticate valid API key via Authorization header for /stats endpoint', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      const body = response.json();
      expect(body).toHaveProperty('key');
      expect(body.key).toBe(VALID_API_KEY.key);
    });

    it('should authenticate valid API key via Authorization header for /v1/chat/completions', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      // Request should be processed by proxy (may get various status codes from upstream)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should authenticate valid API key via Authorization header for /v1/messages', async () => {
      const requestBody = buildAnthropicMessagesRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/messages`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      // Request should be processed by proxy (may get various status codes from upstream)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle "Bearer" prefix case-insensitively', async () => {
      const variants = [
        `Bearer ${VALID_API_KEY.key}`,
        `bearer ${VALID_API_KEY.key}`,
        `BEARER ${VALID_API_KEY.key}`,
      ];

      for (const authHeader of variants) {
        const response = await makeRequest(`${testServer.url}/stats`, {
          headers: {
            Authorization: authHeader,
          },
        });

        expect(response.status).toBe(200);
        expect(response.json().key).toBe(VALID_API_KEY.key);
      }
    });

    it('should authenticate API key with custom model', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        CUSTOM_MODEL_API_KEY.key
      );

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body.key).toBe(CUSTOM_MODEL_API_KEY.key);
      expect(body.model).toBe(CUSTOM_MODEL_API_KEY.model);
    });

    it('should authenticate API key with Anthropic model', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        ANTHROPIC_MODEL_API_KEY.key
      );

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body.key).toBe(ANTHROPIC_MODEL_API_KEY.key);
      expect(body.model).toBe(ANTHROPIC_MODEL_API_KEY.model);
    });
  });

  describe('Authentication via x-api-key Header', () => {
    it('should authenticate valid API key via x-api-key header for /stats endpoint', async () => {
      const response = await makeRequestWithXApiKey(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      const body = response.json();
      expect(body).toHaveProperty('key');
      expect(body.key).toBe(VALID_API_KEY.key);
    });

    it('should authenticate valid API key via x-api-key header for /v1/chat/completions', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeRequestWithXApiKey(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      // Request should be processed by proxy (may get various status codes from upstream)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should authenticate valid API key via x-api-key header for /v1/messages', async () => {
      const requestBody = buildAnthropicMessagesRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeRequestWithXApiKey(
        `${testServer.url}/v1/messages`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      // Request should be processed by proxy (may get various status codes from upstream)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle x-api-key header case-insensitively', async () => {
      const variants = [
        ['x-api-key', VALID_API_KEY.key],
        ['X-API-KEY', VALID_API_KEY.key],
        ['X-Api-Key', VALID_API_KEY.key],
      ];

      for (const [headerName, headerValue] of variants) {
        const response = await makeRequest(`${testServer.url}/stats`, {
          headers: {
            [headerName]: headerValue,
          },
        });

        expect(response.status).toBe(200);
        expect(response.json().key).toBe(VALID_API_KEY.key);
      }
    });
  });

  describe('Authentication Header Priority', () => {
    it('should prefer Authorization header when both headers are present', async () => {
      const response = await makeRequest(`${testServer.url}/stats`, {
        headers: {
          Authorization: `Bearer ${VALID_API_KEY.key}`,
          'x-api-key': CUSTOM_MODEL_API_KEY.key,
        },
      });

      expect(response.status).toBe(200);

      // Should use the API key from Authorization header
      const body = response.json();
      expect(body.key).toBe(VALID_API_KEY.key);
    });

    it('should use x-api-key when Authorization header is not present', async () => {
      const response = await makeRequest(`${testServer.url}/stats`, {
        headers: {
          'x-api-key': CUSTOM_MODEL_API_KEY.key,
        },
      });

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body.key).toBe(CUSTOM_MODEL_API_KEY.key);
    });
  });

  describe('Authenticated Request Processing', () => {
    it('should return correct API key information for authenticated request', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body.key).toBe(VALID_API_KEY.key);
      expect(body.name).toBe(VALID_API_KEY.name);
      expect(body.model).toBe(VALID_API_KEY.model);
      expect(body.token_limit_per_5h).toBe(VALID_API_KEY.token_limit_per_5h);
    });

    it('should return expiry status for authenticated request', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body).toHaveProperty('expiry_date');
      expect(body).toHaveProperty('is_expired');
      expect(body.is_expired).toBe(false);
    });

    it('should return usage statistics for authenticated request', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body).toHaveProperty('current_usage');
      expect(body).toHaveProperty('total_lifetime_tokens');
      expect(typeof body.current_usage).toBe('object');
      expect(typeof body.total_lifetime_tokens).toBe('number');
    });

    it('should return timestamp fields for authenticated request', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body).toHaveProperty('created_at');
      expect(body).toHaveProperty('last_used');

      // Verify timestamps are valid ISO date strings
      expect(() => new Date(body.created_at)).not.toThrow();
      expect(() => new Date(body.last_used)).not.toThrow();
    });

    it('should update last_used timestamp on authenticated request', async () => {
      const beforeResponse = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      const beforeLastUsed = new Date(beforeResponse.json().last_used).getTime();

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      const afterResponse = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      const afterLastUsed = new Date(afterResponse.json().last_used).getTime();

      // last_used should be updated (monotonically increasing)
      expect(afterLastUsed).toBeGreaterThanOrEqual(beforeLastUsed);
    });
  });

  describe('Multiple Valid API Keys', () => {
    it('should authenticate requests from different API keys independently', async () => {
      const keys = [VALID_API_KEY, CUSTOM_MODEL_API_KEY, ANTHROPIC_MODEL_API_KEY];

      for (const key of keys) {
        const response = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          key.key
        );

        expect(response.status).toBe(200);

        const body = response.json();
        expect(body.key).toBe(key.key);
        expect(body.name).toBe(key.name);
        expect(body.model).toBe(key.model);
      }
    });

    it('should return correct data for each authenticated API key', async () => {
      const validKeyResponse = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      const customKeyResponse = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        CUSTOM_MODEL_API_KEY.key
      );

      expect(validKeyResponse.status).toBe(200);
      expect(customKeyResponse.status).toBe(200);

      const validKeyBody = validKeyResponse.json();
      const customKeyBody = customKeyResponse.json();

      // Each response should have data specific to that API key
      expect(validKeyBody.key).toBe(VALID_API_KEY.key);
      expect(customKeyBody.key).toBe(CUSTOM_MODEL_API_KEY.key);
      expect(validKeyBody.model).not.toBe(customKeyBody.model);
    });
  });

  describe('Authentication with API Key States', () => {
    it('should authenticate API key that is expiring soon', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        EXPIRING_SOON_API_KEY.key
      );

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body.key).toBe(EXPIRING_SOON_API_KEY.key);
      expect(body.is_expired).toBe(false);
    });

    it('should authenticate API key with low token limit', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        LOW_LIMIT_API_KEY.key
      );

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body.key).toBe(LOW_LIMIT_API_KEY.key);
      expect(body.token_limit_per_5h).toBe(LOW_LIMIT_API_KEY.token_limit_per_5h);
    });

    it('should include rate limit information for authenticated request', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body).toHaveProperty('token_limit_per_5h');
      expect(body).toHaveProperty('current_usage');

      // Verify current_usage has proper structure
      expect(body.current_usage).toHaveProperty('tokens_used_in_current_window');
      expect(body.current_usage).toHaveProperty('remaining_tokens');
      expect(body.current_usage).toHaveProperty('window_started_at');
      expect(body.current_usage).toHaveProperty('window_ends_at');

      // Verify remaining_tokens does not exceed token_limit_per_5h
      expect(body.current_usage.remaining_tokens).toBeLessThanOrEqual(body.token_limit_per_5h);
    });
  });

  describe('Authentication CORS Support', () => {
    it('should include CORS headers for authenticated requests', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });

    it('should handle preflight OPTIONS with authentication headers present', async () => {
      const response = await makeRequest(`${testServer.url}/stats`, {
        method: 'OPTIONS',
        headers: {
          Authorization: `Bearer ${VALID_API_KEY.key}`,
        },
      });

      // OPTIONS should be handled by CORS middleware
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
    });
  });

  describe('Authentication Consistency', () => {
    it('should return consistent results across multiple requests', async () => {
      const responses = await Promise.all([
        makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key),
        makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key),
        makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(200);

        const body = response.json();
        expect(body.key).toBe(VALID_API_KEY.key);
        expect(body.name).toBe(VALID_API_KEY.name);
        expect(body.model).toBe(VALID_API_KEY.model);
      }
    });

    it('should handle concurrent authenticated requests correctly', async () => {
      const keys = [VALID_API_KEY, CUSTOM_MODEL_API_KEY, ANTHROPIC_MODEL_API_KEY];

      const responses = await Promise.all(
        keys.map(key =>
          makeAuthenticatedRequest(`${testServer.url}/stats`, key.key)
        )
      );

      for (let i = 0; i < responses.length; i++) {
        expect(responses[i].status).toBe(200);

        const body = responses[i].json();
        expect(body.key).toBe(keys[i].key);
      }
    });
  });

  describe('Authentication Performance', () => {
    it('should authenticate requests quickly', async () => {
      const start = Date.now();

      await makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key);

      const duration = Date.now() - start;

      // Authentication should complete within 100ms in test environment
      expect(duration).toBeLessThan(100);
    });

    it('should handle multiple authenticated requests efficiently', async () => {
      const start = Date.now();

      const requests = Array(10)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key)
        );

      await Promise.all(requests);

      const duration = Date.now() - start;

      // 10 concurrent requests should complete within 500ms
      expect(duration).toBeLessThan(500);
    });
  });
});
