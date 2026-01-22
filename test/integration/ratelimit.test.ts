/**
 * Rate Limiting Integration Tests - Enforcement
 *
 * Tests rate limiting enforcement to verify requests are blocked when token limit
 * is exceeded within the 5-hour window.
 *
 * Subtask 4.1: Verify requests are blocked when token limit is exceeded within 5-hour window
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startTestServer,
  makeAuthenticatedRequest,
  makeRequestWithXApiKey,
  buildOpenAIChatRequest,
  buildAnthropicMessagesRequest,
} from './helpers';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
} from './setup';
import { RATE_LIMITED_API_KEY, LOW_LIMIT_API_KEY } from './fixtures';
import type { TestServer } from './helpers';

describe('Rate Limiting Integration Tests - Enforcement', () => {
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

  describe('Rate Limit Exceeded - Basic Behavior', () => {
    it('should block request when token limit is exceeded', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(429);

      const body = response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
      expect(body.error).toHaveProperty('message');
      expect(body.error.message).toMatch(/token.?limit|exceeded/i);
    });

    it('should return token usage information in error response', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(429);

      const body = response.json();
      expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
      expect(body.error).toHaveProperty('tokens_used');
      expect(body.error).toHaveProperty('tokens_limit');
      expect(body.error).toHaveProperty('window_ends_at');

      expect(typeof body.error.tokens_used).toBe('number');
      expect(typeof body.error.tokens_limit).toBe('number');
      expect(typeof body.error.window_ends_at).toBe('string');

      // Verify tokens_used exceeds tokens_limit
      expect(body.error.tokens_used).toBeGreaterThan(body.error.tokens_limit);
    });

    it('should include Retry-After header in rate limit response', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(429);

      const retryAfter = response.headers.get('Retry-After');
      expect(retryAfter).toBeTruthy();

      // Retry-After should be a number (seconds)
      const retryAfterNum = parseInt(retryAfter!, 10);
      expect(retryAfterNum).toBeGreaterThan(0);
      expect(retryAfterNum).toBeLessThanOrEqual(5 * 60 * 60); // Max 5 hours
    });

    it('should return JSON content type for rate limit error', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(429);
      expect(response.headers.get('content-type')).toContain('application/json');
    });

    it('should include CORS headers on rate limit error', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(429);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });
  });

  describe('Rate Limiting - /stats Endpoint', () => {
    it('should still allow /stats request when rate limit exceeded', async () => {
      // The /stats endpoint is designed to work even when rate limited
      // so users can check their current usage
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        RATE_LIMITED_API_KEY.key
      );

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body).toHaveProperty('current_usage');
      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThan(
        body.token_limit_per_5h
      );
    });

    it('should show rate limit status in /stats response', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        RATE_LIMITED_API_KEY.key
      );

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThan(
        body.token_limit_per_5h
      );
      expect(body.current_usage.remaining_tokens).toBe(0);
    });

    it('should return correct usage data for rate-limited key', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        RATE_LIMITED_API_KEY.key
      );

      expect(response.status).toBe(200);

      const body = response.json();
      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThan(
        RATE_LIMITED_API_KEY.token_limit_per_5h
      );
      expect(body.token_limit_per_5h).toBe(RATE_LIMITED_API_KEY.token_limit_per_5h);
    });
  });

  describe('Rate Limiting - /v1/chat/completions Endpoint', () => {
    it('should block chat completion request when rate limit exceeded', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(429);

      const body = response.json();
      expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
      expect(body.error).toHaveProperty('message');
    });

    it('should include retry information in chat completion rate limit error', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Test message' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(429);

      const retryAfter = response.headers.get('Retry-After');
      expect(retryAfter).toBeTruthy();

      const body = response.json();
      expect(body.error).toHaveProperty('window_ends_at');
    });

    it('should block streaming chat completion request when rate limit exceeded', async () => {
      const requestBody = buildOpenAIChatRequest(
        [{ role: 'user', content: 'Hello' }],
        'glm-4'
      );

      // Modify request to be streaming
      const streamingBody = requestBody.replace('"stream": false', '"stream": true');

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: streamingBody,
        }
      );

      expect(response.status).toBe(429);

      const body = response.json();
      expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
    });

    it('should rate limit before processing request body', async () => {
      // Rate limiting should happen early in the middleware pipeline
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Long message that should not be processed' },
      ]);

      const startTime = Date.now();
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );
      const duration = Date.now() - startTime;

      // Should fail fast without processing the request
      expect(response.status).toBe(429);
      expect(duration).toBeLessThan(100); // Should be very fast
    });
  });

  describe('Rate Limiting - /v1/messages Endpoint', () => {
    it('should block messages request when rate limit exceeded', async () => {
      const requestBody = buildAnthropicMessagesRequest([
        { role: 'user', content: 'Hello' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/messages`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(429);

      const body = response.json();
      expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
      expect(body.error).toHaveProperty('message');
    });

    it('should include retry information in messages rate limit error', async () => {
      const requestBody = buildAnthropicMessagesRequest([
        { role: 'user', content: 'Test message' },
      ]);

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/messages`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(429);

      const retryAfter = response.headers.get('Retry-After');
      expect(retryAfter).toBeTruthy();

      const body = response.json();
      expect(body.error).toHaveProperty('window_ends_at');
    });

    it('should block streaming messages request when rate limit exceeded', async () => {
      const requestBody = buildAnthropicMessagesRequest(
        [{ role: 'user', content: 'Hello' }],
        'claude-3-5-sonnet-20241022'
      );

      // Modify request to be streaming
      const streamingBody = requestBody.replace('"stream": false', '"stream": true');

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/messages`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: streamingBody,
        }
      );

      expect(response.status).toBe(429);

      const body = response.json();
      expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
    });

    it('should rate limit before processing Anthropic request', async () => {
      const requestBody = buildAnthropicMessagesRequest([
        { role: 'user', content: 'Long Anthropic message' },
      ]);

      const startTime = Date.now();
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/messages`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );
      const duration = Date.now() - startTime;

      // Should fail fast without processing
      expect(response.status).toBe(429);
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Rate Limiting with Multiple Usage Windows', () => {
    it('should sum tokens from all active windows correctly', async () => {
      // The RATE_LIMITED_API_KEY has 12000 tokens used in one window
      // Verify this is correctly reported
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        RATE_LIMITED_API_KEY.key
      );

      expect(response.status).toBe(200);

      const body = response.json();
      // Should report 12000 tokens used
      expect(body.current_usage.tokens_used_in_current_window).toBe(12000);
      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThan(
        body.token_limit_per_5h
      );
    });

    it('should enforce limit based on sum of all windows', async () => {
      // RATE_LIMITED_API_KEY has 12000 tokens used vs 10000 limit
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Hello' }]);
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(429);

      const body = response.json();
      expect(body.error.tokens_used).toBe(12000);
      expect(body.error.tokens_limit).toBe(10000);
    });
  });

  describe('Rate Limiting - Edge Cases', () => {
    it('should handle API key significantly over limit', async () => {
      // RATE_LIMITED_API_KEY has 12000 used vs 10000 limit (20% over)
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Hello' }]);
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(429);

      const body = response.json();
      expect(body.error.tokens_used).toBe(12000);
      expect(body.error.tokens_limit).toBe(10000);
      // Verify it's over by expected amount
      expect(body.error.tokens_used - body.error.tokens_limit).toBe(2000);
    });

    it('should handle API key at limit boundary', async () => {
      // LOW_LIMIT_API_KEY has 5000 limit and only 1000 used, so should be allowed
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Hello' }]);
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        LOW_LIMIT_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      // Should not be rate limited (will get upstream error, but not 429)
      expect(response.status).not.toBe(429);
    });

    it('should correctly report remaining tokens', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        LOW_LIMIT_API_KEY.key
      );

      expect(response.status).toBe(200);

      const body = response.json();
      // LOW_LIMIT_API_KEY has 5000 limit and 0 used in current window
      expect(body.token_limit_per_5h).toBe(5000);
      expect(body.current_usage.tokens_used_in_current_window).toBe(0);
      expect(body.current_usage.remaining_tokens).toBe(5000);
    });
  });

  describe('Rate Limiting - Error Message Quality', () => {
    it('should provide clear error message', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Hello' }]);
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(429);

      const body = response.json();
      expect(body.error.message).toBeTruthy();
      expect(typeof body.error.message).toBe('string');
      expect(body.error.message.length).toBeGreaterThan(0);
    });

    it('should include window end time in error response', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Hello' }]);
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(429);

      const body = response.json();
      expect(body.error.window_ends_at).toBeTruthy();

      // Should be valid ISO date string
      const windowEnd = new Date(body.error.window_ends_at);
      expect(windowEnd.getTime()).not.toBeNaN();
      expect(windowEnd.getTime()).toBeGreaterThan(Date.now());
    });

    it('should provide accurate retry-after seconds', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Hello' }]);
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect(response.status).toBe(429);

      const retryAfter = response.headers.get('Retry-After');
      expect(retryAfter).toBeTruthy();

      const retryAfterSeconds = parseInt(retryAfter!, 10);

      // Get window_ends_at from response body
      const body = response.json();
      const windowEnd = new Date(body.error.window_ends_at);
      const now = new Date();
      const expectedRetryAfter = Math.floor((windowEnd.getTime() - now.getTime()) / 1000);

      // Retry-After should be close to the time until window end
      // Allow small margin of error for test execution time
      expect(Math.abs(retryAfterSeconds - expectedRetryAfter)).toBeLessThan(5);
    });
  });

  describe('Rate Limiting - Consistency', () => {
    it('should consistently block requests for rate-limited key', async () => {
      // Make multiple requests and verify all are blocked
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Hello' }]);
      const requests = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, RATE_LIMITED_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      for (const response of responses) {
        expect(response.status).toBe(429);
        const body = response.json();
        expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
      }
    });

    it('should return consistent error information across requests', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Hello' }]);
      const responses = await Promise.all([
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, RATE_LIMITED_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, RATE_LIMITED_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, RATE_LIMITED_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
      ]);

      // All responses should have same tokens_used and tokens_limit
      const bodies = responses.map(r => r.json());

      for (let i = 1; i < bodies.length; i++) {
        expect(bodies[i].error.tokens_used).toBe(bodies[0].error.tokens_used);
        expect(bodies[i].error.tokens_limit).toBe(bodies[0].error.tokens_limit);
      }
    });

    it('should handle concurrent rate-limited requests correctly', async () => {
      const endpoints = [
        {
          url: '/v1/chat/completions',
          body: buildOpenAIChatRequest([{ role: 'user', content: 'Hello' }]),
        },
        {
          url: '/v1/messages',
          body: buildAnthropicMessagesRequest([{ role: 'user', content: 'Hello' }]),
        },
      ];

      const requests = endpoints.map(endpoint =>
        makeAuthenticatedRequest(`${testServer.url}${endpoint.url}`, RATE_LIMITED_API_KEY.key, {
          method: 'POST',
          body: endpoint.body,
        })
      );

      const responses = await Promise.all(requests);

      // All should be rate limited
      for (const response of responses) {
        expect(response.status).toBe(429);
        const body = response.json();
        expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
      }
    });
  });

  describe('Rate Limiting - Performance', () => {
    it('should fail fast on rate limit check', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Hello' }]);
      const start = Date.now();

      await makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, RATE_LIMITED_API_KEY.key, {
        method: 'POST',
        body: requestBody,
      });

      const duration = Date.now() - start;

      // Rate limit check should be very fast
      expect(duration).toBeLessThan(100);
    });

    it('should handle multiple concurrent rate limit checks efficiently', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Hello' }]);
      const start = Date.now();

      // Reduced from 20 to 10 to avoid file locking race conditions in test environment
      const requests = Array(10)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, RATE_LIMITED_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(requests);

      const duration = Date.now() - start;

      // 10 concurrent requests should complete quickly
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Rate Limiting - Cross-Endpoint Consistency', () => {
    it('should report same usage data across all endpoints', async () => {
      const chatRequestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Hello' }]);
      const chatResponse = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: chatRequestBody,
        }
      );

      const messagesRequestBody = buildAnthropicMessagesRequest([{ role: 'user', content: 'Hello' }]);
      const messagesResponse = await makeAuthenticatedRequest(
        `${testServer.url}/v1/messages`,
        RATE_LIMITED_API_KEY.key,
        {
          method: 'POST',
          body: messagesRequestBody,
        }
      );

      expect(chatResponse.status).toBe(429);
      expect(messagesResponse.status).toBe(429);

      const chatBody = chatResponse.json();
      const messagesBody = messagesResponse.json();

      // Both should report same token usage
      expect(chatBody.error.tokens_used).toBe(messagesBody.error.tokens_used);
      expect(chatBody.error.tokens_limit).toBe(messagesBody.error.tokens_limit);
    });
  });
});
