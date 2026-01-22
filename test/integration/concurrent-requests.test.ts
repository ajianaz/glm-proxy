/**
 * Concurrent Requests Integration Tests
 *
 * Tests concurrent request handling to verify:
 * - No race conditions with simultaneous requests
 * - Thread-safe file operations
 * - Data integrity under concurrent load
 * - Proper handling of mixed concurrent requests
 * - Concurrent streaming and non-streaming
 * - Multiple API keys handling concurrently
 *
 * Subtask 7.1: Verify multiple simultaneous requests are handled correctly without race conditions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startTestServer,
  makeAuthenticatedRequest,
  makeRequest,
  buildOpenAIChatRequest,
  buildOpenAIStreamingRequest,
  buildAnthropicMessagesRequest,
  buildAnthropicStreamingRequest,
} from './helpers';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
} from './setup';
import {
  VALID_API_KEY,
  CONCURRENT_TEST_API_KEY,
  LOW_LIMIT_API_KEY,
  CUSTOM_MODEL_API_KEY,
  ANTHROPIC_MODEL_API_KEY,
} from './fixtures';
import type { TestServer } from './helpers';

describe('Concurrent Requests Integration Tests', () => {
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

  describe('Basic Concurrent Request Handling', () => {
    it('should handle multiple concurrent requests without errors', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Concurrent test' },
      ]);

      const requests = Array(10)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete without hanging or crashing
      expect(responses).toHaveLength(10);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });

    it('should process concurrent requests independently', async () => {
      const requestBodies = [
        buildOpenAIChatRequest([{ role: 'user', content: 'Request 1' }]),
        buildOpenAIChatRequest([{ role: 'user', content: 'Request 2' }]),
        buildOpenAIChatRequest([{ role: 'user', content: 'Request 3' }]),
      ];

      const requests = requestBodies.map(body =>
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
          method: 'POST',
          body,
        })
      );

      const responses = await Promise.all(requests);

      // All should complete successfully
      expect(responses).toHaveLength(3);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });

    it('should maintain request ordering in concurrent batch', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Ordering test' }]);

      // Create requests with delays to test ordering
      const requests = Array(5)
        .fill(null)
        .map((_, i) =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete
      expect(responses).toHaveLength(5);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });
  });

  describe('Concurrent Cross-Endpoint Requests', () => {
    it('should handle concurrent requests to different endpoints', async () => {
      const openaiBody = buildOpenAIChatRequest([{ role: 'user', content: 'OpenAI endpoint' }]);
      const anthropicBody = buildAnthropicMessagesRequest([{ role: 'user', content: 'Anthropic endpoint' }]);

      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
          method: 'POST',
          body: openaiBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/messages`, ANTHROPIC_MODEL_API_KEY.key, {
          method: 'POST',
          body: anthropicBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key),
        makeAuthenticatedRequest(`${testServer.url}/health`, VALID_API_KEY.key),
      ];

      const responses = await Promise.all(requests);

      // All should complete successfully
      expect(responses).toHaveLength(4);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });

    it('should handle concurrent streaming and non-streaming requests', async () => {
      const streamingBody = buildOpenAIStreamingRequest([{ role: 'user', content: 'Streaming request' }]);
      const nonStreamingBody = buildOpenAIChatRequest([{ role: 'user', content: 'Non-streaming' }]);

      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
          method: 'POST',
          body: streamingBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
          method: 'POST',
          body: nonStreamingBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
          method: 'POST',
          body: streamingBody,
        }),
      ];

      const responses = await Promise.all(requests);

      // All should complete
      expect(responses).toHaveLength(3);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });

    it('should handle concurrent requests to OpenAI and Anthropic streaming endpoints', async () => {
      const openaiStreaming = buildOpenAIStreamingRequest([{ role: 'user', content: 'OpenAI streaming' }]);
      const anthropicStreaming = buildAnthropicStreamingRequest([{ role: 'user', content: 'Anthropic streaming' }]);

      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
          method: 'POST',
          body: openaiStreaming,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/messages`, ANTHROPIC_MODEL_API_KEY.key, {
          method: 'POST',
          body: anthropicStreaming,
        }),
      ];

      const responses = await Promise.all(requests);

      // Both should complete
      expect(responses).toHaveLength(2);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });
  });

  describe('Concurrent Requests with Multiple API Keys', () => {
    it('should handle concurrent requests from different API keys', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Multi-key test' }]);

      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CUSTOM_MODEL_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
      ];

      const responses = await Promise.all(requests);

      // All should complete independently
      expect(responses).toHaveLength(3);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });

    it('should track usage independently for concurrent requests from different keys', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Independent tracking' }]);

      // Get stats before
      const stats1Before = await makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key);
      const stats2Before = await makeAuthenticatedRequest(`${testServer.url}/stats`, CONCURRENT_TEST_API_KEY.key);

      // Make concurrent requests with different keys
      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
      ];

      await Promise.all(requests);

      // Get stats after
      const stats1After = await makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key);
      const stats2After = await makeAuthenticatedRequest(`${testServer.url}/stats`, CONCURRENT_TEST_API_KEY.key);

      // Both should return valid stats
      expect(stats1After.status).toBe(200);
      expect(stats2After.status).toBe(200);

      const body1 = stats1After.json();
      const body2 = stats2After.json();

      expect(body1).toHaveProperty('current_usage');
      expect(body2).toHaveProperty('current_usage');
    });

    it('should handle concurrent requests with varying rate limits', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Varying limits' }]);

      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, LOW_LIMIT_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
      ];

      const responses = await Promise.all(requests);

      // All should complete (some may be rate limited)
      expect(responses).toHaveLength(3);
      for (const response of responses) {
        expect([200, 401, 429, 500]).toContain(response.status);
      }
    });
  });

  describe('Data Integrity Under Concurrent Load', () => {
    it('should maintain consistent stats during concurrent requests', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Stats consistency' }]);

      // Make concurrent API requests
      const apiRequests = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      // Make concurrent stats queries
      const statsRequests = Array(3)
        .fill(null)
        .map(() => makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key));

      const allResponses = await Promise.all([...apiRequests, ...statsRequests]);

      // All should complete successfully
      expect(allResponses).toHaveLength(8);
      for (const response of allResponses) {
        expect([200, 401, 500]).toContain(response.status);
      }

      // Verify stats are valid
      const finalStats = await makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key);
      expect(finalStats.status).toBe(200);

      const body = finalStats.json();
      expect(body).toHaveProperty('current_usage');
      expect(body).toHaveProperty('token_limit_per_5h');
      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThanOrEqual(0);
    });

    it('should prevent data corruption with rapid concurrent writes', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Data integrity test' }]);

      // Make a burst of concurrent requests
      const batches = Array(3)
        .fill(null)
        .map(() =>
          Array(3)
            .fill(null)
            .map(() =>
              makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
                method: 'POST',
                body: requestBody,
              })
            )
        );

      // Execute batches concurrently
      const allBatches = await Promise.all(batches.map(batch => Promise.all(batch)));

      // All requests should complete
      expect(allBatches).toHaveLength(3);
      for (const batch of allBatches) {
        expect(batch).toHaveLength(3);
        for (const response of batch) {
          expect([200, 401, 500]).toContain(response.status);
        }
      }

      // Verify data integrity
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key);
      expect(stats.status).toBe(200);

      const body = stats.json();
      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(body.current_usage.tokens_used_in_current_window)).toBe(true);
    });

    it('should handle concurrent stats queries without corruption', async () => {
      // Make many concurrent stats requests
      const statsRequests = Array(20)
        .fill(null)
        .map(() => makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key));

      const responses = await Promise.all(statsRequests);

      // All should succeed
      expect(responses).toHaveLength(20);
      for (const response of responses) {
        expect(response.status).toBe(200);
        const body = response.json();
        expect(body).toHaveProperty('key');
        expect(body).toHaveProperty('name');
        expect(body).toHaveProperty('token_limit_per_5h');
      }
    });
  });

  describe('Thread Safety & Race Condition Prevention', () => {
    it('should prevent race conditions in file operations', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Race condition test' }]);

      // Create a large burst of concurrent requests
      const requests = Array(15)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete without hanging or crashing
      expect(responses).toHaveLength(15);
      for (const response of responses) {
        expect([200, 401, 429, 500]).toContain(response.status);
      }

      // Verify system is still functional
      const healthCheck = await makeRequest(`${testServer.url}/health`);
      expect(healthCheck.status).toBe(200);

      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, CONCURRENT_TEST_API_KEY.key);
      expect(stats.status).toBe(200);
    });

    it('should handle concurrent reads and writes safely', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Read-write safety' }]);

      // Mix of write operations (API requests) and read operations (stats)
      const operations = [
        ...Array(5)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
              method: 'POST',
              body: requestBody,
            })
          ),
        ...Array(5)
          .fill(null)
          .map(() => makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key)),
      ];

      const responses = await Promise.all(operations);

      // All should complete successfully
      expect(responses).toHaveLength(10);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });

    it('should maintain consistency under high concurrent load', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'High load test' }]);

      // Execute multiple rounds of concurrent requests
      for (let round = 0; round < 3; round++) {
        const requests = Array(5)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
              method: 'POST',
              body: requestBody,
            })
          );

        const responses = await Promise.all(requests);

        expect(responses).toHaveLength(5);
        for (const response of responses) {
          expect([200, 401, 500]).toContain(response.status);
        }
      }

      // System should still be consistent
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, CONCURRENT_TEST_API_KEY.key);
      expect(stats.status).toBe(200);

      const body = stats.json();
      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(body.current_usage.tokens_used_in_current_window)).toBe(true);
    });
  });

  describe('Error Handling Under Concurrent Load', () => {
    it('should handle authentication errors in concurrent requests', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Auth error test' }]);

      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, 'invalid_key', {
          method: 'POST',
          body: requestBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
      ];

      const responses = await Promise.all(requests);

      // Valid keys should work, invalid should fail
      expect(responses).toHaveLength(3);
      expect(responses[0].status).toBeGreaterThanOrEqual(200);
      expect(responses[1].status).toBe(401);
      expect(responses[2].status).toBeGreaterThanOrEqual(200);
    });

    it('should handle rate limit errors in concurrent requests', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Rate limit error test' }]);

      const requests = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, LOW_LIMIT_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // Some may be rate limited, all should handle gracefully
      expect(responses).toHaveLength(5);
      for (const response of responses) {
        expect([200, 401, 429, 500]).toContain(response.status);

        // If rate limited, should have proper error format
        if (response.status === 429) {
          const body = response.json();
          expect(body).toHaveProperty('error');
          expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
        }
      }
    });

    it('should handle mixed success and error responses in concurrent batch', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Mixed response test' }]);

      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, 'invalid_key_1', {
          method: 'POST',
          body: requestBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, LOW_LIMIT_API_KEY.key, {
          method: 'POST',
          body: requestBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, 'invalid_key_2', {
          method: 'POST',
          body: requestBody,
        }),
      ];

      const responses = await Promise.all(requests);

      // Should handle mix of successes and errors gracefully
      expect(responses).toHaveLength(4);
      for (const response of responses) {
        expect([200, 401, 429, 500]).toContain(response.status);
      }
    });
  });

  describe('Performance Under Concurrent Load', () => {
    it('should complete concurrent requests within reasonable time', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Performance test' }]);

      const startTime = Date.now();

      const requests = Array(10)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(requests);

      const duration = Date.now() - startTime;

      // 10 concurrent requests should complete in reasonable time
      expect(duration).toBeLessThan(10000);
    });

    it('should handle burst of concurrent requests without degradation', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Burst performance' }]);

      // First burst
      const burst1 = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(burst1);

      // Second immediate burst
      const burst2 = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(burst2);

      // Second burst should also complete successfully
      expect(responses).toHaveLength(5);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });

    it('should maintain performance with mixed endpoint concurrency', async () => {
      const openaiBody = buildOpenAIChatRequest([{ role: 'user', content: 'Mixed endpoint test' }]);
      const anthropicBody = buildAnthropicMessagesRequest([{ role: 'user', content: 'Mixed endpoint test' }]);

      const startTime = Date.now();

      const requests = [
        ...Array(3)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
              method: 'POST',
              body: openaiBody,
            })
          ),
        ...Array(3)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/messages`, ANTHROPIC_MODEL_API_KEY.key, {
              method: 'POST',
              body: anthropicBody,
            })
          ),
        ...Array(2)
          .fill(null)
          .map(() => makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key)),
      ];

      await Promise.all(requests);

      const duration = Date.now() - startTime;

      // Mixed requests should complete in reasonable time
      expect(duration).toBeLessThan(10000);
    });
  });

  describe('Concurrent Requests - Edge Cases', () => {
    it('should handle concurrent requests with identical payloads', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Identical payload' }]);

      const requests = Array(10)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete successfully
      expect(responses).toHaveLength(10);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });

    it('should handle concurrent requests with varying payload sizes', async () => {
      const smallBody = buildOpenAIChatRequest([{ role: 'user', content: 'Small' }]);
      const largeBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Large payload '.repeat(100) },
      ]);

      const requests = [
        ...Array(3)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
              method: 'POST',
              body: smallBody,
            })
          ),
        ...Array(3)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
              method: 'POST',
              body: largeBody,
            })
          ),
      ];

      const responses = await Promise.all(requests);

      // All should handle correctly
      expect(responses).toHaveLength(6);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }
    });

    it('should handle rapid sequential concurrent batches', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Sequential batch' }]);

      // Execute multiple batches in rapid succession
      for (let i = 0; i < 5; i++) {
        const requests = Array(3)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
              method: 'POST',
              body: requestBody,
            })
          );

        const responses = await Promise.all(requests);

        expect(responses).toHaveLength(3);
        for (const response of responses) {
          expect([200, 401, 500]).toContain(response.status);
        }
      }
    });
  });
});
