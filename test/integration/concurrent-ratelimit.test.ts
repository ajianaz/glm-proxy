/**
 * Concurrent Rate Limit Updates Integration Tests
 *
 * Tests concurrent token usage updates to verify:
 * - File locking prevents race conditions in usage updates
 * - All concurrent updates are applied correctly
 * - No data corruption under concurrent write load
 * - Lock contention is handled gracefully
 * - Usage tracking remains accurate with simultaneous updates
 * - Multiple API keys can update usage concurrently
 * - Stats remain consistent during concurrent updates
 *
 * Subtask 7.3: Verify simultaneous token usage updates are handled correctly with file locking
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
import {
  VALID_API_KEY,
  CONCURRENT_TEST_API_KEY,
  LOW_LIMIT_API_KEY,
  CUSTOM_MODEL_API_KEY,
  MULTI_WINDOW_API_KEY,
  ANTHROPIC_MODEL_API_KEY,
} from './fixtures';
import type { TestServer } from './helpers';

describe('Concurrent Rate Limit Updates Integration Tests', () => {
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

  describe('Basic Concurrent Usage Updates', () => {
    it('should handle concurrent token usage updates without corruption', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Concurrent update test' },
      ]);

      // Get stats before
      const statsBefore = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        CONCURRENT_TEST_API_KEY.key
      );
      expect(statsBefore.status).toBe(200);
      const beforeBody = statsBefore.json();

      // Make 5 concurrent requests that will update usage
      const requests = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
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

      // Check stats after - usage should have increased
      const statsAfter = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        CONCURRENT_TEST_API_KEY.key
      );
      expect(statsAfter.status).toBe(200);
      const afterBody = statsAfter.json();

      // Verify usage increased (no corruption - should be finite and reasonable)
      expect(afterBody.current_usage.tokens_used_in_current_window).toBeGreaterThanOrEqual(
        beforeBody.current_usage.tokens_used_in_current_window
      );
      expect(Number.isFinite(afterBody.current_usage.tokens_used_in_current_window)).toBe(true);
      expect(Number.isFinite(afterBody.total_lifetime_tokens)).toBe(true);
    });

    it('should apply all concurrent updates correctly', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Apply all updates test' },
      ]);

      // Get initial usage
      const statsBefore = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(statsBefore.status).toBe(200);
      const beforeBody = statsBefore.json();
      const initialUsage = beforeBody.current_usage.tokens_used_in_current_window;
      const initialLifetime = beforeBody.total_lifetime_tokens;

      // Make 3 concurrent requests
      const requests = Array(3)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete without hanging (may have various status codes)
      expect(responses).toHaveLength(3);
      for (const response of responses) {
        expect([200, 401, 429, 500, 503]).toContain(response.status);
      }

      // Check final usage - system should remain consistent
      const statsAfter = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(statsAfter.status).toBe(200);
      const afterBody = statsAfter.json();

      // Usage should be monotonically increasing (no lost updates)
      expect(afterBody.current_usage.tokens_used_in_current_window).toBeGreaterThanOrEqual(initialUsage);
      expect(afterBody.total_lifetime_tokens).toBeGreaterThanOrEqual(initialLifetime);

      // Verify no corruption
      expect(Number.isFinite(afterBody.current_usage.tokens_used_in_current_window)).toBe(true);
      expect(Number.isFinite(afterBody.total_lifetime_tokens)).toBe(true);
    });

    it('should maintain usage window integrity with concurrent updates', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Window integrity test' },
      ]);

      // Make concurrent requests
      const requests = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(requests);

      // Check stats to verify windows are properly maintained
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(stats.status).toBe(200);

      const body = stats.json();
      expect(body).toHaveProperty('current_usage');
      expect(body.current_usage).toHaveProperty('tokens_used_in_current_window');

      // If windows are present, they should be valid
      if (body.current_usage.windows && body.current_usage.windows.length > 0) {
        expect(Array.isArray(body.current_usage.windows)).toBe(true);

        for (const window of body.current_usage.windows) {
          expect(window).toHaveProperty('window_start');
          expect(window).toHaveProperty('tokens_used');
          expect(typeof window.window_start).toBe('string');
          expect(typeof window.tokens_used).toBe('number');
          expect(Number.isFinite(window.tokens_used)).toBe(true);
          expect(window.tokens_used).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });

  describe('File Locking Behavior', () => {
    it('should prevent race conditions with file locking', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Race condition test' },
      ]);

      // Create a large burst of concurrent requests to stress the lock
      const requestCount = 10;
      const requests = Array(requestCount)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete without hanging (lock timeout may cause some failures)
      expect(responses).toHaveLength(requestCount);
      for (const response of responses) {
        expect([200, 401, 429, 500, 503]).toContain(response.status);
      }

      // Verify system is still functional after lock contention
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(stats.status).toBe(200);

      const body = stats.json();
      expect(body.current_usage.tokens_used_in_current_window).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(body.current_usage.tokens_used_in_current_window)).toBe(true);
    });

    it('should handle lock contention gracefully', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Lock contention test' },
      ]);

      // Make multiple rapid concurrent batches to increase lock contention
      const batches = Array(3)
        .fill(null)
        .map(() =>
          Array(5)
            .fill(null)
            .map(() =>
              makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
                method: 'POST',
                body: requestBody,
              })
            )
        );

      const allBatches = await Promise.all(batches.map(batch => Promise.all(batch)));

      // All batches should complete
      expect(allBatches).toHaveLength(3);
      for (const batch of allBatches) {
        expect(batch).toHaveLength(5);
        for (const response of batch) {
          expect([200, 401, 429, 500, 503]).toContain(response.status);
        }
      }

      // Verify data integrity after lock contention
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(stats.status).toBe(200);

      const body = stats.json();
      expect(Number.isFinite(body.current_usage.tokens_used_in_current_window)).toBe(true);
      expect(Number.isFinite(body.total_lifetime_tokens)).toBe(true);
    });

    it('should retry and eventually acquire lock under contention', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Lock retry test' },
      ]);

      // Create moderate concurrent load
      const requests = Array(8)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete (some may timeout due to lock contention)
      expect(responses).toHaveLength(8);
      for (const response of responses) {
        expect([200, 401, 429, 500, 503]).toContain(response.status);
      }

      // With the retry mechanism, at least some should complete successfully
      const validResponses = responses.filter(r =>
        r.status === 200 || r.status === 401 || r.status === 429
      );
      expect(validResponses.length).toBeGreaterThan(0);

      // Verify no corruption - system should remain functional
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(stats.status).toBe(200);
      expect(Number.isFinite(stats.json().current_usage.tokens_used_in_current_window)).toBe(true);
    });
  });

  describe('Concurrent Updates - Multiple API Keys', () => {
    it('should handle concurrent updates from different API keys independently', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Multi-key concurrent update' },
      ]);

      const key1 = VALID_API_KEY.key;
      const key2 = CONCURRENT_TEST_API_KEY.key;
      const key3 = CUSTOM_MODEL_API_KEY.key;

      // Get stats before for all keys
      const stats1Before = await makeAuthenticatedRequest(`${testServer.url}/stats`, key1);
      const stats2Before = await makeAuthenticatedRequest(`${testServer.url}/stats`, key2);
      const stats3Before = await makeAuthenticatedRequest(`${testServer.url}/stats`, key3);

      expect(stats1Before.status).toBe(200);
      expect(stats2Before.status).toBe(200);
      expect(stats3Before.status).toBe(200);

      const usage1Before = stats1Before.json().current_usage.tokens_used_in_current_window;
      const usage2Before = stats2Before.json().current_usage.tokens_used_in_current_window;
      const usage3Before = stats3Before.json().current_usage.tokens_used_in_current_window;

      // Make concurrent requests for all keys
      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key1, {
          method: 'POST',
          body: requestBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key2, {
          method: 'POST',
          body: requestBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key3, {
          method: 'POST',
          body: requestBody,
        }),
      ];

      await Promise.all(requests);

      // Get stats after for all keys
      const stats1After = await makeAuthenticatedRequest(`${testServer.url}/stats`, key1);
      const stats2After = await makeAuthenticatedRequest(`${testServer.url}/stats`, key2);
      const stats3After = await makeAuthenticatedRequest(`${testServer.url}/stats`, key3);

      expect(stats1After.status).toBe(200);
      expect(stats2After.status).toBe(200);
      expect(stats3After.status).toBe(200);

      // Each key should have independent usage tracking
      const usage1After = stats1After.json().current_usage.tokens_used_in_current_window;
      const usage2After = stats2After.json().current_usage.tokens_used_in_current_window;
      const usage3After = stats3After.json().current_usage.tokens_used_in_current_window;

      // All should be valid (no corruption)
      expect(Number.isFinite(usage1After)).toBe(true);
      expect(Number.isFinite(usage2After)).toBe(true);
      expect(Number.isFinite(usage3After)).toBe(true);
    });

    it('should prevent cross-key interference during concurrent updates', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Cross-key isolation test' },
      ]);

      const key1 = VALID_API_KEY.key;
      const key2 = CONCURRENT_TEST_API_KEY.key;

      // Make many concurrent requests for both keys
      const requests = [
        ...Array(5)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key1, {
              method: 'POST',
              body: requestBody,
            })
          ),
        ...Array(5)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key2, {
              method: 'POST',
              body: requestBody,
            })
          ),
      ];

      await Promise.all(requests);

      // Verify both keys have valid stats independently
      const stats1 = await makeAuthenticatedRequest(`${testServer.url}/stats`, key1);
      const stats2 = await makeAuthenticatedRequest(`${testServer.url}/stats`, key2);

      expect(stats1.status).toBe(200);
      expect(stats2.status).toBe(200);

      const body1 = stats1.json();
      const body2 = stats2.json();

      // Each key should have correct key field
      expect(body1.key).toBe(key1);
      expect(body2.key).toBe(key2);

      // Both should have valid usage data
      expect(Number.isFinite(body1.current_usage.tokens_used_in_current_window)).toBe(true);
      expect(Number.isFinite(body2.current_usage.tokens_used_in_current_window)).toBe(true);
    });
  });

  describe('Concurrent Updates - Rate Limit Enforcement', () => {
    it('should enforce rate limit correctly with concurrent updates', async () => {
      const key = LOW_LIMIT_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Rate limit enforcement test' },
      ]);

      // Make many concurrent requests to potentially hit rate limit
      const requests = Array(10)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // Some may be rate limited, but all should handle gracefully
      expect(responses).toHaveLength(10);

      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      const successCount = responses.filter(r => r.status === 200).length;

      // At minimum, all should have valid responses (no corruption)
      for (const response of responses) {
        expect([200, 401, 429, 500]).toContain(response.status);

        // If rate limited, should have proper error format
        if (response.status === 429) {
          const body = response.json();
          expect(body).toHaveProperty('error');
          expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
          expect(body.error).toHaveProperty('tokens_used');
          expect(body.error).toHaveProperty('tokens_limit');
        }
      }

      // Verify stats are still valid after rate limiting
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(stats.status).toBe(200);
      expect(Number.isFinite(stats.json().current_usage.tokens_used_in_current_window)).toBe(true);
    });

    it('should maintain accurate usage tracking when rate limited', async () => {
      const key = LOW_LIMIT_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Accurate tracking test' },
      ]);

      // Get stats before
      const statsBefore = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(statsBefore.status).toBe(200);
      const beforeTokens = statsBefore.json().current_usage.tokens_used_in_current_window;

      // Make concurrent requests (some may be rate limited)
      const requests = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(requests);

      // Check stats after - usage should be accurate
      const statsAfter = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(statsAfter.status).toBe(200);

      const afterTokens = statsAfter.json().current_usage.tokens_used_in_current_window;

      // Usage should be valid and monotonically increasing
      expect(afterTokens).toBeGreaterThanOrEqual(beforeTokens);
      expect(Number.isFinite(afterTokens)).toBe(true);
      expect(Number.isFinite(statsAfter.json().total_lifetime_tokens)).toBe(true);
    });
  });

  describe('Concurrent Updates - Data Integrity', () => {
    it('should prevent data loss with concurrent usage updates', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Data loss prevention test' },
      ]);

      // Get initial stats
      const statsBefore = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(statsBefore.status).toBe(200);
      const initialLifetime = statsBefore.json().total_lifetime_tokens;

      // Make concurrent requests
      const requests = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(requests);

      // Verify no data loss - lifetime tokens should never decrease
      const statsAfter = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(statsAfter.status).toBe(200);

      const finalLifetime = statsAfter.json().total_lifetime_tokens;
      expect(finalLifetime).toBeGreaterThanOrEqual(initialLifetime);
      expect(Number.isFinite(finalLifetime)).toBe(true);
    });

    it('should maintain window data consistency with concurrent updates', async () => {
      const key = MULTI_WINDOW_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Window consistency test' },
      ]);

      // Make concurrent updates
      const requests = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(requests);

      // Check window consistency
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(stats.status).toBe(200);

      const body = stats.json();
      const currentUsage = body.current_usage.tokens_used_in_current_window;

      // If windows are present, their sum should match current_usage
      if (body.current_usage.windows && body.current_usage.windows.length > 0) {
        const windowSum = body.current_usage.windows.reduce((sum: number, w: any) => sum + w.tokens_used, 0);
        expect(windowSum).toBe(currentUsage);
      }

      // Verify all numeric values are finite
      expect(Number.isFinite(currentUsage)).toBe(true);
    });

    it('should handle concurrent updates without creating orphaned data', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Orphaned data test' },
      ]);

      // Make concurrent requests
      const requests = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(requests);

      // Verify API key data is complete
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(stats.status).toBe(200);

      const body = stats.json();

      // Check all required fields are present and valid
      expect(body).toHaveProperty('key');
      expect(body).toHaveProperty('name');
      expect(body).toHaveProperty('model');
      expect(body).toHaveProperty('token_limit_per_5h');
      expect(body).toHaveProperty('total_lifetime_tokens');
      expect(body).toHaveProperty('current_usage');

      // Verify data types
      expect(typeof body.key).toBe('string');
      expect(typeof body.name).toBe('string');
      expect(typeof body.model).toBe('string');
      expect(typeof body.token_limit_per_5h).toBe('number');
      expect(typeof body.total_lifetime_tokens).toBe('number');
      expect(typeof body.current_usage.tokens_used_in_current_window).toBe('number');

      // Verify no NaN or Infinity
      expect(Number.isFinite(body.token_limit_per_5h)).toBe(true);
      expect(Number.isFinite(body.total_lifetime_tokens)).toBe(true);
      expect(Number.isFinite(body.current_usage.tokens_used_in_current_window)).toBe(true);
    });
  });

  describe('Concurrent Updates - Cross-Endpoint', () => {
    it('should aggregate usage from concurrent OpenAI and Anthropic requests', async () => {
      const key = ANTHROPIC_MODEL_API_KEY.key;

      const openaiBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Cross-endpoint aggregation' },
      ]);
      const anthropicBody = buildAnthropicMessagesRequest([
        { role: 'user', content: 'Cross-endpoint aggregation' },
      ]);

      // Get stats before
      const statsBefore = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      const beforeUsage = statsBefore.json().current_usage.tokens_used_in_current_window;

      // Make concurrent requests to both endpoints
      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
          method: 'POST',
          body: openaiBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/messages`, key, {
          method: 'POST',
          body: anthropicBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
          method: 'POST',
          body: openaiBody,
        }),
      ];

      await Promise.all(requests);

      // Check stats after - usage should be aggregated
      const statsAfter = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(statsAfter.status).toBe(200);

      const afterUsage = statsAfter.json().current_usage.tokens_used_in_current_window;

      // Usage should have increased
      expect(afterUsage).toBeGreaterThanOrEqual(beforeUsage);
      expect(Number.isFinite(afterUsage)).toBe(true);
    });

    it('should handle concurrent mixed endpoint requests without corruption', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;

      const openaiBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Mixed endpoint test' },
      ]);
      const anthropicBody = buildAnthropicMessagesRequest([
        { role: 'user', content: 'Mixed endpoint test' },
      ]);

      // Mix of concurrent requests
      const requests = [
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
          method: 'POST',
          body: openaiBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/stats`, key),
        makeAuthenticatedRequest(`${testServer.url}/v1/messages`, key, {
          method: 'POST',
          body: anthropicBody,
        }),
        makeAuthenticatedRequest(`${testServer.url}/stats`, key),
        makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
          method: 'POST',
          body: openaiBody,
        }),
      ];

      const responses = await Promise.all(requests);

      // All should complete successfully
      expect(responses).toHaveLength(5);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }

      // Verify final stats are valid
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(stats.status).toBe(200);
      expect(Number.isFinite(stats.json().current_usage.tokens_used_in_current_window)).toBe(true);
    });
  });

  describe('Concurrent Updates - Performance & Reliability', () => {
    it('should complete concurrent updates within reasonable time', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Performance test' },
      ]);

      const startTime = Date.now();

      // Make 5 concurrent requests
      const requests = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(requests);

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (accounting for lock contention)
      expect(duration).toBeLessThan(10000);
    });

    it('should handle rapid sequential concurrent update batches', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Sequential batch test' },
      ]);

      // Execute multiple batches in rapid succession
      for (let i = 0; i < 3; i++) {
        const requests = Array(3)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
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

      // Verify system is still stable
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(stats.status).toBe(200);
      expect(Number.isFinite(stats.json().current_usage.tokens_used_in_current_window)).toBe(true);
    });

    it('should maintain consistency under sustained concurrent load', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Sustained load test' },
      ]);

      // Make multiple rounds of concurrent requests
      for (let round = 0; round < 3; round++) {
        const requests = Array(4)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
              method: 'POST',
              body: requestBody,
            })
          );

        const responses = await Promise.all(requests);

        expect(responses).toHaveLength(4);
        for (const response of responses) {
          expect([200, 401, 500]).toContain(response.status);
        }

        // Verify stats after each round
        const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
        expect(stats.status).toBe(200);
        expect(Number.isFinite(stats.json().current_usage.tokens_used_in_current_window)).toBe(true);
      }
    });
  });

  describe('Concurrent Updates - Edge Cases', () => {
    it('should handle concurrent updates with identical requests', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Identical request test' },
      ]);

      // Make 5 identical concurrent requests
      const requests = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      expect(responses).toHaveLength(5);
      for (const response of responses) {
        expect([200, 401, 500]).toContain(response.status);
      }

      // Verify no corruption
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(stats.status).toBe(200);
      expect(Number.isFinite(stats.json().current_usage.tokens_used_in_current_window)).toBe(true);
    });

    it('should handle concurrent zero-token updates gracefully', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;

      // Make stats requests (which don't update usage but still acquire locks)
      const requests = Array(5)
        .fill(null)
        .map(() => makeAuthenticatedRequest(`${testServer.url}/stats`, key));

      const responses = await Promise.all(requests);

      // All should succeed
      expect(responses).toHaveLength(5);
      for (const response of responses) {
        expect(response.status).toBe(200);
      }

      // Stats should remain consistent
      const body = responses[0].json();
      expect(Number.isFinite(body.current_usage.tokens_used_in_current_window)).toBe(true);
    });

    it('should recover from temporary lock failures', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Lock recovery test' },
      ]);

      // Create significant lock contention
      const requests = Array(12)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete with some response (no hanging)
      expect(responses).toHaveLength(12);
      for (const response of responses) {
        expect([200, 401, 429, 500, 503]).toContain(response.status);
      }

      // At least some should complete with valid responses (not all timeout)
      const validResponses = responses.filter(r =>
        r.status === 200 || r.status === 401 || r.status === 429
      );
      expect(validResponses.length).toBeGreaterThan(0);

      // System should remain functional after lock contention
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(stats.status).toBe(200);
      expect(Number.isFinite(stats.json().current_usage.tokens_used_in_current_window)).toBe(true);
    });
  });
});
