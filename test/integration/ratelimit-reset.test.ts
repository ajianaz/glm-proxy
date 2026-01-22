/**
 * Rate Limiting Integration Tests - Window Reset
 *
 * Tests that token usage is properly reset when 5-hour windows expire.
 *
 * Subtask 4.3: Verify token usage is properly reset when 5-hour window expires
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startTestServer,
  makeAuthenticatedRequest,
  buildOpenAIChatRequest,
  buildAnthropicMessagesRequest,
  createMockApiKey,
} from './helpers';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
} from './setup';
import type { TestServer } from './helpers';
import { readApiKeys, writeApiKeys, updateApiKeyUsage } from '../../src/storage';

describe('Rate Limiting Integration Tests - Window Reset', () => {
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

  describe('Token Reset After Window Expiry', () => {
    it('should reset token usage when all windows expire', async () => {
      // Create a key with an expired window
      const resetKey = createMockApiKey({
        key: 'pk_test_reset_after_expiry',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago - expired
            tokens_used: 12000, // Over limit
          },
        ],
      });

      // Add to storage
      const data = await readApiKeys();
      data.keys.push(resetKey);
      await writeApiKeys(data);

      try {
        // Make a request - should trigger cleanup and create new window
        const requestBody = buildOpenAIChatRequest([
          { role: 'user', content: 'Hello' },
        ]);

        const response = await makeAuthenticatedRequest(
          `${testServer.url}/v1/chat/completions`,
          resetKey.key,
          {
            method: 'POST',
            body: requestBody,
          }
        );

        // Should NOT be rate limited (old window cleaned up, new one created)
        expect(response.status).not.toBe(429);

        // Check stats to verify reset
        const statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          resetKey.key
        );

        expect(statsResponse.status).toBe(200);

        const statsBody = statsResponse.json();
        // Should show only new tokens used (estimated from the request)
        expect(statsBody.current_usage.tokens_used_in_current_window).toBeLessThan(1000);
        expect(statsBody.current_usage.remaining_tokens).toBeGreaterThan(9000);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== resetKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should allow requests after windows expire and reset', async () => {
      // Create a key that was rate limited but windows have expired
      const resetKey = createMockApiKey({
        key: 'pk_test_allow_after_reset',
        token_limit_per_5h: 5000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 5 * 60 * 60 * 1000 - 1000).toISOString(), // Just over 5 hours
            tokens_used: 10000, // Way over limit
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(resetKey);
      await writeApiKeys(data);

      try {
        // First request triggers cleanup
        await updateApiKeyUsage(resetKey.key, 100, 'glm-4');

        // Check that old window was removed and new one created
        const updatedData = await readApiKeys();
        const updatedKey = updatedData.keys.find(k => k.key === resetKey.key);

        expect(updatedKey).toBeDefined();
        expect(updatedKey!.usage_windows.length).toBe(1);
        expect(updatedKey!.usage_windows[0].tokens_used).toBe(100);

        // Make a chat completion request - should be allowed
        const requestBody = buildOpenAIChatRequest([
          { role: 'user', content: 'Test message' },
        ]);

        const response = await makeAuthenticatedRequest(
          `${testServer.url}/v1/chat/completions`,
          resetKey.key,
          {
            method: 'POST',
            body: requestBody,
          }
        );

        // Should not be rate limited
        expect(response.status).not.toBe(429);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== resetKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should report zero usage when all windows have expired', async () => {
      const resetKey = createMockApiKey({
        key: 'pk_test_zero_usage_after_expiry',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(), // 10 hours ago
            tokens_used: 15000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(resetKey);
      await writeApiKeys(data);

      try {
        // Check stats before any new requests
        let statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          resetKey.key
        );

        expect(statsResponse.status).toBe(200);

        let statsBody = statsResponse.json();
        // Old windows should be filtered out, showing zero usage
        expect(statsBody.current_usage.tokens_used_in_current_window).toBe(0);
        expect(statsBody.current_usage.remaining_tokens).toBe(10000);

        // Update usage directly to create new window
        await updateApiKeyUsage(resetKey.key, 100, 'glm-4');

        // Check stats after update - should show small usage
        statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          resetKey.key
        );

        statsBody = statsResponse.json();
        expect(statsBody.current_usage.tokens_used_in_current_window).toBe(100);
        expect(statsBody.current_usage.remaining_tokens).toBe(9900);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== resetKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should handle multiple expired windows correctly', async () => {
      const multiResetKey = createMockApiKey({
        key: 'pk_test_multi_window_reset',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
            tokens_used: 5000,
          },
          {
            window_start: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
            tokens_used: 4000,
          },
          {
            window_start: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
            tokens_used: 3000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(multiResetKey);
      await writeApiKeys(data);

      try {
        // Trigger usage update (which triggers cleanup)
        await updateApiKeyUsage(multiResetKey.key, 100, 'glm-4');

        // Verify all old windows were cleaned up
        const updatedData = await readApiKeys();
        const updatedKey = updatedData.keys.find(k => k.key === multiResetKey.key);

        expect(updatedKey).toBeDefined();
        expect(updatedKey!.usage_windows.length).toBe(1);
        expect(updatedKey!.usage_windows[0].tokens_used).toBe(100);

        // Verify stats show only new usage
        const statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          multiResetKey.key
        );

        const statsBody = statsResponse.json();
        expect(statsBody.current_usage.tokens_used_in_current_window).toBe(100);
        expect(statsBody.current_usage.remaining_tokens).toBe(9900);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== multiResetKey.key);
        await writeApiKeys(cleanData);
      }
    });
  });

  describe('Reset Behavior Across Endpoints', () => {
    it('should reset consistently for /v1/chat/completions endpoint', async () => {
      const resetKey = createMockApiKey({
        key: 'pk_test_reset_openai',
        token_limit_per_5h: 5000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
            tokens_used: 10000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(resetKey);
      await writeApiKeys(data);

      try {
        const requestBody = buildOpenAIChatRequest([
          { role: 'user', content: 'Test' },
        ]);

        const response = await makeAuthenticatedRequest(
          `${testServer.url}/v1/chat/completions`,
          resetKey.key,
          {
            method: 'POST',
            body: requestBody,
          }
        );

        expect(response.status).not.toBe(429);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== resetKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should reset consistently for /v1/messages endpoint', async () => {
      const resetKey = createMockApiKey({
        key: 'pk_test_reset_anthropic',
        token_limit_per_5h: 5000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
            tokens_used: 10000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(resetKey);
      await writeApiKeys(data);

      try {
        const requestBody = buildAnthropicMessagesRequest([
          { role: 'user', content: 'Test' },
        ]);

        const response = await makeAuthenticatedRequest(
          `${testServer.url}/v1/messages`,
          resetKey.key,
          {
            method: 'POST',
            body: requestBody,
          }
        );

        expect(response.status).not.toBe(429);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== resetKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should show reset state in /stats endpoint', async () => {
      const resetKey = createMockApiKey({
        key: 'pk_test_reset_stats',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
            tokens_used: 15000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(resetKey);
      await writeApiKeys(data);

      try {
        // Before any new requests, stats should show 0 usage (old window filtered out)
        let statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          resetKey.key
        );

        let statsBody = statsResponse.json();
        expect(statsBody.current_usage.tokens_used_in_current_window).toBe(0);
        expect(statsBody.current_usage.remaining_tokens).toBe(10000);

        // Make a request to create new window
        await updateApiKeyUsage(resetKey.key, 500, 'glm-4');

        // Check stats after - should show new usage
        statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          resetKey.key
        );

        statsBody = statsResponse.json();
        expect(statsBody.current_usage.tokens_used_in_current_window).toBe(500);
        expect(statsBody.current_usage.remaining_tokens).toBe(9500);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== resetKey.key);
        await writeApiKeys(cleanData);
      }
    });
  });

  describe('Reset Timing and Boundary Conditions', () => {
    it('should reset exactly at 5 hour boundary', async () => {
      // Create a window exactly at the 5 hour boundary
      const boundaryKey = createMockApiKey({
        key: 'pk_test_boundary_reset',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 5 * 60 * 60 * 1000 - 1).toISOString(), // 1ms past boundary
            tokens_used: 15000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(boundaryKey);
      await writeApiKeys(data);

      try {
        // Window should be considered expired (just past 5 hours)
        const statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          boundaryKey.key
        );

        const statsBody = statsResponse.json();
        expect(statsBody.current_usage.tokens_used_in_current_window).toBe(0);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== boundaryKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should not reset just before 5 hour boundary', async () => {
      const nearBoundaryKey = createMockApiKey({
        key: 'pk_test_near_boundary',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 5 * 60 * 60 * 1000 + 1000).toISOString(), // 1 second before boundary
            tokens_used: 15000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(nearBoundaryKey);
      await writeApiKeys(data);

      try {
        // Window should still be active (just within 5 hours)
        const statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          nearBoundaryKey.key
        );

        const statsBody = statsResponse.json();
        expect(statsBody.current_usage.tokens_used_in_current_window).toBe(15000);
        expect(statsBody.current_usage.remaining_tokens).toBe(0);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== nearBoundaryKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should handle rapid successive resets', async () => {
      // Create a scenario where windows expire and reset multiple times
      const rapidResetKey = createMockApiKey({
        key: 'pk_test_rapid_reset',
        token_limit_per_5h: 5000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
            tokens_used: 6000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(rapidResetKey);
      await writeApiKeys(data);

      try {
        // First usage update - triggers first reset
        await updateApiKeyUsage(rapidResetKey.key, 100, 'glm-4');

        let updatedData = await readApiKeys();
        let key = updatedData.keys.find(k => k.key === rapidResetKey.key);
        expect(key!.usage_windows.length).toBe(1);
        expect(key!.usage_windows[0].tokens_used).toBe(100);

        // Second usage update - should reuse same window
        await updateApiKeyUsage(rapidResetKey.key, 200, 'glm-4');

        updatedData = await readApiKeys();
        key = updatedData.keys.find(k => k.key === rapidResetKey.key);
        expect(key!.usage_windows.length).toBe(1);
        expect(key!.usage_windows[0].tokens_used).toBe(300);

        // Third usage update - still same window
        await updateApiKeyUsage(rapidResetKey.key, 150, 'glm-4');

        updatedData = await readApiKeys();
        key = updatedData.keys.find(k => k.key === rapidResetKey.key);
        expect(key!.usage_windows.length).toBe(1);
        expect(key!.usage_windows[0].tokens_used).toBe(450);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== rapidResetKey.key);
        await writeApiKeys(cleanData);
      }
    });
  });

  describe('Reset with Mixed Active and Expired Windows', () => {
    it('should keep active windows and remove only expired ones', async () => {
      const mixedKey = createMockApiKey({
        key: 'pk_test_mixed_reset',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago - active
            tokens_used: 3000,
          },
          {
            window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago - expired
            tokens_used: 8000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(mixedKey);
      await writeApiKeys(data);

      try {
        // Trigger cleanup
        await updateApiKeyUsage(mixedKey.key, 100, 'glm-4');

        // Check that only active window remains
        const updatedData = await readApiKeys();
        const updatedKey = updatedData.keys.find(k => k.key === mixedKey.key);

        expect(updatedKey).toBeDefined();
        expect(updatedKey!.usage_windows.length).toBe(1);
        expect(updatedKey!.usage_windows[0].tokens_used).toBe(3100); // 3000 + 100

        // Verify the remaining window is the active one
        const window = updatedKey!.usage_windows[0];
        const windowStartTime = new Date(window.window_start).getTime();
        const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
        expect(windowStartTime).toBeGreaterThanOrEqual(fiveHoursAgo);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== mixedKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should calculate remaining tokens correctly after partial cleanup', async () => {
      const partialKey = createMockApiKey({
        key: 'pk_test_partial_cleanup',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 3600000).toISOString(),
            tokens_used: 2000,
          },
          {
            window_start: new Date(Date.now() - 7200000).toISOString(),
            tokens_used: 3000,
          },
          {
            window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
            tokens_used: 6000, // Should be cleaned up
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(partialKey);
      await writeApiKeys(data);

      try {
        // Check stats - should only include active windows
        const statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          partialKey.key
        );

        const statsBody = statsResponse.json();
        // Should sum only the two active windows: 2000 + 3000 = 5000
        expect(statsBody.current_usage.tokens_used_in_current_window).toBe(5000);
        expect(statsBody.current_usage.remaining_tokens).toBe(5000); // 10000 - 5000
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== partialKey.key);
        await writeApiKeys(cleanData);
      }
    });
  });

  describe('Reset Persistence and Consistency', () => {
    it('should persist reset state across storage operations', async () => {
      const persistResetKey = createMockApiKey({
        key: 'pk_test_persist_reset',
        token_limit_per_5h: 5000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
            tokens_used: 10000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(persistResetKey);
      await writeApiKeys(data);

      try {
        // First update - triggers reset
        await updateApiKeyUsage(persistResetKey.key, 100, 'glm-4');

        // Read directly from storage
        let data1 = await readApiKeys();
        let key1 = data1.keys.find(k => k.key === persistResetKey.key);
        expect(key1!.usage_windows.length).toBe(1);
        expect(key1!.usage_windows[0].tokens_used).toBe(100);

        // Second update - should persist to same window
        await updateApiKeyUsage(persistResetKey.key, 200, 'glm-4');

        // Read again to verify persistence
        let data2 = await readApiKeys();
        let key2 = data2.keys.find(k => k.key === persistResetKey.key);
        expect(key2!.usage_windows.length).toBe(1);
        expect(key2!.usage_windows[0].tokens_used).toBe(300);

        // Verify through stats endpoint as well
        const statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          persistResetKey.key
        );

        const statsBody = statsResponse.json();
        expect(statsBody.current_usage.tokens_used_in_current_window).toBe(300);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== persistResetKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should handle concurrent requests after reset correctly', async () => {
      const concurrentResetKey = createMockApiKey({
        key: 'pk_test_concurrent_reset',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
            tokens_used: 15000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(concurrentResetKey);
      await writeApiKeys(data);

      try {
        // Make multiple concurrent usage updates after reset
        const updatePromises = Array(3)
          .fill(null)
          .map(() => updateApiKeyUsage(concurrentResetKey.key, 100, 'glm-4'));

        await Promise.all(updatePromises);

        // Verify final state
        const statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          concurrentResetKey.key
        );

        const statsBody = statsResponse.json();
        // Should have 300 tokens used (100 * 3)
        expect(statsBody.current_usage.tokens_used_in_current_window).toBe(300);
        expect(statsBody.current_usage.remaining_tokens).toBe(9700); // 10000 - 300
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== concurrentResetKey.key);
        await writeApiKeys(cleanData);
      }
    });
  });
});
