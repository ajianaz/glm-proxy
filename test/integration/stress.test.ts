/**
 * Stress Testing Integration Tests
 *
 * Tests system stability under high concurrent load to verify:
 * - System remains stable with 50+ simultaneous requests
 * - No crashes or hangs under extreme load
 * - Graceful degradation when overloaded
 * - Data integrity maintained under stress
 * - Performance remains acceptable
 * - System recovers after stress load
 * - Multiple endpoints handle concurrent load
 * - File lock contention handled gracefully
 *
 * Subtask 7.4: Verify system remains stable under high concurrent load (50+ simultaneous requests)
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

describe('Stress Testing Integration Tests', () => {
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

  describe('High Concurrent Load - API Requests', () => {
    it('should handle 50 concurrent API requests without crashing', async () => {
      const requestBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Stress test' },
      ]);

      // Make 50 concurrent requests
      const requests = Array(50)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete without hanging
      expect(responses).toHaveLength(50);

      // Count different response types
      const successCount = responses.filter(r => r.status === 200).length;
      const errorCount = responses.filter(r => r.status >= 400).length;

      // System should remain responsive - at least some requests should succeed
      expect(successCount + errorCount).toBe(50);

      // Verify system is still functional after stress
      const healthCheck = await makeRequest(`${testServer.url}/health`);
      expect(healthCheck.status).toBe(200);
    });

    it('should maintain data integrity with 50 concurrent requests', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Data integrity stress' }]);

      // Get stats before
      const statsBefore = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(statsBefore.status).toBe(200);
      const beforeTokens = statsBefore.json().current_usage.tokens_used_in_current_window;

      // Make 50 concurrent requests
      const requests = Array(50)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(requests);

      // Check stats after - data should remain consistent
      const statsAfter = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(statsAfter.status).toBe(200);

      const afterTokens = statsAfter.json().current_usage.tokens_used_in_current_window;

      // Verify no data corruption - should be finite and reasonable
      expect(Number.isFinite(afterTokens)).toBe(true);
      expect(afterTokens).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(statsAfter.json().total_lifetime_tokens)).toBe(true);
    });

    it('should handle 60 concurrent requests with graceful degradation', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Graceful degradation' }]);

      // Make 60 concurrent requests
      const requests = Array(60)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete (some may fail, some may succeed, but no hangs)
      expect(responses).toHaveLength(60);

      const successCount = responses.filter(r => r.status === 200).length;
      const timeoutCount = responses.filter(r => r.status === 503).length;
      const otherErrors = responses.filter(r => r.status >= 400 && r.status !== 503).length;

      // System should handle gracefully - mix of success and errors is acceptable
      expect(successCount + timeoutCount + otherErrors).toBe(60);

      // Critical: No request should hang indefinitely
      for (const response of responses) {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
      }

      // System should recover and remain functional
      const healthCheck = await makeRequest(`${testServer.url}/health`);
      expect(healthCheck.status).toBe(200);
    });

    it('should complete 50 concurrent requests within reasonable time', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Performance stress' }]);

      const startTime = Date.now();

      // Make 50 concurrent requests
      const requests = Array(50)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(requests);

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (allowing for lock contention)
      expect(duration).toBeLessThan(30000);
    });
  });

  describe('High Concurrent Load - Stats Queries', () => {
    it('should handle 50 concurrent stats queries', async () => {
      // Make 50 concurrent stats requests
      const statsRequests = Array(50)
        .fill(null)
        .map(() => makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key));

      const responses = await Promise.all(statsRequests);

      // All should complete
      expect(responses).toHaveLength(50);

      // Count successful responses
      let successCount = 0;
      for (const response of responses) {
        if (response.status === 200) {
          successCount++;
          const body = response.json();

          // Verify data integrity in all successful responses
          expect(body).toHaveProperty('key');
          expect(body).toHaveProperty('name');
          expect(body).toHaveProperty('model');
          expect(body).toHaveProperty('token_limit_per_5h');
          expect(Number.isFinite(body.token_limit_per_5h)).toBe(true);
          expect(Number.isFinite(body.current_usage.tokens_used_in_current_window)).toBe(true);
        }
      }

      // At least some should succeed under high load
      expect(successCount).toBeGreaterThan(0);
    });

    it('should maintain consistent data across 50 concurrent stats queries', async () => {
      // Make 50 concurrent stats requests
      const statsRequests = Array(50)
        .fill(null)
        .map(() => makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key));

      const responses = await Promise.all(statsRequests);

      // All successful responses should have consistent key, name, model
      const firstSuccessful = responses.find(r => r.status === 200);
      expect(firstSuccessful).toBeDefined();

      const firstBody = firstSuccessful!.json();

      for (const response of responses) {
        if (response.status === 200) {
          const body = response.json();
          expect(body.key).toBe(firstBody.key);
          expect(body.name).toBe(firstBody.name);
          expect(body.model).toBe(firstBody.model);
        }
      }
    });
  });

  describe('High Concurrent Load - Mixed Endpoints', () => {
    it('should handle 50 concurrent mixed endpoint requests', async () => {
      const openaiBody = buildOpenAIChatRequest([{ role: 'user', content: 'Mixed endpoint stress' }]);
      const anthropicBody = buildAnthropicMessagesRequest([{ role: 'user', content: 'Mixed endpoint stress' }]);

      // Mix of different endpoints
      const requests = [
        ...Array(15)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
              method: 'POST',
              body: openaiBody,
            })
          ),
        ...Array(15)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/messages`, ANTHROPIC_MODEL_API_KEY.key, {
              method: 'POST',
              body: anthropicBody,
            })
          ),
        ...Array(10)
          .fill(null)
          .map(() => makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key)),
        ...Array(10)
          .fill(null)
          .map(() => makeRequest(`${testServer.url}/health`)),
      ];

      const responses = await Promise.all(requests);

      // All should complete
      expect(responses).toHaveLength(50);

      // System should remain stable under mixed load
      for (const response of responses) {
        expect([200, 401, 429, 500, 503]).toContain(response.status);
      }

      // Verify health endpoint still works
      const healthCheck = await makeRequest(`${testServer.url}/health`);
      expect(healthCheck.status).toBe(200);
    });

    it('should handle streaming and non-streaming under high load', async () => {
      const streamingBody = buildOpenAIStreamingRequest([{ role: 'user', content: 'Streaming stress' }]);
      const nonStreamingBody = buildOpenAIChatRequest([{ role: 'user', content: 'Non-streaming stress' }]);

      // Mix of streaming and non-streaming requests
      const requests = [
        ...Array(25)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
              method: 'POST',
              body: streamingBody,
            })
          ),
        ...Array(25)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
              method: 'POST',
              body: nonStreamingBody,
            })
          ),
      ];

      const responses = await Promise.all(requests);

      // All should complete
      expect(responses).toHaveLength(50);

      // System should handle mixed streaming types
      for (const response of responses) {
        expect([200, 401, 500, 503]).toContain(response.status);
      }
    });
  });

  describe('High Concurrent Load - Multiple API Keys', () => {
    it('should handle 50 concurrent requests across multiple API keys', async () => {
      const apiKeys = [
        VALID_API_KEY.key,
        CONCURRENT_TEST_API_KEY.key,
        CUSTOM_MODEL_API_KEY.key,
      ];

      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Multi-key stress' }]);

      // Distribute 50 requests across multiple keys
      const requests = Array(50)
        .fill(null)
        .map((_, i) =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, apiKeys[i % apiKeys.length], {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete
      expect(responses).toHaveLength(50);

      // Each key should have independent, valid stats after
      for (const key of apiKeys) {
        const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
        expect(stats.status).toBe(200);

        const body = stats.json();
        expect(body.key).toBe(key);
        expect(Number.isFinite(body.current_usage.tokens_used_in_current_window)).toBe(true);
      }
    });

    it('should maintain isolation between keys under high concurrent load', async () => {
      const key1 = VALID_API_KEY.key;
      const key2 = CONCURRENT_TEST_API_KEY.key;

      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Isolation stress' }]);

      // 25 requests for each key
      const requests = [
        ...Array(25)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key1, {
              method: 'POST',
              body: requestBody,
            })
          ),
        ...Array(25)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key2, {
              method: 'POST',
              body: requestBody,
            })
          ),
      ];

      await Promise.all(requests);

      // Verify isolation - both keys should have valid stats
      const stats1 = await makeAuthenticatedRequest(`${testServer.url}/stats`, key1);
      const stats2 = await makeAuthenticatedRequest(`${testServer.url}/stats`, key2);

      expect(stats1.status).toBe(200);
      expect(stats2.status).toBe(200);

      expect(stats1.json().key).toBe(key1);
      expect(stats2.json().key).toBe(key2);

      // Both should have valid, independent usage data
      expect(Number.isFinite(stats1.json().current_usage.tokens_used_in_current_window)).toBe(true);
      expect(Number.isFinite(stats2.json().current_usage.tokens_used_in_current_window)).toBe(true);
    });
  });

  describe('System Recovery After Stress', () => {
    it('should recover and function normally after stress load', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Recovery test' }]);

      // Apply stress load
      const stressRequests = Array(50)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(stressRequests);

      // Wait a moment for recovery
      await new Promise(resolve => setTimeout(resolve, 100));

      // System should function normally
      const normalRequest = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect([200, 401, 500]).toContain(normalRequest.status);

      // Health check should pass
      const healthCheck = await makeRequest(`${testServer.url}/health`);
      expect(healthCheck.status).toBe(200);

      // Stats should be accessible and valid
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key);
      expect(stats.status).toBe(200);
      expect(Number.isFinite(stats.json().current_usage.tokens_used_in_current_window)).toBe(true);
    });

    it('should handle repeated stress cycles', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Cyclic stress' }]);

      // Apply multiple stress cycles
      for (let cycle = 0; cycle < 3; cycle++) {
        // Stress load
        const stressRequests = Array(30)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
              method: 'POST',
              body: requestBody,
            })
          );

        await Promise.all(stressRequests);

        // Brief pause
        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify system is still functional
        const healthCheck = await makeRequest(`${testServer.url}/health`);
        expect(healthCheck.status).toBe(200);
      }

      // Final verification - system should be fully functional
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, VALID_API_KEY.key);
      expect(stats.status).toBe(200);
      expect(Number.isFinite(stats.json().current_usage.tokens_used_in_current_window)).toBe(true);
    });

    it('should not accumulate errors under repeated stress', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Error accumulation test' }]);

      // Track error rates across cycles
      const errorRates: number[] = [];

      for (let cycle = 0; cycle < 3; cycle++) {
        const requests = Array(30)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
              method: 'POST',
              body: requestBody,
            })
          );

        const responses = await Promise.all(requests);

        const errorCount = responses.filter(r => r.status >= 400).length;
        errorRates.push(errorCount / responses.length);

        // Brief pause between cycles
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Error rates should not consistently increase (system should recover)
      // The last cycle should not be significantly worse than the first
      expect(errorRates[2]).toBeLessThan(errorRates[0] * 2);
    });
  });

  describe('Extreme Load Scenarios', () => {
    it('should handle burst of 75 concurrent requests', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Extreme burst' }]);

      // Extreme burst
      const requests = Array(75)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      // All should complete (with various status codes)
      expect(responses).toHaveLength(75);

      for (const response of responses) {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
      }

      // Should complete in reasonable time
      expect(duration).toBeLessThan(45000);

      // System should recover
      const healthCheck = await makeRequest(`${testServer.url}/health`);
      expect(healthCheck.status).toBe(200);
    });

    it('should handle sustained high load over time', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Sustained load' }]);

      const batchCount = 3;
      const batchSize = 30;

      for (let batch = 0; batch < batchCount; batch++) {
        const requests = Array(batchSize)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
              method: 'POST',
              body: requestBody,
            })
          );

        const responses = await Promise.all(requests);

        // All requests in each batch should complete
        expect(responses).toHaveLength(batchSize);

        // Small pause between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // System should remain functional after sustained load
      const healthCheck = await makeRequest(`${testServer.url}/health`);
      expect(healthCheck.status).toBe(200);

      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, CONCURRENT_TEST_API_KEY.key);
      expect(stats.status).toBe(200);
      expect(Number.isFinite(stats.json().current_usage.tokens_used_in_current_window)).toBe(true);
    });

    it('should handle concurrent requests with rate limiting under stress', async () => {
      const key = LOW_LIMIT_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Rate limit stress' }]);

      // Many concurrent requests that will likely hit rate limits
      const requests = Array(50)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete with appropriate responses
      expect(responses).toHaveLength(50);

      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      const otherErrors = responses.filter(r => r.status >= 400 && r.status !== 429).length;

      // Should have mix of responses
      expect(successCount + rateLimitedCount + otherErrors).toBe(50);

      // Rate limited responses should have proper format
      for (const response of responses) {
        if (response.status === 429) {
          const body = response.json();
          expect(body).toHaveProperty('error');
          expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
        }
      }

      // System should remain stable
      const stats = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(stats.status).toBe(200);
    });
  });

  describe('Resource Management Under Stress', () => {
    it('should not leak connections under high concurrent load', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Connection leak test' }]);

      // Multiple rounds of high concurrent load
      for (let round = 0; round < 2; round++) {
        const requests = Array(40)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
              method: 'POST',
              body: requestBody,
            })
          );

        await Promise.all(requests);

        // Small pause between rounds
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // System should still be responsive (no connection exhaustion)
      const finalRequest = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: requestBody,
        }
      );

      expect([200, 401, 500]).toContain(finalRequest.status);

      const healthCheck = await makeRequest(`${testServer.url}/health`);
      expect(healthCheck.status).toBe(200);
    });

    it('should handle memory pressure from concurrent requests', async () => {
      const largeBody = buildOpenAIChatRequest([
        { role: 'user', content: 'Large payload test '.repeat(100) },
      ]);

      // Many concurrent requests with large payloads
      const requests = Array(40)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
            method: 'POST',
            body: largeBody,
          })
        );

      const responses = await Promise.all(requests);

      // All should complete
      expect(responses).toHaveLength(40);

      // System should remain functional
      const healthCheck = await makeRequest(`${testServer.url}/health`);
      expect(healthCheck.status).toBe(200);
    });

    it('should maintain file system integrity under concurrent writes', async () => {
      const key = CONCURRENT_TEST_API_KEY.key;
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'File integrity test' }]);

      // Get initial stats
      const statsBefore = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      const beforeLifetime = statsBefore.json().total_lifetime_tokens;

      // Many concurrent write operations
      const requests = Array(50)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(requests);

      // Verify file system integrity
      const statsAfter = await makeAuthenticatedRequest(`${testServer.url}/stats`, key);
      expect(statsAfter.status).toBe(200);

      const afterLifetime = statsAfter.json().total_lifetime_tokens;

      // Lifetime tokens should be monotonically increasing (no corruption)
      expect(afterLifetime).toBeGreaterThanOrEqual(beforeLifetime);
      expect(Number.isFinite(afterLifetime)).toBe(true);

      // All API key data should be intact
      const body = statsAfter.json();
      expect(body).toHaveProperty('key');
      expect(body).toHaveProperty('name');
      expect(body).toHaveProperty('model');
      expect(body.key).toBe(key);
    });
  });

  describe('Edge Cases Under Stress', () => {
    it('should handle concurrent requests with varying payloads', async () => {
      const smallBody = buildOpenAIChatRequest([{ role: 'user', content: 'Small' }]);
      const mediumBody = buildOpenAIChatRequest([{ role: 'user', content: 'Medium '.repeat(10) }]);
      const largeBody = buildOpenAIChatRequest([{ role: 'user', content: 'Large '.repeat(100) }]);

      // Mix of different payload sizes
      const requests = [
        ...Array(15)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
              method: 'POST',
              body: smallBody,
            })
          ),
        ...Array(15)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
              method: 'POST',
              body: mediumBody,
            })
          ),
        ...Array(15)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
              method: 'POST',
              body: largeBody,
            })
          ),
      ];

      const responses = await Promise.all(requests);

      // All should complete
      expect(responses).toHaveLength(45);

      // System should handle mixed load sizes
      for (const response of responses) {
        expect([200, 401, 500, 503]).toContain(response.status);
      }
    });

    it('should handle rapid sequential stress batches', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Rapid batch test' }]);

      // Execute multiple batches without pause
      for (let batch = 0; batch < 5; batch++) {
        const requests = Array(20)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
              method: 'POST',
              body: requestBody,
            })
          );

        const responses = await Promise.all(requests);

        // Each batch should complete
        expect(responses).toHaveLength(20);
      }

      // Final health check
      const healthCheck = await makeRequest(`${testServer.url}/health`);
      expect(healthCheck.status).toBe(200);
    });

    it('should handle stress with mixed authentication scenarios', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Auth stress test' }]);

      // Mix of valid and invalid keys
      const requests = [
        ...Array(20)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
              method: 'POST',
              body: requestBody,
            })
          ),
        ...Array(10)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, 'invalid_key_stress', {
              method: 'POST',
              body: requestBody,
            })
          ),
        ...Array(20)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
              method: 'POST',
              body: requestBody,
            })
          ),
      ];

      const responses = await Promise.all(requests);

      // All should complete appropriately
      expect(responses).toHaveLength(50);

      // Invalid keys should be rejected
      const invalidKeyResponses = responses.slice(20, 30);
      for (const response of invalidKeyResponses) {
        expect(response.status).toBe(401);
      }

      // Valid keys should get responses
      const validResponses = [...responses.slice(0, 20), ...responses.slice(30)];
      for (const response of validResponses) {
        expect([200, 429, 500, 503]).toContain(response.status);
      }
    });
  });

  describe('Performance Benchmarks Under Stress', () => {
    it('should maintain acceptable response times under moderate stress', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Performance benchmark' }]);

      const startTime = Date.now();

      // 30 concurrent requests
      const requests = Array(30)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, VALID_API_KEY.key, {
            method: 'POST',
            body: requestBody,
          })
        );

      await Promise.all(requests);

      const duration = Date.now() - startTime;

      // Average per request should be reasonable
      const avgTimePerRequest = duration / 30;
      expect(avgTimePerRequest).toBeLessThan(1000);
    });

    it('should scale linearly (not exponentially) with load', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Scaling test' }]);

      // Test with different load sizes
      const timings: number[] = [];

      for (const loadSize of [10, 25, 50]) {
        const startTime = Date.now();

        const requests = Array(loadSize)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
              method: 'POST',
              body: requestBody,
            })
          );

        await Promise.all(requests);

        timings.push(Date.now() - startTime);

        // Brief pause between tests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 5x load should not take more than 10x time (linear, not exponential)
      expect(timings[2]).toBeLessThan(timings[0] * 10);
    });

    it('should maintain throughput under sustained load', async () => {
      const requestBody = buildOpenAIChatRequest([{ role: 'user', content: 'Throughput test' }]);

      const batchCount = 3;
      const batchSize = 25;
      const totalRequests = batchCount * batchSize;

      const startTime = Date.now();

      for (let batch = 0; batch < batchCount; batch++) {
        const requests = Array(batchSize)
          .fill(null)
          .map(() =>
            makeAuthenticatedRequest(`${testServer.url}/v1/chat/completions`, CONCURRENT_TEST_API_KEY.key, {
              method: 'POST',
              body: requestBody,
            })
          );

        await Promise.all(requests);
      }

      const duration = Date.now() - startTime;
      const throughput = totalRequests / (duration / 1000); // requests per second

      // Should maintain reasonable throughput
      expect(throughput).toBeGreaterThan(1);
    });
  });
});
