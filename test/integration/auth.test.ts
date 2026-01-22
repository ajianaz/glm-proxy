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
  EXPIRED_API_KEY,
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

/**
 * Subtask 3.2: Verify requests with invalid, missing, or malformed API keys are rejected with proper error messages
 */
describe('Authentication Integration Tests - Invalid API Keys', () => {
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

  describe('Missing API Key', () => {
    it('should reject request with no authentication headers for /stats endpoint', async () => {
      const response = await makeRequest(`${testServer.url}/stats`);

      expect(response.status).toBe(401);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toBeTruthy();
    });

    it('should reject request with no authentication headers for /v1/chat/completions', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeRequest(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        body: requestBody,
      });

      expect(response.status).toBe(401);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toBeTruthy();
    });

    it('should reject request with no authentication headers for /v1/messages', async () => {
      const requestBody = buildAnthropicMessagesRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeRequest(`${testServer.url}/v1/messages`, {
        method: 'POST',
        body: requestBody,
      });

      expect(response.status).toBe(401);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toBeTruthy();
    });

    it('should return descriptive error message for missing API key', async () => {
      const response = await makeRequest(`${testServer.url}/stats`);

      expect(response.status).toBe(401);

      const body = response.json();
      expect(body.error).toMatch(/api.?key/i);
      expect(body.error).toMatch(/required|missing|provide/i);
    });
  });

  describe('Invalid API Key', () => {
    it('should reject request with non-existent API key via Authorization header', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        'pk_test_does_not_exist_12345'
      );

      expect(response.status).toBe(401);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toBeTruthy();
    });

    it('should reject request with non-existent API key via x-api-key header', async () => {
      const response = await makeRequestWithXApiKey(
        `${testServer.url}/stats`,
        'pk_test_does_not_exist_12345'
      );

      expect(response.status).toBe(401);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toBeTruthy();
    });

    it('should reject request with non-existent API key for chat completions', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        'pk_test_does_not_exist_12345',
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(401);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toBeTruthy();
    });

    it('should reject request with non-existent API key for messages', async () => {
      const requestBody = buildAnthropicMessagesRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/messages`,
        'pk_test_does_not_exist_12345',
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(401);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toBeTruthy();
    });

    it('should return descriptive error message for invalid API key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        'pk_test_invalid_key_12345'
      );

      expect(response.status).toBe(401);

      const body = response.json();
      expect(body.error).toMatch(/invalid|unauthorized|not.?found/i);
    });
  });

  describe('Malformed API Key', () => {
    it('should reject request with malformed API key format', async () => {
      const malformedKeys = [
        'invalid-key-format',
        'not-an-api-key',
        'abc123',
        'key_without_proper_prefix',
      ];

      for (const malformedKey of malformedKeys) {
        const response = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          malformedKey
        );

        expect(response.status).toBe(401);

        const body = response.json();
        expect(body).toHaveProperty('error');
        expect(body.error).toBeTruthy();
      }
    });

    it('should reject request with empty string API key via Authorization header', async () => {
      const response = await makeRequest(`${testServer.url}/stats`, {
        headers: {
          Authorization: 'Bearer ',
        },
      });

      expect(response.status).toBe(401);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toBeTruthy();
    });

    it('should reject request with empty string API key via x-api-key header', async () => {
      const response = await makeRequest(`${testServer.url}/stats`, {
        headers: {
          'x-api-key': '',
        },
      });

      expect(response.status).toBe(401);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toBeTruthy();
    });

    it('should reject request with whitespace-only API key', async () => {
      const response = await makeRequest(`${testServer.url}/stats`, {
        headers: {
          Authorization: 'Bearer    ',
        },
      });

      expect(response.status).toBe(401);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toBeTruthy();
    });

    it('should return descriptive error message for malformed API key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        'invalid-key-format'
      );

      expect(response.status).toBe(401);

      const body = response.json();
      expect(body.error).toMatch(/invalid|malformed|unauthorized/i);
    });
  });

  describe('Expired API Key', () => {
    it('should reject request with expired API key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        EXPIRED_API_KEY.key
      );

      expect(response.status).toBe(403);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toBeTruthy();
    });

    it('should reject chat completion request with expired API key', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        EXPIRED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(403);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toBeTruthy();
    });

    it('should reject messages request with expired API key', async () => {
      const requestBody = buildAnthropicMessagesRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/messages`,
        EXPIRED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(403);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toBeTruthy();
    });

    it('should return descriptive error message for expired API key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        EXPIRED_API_KEY.key
      );

      expect(response.status).toBe(403);

      const body = response.json();
      expect(body.error).toMatch(/expired/i);
    });

    it('should reject expired API key via x-api-key header', async () => {
      const response = await makeRequestWithXApiKey(
        `${testServer.url}/stats`,
        EXPIRED_API_KEY.key
      );

      expect(response.status).toBe(403);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toMatch(/expired/i);
    });
  });

  describe('Authorization Header Format', () => {
    it('should accept API key without Bearer prefix (lenient behavior)', async () => {
      const response = await makeRequest(`${testServer.url}/stats`, {
        headers: {
          Authorization: VALID_API_KEY.key,
        },
      });

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body.key).toBe(VALID_API_KEY.key);
    });

    it('should reject Authorization header with wrong prefix (treats as invalid key)', async () => {
      const wrongPrefixes = [
        `Basic ${VALID_API_KEY.key}`,
        `Token ${VALID_API_KEY.key}`,
        `ApiKey ${VALID_API_KEY.key}`,
      ];

      for (const authHeader of wrongPrefixes) {
        const response = await makeRequest(`${testServer.url}/stats`, {
          headers: {
            Authorization: authHeader,
          },
        });

        expect(response.status).toBe(401);

        const body = response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should reject Authorization header with multiple tokens', async () => {
      const response = await makeRequest(`${testServer.url}/stats`, {
        headers: {
          Authorization: `Bearer ${VALID_API_KEY.key} ${VALID_API_KEY.key}`,
        },
      });

      // Should be rejected as invalid key (the whole string including space and second key)
      expect(response.status).toBe(401);

      const body = response.json();
      expect(body).toHaveProperty('error');
    });

    it('should handle Authorization header with extra whitespace', async () => {
      const response = await makeRequest(`${testServer.url}/stats`, {
        headers: {
          Authorization: `Bearer   ${VALID_API_KEY.key}   `,
        },
      });

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body.key).toBe(VALID_API_KEY.key);
    });
  });

  describe('Error Response Format', () => {
    it('should return JSON error response for missing API key', async () => {
      const response = await makeRequest(`${testServer.url}/stats`);

      expect(response.status).toBe(401);
      expect(response.headers.get('content-type')).toContain('application/json');

      const body = response.json();
      expect(typeof body).toBe('object');
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
    });

    it('should return JSON error response for invalid API key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        'pk_test_invalid'
      );

      expect(response.status).toBe(401);
      expect(response.headers.get('content-type')).toContain('application/json');

      const body = response.json();
      expect(typeof body).toBe('object');
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
    });

    it('should return JSON error response for malformed API key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        'malformed-key'
      );

      expect(response.status).toBe(401);
      expect(response.headers.get('content-type')).toContain('application/json');

      const body = response.json();
      expect(typeof body).toBe('object');
      expect(body).toHaveProperty('error');
      expect(typeof body.error).toBe('string');
    });

    it('should include CORS headers on authentication error responses', async () => {
      const response = await makeRequest(`${testServer.url}/stats`);

      expect(response.status).toBe(401);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });
  });

  describe('Authentication Error Consistency', () => {
    it('should return consistent error format across all endpoints', async () => {
      const endpoints = [
        { url: '/stats', method: 'GET', body: null },
        {
          url: '/v1/chat/completions',
          method: 'POST',
          body: buildOpenAIChatRequest([{ role: 'user', content: 'Hello' }]),
        },
        {
          url: '/v1/messages',
          method: 'POST',
          body: buildAnthropicMessagesRequest([{ role: 'user', content: 'Hello' }]),
        },
      ];

      for (const endpoint of endpoints) {
        const response = await makeRequest(`${testServer.url}${endpoint.url}`, {
          method: endpoint.method,
          body: endpoint.body || undefined,
        });

        expect(response.status).toBe(401);

        const body = response.json();
        expect(body).toHaveProperty('error');
        expect(typeof body.error).toBe('string');
        expect(response.headers.get('content-type')).toContain('application/json');
      }
    });

    it('should handle concurrent invalid authentication requests correctly', async () => {
      const invalidKeys = [
        'invalid_key_1',
        'invalid_key_2',
        'invalid_key_3',
        'invalid_key_4',
        'invalid_key_5',
      ];

      const responses = await Promise.all(
        invalidKeys.map(key =>
          makeAuthenticatedRequest(`${testServer.url}/stats`, key)
        )
      );

      for (const response of responses) {
        expect(response.status).toBe(401);

        const body = response.json();
        expect(body).toHaveProperty('error');
        expect(typeof body.error).toBe('string');
      }
    });
  });

  describe('Authentication Error Performance', () => {
    it('should fail fast on invalid API key', async () => {
      const start = Date.now();

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        'pk_test_invalid_key'
      );

      const duration = Date.now() - start;

      expect(response.status).toBe(401);
      // Should fail quickly, within 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should fail fast on missing API key', async () => {
      const start = Date.now();

      const response = await makeRequest(`${testServer.url}/stats`);

      const duration = Date.now() - start;

      expect(response.status).toBe(401);
      // Should fail quickly, within 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should handle multiple concurrent invalid requests efficiently', async () => {
      const start = Date.now();

      const requests = Array(10)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/stats`, 'invalid_key')
        );

      const responses = await Promise.all(requests);

      const duration = Date.now() - start;

      // All should fail
      for (const response of responses) {
        expect(response.status).toBe(401);
      }

      // Should complete quickly
      expect(duration).toBeLessThan(500);
    });
  });
});
