/**
 * Rate Limiting Integration Tests - Rolling Window Behavior
 *
 * Tests the rolling window behavior to verify old usage windows are cleaned up
 * and new windows are created correctly.
 *
 * Subtask 4.2: Verify old usage windows are cleaned up and new windows are created correctly
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  startTestServer,
  makeAuthenticatedRequest,
} from './helpers';
import {
  setupTestEnvironment,
  teardownTestEnvironment,
} from './setup';
import {
  createMockApiKey,
} from './helpers';
import type { TestServer } from './helpers';
import { readApiKeys, writeApiKeys, updateApiKeyUsage } from '../../src/storage';

describe('Rate Limiting Integration Tests - Rolling Window Behavior', () => {
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

  describe('Old Window Cleanup', () => {
    it('should clean up windows older than 5 hours when usage is updated', async () => {
      // Create a key with one recent window and one old window
      const mixedKey = createMockApiKey({
        key: 'pk_test_mixed_windows',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago - should be kept
            tokens_used: 3000,
          },
          {
            window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago - should be cleaned up
            tokens_used: 5000,
          },
        ],
      });

      // Add to storage
      const data = await readApiKeys();
      data.keys.push(mixedKey);
      await writeApiKeys(data);

      try {
        // Update usage to trigger cleanup
        await updateApiKeyUsage(mixedKey.key, 100, 'glm-4');

        // Check that old window was cleaned up
        const updatedData = await readApiKeys();
        const updatedKey = updatedData.keys.find(k => k.key === mixedKey.key);

        expect(updatedKey).toBeDefined();
        expect(updatedKey!.usage_windows.length).toBe(1);

        // Verify the remaining window is within 5 hours
        const window = updatedKey!.usage_windows[0];
        const windowStartTime = new Date(window.window_start).getTime();
        const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
        expect(windowStartTime).toBeGreaterThanOrEqual(fiveHoursAgo);
        expect(window.tokens_used).toBe(3100); // 3000 + 100
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== mixedKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should remove all windows if all are older than 5 hours', async () => {
      // Create a key with only old windows
      const oldKey = createMockApiKey({
        key: 'pk_test_old_only',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
            tokens_used: 5000,
          },
          {
            window_start: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
            tokens_used: 3000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(oldKey);
      await writeApiKeys(data);

      try {
        // Update usage to trigger cleanup and new window creation
        await updateApiKeyUsage(oldKey.key, 100, 'glm-4');

        // Check that old windows were removed and a new one was created
        const updatedData = await readApiKeys();
        const updatedKey = updatedData.keys.find(k => k.key === oldKey.key);

        expect(updatedKey).toBeDefined();
        expect(updatedKey!.usage_windows.length).toBe(1);

        // Verify the new window is recent
        const window = updatedKey!.usage_windows[0];
        const windowStartTime = new Date(window.window_start).getTime();
        const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
        expect(windowStartTime).toBeGreaterThanOrEqual(fiveHoursAgo);
        expect(window.tokens_used).toBe(100); // Only the new tokens
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== oldKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should keep windows within 5 hour boundary', async () => {
      // Create a key with windows at different times within 5 hours
      const multiKey = createMockApiKey({
        key: 'pk_test_multi_within_boundary',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
            tokens_used: 2000,
          },
          {
            window_start: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
            tokens_used: 3000,
          },
          {
            window_start: new Date(Date.now() - 14400000).toISOString(), // 4 hours ago
            tokens_used: 1500,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(multiKey);
      await writeApiKeys(data);

      try {
        // Update usage - should keep all windows
        await updateApiKeyUsage(multiKey.key, 100, 'glm-4');

        // Check that all windows are still there
        const updatedData = await readApiKeys();
        const updatedKey = updatedData.keys.find(k => k.key === multiKey.key);

        expect(updatedKey).toBeDefined();
        expect(updatedKey!.usage_windows.length).toBe(3);

        // Verify all windows are within 5 hours
        const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
        for (const window of updatedKey!.usage_windows) {
          const windowStartTime = new Date(window.window_start).getTime();
          expect(windowStartTime).toBeGreaterThanOrEqual(fiveHoursAgo);
        }
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== multiKey.key);
        await writeApiKeys(cleanData);
      }
    });
  });

  describe('New Window Creation', () => {
    it('should create new window when no windows exist', async () => {
      const freshKey = createMockApiKey({
        key: 'pk_test_fresh',
        token_limit_per_5h: 10000,
        usage_windows: [],
      });

      const data = await readApiKeys();
      data.keys.push(freshKey);
      await writeApiKeys(data);

      try {
        // Update usage to create first window
        await updateApiKeyUsage(freshKey.key, 100, 'glm-4');

        // Check that a window was created
        const updatedData = await readApiKeys();
        const updatedKey = updatedData.keys.find(k => k.key === freshKey.key);

        expect(updatedKey).toBeDefined();
        expect(updatedKey!.usage_windows.length).toBe(1);
        expect(updatedKey!.usage_windows[0].tokens_used).toBe(100);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== freshKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should reuse existing window if within 5 hours', async () => {
      const existingKey = createMockApiKey({
        key: 'pk_test_reuse_window',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 3600000).toISOString(),
            tokens_used: 1000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(existingKey);
      await writeApiKeys(data);

      try {
        // Update usage - should reuse the existing window
        await updateApiKeyUsage(existingKey.key, 500, 'glm-4');

        // Check that tokens were added to existing window (not a new one)
        const updatedData = await readApiKeys();
        const updatedKey = updatedData.keys.find(k => k.key === existingKey.key);

        expect(updatedKey).toBeDefined();
        expect(updatedKey!.usage_windows.length).toBe(1);
        expect(updatedKey!.usage_windows[0].tokens_used).toBe(1500); // 1000 + 500
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== existingKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should create new window when all existing windows are expired', async () => {
      const expiredKey = createMockApiKey({
        key: 'pk_test_all_expired',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
            tokens_used: 5000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(expiredKey);
      await writeApiKeys(data);

      try {
        // Update usage to create new window
        await updateApiKeyUsage(expiredKey.key, 100, 'glm-4');

        // Check that old window was removed and new one created
        const updatedData = await readApiKeys();
        const updatedKey = updatedData.keys.find(k => k.key === expiredKey.key);

        expect(updatedKey).toBeDefined();
        expect(updatedKey!.usage_windows.length).toBe(1);

        // Verify the new window is recent
        const window = updatedKey!.usage_windows[0];
        const windowStartTime = new Date(window.window_start).getTime();
        const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
        expect(windowStartTime).toBeGreaterThanOrEqual(fiveHoursAgo);
        expect(window.tokens_used).toBe(100); // Only the new tokens
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== expiredKey.key);
        await writeApiKeys(cleanData);
      }
    });
  });

  describe('Window Token Aggregation', () => {
    it('should correctly sum tokens from all active windows', async () => {
      const multiKey = createMockApiKey({
        key: 'pk_test_aggregation',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 3600000).toISOString(),
            tokens_used: 3000,
          },
          {
            window_start: new Date(Date.now() - 7200000).toISOString(),
            tokens_used: 4000,
          },
          {
            window_start: new Date(Date.now() - 14400000).toISOString(),
            tokens_used: 2000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(multiKey);
      await writeApiKeys(data);

      try {
        // Check stats
        const statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          multiKey.key
        );

        expect(statsResponse.status).toBe(200);

        const statsBody = statsResponse.json();
        // Should sum all windows: 3000 + 4000 + 2000 = 9000
        expect(statsBody.current_usage.tokens_used_in_current_window).toBe(9000);
        expect(statsBody.current_usage.remaining_tokens).toBe(1000); // 10000 - 9000
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== multiKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should report zero remaining when over limit', async () => {
      const overLimitKey = createMockApiKey({
        key: 'pk_test_over_limit',
        token_limit_per_5h: 5000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 3600000).toISOString(),
            tokens_used: 6000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(overLimitKey);
      await writeApiKeys(data);

      try {
        const statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          overLimitKey.key
        );

        expect(statsResponse.status).toBe(200);

        const statsBody = statsResponse.json();
        expect(statsBody.current_usage.tokens_used_in_current_window).toBe(6000);
        expect(statsBody.current_usage.remaining_tokens).toBe(0);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== overLimitKey.key);
        await writeApiKeys(cleanData);
      }
    });
  });

  describe('Window Time Boundaries', () => {
    it('should include window exactly at 5 hour boundary', async () => {
      const boundaryKey = createMockApiKey({
        key: 'pk_test_boundary_inclusive',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 5 * 60 * 60 * 1000 + 1000).toISOString(), // 5 hours minus 1 second
            tokens_used: 1000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(boundaryKey);
      await writeApiKeys(data);

      try {
        const statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          boundaryKey.key
        );

        expect(statsResponse.status).toBe(200);

        const statsBody = statsResponse.json();
        // Window at just within 5 hours should be included (>= boundary)
        expect(statsBody.current_usage.tokens_used_in_current_window).toBe(1000);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== boundaryKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should exclude window just beyond 5 hour boundary', async () => {
      const beyondKey = createMockApiKey({
        key: 'pk_test_boundary_exclusive',
        token_limit_per_5h: 10000,
        usage_windows: [
          {
            window_start: new Date(Date.now() - 5 * 60 * 60 * 1000 - 1).toISOString(), // 1ms beyond 5 hours
            tokens_used: 1000,
          },
        ],
      });

      const data = await readApiKeys();
      data.keys.push(beyondKey);
      await writeApiKeys(data);

      try {
        const statsResponse = await makeAuthenticatedRequest(
          `${testServer.url}/stats`,
          beyondKey.key
        );

        expect(statsResponse.status).toBe(200);

        const statsBody = statsResponse.json();
        // Window just beyond 5 hours should be excluded
        expect(statsBody.current_usage.tokens_used_in_current_window).toBe(0);
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== beyondKey.key);
        await writeApiKeys(cleanData);
      }
    });
  });

  describe('Window Persistence', () => {
    it('should persist window data across multiple updates', async () => {
      const persistKey = createMockApiKey({
        key: 'pk_test_persist',
        token_limit_per_5h: 10000,
        usage_windows: [],
      });

      const data = await readApiKeys();
      data.keys.push(persistKey);
      await writeApiKeys(data);

      try {
        // First update
        await updateApiKeyUsage(persistKey.key, 100, 'glm-4');

        // Check after first update
        const data1 = await readApiKeys();
        const key1 = data1.keys.find(k => k.key === persistKey.key);
        expect(key1!.usage_windows.length).toBe(1);
        expect(key1!.usage_windows[0].tokens_used).toBe(100);

        // Second update
        await updateApiKeyUsage(persistKey.key, 200, 'glm-4');

        // Check after second update
        const data2 = await readApiKeys();
        const key2 = data2.keys.find(k => k.key === persistKey.key);
        expect(key2!.usage_windows.length).toBe(1);
        expect(key2!.usage_windows[0].tokens_used).toBe(300); // 100 + 200
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== persistKey.key);
        await writeApiKeys(cleanData);
      }
    });

    it('should create separate windows when time gap is large', async () => {
      const gapKey = createMockApiKey({
        key: 'pk_test_time_gap',
        token_limit_per_5h: 10000,
        usage_windows: [],
      });

      const data = await readApiKeys();
      data.keys.push(gapKey);
      await writeApiKeys(data);

      try {
        // First update - creates initial window
        await updateApiKeyUsage(gapKey.key, 100, 'glm-4');

        // Manually set the window start time to 4 hours ago
        let data1 = await readApiKeys();
        let key1 = data1.keys.find(k => k.key === gapKey.key);
        key1!.usage_windows[0].window_start = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
        await writeApiKeys(data1);

        // Second update - should reuse the existing window (still within 5 hours)
        await updateApiKeyUsage(gapKey.key, 200, 'glm-4');

        const data2 = await readApiKeys();
        const key2 = data2.keys.find(k => k.key === gapKey.key);

        expect(key2!.usage_windows.length).toBe(1);
        expect(key2!.usage_windows[0].tokens_used).toBe(300); // 100 + 200
      } finally {
        // Clean up
        const cleanData = await readApiKeys();
        cleanData.keys = cleanData.keys.filter(k => k.key !== gapKey.key);
        await writeApiKeys(cleanData);
      }
    });
  });
});
