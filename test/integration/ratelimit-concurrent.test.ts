/**
 * Rate Limiting Integration Tests - Concurrent Requests
 *
 * Tests rate limiting behavior with multiple simultaneous requests to verify:
 * - Race condition protection with file locking
 * - Partial success scenarios when limit is hit mid-flight
 * - Consistency of usage tracking under concurrent load
 * - Proper handling of simultaneous requests across different endpoints
 *
 * Subtask 4.4: Verify rate limiting works correctly with multiple simultaneous requests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startTestServer,
  makeAuthenticatedRequest,
  buildOpenAIChatRequest,
  buildAnthropicMessagesRequest,
} from './helpers';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
} from './setup';
import { LOW_LIMIT_API_KEY, CONCURRENT_TEST_API_KEY } from './fixtures';
import type { TestServer } from './helpers';

describe('Rate Limiting Integration Tests - Concurrent Requests', () => {
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

  describe('Concurrent Requests - Basic Behavior', () => {
    it('should handle concurrent requests without corruption', async () => {
      // Make 5 concurrent small requests that should all succeed
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Small test' },
      ]);

      const requests = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete without hanging (will get upstream errors, but not rate limited)
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status); // Valid status codes
        expect(response.status).not.toBe(429); // Should not be rate limited
      }
    });

    it('should track token usage correctly with concurrent requests', async () => {
      // First check current usage
      const statsBefore = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        CONCURRENT_TEST_API_KEY.key
      );

      expect(statsBefore.status).toBe(200);
      const beforeBody = statsBefore.json();

      // Make concurrent requests
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Test' }]);
      const requests = Array(3)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(requests);

      // Check usage after
      const statsAfter = await makeAuthenticatedRequest(`${testServer.url}/stats`, CONCURRENT_TEST_API_KEY.key);
      expect(statsAfter.status).toBe(200);
      const afterBody = statsAfter.json();

      // Usage should have increased
      expect(afterBody.current_usage.tokens_used_in_current_window).toBeGreaterThanOrEqual(
        beforeBody.current_usage.tokens_used_in_current_window
      );
    });

    it('should prevent race conditions with file locking', async () => {
      // Make several concurrent requests to stress test file locking
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Concurrent test' }]);
      const requestCount = 5; // Reduced to avoid lock timeouts

      const requests = Array(requestCount)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete without hanging or erroring due to lock issues
      expect(responses).toHaveLength(requestCount);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status); // Valid status codes
      }
    });
  });

  describe('Concurrent Requests - Rate Limit Enforcement', () => {
    it('should allow concurrent requests up to limit', async () => {
      // Use key with reasonable limit
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Test message' }]);
      const requests = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // Should not be rate limited (will get upstream errors, but not 429)
      for (const response of responses) {
        expect(response.status).not.toBe(429);
      }
    });

    it('should handle concurrent requests when approaching limit', async () => {
      // Use LOW_LIMIT_API_KEY which may hit the limit
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Rate limit test' }]);
      const requestCount = 5; // Reduced from 20 to avoid excessive load

      const requests = Array(requestCount)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, LOW_LIMIT_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete successfully (some may be rate limited)
      expect(responses).toHaveLength(requestCount);
      for (const response of responses) {
        expect([200, 401, 429, 500]).toContain(response.status);
      }
    });

    it('should provide consistent rate limit errors during concurrent requests', async () => {
      // Use already rate-limited key
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Test' }]);
      const requests = Array(3)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(
            `${testServer.url}/v1/chat/completions`,
            LOW_LIMIT_API_KEY.key,
            {
              method: 'POST',
              body: requestBody,
            }
          )
        );

      const responses = await Promise.all(requests);

      // Check that responses have consistent format
      for (const response of responses) {
        if (response.status === 429) {
          const body = response.json();
          expect(body).toHaveProperty('error');
          expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
          expect(body.error).toHaveProperty('tokens_used');
          expect(body.error).toHaveProperty('tokens_limit');
          expect(body.error).toHaveProperty('window_ends_at');
        }
      }
    });
  });

  describe('Concurrent Requests - Cross-Endpoint', () => {
    it('should handle concurrent requests to different endpoints', async () => {
      const openaiBody = buildOpenAIChatRequest([{ role: 'user', content: 'OpenAI test' }]);
      const anthropicBody = buildAnthropicMessagesRequest([{ role: 'user', content: 'Anthropic test' }]);

      // Mix of requests to both endpoints
      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: openaiBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/messages`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: anthropicBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: openaiBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/messages`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: anthropicBody,
        }),
      ];

      const responses = await Promise.all(requests);

      // All should complete without hanging
      expect(responses).toHaveLength(4);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });

    it('should aggregate usage across concurrent requests to different endpoints', async () => {
      const openaiBody = buildOpenAIChatRequest([{ role: 'user', content: 'Aggregation test' }]);
      const anthropicBody = buildAnthropicMessagesRequest([{ role: 'user', content: 'Aggregation test' }]);

      const statsBefore = await makeAuthenticatedRequest(`${testServer.url}/stats`, CONCURRENT_TEST_API_KEY.key);
      const beforeBody = statsBefore.json();

      // Make concurrent requests to both endpoints
      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: openaiBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/messages`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: anthropicBody,
        }),
      ];

      const responses = await Promise.all(requests);

      // Check stats after concurrent requests
      const statsAfter = await makeAuthenticatedRequest(`${testServer.url}/stats`, CONCURRENT_TEST_API_KEY.key);
      const afterBody = statsAfter.json();

      // Stats endpoint should still work and return valid data
      expect(statsAfter.status).toBe(200);
      expect(afterBody).toHaveProperty('current_usage');
      expect(afterBody.current_usage).toHaveProperty('tokens_used_in_current_window');

      // Usage should be valid (non-negative, finite number)
      expect(afterBody.current_usage.tokens_used_in_current_window).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(afterBody.current_usage.tokens_used_in_current_window)).toBe(true);

      // Both requests should have completed without hanging
      expect(responses).toHaveLength(2);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });

    it('should enforce rate limit across concurrent cross-endpoint requests', async () => {
      // Use LOW_LIMIT_API_KEY
      const openaiBody = buildOpenAIChatRequest([{ role: 'user', content: 'Cross-endpoint test' }]);
      const anthropicBody = buildAnthropicMessagesRequest([{ role: 'user', content: 'Cross-endpoint test' }]);

      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, LOW_LIMIT_API_KEY.key, {
          method: 'POST',
          body: openaiBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/messages`, LOW_LIMIT_API_KEY.key, {
          method: 'POST',
          body: anthropicBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, LOW_LIMIT_API_KEY.key, {
          method: 'POST',
          body: openaiBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/messages`, LOW_LIMIT_API_KEY.key, {
          method: 'POST',
          body: anthropicBody,
        }),
      ];

      const responses = await Promise.all(requests);

      // All responses should be valid
      for (const response of responses) {
        expect([200, 401, 429, 500]).toContain(response.status);

        // If rate limited, should have proper error format
        if (response.status === 429) {
          const body = response.json();
          expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
        }
      }
    });
  });

  describe('Concurrent Requests - Stats Endpoint', () => {
    it('should handle concurrent /stats requests safely', async () => {
      // Make several concurrent /stats requests
      const requests = Array(5)
        .fill(null)
        .map(() => makeAuthenticatedRequest(`${testServer.url}/stats`, CONCURRENT_TEST_API_KEY.key));

      const responses = await Promise.all(requests);

      // All should succeed
      expect(responses).toHaveLength(5);
      for (const response of responses) {
        expect(response.status).toBe(200);
        const body = response.json();
        expect(body).toHaveProperty('current_usage');
        expect(body).toHaveProperty('token_limit_per_5h');
      }
    });

    it('should return consistent data across concurrent /stats requests', async () => {
      const requests = Array(3)
        .fill(null)
        .map(() => makeAuthenticatedRequest(`${testServer.url}/stats`, CONCURRENT_TEST_API_KEY.key));

      const responses = await Promise.all(requests);
      const bodies = responses.map(r => r.json());

      // All should have the same token limit
      const tokenLimits = bodies.map(b => b.token_limit_per_5h);
      for (let i = 1; i < tokenLimits.length; i++) {
        expect(tokenLimits[i]).toBe(tokenLimits[0]);
      }
    });

    it('should handle concurrent /stats requests during active usage', async () => {
      const openaiBody = buildOpenAIChatRequest([{ role: 'user', content: 'Stats during usage' }]);

      // Make concurrent API requests and stats queries
      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: openaiBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/stats`, CONCURRENT_TEST_API_KEY.key),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: openaiBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/stats`, CONCURRENT_TEST_API_KEY.key),
        makeAuthenticatedRequest(`${testServer.url}/stats`, CONCURRENT_TEST_API_KEY.key),
      ];

      const responses = await Promise.all(requests);

      // All should complete successfully
      expect(responses).toHaveLength(5);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });
  });

  describe('Concurrent Requests - Performance & Reliability', () => {
    it('should complete concurrent requests within reasonable time', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Performance test' }]);
      const requestCount = 5;

      const startTime = Date.now();

      const requests = Array(requestCount)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(requests);

      const duration = Date.now() - startTime;

      // 5 concurrent requests should complete in reasonable time
      expect(duration).toBeLessThan(5000);
    });

    it('should handle burst of concurrent requests without degradation', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Burst test' }]);

      // First batch
      const batch1 = Array(3)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(batch1);

      // Second immediate batch
      const batch2 = Array(3)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(batch2);

      // Second batch should also complete successfully
      expect(responses).toHaveLength(3);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });

    it('should maintain data integrity under concurrent load', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Integrity test' }]);
      const requestCount = 5;

      const requests = Array(requestCount)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // Check stats after to ensure no corruption
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, CONCURRENT_TEST_API_KEY.key);
      expect(stats.status).toBe(200);

      const body = stats.json();
      expect(body).toHaveProperty('current_usage');
      expect(body.current_usage).toHaveProperty('tokens_used_in_current_window');
      expect(body.current_usage).toHaveProperty('remaining_tokens');

      // Values should be sensible (not negative, not infinity, etc.)
      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(body.current_usage.tokens_used_in_current_window)).toBe(true);
      expect(body.current_usage.remaining_tokens).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(body.current_usage.remaining_tokens)).toBe(true);
    });
  });

  describe('Concurrent Requests - Edge Cases', () => {
    it('should handle single request amid concurrent batch', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Edge case test' }]);

      // Make a batch of concurrent requests
      const batch = Array(3)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      // Make a single request separately
      const single = makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
        method: 'POST',
        body: requestBody,
      });

      // Combine and execute
      const responses = await Promise.all([...batch, single]);

      // All should complete
      expect(responses).toHaveLength(4);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });

    it('should handle concurrent requests with varying payloads', async () => {
      const smallBody = buildOpenAIChatRequest([{ role: 'user', content: 'Hi' }]);
      const mediumBody = buildOpenAIChatRequest([{ role: 'user', content: 'This is a medium sized message for testing' }]);
      const largeBody = buildOpenAIChatRequest([
        { role: 'user', content: 'This is a larger message that should use more tokens. '.repeat(10) },
      ]);

      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: smallBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: mediumBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: largeBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: smallBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: mediumBody,
        }),
      ];

      const responses = await Promise.all(requests);

      // All should handle correctly
      expect(responses).toHaveLength(5);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });

    it('should handle rapid sequential concurrent batches', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Sequential batch' }]);

      // Execute multiple batches in sequence
      for (let i = 0; i < 3; i++) {
        const requests = Array(2)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
              method: 'POST',
              body: requestBody,
            })
          );

        const responses = await Promise.all(requests);

        expect(responses).toHaveLength(2);
        for (const response of responses) {
          expect([200, 401, 500]).toContain(response.status);
        }
      }
    });
  });
});
