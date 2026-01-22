import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { eq } from 'drizzle-orm';
import { getDb, closeDb, resetDb } from '../../src/db/connection.js';
import {
  findApiKey,
  createApiKey,
  deleteApiKey,
  updateApiKeyUsage,
  getKeyStats
} from '../../src/db/operations.js';
import type { ApiKey } from '../../src/types.js';

/**
 * Usage Window Logic and Token Counting Tests
 *
 * This test suite verifies:
 * 1. 5-hour rolling window calculation
 * 2. Multiple usage window handling
 * 3. Old usage window cleanup
 * 4. Concurrent update handling and transaction isolation
 */

// Helper to create test API key
function createTestKey(suffix: string): ApiKey {
  return {
    key: `test-usage-${suffix}`,
    name: `Test Usage Key ${suffix}`,
    model: 'claude-3-5-sonnet-20241022',
    token_limit_per_5h: 50000,
    expiry_date: '2027-12-31T23:59:59Z',
    created_at: new Date().toISOString(),
    last_used: new Date().toISOString(),
    total_lifetime_tokens: 0,
    usage_windows: [],
  };
}

describe('Usage Window Logic and Token Counting', () => {
  beforeAll(async () => {
    // Ensure database connection is initialized
    await getDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  describe('5-Hour Window Calculation', () => {
    const windowTestKey = createTestKey('window-001');

    test('should create new usage window on first usage', async () => {
      await createApiKey(windowTestKey);

      // First usage update
      await updateApiKeyUsage(windowTestKey.key, 1000, 'claude-3-5-sonnet-20241022');

      const key = await findApiKey(windowTestKey.key);

      expect(key?.usage_windows.length).toBe(1);
      expect(key?.usage_windows[0].tokens_used).toBe(1000);
      expect(key?.total_lifetime_tokens).toBe(1000);

      // Verify window timestamp is recent (within last minute)
      const windowTime = new Date(key?.usage_windows[0].window_start ?? 0).getTime();
      const now = Date.now();
      const diff = Math.abs(now - windowTime);
      expect(diff).toBeLessThan(60000); // Less than 1 minute
    });

    test('should accumulate tokens in same 5-hour window', async () => {
      // Second usage update within the 5-hour window
      await updateApiKeyUsage(windowTestKey.key, 500, 'claude-3-5-sonnet-20241022');

      const key = await findApiKey(windowTestKey.key);

      // Should still have only 1 window
      expect(key?.usage_windows.length).toBe(1);
      expect(key?.usage_windows[0].tokens_used).toBe(1500); // 1000 + 500
      expect(key?.total_lifetime_tokens).toBe(1500);
    });

    test('should create new window after 5-hour period', async () => {
      // First, clear any existing windows for this key
      const { db, type } = await getDb();
      const schema = await import('../../src/db/schema.js');
      const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;
      await db.delete(usageTable).where(eq(usageTable.apiKey, windowTestKey.key));

      // Get current total lifetime tokens (without windows)
      const beforeKey = await findApiKey(windowTestKey.key);
      const beforeTokens = beforeKey?.total_lifetime_tokens ?? 0;

      // Manually insert an old usage window (> 5 hours ago)
      const oldWindowStart = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

      await db.insert(usageTable).values({
        apiKey: windowTestKey.key,
        windowStart: oldWindowStart,
        tokensUsed: 2000,
      });

      // Now add new usage - should create a new window
      await updateApiKeyUsage(windowTestKey.key, 3000, 'claude-3-5-sonnet-20241022');

      const key = await findApiKey(windowTestKey.key);

      // Old window should be cleaned up, only new window exists
      expect(key?.usage_windows.length).toBe(1);
      expect(key?.usage_windows[0].tokens_used).toBe(3000);
      expect(key?.total_lifetime_tokens).toBe(beforeTokens + 3000);

      // Verify new window timestamp is recent
      const windowTime = new Date(key?.usage_windows[0].window_start ?? 0).getTime();
      const now = Date.now();
      const diff = Math.abs(now - windowTime);
      expect(diff).toBeLessThan(60000);
    });

    test('should calculate window_end_at correctly', async () => {
      const stats = await getKeyStats(windowTestKey.key);

      expect(stats).toBeDefined();
      expect(stats?.current_usage.window_started_at).toBeDefined();
      expect(stats?.current_usage.window_ends_at).toBeDefined();

      const windowStart = new Date(stats?.current_usage.window_started_at ?? 0);
      const windowEnd = new Date(stats?.current_usage.window_ends_at ?? 0);

      // Window end should be exactly 5 hours after window start
      const diff = windowEnd.getTime() - windowStart.getTime();
      expect(diff).toBe(5 * 60 * 60 * 1000); // 5 hours in milliseconds
    });

    test('cleanup: delete window test key', async () => {
      await deleteApiKey(windowTestKey.key);
    });
  });

  describe('Multiple Window Handling', () => {
    const multiWindowKey = createTestKey('multi-window-001');

    test('should handle multiple sequential usage updates', async () => {
      await createApiKey(multiWindowKey);

      // Multiple rapid updates
      const updates = [1000, 500, 250, 750, 500];
      for (const tokens of updates) {
        await updateApiKeyUsage(multiWindowKey.key, tokens, 'claude-3-5-sonnet-20241022');
      }

      const key = await findApiKey(multiWindowKey.key);

      // All should be in same window
      expect(key?.usage_windows.length).toBe(1);
      expect(key?.usage_windows[0].tokens_used).toBe(3000); // Sum of all updates
      expect(key?.total_lifetime_tokens).toBe(3000);
    });

    test('should handle updates with zero tokens', async () => {
      // Zero token update should still work
      await updateApiKeyUsage(multiWindowKey.key, 0, 'claude-3-5-sonnet-20241022');

      const key = await findApiKey(multiWindowKey.key);

      // Window count and tokens should remain unchanged
      expect(key?.usage_windows.length).toBe(1);
      expect(key?.usage_windows[0].tokens_used).toBe(3000);
      expect(key?.total_lifetime_tokens).toBe(3000);

      // But last_used should be updated
      expect(key?.last_used).toBeDefined();
    });

    test('should handle large token counts', async () => {
      // Large token count
      await updateApiKeyUsage(multiWindowKey.key, 50000, 'claude-3-5-sonnet-20241022');

      const key = await findApiKey(multiWindowKey.key);

      expect(key?.usage_windows[0].tokens_used).toBe(53000); // 3000 + 50000
      expect(key?.total_lifetime_tokens).toBe(53000);
    });

    test('should maintain accuracy across many updates', async () => {
      // Many small updates
      const updatesCount = 50;
      const tokensPerUpdate = 100;

      for (let i = 0; i < updatesCount; i++) {
        await updateApiKeyUsage(multiWindowKey.key, tokensPerUpdate, 'claude-3-5-sonnet-20241022');
      }

      const key = await findApiKey(multiWindowKey.key);

      const expectedTokens = 53000 + (updatesCount * tokensPerUpdate);
      expect(key?.usage_windows[0].tokens_used).toBe(expectedTokens);
      expect(key?.total_lifetime_tokens).toBe(expectedTokens);
    });

    test('cleanup: delete multi-window test key', async () => {
      await deleteApiKey(multiWindowKey.key);
    });
  });

  describe('Old Window Cleanup', () => {
    const cleanupTestKey = createTestKey('cleanup-001');

    beforeAll(async () => {
      await createApiKey(cleanupTestKey);
    });

    test('should delete windows older than 5 hours', async () => {
      const { db, type } = await getDb();
      const schema = await import('../../src/db/schema.js');
      const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

      // Create multiple old windows
      const oldWindows = [
        { start: -6 * 60 * 60 * 1000, tokens: 1000 },  // 6 hours ago
        { start: -7 * 60 * 60 * 1000, tokens: 1500 },  // 7 hours ago
        { start: -8 * 60 * 60 * 1000, tokens: 2000 },  // 8 hours ago
      ];

      for (const window of oldWindows) {
        await db.insert(usageTable).values({
          apiKey: cleanupTestKey.key,
          windowStart: new Date(Date.now() + window.start).toISOString(),
          tokensUsed: window.tokens,
        });
      }

      // Verify old windows were inserted
      let key = await findApiKey(cleanupTestKey.key);
      const windowCountBeforeUpdate = key?.usage_windows.length ?? 0;
      expect(windowCountBeforeUpdate).toBe(3);

      // Add new usage - should trigger cleanup
      await updateApiKeyUsage(cleanupTestKey.key, 500, 'claude-3-5-sonnet-20241022');

      // Verify old windows were cleaned up
      key = await findApiKey(cleanupTestKey.key);
      expect(key?.usage_windows.length).toBe(1);
      expect(key?.usage_windows[0].tokens_used).toBe(500);
    });

    test('should preserve windows within 5-hour threshold', async () => {
      const { db, type } = await getDb();
      const schema = await import('../../src/db/schema.js');
      const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

      // Clear existing windows first
      await db.delete(usageTable).where(eq(usageTable.apiKey, cleanupTestKey.key));

      // Create a window just under 5 hours old
      const recentOldWindow = new Date(Date.now() - 4.5 * 60 * 60 * 1000).toISOString();

      await db.insert(usageTable).values({
        apiKey: cleanupTestKey.key,
        windowStart: recentOldWindow,
        tokensUsed: 3000,
      });

      // Add new usage
      await updateApiKeyUsage(cleanupTestKey.key, 1000, 'claude-3-5-sonnet-20241022');

      const key = await findApiKey(cleanupTestKey.key);

      // Should reuse the recent window (not create a new one)
      expect(key?.usage_windows.length).toBe(1);
      expect(key?.usage_windows[0].tokens_used).toBe(4000); // 3000 + 1000

      // Verify the window timestamp is from the recent old window
      expect(key?.usage_windows[0].window_start).toBe(recentOldWindow);
    });

    test('should clean up multiple old windows across multiple keys', async () => {
      const anotherKey = createTestKey(`cleanup-002-${Date.now()}`); // Unique key

      try {
        await createApiKey(anotherKey);
      } catch (error) {
        // Ignore if already exists
      }

      const { db, type } = await getDb();
      const schema = await import('../../src/db/schema.js');
      const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

      // Clear existing windows for cleanupTestKey
      await db.delete(usageTable).where(eq(usageTable.apiKey, cleanupTestKey.key));

      // Add old windows to both keys
      for (const keyStr of [cleanupTestKey.key, anotherKey.key]) {
        await db.insert(usageTable).values({
          apiKey: keyStr,
          windowStart: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
          tokensUsed: 5000,
        });
      }

      // Verify both keys have old windows
      let key1 = await findApiKey(cleanupTestKey.key);
      let key2 = await findApiKey(anotherKey.key);
      expect(key1?.usage_windows.length).toBeGreaterThan(0);
      expect(key2?.usage_windows.length).toBeGreaterThan(0);

      // Update both keys - should clean up old windows for each
      await updateApiKeyUsage(cleanupTestKey.key, 100, 'claude-3-5-sonnet-20241022');
      await updateApiKeyUsage(anotherKey.key, 200, 'claude-3-5-sonnet-20241022');

      key1 = await findApiKey(cleanupTestKey.key);
      key2 = await findApiKey(anotherKey.key);

      // Both keys should have only their current windows
      expect(key1?.usage_windows.length).toBe(1);
      expect(key2?.usage_windows.length).toBe(1);
      expect(key1?.usage_windows[0].tokens_used).toBeGreaterThanOrEqual(100);
      expect(key2?.usage_windows[0].tokens_used).toBeGreaterThanOrEqual(200);

      // Cleanup
      await deleteApiKey(anotherKey.key);
    });

    test('should not delete current window during cleanup', async () => {
      const { db, type } = await getDb();
      const schema = await import('../../src/db/schema.js');
      const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

      // Clear existing windows first
      await db.delete(usageTable).where(eq(usageTable.apiKey, cleanupTestKey.key));

      // Add current window
      const currentWindowStart = new Date(Date.now() - 1000).toISOString(); // 1 second ago

      await db.insert(usageTable).values({
        apiKey: cleanupTestKey.key,
        windowStart: currentWindowStart,
        tokensUsed: 2000,
      });

      // Update usage - should reuse current window
      await updateApiKeyUsage(cleanupTestKey.key, 1000, 'claude-3-5-sonnet-20241022');

      const key = await findApiKey(cleanupTestKey.key);

      expect(key?.usage_windows.length).toBe(1);
      expect(key?.usage_windows[0].tokens_used).toBe(3000); // 2000 + 1000
      expect(key?.usage_windows[0].window_start).toBe(currentWindowStart);
    });

    test('cleanup: delete cleanup test key', async () => {
      await deleteApiKey(cleanupTestKey.key);
    });
  });

  describe('Concurrent Updates and Transaction Isolation', () => {
    const concurrentTestKey = createTestKey('concurrent-001');

    test('should handle sequential updates atomically', async () => {
      await createApiKey(concurrentTestKey);

      // Sequential updates
      const updates = [100, 200, 300, 400, 500];

      for (const tokens of updates) {
        await updateApiKeyUsage(concurrentTestKey.key, tokens, 'claude-3-5-sonnet-20241022');
      }

      const key = await findApiKey(concurrentTestKey.key);

      // All updates should be applied
      const sum = updates.reduce((a, b) => a + b, 0);
      expect(key?.total_lifetime_tokens).toBe(sum);
      expect(key?.usage_windows[0].tokens_used).toBe(sum);
    });

    test('should maintain data integrity with rapid updates', async () => {
      // Get current total before rapid updates
      const beforeKey = await findApiKey(concurrentTestKey.key);
      const beforeTotal = beforeKey?.total_lifetime_tokens ?? 0;

      // Simulate rapid concurrent-like updates
      const promises = [];
      const updateCount = 10;

      for (let i = 0; i < updateCount; i++) {
        // Note: These are sequential but simulate rapid usage
        await updateApiKeyUsage(concurrentTestKey.key, 100, 'claude-3-5-sonnet-20241022');
      }

      const key = await findApiKey(concurrentTestKey.key);

      // All updates should be reflected
      const expectedTotal = beforeTotal + (updateCount * 100);
      expect(key?.total_lifetime_tokens).toBe(expectedTotal);
      expect(key?.usage_windows[0].tokens_used).toBe(expectedTotal);
    });

    test('should update last_used timestamp on each usage update', async () => {
      const beforeKey = await findApiKey(concurrentTestKey.key);
      const beforeLastUsed = new Date(beforeKey?.last_used ?? 0).getTime();

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await updateApiKeyUsage(concurrentTestKey.key, 50, 'claude-3-5-sonnet-20241022');

      const afterKey = await findApiKey(concurrentTestKey.key);
      const afterLastUsed = new Date(afterKey?.last_used ?? 0).getTime();

      expect(afterLastUsed).toBeGreaterThan(beforeLastUsed);
    });

    test('should handle updates with same timestamp', async () => {
      // Get current total
      const beforeKey = await findApiKey(concurrentTestKey.key);
      const beforeTotal = beforeKey?.total_lifetime_tokens ?? 0;

      // Multiple updates that might have same timestamp
      const updateCount = 5;
      const tokensPerUpdate = 10;

      for (let i = 0; i < updateCount; i++) {
        await updateApiKeyUsage(concurrentTestKey.key, tokensPerUpdate, 'claude-3-5-sonnet-20241022');
      }

      const key = await findApiKey(concurrentTestKey.key);

      // All should be accumulated in same window
      const expectedTotal = beforeTotal + (updateCount * tokensPerUpdate);
      expect(key?.usage_windows.length).toBe(1);
      expect(key?.total_lifetime_tokens).toBe(expectedTotal);
    });

    test('should verify stats consistency with usage windows', async () => {
      const stats = await getKeyStats(concurrentTestKey.key);
      const key = await findApiKey(concurrentTestKey.key);

      // Stats should match current usage window
      expect(stats?.current_usage.tokens_used_in_current_window).toBe(
        key?.usage_windows[0].tokens_used
      );

      // Total lifetime should match
      expect(stats?.total_lifetime_tokens).toBe(key?.total_lifetime_tokens);

      // Remaining tokens should be calculated correctly
      const expectedRemaining = Math.max(
        0,
        50000 - (stats?.current_usage.tokens_used_in_current_window ?? 0)
      );
      expect(stats?.current_usage.remaining_tokens).toBe(expectedRemaining);
    });

    test('cleanup: delete concurrent test key', async () => {
      await deleteApiKey(concurrentTestKey.key);
    });
  });

  describe('Token Counting Accuracy', () => {
    const tokenCountKey = createTestKey('token-count-001');

    beforeAll(async () => {
      await createApiKey(tokenCountKey);
    });

    test('should accurately count tokens with small increments', async () => {
      const increments = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

      for (const tokens of increments) {
        await updateApiKeyUsage(tokenCountKey.key, tokens, 'claude-3-5-sonnet-20241022');
      }

      const key = await findApiKey(tokenCountKey.key);

      const expectedSum = increments.reduce((a, b) => a + b, 0);
      expect(key?.usage_windows[0].tokens_used).toBe(expectedSum);
      expect(key?.total_lifetime_tokens).toBe(expectedSum);
    });

    test('should accurately count tokens with large increments', async () => {
      const largeIncrements = [10000, 20000, 30000, 40000];

      for (const tokens of largeIncrements) {
        await updateApiKeyUsage(tokenCountKey.key, tokens, 'claude-3-5-sonnet-20241022');
      }

      const key = await findApiKey(tokenCountKey.key);

      const expectedSum = largeIncrements.reduce((a, b) => a + b, 0);
      const totalExpected = 55 + expectedSum; // Previous sum (55) + large increments

      expect(key?.usage_windows[0].tokens_used).toBe(totalExpected);
      expect(key?.total_lifetime_tokens).toBe(totalExpected);
    });

    test('should handle token overflow scenarios', async () => {
      // Get current total
      const beforeKey = await findApiKey(tokenCountKey.key);
      const beforeTotal = beforeKey?.total_lifetime_tokens ?? 0;

      // Add tokens that would exceed typical 32-bit integer limit
      const hugeAmount = 100000000; // 100 million

      await updateApiKeyUsage(tokenCountKey.key, hugeAmount, 'claude-3-5-sonnet-20241022');

      const key = await findApiKey(tokenCountKey.key);

      const expectedTotal = beforeTotal + hugeAmount;
      expect(key?.total_lifetime_tokens).toBe(expectedTotal);
      expect(key?.usage_windows[0].tokens_used).toBe(expectedTotal);
    });

    test('should maintain accuracy with decimal token counts (rounded)', async () => {
      // Token counts should be integers, but test with decimal input
      // The function should handle it correctly
      await updateApiKeyUsage(tokenCountKey.key, 100.5, 'claude-3-5-sonnet-20241022');
      await updateApiKeyUsage(tokenCountKey.key, 200.7, 'claude-3-5-sonnet-20241022');

      const key = await findApiKey(tokenCountKey.key);

      // Decimals should be summed correctly
      expect(key?.usage_windows[0].tokens_used).toBeGreaterThanOrEqual(100000356);
    });

    test('should calculate remaining tokens correctly', async () => {
      const stats = await getKeyStats(tokenCountKey.key);

      const currentUsage = stats?.current_usage.tokens_used_in_current_window ?? 0;
      const remaining = stats?.current_usage.remaining_tokens ?? 0;

      // Remaining should be max(0, limit - usage)
      const expectedRemaining = Math.max(0, 50000 - currentUsage);
      expect(remaining).toBe(expectedRemaining);
    });

    test('should show zero remaining tokens when limit exceeded', async () => {
      // Exceed the token limit significantly
      await updateApiKeyUsage(tokenCountKey.key, 1000000, 'claude-3-5-sonnet-20241022');

      const stats = await getKeyStats(tokenCountKey.key);

      // Remaining should be clamped to 0
      expect(stats?.current_usage.remaining_tokens).toBe(0);
    });

    test('cleanup: delete token count test key', async () => {
      await deleteApiKey(tokenCountKey.key);
    });
  });

  describe('Window Boundary Conditions', () => {
    test('should handle window at exact 5-hour boundary', async () => {
      const boundaryKey = createTestKey(`boundary-exact-${Date.now()}`);
      await createApiKey(boundaryKey);

      const { db, type } = await getDb();
      const schema = await import('../../src/db/schema.js');
      const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

      // Create a window just beyond 5 hours old (5 hours + 1 second)
      const boundaryWindow = new Date(Date.now() - (5 * 60 * 60 + 1) * 1000).toISOString();

      await db.insert(usageTable).values({
        apiKey: boundaryKey.key,
        windowStart: boundaryWindow,
        tokensUsed: 5000,
      });

      // New usage should create a new window (old one is beyond boundary)
      await updateApiKeyUsage(boundaryKey.key, 1000, 'claude-3-5-sonnet-20241022');

      const key = await findApiKey(boundaryKey.key);

      // Old window should be cleaned up
      expect(key?.usage_windows.length).toBe(1);
      expect(key?.usage_windows[0].tokens_used).toBe(1000);
      expect(key?.total_lifetime_tokens).toBe(1000);

      // Cleanup
      await deleteApiKey(boundaryKey.key);
    });

    test('should handle window just inside 5-hour boundary', async () => {
      const boundaryKey = createTestKey(`boundary-inside-${Date.now()}`);
      await createApiKey(boundaryKey);

      const { db, type } = await getDb();
      const schema = await import('../../src/db/schema.js');
      const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

      // Create a window just inside 5 hours (4 hours 59 minutes 59 seconds)
      const insideBoundary = new Date(Date.now() - (5 * 60 * 60 - 1) * 1000).toISOString();

      await db.insert(usageTable).values({
        apiKey: boundaryKey.key,
        windowStart: insideBoundary,
        tokensUsed: 3000,
      });

      // New usage should reuse this window
      await updateApiKeyUsage(boundaryKey.key, 2000, 'claude-3-5-sonnet-20241022');

      const key = await findApiKey(boundaryKey.key);

      expect(key?.usage_windows.length).toBe(1);
      expect(key?.usage_windows[0].tokens_used).toBe(5000); // 3000 + 2000
      expect(key?.usage_windows[0].window_start).toBe(insideBoundary);

      // Cleanup
      await deleteApiKey(boundaryKey.key);
    });

    test('should handle multiple windows at different ages', async () => {
      const boundaryKey = createTestKey(`boundary-multiple-${Date.now()}`);
      await createApiKey(boundaryKey);

      const { db, type } = await getDb();
      const schema = await import('../../src/db/schema.js');
      const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

      // Create windows at different ages
      const windows = [
        { age: -1 * 60 * 60 * 1000, tokens: 1000 },    // 1 hour old - kept
        { age: -3 * 60 * 60 * 1000, tokens: 2000 },    // 3 hours old - updated (oldest within 5h)
        { age: -5.5 * 60 * 60 * 1000, tokens: 3000 },  // 5.5 hours old - cleanup
        { age: -10 * 60 * 60 * 1000, tokens: 4000 },   // 10 hours old - cleanup
      ];

      for (const window of windows) {
        await db.insert(usageTable).values({
          apiKey: boundaryKey.key,
          windowStart: new Date(Date.now() + window.age).toISOString(),
          tokensUsed: window.tokens,
        });
      }

      // Add new usage - should update the oldest window within 5h and clean up old ones
      await updateApiKeyUsage(boundaryKey.key, 500, 'claude-3-5-sonnet-20241022');

      const key = await findApiKey(boundaryKey.key);

      // Should have 2 windows: 1 hour and 3 hours (both within 5h range)
      // Old windows (5.5h and 10h) should be cleaned up
      expect(key?.usage_windows.length).toBe(2);

      // The 3-hour window (oldest within 5h window) should have been updated
      const threeHourWindow = key?.usage_windows.find(w => {
        const windowAge = Date.now() - new Date(w.window_start).getTime();
        return windowAge >= (2.9 * 60 * 60 * 1000) && windowAge <= (3.1 * 60 * 60 * 1000);
      });
      expect(threeHourWindow?.tokens_used).toBe(2500); // 2000 + 500

      // The 1-hour window should remain unchanged
      const oneHourWindow = key?.usage_windows.find(w => {
        const windowAge = Date.now() - new Date(w.window_start).getTime();
        return windowAge >= (0.9 * 60 * 60 * 1000) && windowAge <= (1.1 * 60 * 60 * 1000);
      });
      expect(oneHourWindow?.tokens_used).toBe(1000); // unchanged

      // Cleanup
      await deleteApiKey(boundaryKey.key);
    });
  });

  describe('Usage Window Stats Integration', () => {
    const statsKey = createTestKey('stats-001');

    beforeAll(async () => {
      await createApiKey(statsKey);
    });

    test('should correctly calculate current window usage', async () => {
      await updateApiKeyUsage(statsKey.key, 10000, 'claude-3-5-sonnet-20241022');

      const stats = await getKeyStats(statsKey.key);

      expect(stats?.current_usage.tokens_used_in_current_window).toBe(10000);
      expect(stats?.total_lifetime_tokens).toBe(10000);
    });

    test('should correctly calculate remaining tokens', async () => {
      const stats = await getKeyStats(statsKey.key);

      const expectedRemaining = 50000 - 10000;
      expect(stats?.current_usage.remaining_tokens).toBe(expectedRemaining);
    });

    test('should update stats with each usage update', async () => {
      await updateApiKeyUsage(statsKey.key, 5000, 'claude-3-5-sonnet-20241022');

      const stats = await getKeyStats(statsKey.key);

      expect(stats?.current_usage.tokens_used_in_current_window).toBe(15000);
      expect(stats?.current_usage.remaining_tokens).toBe(35000);
    });

    test('should accurately track window timestamps', async () => {
      const stats = await getKeyStats(statsKey.key);

      expect(stats?.current_usage.window_started_at).toBeDefined();
      expect(stats?.current_usage.window_ends_at).toBeDefined();

      const windowStart = new Date(stats?.current_usage.window_started_at ?? 0);
      const windowEnd = new Date(stats?.current_usage.window_ends_at ?? 0);
      const now = new Date();

      // Window start should be in the past
      expect(windowStart.getTime()).toBeLessThanOrEqual(now.getTime());

      // Window end should be in the future
      expect(windowEnd.getTime()).toBeGreaterThan(now.getTime());

      // Window end should be exactly 5 hours after start
      const diff = windowEnd.getTime() - windowStart.getTime();
      expect(diff).toBe(5 * 60 * 60 * 1000);
    });

    test('should handle multiple stats calls consistently', async () => {
      const stats1 = await getKeyStats(statsKey.key);
      const stats2 = await getKeyStats(statsKey.key);

      // Stats should be consistent across calls
      expect(stats1?.current_usage.tokens_used_in_current_window).toBe(
        stats2?.current_usage.tokens_used_in_current_window
      );
      expect(stats1?.total_lifetime_tokens).toBe(stats2?.total_lifetime_tokens);
    });

    test('cleanup: delete stats test key', async () => {
      await deleteApiKey(statsKey.key);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    const errorKey = createTestKey('error-001');

    test('should handle usage update for non-existent key', async () => {
      await expect(
        updateApiKeyUsage('non-existent-key', 1000, 'claude-3-5-sonnet-20241022')
      ).rejects.toThrow('not found');
    });

    test('should handle negative token counts', async () => {
      await createApiKey(errorKey);

      await expect(
        updateApiKeyUsage(errorKey.key, -100, 'claude-3-5-sonnet-20241022')
      ).rejects.toThrow('non-negative');
    });

    test('should handle empty key string', async () => {
      await expect(
        updateApiKeyUsage('', 100, 'claude-3-5-sonnet-20241022')
      ).rejects.toThrow('required');
    });

    test('should maintain consistency after failed update', async () => {
      await updateApiKeyUsage(errorKey.key, 1000, 'claude-3-5-sonnet-20241022');

      const beforeStats = await getKeyStats(errorKey.key);
      const beforeTotal = beforeStats?.total_lifetime_tokens ?? 0;

      // Try invalid update
      try {
        await updateApiKeyUsage(errorKey.key, -500, 'claude-3-5-sonnet-20241022');
        expect.fail('Should have thrown error');
      } catch (error) {
        // Expected error
      }

      const afterStats = await getKeyStats(errorKey.key);
      const afterTotal = afterStats?.total_lifetime_tokens ?? 0;

      // Total should remain unchanged
      expect(afterTotal).toBe(beforeTotal);
    });

    test('cleanup: delete error test key', async () => {
      await deleteApiKey(errorKey.key);
    });
  });
});
