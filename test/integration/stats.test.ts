/**
 * Stats Endpoint Integration Tests
 *
 * Tests the /stats endpoint for correct API key information,
 * usage statistics, rate limit data, and expiry status.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, makeAuthenticatedRequest, validateStatsResponse } from './helpers';
import { setupTestEnvironment, teardownTestEnvironment } from './setup';
import {
  VALID_API_KEY,
  EXPIRED_API_KEY,
  EXPIRING_SOON_API_KEY,
  LOW_LIMIT_API_KEY,
  RATE_LIMITED_API_KEY,
  MULTI_WINDOW_API_KEY,
  CUSTOM_MODEL_API_KEY,
} from './fixtures';
import type { TestServer } from './helpers';

describe('Stats Endpoint Integration Tests', () => {
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

  describe('GET /stats - Basic Response Format', () => {
    it('should return 200 OK status with valid API key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      expect(response.status).toBe(200);
    });

    it('should require authentication', async () => {
      const response = await fetch(`${testServer.url}/stats`);

      expect(response.status).toBe(401);
    });

    it('should return JSON content type', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      expect(response.headers.get('content-type')).toContain('application/json');
    });

    it('should return all required fields', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      const requiredFields = [
        'key',
        'name',
        'model',
        'token_limit_per_5h',
        'expiry_date',
        'created_at',
        'last_used',
        'is_expired',
        'current_usage',
        'total_lifetime_tokens',
      ];

      for (const field of requiredFields) {
        expect(body).toHaveProperty(field);
      }
    });

    it('should validate response using helper function', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      expect(() => validateStatsResponse(response, VALID_API_KEY.key)).not.toThrow();
    });
  });

  describe('GET /stats - API Key Information', () => {
    it('should return correct API key value', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.key).toBe(VALID_API_KEY.key);
    });

    it('should return correct API key name', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.name).toBe(VALID_API_KEY.name);
    });

    it('should return correct model', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.model).toBe(VALID_API_KEY.model);
    });

    it('should return custom model when configured', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        CUSTOM_MODEL_API_KEY.key
      );
      const body = response.json();

      expect(body.model).toBe(CUSTOM_MODEL_API_KEY.model);
    });

    it('should return correct token limit', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.token_limit_per_5h).toBe(VALID_API_KEY.token_limit_per_5h);
      expect(typeof body.token_limit_per_5h).toBe('number');
    });

    it('should return low token limit correctly', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        LOW_LIMIT_API_KEY.key
      );
      const body = response.json();

      expect(body.token_limit_per_5h).toBe(LOW_LIMIT_API_KEY.token_limit_per_5h);
      expect(body.token_limit_per_5h).toBeLessThan(VALID_API_KEY.token_limit_per_5h);
    });
  });

  describe('GET /stats - Usage Statistics', () => {
    it('should return total lifetime tokens', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.total_lifetime_tokens).toBe(VALID_API_KEY.total_lifetime_tokens);
      expect(typeof body.total_lifetime_tokens).toBe('number');
      expect(body.total_lifetime_tokens).toBeGreaterThanOrEqual(0);
    });

    it('should return current_usage object', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.current_usage).toBeDefined();
      expect(typeof body.current_usage).toBe('object');
    });

    it('should return tokens used in current window', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.current_usage).toHaveProperty('tokens_used_in_current_window');
      expect(typeof body.current_usage.tokens_used_in_current_window).toBe('number');
      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThanOrEqual(0);
    });

    it('should return correct window start time', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.current_usage).toHaveProperty('window_started_at');
      expect(typeof body.current_usage.window_started_at).toBe('string');

      // Verify it's a valid ISO date string
      const date = new Date(body.current_usage.window_started_at);
      expect(date.toISOString()).toBe(body.current_usage.window_started_at);
    });

    it('should return correct window end time', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.current_usage).toHaveProperty('window_ends_at');
      expect(typeof body.current_usage.window_ends_at).toBe('string');

      // Verify it's a valid ISO date string
      const date = new Date(body.current_usage.window_ends_at);
      expect(date.toISOString()).toBe(body.current_usage.window_ends_at);
    });

    it('should return remaining tokens', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.current_usage).toHaveProperty('remaining_tokens');
      expect(typeof body.current_usage.remaining_tokens).toBe('number');
      expect(body.current_usage.remaining_tokens).toBeGreaterThanOrEqual(0);
    });

    it('should calculate remaining tokens correctly', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        LOW_LIMIT_API_KEY.key
      );
      const body = response.json();

      const expectedRemaining =
        LOW_LIMIT_API_KEY.token_limit_per_5h -
        body.current_usage.tokens_used_in_current_window;

      expect(body.current_usage.remaining_tokens).toBe(expectedRemaining);
    });
  });

  describe('GET /stats - Rate Limit Data', () => {
    it('should return rate limit information for valid key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.token_limit_per_5h).toBeDefined();
      expect(body.current_usage.tokens_used_in_current_window).toBeDefined();
      expect(body.current_usage.remaining_tokens).toBeDefined();
    });

    it('should show usage for rate-limited key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        RATE_LIMITED_API_KEY.key
      );
      const body = response.json();

      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThan(0);
      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThan(
        body.token_limit_per_5h
      );
    });

    it('should return zero or negative remaining for rate-limited key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        RATE_LIMITED_API_KEY.key
      );
      const body = response.json();

      // Remaining should be 0 or negative since tokens_used > limit
      expect(body.current_usage.remaining_tokens).toBeLessThanOrEqual(0);
    });

    it('should aggregate usage across multiple windows', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        MULTI_WINDOW_API_KEY.key
      );
      const body = response.json();

      // The tokens used should reflect the sum of windows within the 5-hour period
      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThan(0);
    });

    it('should return window timestamps in ISO 8601 format', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      const windowStart = new Date(body.current_usage.window_started_at);
      const windowEnd = new Date(body.current_usage.window_ends_at);

      expect(() => new Date(windowStart)).not.toThrow();
      expect(() => new Date(windowEnd)).not.toThrow();
      expect(windowStart.toISOString()).toBe(body.current_usage.window_started_at);
      expect(windowEnd.toISOString()).toBe(body.current_usage.window_ends_at);
    });

    it('should have window end after window start', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      const windowStart = new Date(body.current_usage.window_started_at);
      const windowEnd = new Date(body.current_usage.window_ends_at);

      expect(windowEnd.getTime()).toBeGreaterThan(windowStart.getTime());
    });
  });

  describe('GET /stats - Expiry Status', () => {
    it('should return expiry_date', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.expiry_date).toBeDefined();
      expect(typeof body.expiry_date).toBe('string');

      // Verify it's a valid ISO date string
      expect(() => new Date(body.expiry_date)).not.toThrow();
      const date = new Date(body.expiry_date);
      expect(date.toISOString()).toBeTruthy();
    });

    it('should return correct expiry date for valid key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.expiry_date).toBe(VALID_API_KEY.expiry_date);
    });

    it('should return is_expired boolean', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body).toHaveProperty('is_expired');
      expect(typeof body.is_expired).toBe('boolean');
    });

    it('should mark valid key as not expired', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.is_expired).toBe(false);
    });

    it('should mark expiring soon key as not expired', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        EXPIRING_SOON_API_KEY.key
      );
      const body = response.json();

      // Even if expiring soon, it's not expired yet
      expect(body.is_expired).toBe(false);
    });

    it('should match is_expired with expiry_date comparison', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      const expiryDate = new Date(body.expiry_date);
      const now = new Date();
      const shouldBeExpired = expiryDate < now;

      expect(body.is_expired).toBe(shouldBeExpired);
      expect(shouldBeExpired).toBe(false);
    });
  });

  describe('GET /stats - Timestamp Fields', () => {
    it('should return created_at timestamp', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.created_at).toBeDefined();
      expect(typeof body.created_at).toBe('string');

      // Verify it's a valid ISO date string
      expect(() => new Date(body.created_at)).not.toThrow();
      const date = new Date(body.created_at);
      expect(date.toISOString()).toBeTruthy();
    });

    it('should return last_used timestamp', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.last_used).toBeDefined();
      expect(typeof body.last_used).toBe('string');

      // Verify it's a valid ISO date string
      expect(() => new Date(body.last_used)).not.toThrow();
      const date = new Date(body.last_used);
      expect(date.toISOString()).toBeTruthy();
    });

    it('should return correct created_at for API key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      // Compare dates as Date objects to handle millisecond differences
      const expectedDate = new Date(VALID_API_KEY.created_at);
      const actualDate = new Date(body.created_at);
      expect(actualDate.getTime()).toBe(expectedDate.getTime());
    });

    it('should return correct last_used for API key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      // Compare dates as Date objects to handle millisecond differences
      const expectedDate = new Date(VALID_API_KEY.last_used);
      const actualDate = new Date(body.last_used);
      expect(actualDate.getTime()).toBe(expectedDate.getTime());
    });

    it('should have created_at before or at last_used', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      const createdAt = new Date(body.created_at);
      const lastUsed = new Date(body.last_used);

      expect(lastUsed.getTime()).toBeGreaterThanOrEqual(createdAt.getTime());
    });
  });

  describe('GET /stats - Authentication Methods', () => {
    it('should work with Authorization header', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      expect(response.status).toBe(200);
    });

    it('should work with x-api-key header', async () => {
      const response = await fetch(`${testServer.url}/stats`, {
        method: 'GET',
        headers: {
          'x-api-key': VALID_API_KEY.key,
        },
      });

      expect(response.status).toBe(200);
    });

    it('should fail without authentication', async () => {
      const response = await fetch(`${testServer.url}/stats`);

      expect(response.status).toBe(401);
    });

    it('should fail with invalid API key', async () => {
      const response = await fetch(`${testServer.url}/stats`, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer invalid_key_12345',
        },
      });

      expect(response.status).toBe(401);
    });

    it('should fail with malformed Authorization header', async () => {
      const response = await fetch(`${testServer.url}/stats`, {
        method: 'GET',
        headers: {
          Authorization: 'invalid_format',
        },
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Stats Endpoint Edge Cases', () => {
    it('should be consistent across multiple requests', async () => {
      const responses = await Promise.all([
        makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key),
        makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key),
        makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key),
      ]);

      // All should return 200
      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      // All should have same key info
      const keys = responses.map(r => r.json().key);
      for (const key of keys) {
        expect(key).toBe(VALID_API_KEY.key);
      }
    });

    it('should handle requests with query parameters', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats?test=1&foo=bar`,
        VALID_API_KEY.key
      );

      expect(response.status).toBe(200);
      expect(response.json()).toHaveProperty('key');
    });

    it('should handle requests with custom headers', async () => {
      const response = await fetch(`${testServer.url}/stats`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${VALID_API_KEY.key}`,
          'X-Custom-Header': 'test-value',
          'User-Agent': 'Test-Agent/1.0',
        },
      });

      expect(response.status).toBe(200);
    });

    it('should be fast to respond', async () => {
      const start = Date.now();
      await makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key);
      const duration = Date.now() - start;

      // Should respond within 100ms
      expect(duration).toBeLessThan(100);
    });

    it('should handle concurrent requests', async () => {
      const requests = Array(10)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key)
        );

      const responses = await Promise.all(requests);

      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(response.json()).toHaveProperty('key');
      }
    });
  });

  describe('GET /stats - Different API Key Scenarios', () => {
    it('should return stats for key with custom model', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        CUSTOM_MODEL_API_KEY.key
      );
      const body = response.json();

      expect(body.key).toBe(CUSTOM_MODEL_API_KEY.key);
      expect(body.model).toBe(CUSTOM_MODEL_API_KEY.model);
      expect(body.name).toBe(CUSTOM_MODEL_API_KEY.name);
    });

    it('should return stats for low limit key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        LOW_LIMIT_API_KEY.key
      );
      const body = response.json();

      expect(body.key).toBe(LOW_LIMIT_API_KEY.key);
      expect(body.token_limit_per_5h).toBe(LOW_LIMIT_API_KEY.token_limit_per_5h);
    });

    it('should return stats for multi-window key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        MULTI_WINDOW_API_KEY.key
      );
      const body = response.json();

      expect(body.key).toBe(MULTI_WINDOW_API_KEY.key);
      expect(body.total_lifetime_tokens).toBe(MULTI_WINDOW_API_KEY.total_lifetime_tokens);
      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThan(0);
    });

    it('should handle key with no usage windows', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );
      const body = response.json();

      expect(body.current_usage).toBeDefined();
      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /stats - CORS Headers', () => {
    it('should include CORS headers', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      expect(response.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('should handle OPTIONS preflight request', async () => {
      const response = await fetch(`${testServer.url}/stats`, {
        method: 'OPTIONS',
      });

      // OPTIONS should be handled by CORS middleware
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);

      // Should have CORS headers
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });
  });
});
