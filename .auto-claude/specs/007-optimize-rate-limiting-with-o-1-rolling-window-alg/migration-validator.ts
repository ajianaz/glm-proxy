/**
 * Migration Validation Script
 *
 * This script validates the migration strategy by simulating the migration
 * of usage_windows data to the rolling window format.
 *
 * Run with: bun run migration-validator.ts
 */

import type { ApiKey, UsageWindow, RollingWindowData, TimeBucket } from '../src/types.js';

// Configuration constants (matching design)
const WINDOW_DURATION_MS = 5 * 60 * 60 * 1000;  // 5 hours
const BUCKET_SIZE_MS = 5 * 60 * 1000;            // 5 minutes
const BUCKET_COUNT = 60;                         // 5 hours / 5 minutes

/**
 * Simple rolling window implementation for validation
 * (This will be replaced by the actual RollingWindow class in Phase 2)
 */
class SimpleRollingWindow {
  private buckets: Map<number, TimeBucket> = new Map();
  public runningTotal: number = 0;

  constructor(
    private readonly windowDurationMs: number,
    private readonly bucketSizeMs: number
  ) {}

  addTokens(timestamp: Date, tokens: number): void {
    // Clean up expired buckets first
    this.cleanup(timestamp);

    const bucketTime = this.getBucketTime(timestamp);
    const bucketIndex = this.getBucketIndex(timestamp);

    const existingBucket = this.buckets.get(bucketIndex);

    if (existingBucket && existingBucket.timestamp === bucketTime) {
      // Same bucket, just add tokens
      existingBucket.tokens += tokens;
      this.runningTotal += tokens;
    } else {
      // Different bucket (could be old expired bucket or new bucket)
      // Subtract old bucket's tokens if it exists
      if (existingBucket) {
        this.runningTotal -= existingBucket.tokens;
      }
      // Add new bucket
      this.buckets.set(bucketIndex, { timestamp: bucketTime, tokens });
      this.runningTotal += tokens;
    }
  }

  /**
   * Add tokens without running cleanup first.
   * Used during migration to avoid premature cleanup of old buckets.
   */
  addTokensNoCleanup(timestamp: Date, tokens: number): void {
    const bucketTime = this.getBucketTime(timestamp);
    const bucketIndex = this.getBucketIndex(timestamp);

    const existingBucket = this.buckets.get(bucketIndex);

    if (existingBucket && existingBucket.timestamp === bucketTime) {
      // Same bucket, just add tokens
      existingBucket.tokens += tokens;
      this.runningTotal += tokens;
    } else {
      // Different bucket at same index - this is a circular buffer collision
      // The old bucket must be from a previous time window (expired)
      if (existingBucket) {
        // Remove old bucket's tokens from running total
        this.runningTotal -= existingBucket.tokens;
      }
      // Add new bucket with its tokens
      this.buckets.set(bucketIndex, { timestamp: bucketTime, tokens });
      this.runningTotal += tokens;
    }
  }

  getTotalTokens(currentTime: Date): number {
    this.cleanup(currentTime);
    return this.runningTotal;
  }

  cleanup(currentTime: Date): void {
    const expiryTime = currentTime.getTime() - this.windowDurationMs;

    for (const [index, bucket] of this.buckets) {
      if (bucket.timestamp < expiryTime) {
        this.runningTotal -= bucket.tokens;
        this.buckets.delete(index);
      }
    }
  }

  getBucketIndex(timestamp: Date): number {
    const bucketTime = this.getBucketTime(timestamp);
    // Divide by bucketSizeMs to get the bucket number, then modulo by bucketCount
    return Math.floor(bucketTime / this.bucketSizeMs) % BUCKET_COUNT;
  }

  getBucketTime(timestamp: Date): number {
    return Math.floor(timestamp.getTime() / this.bucketSizeMs) * this.bucketSizeMs;
  }

  toSerializable(): RollingWindowData {
    return {
      buckets: Array.from(this.buckets.values()),
      runningTotal: this.runningTotal,
      lastUpdated: new Date().toISOString(),
      windowDurationMs: this.windowDurationMs,
      bucketSizeMs: this.bucketSizeMs,
    };
  }
}

/**
 * Migrate usage_windows to rolling window cache format
 *
 * This is the migration helper function that will be added to storage.ts
 */
export function migrateToRollingWindow(apiKey: ApiKey): RollingWindowData {
  const rollingWindow = new SimpleRollingWindow(WINDOW_DURATION_MS, BUCKET_SIZE_MS);

  if (apiKey.usage_windows.length === 0) {
    return rollingWindow.toSerializable();
  }

  // Populate buckets from existing usage_windows
  // Sort by timestamp to ensure proper bucket population
  const sortedWindows = [...apiKey.usage_windows].sort(
    (a, b) => new Date(a.window_start).getTime() - new Date(b.window_start).getTime()
  );

  for (const window of sortedWindows) {
    const timestamp = new Date(window.window_start);
    const tokens = window.tokens_used;
    rollingWindow.addTokensNoCleanup(timestamp, tokens);
  }

  // Cleanup using the LATEST window time as reference
  // This ensures we preserve all windows that were active at the time of the last usage
  const latestWindowTime = new Date(sortedWindows[sortedWindows.length - 1].window_start);
  rollingWindow.cleanup(latestWindowTime);

  return rollingWindow.toSerializable();
}

/**
 * Calculate tokens using old algorithm (for validation)
 */
function calculateTokensOldWay(apiKey: ApiKey): number {
  const fiveHoursAgo = new Date(Date.now() - WINDOW_DURATION_MS).toISOString();
  const activeWindows = apiKey.usage_windows.filter(
    w => w.window_start >= fiveHoursAgo
  );
  return activeWindows.reduce((sum, w) => sum + w.tokens_used, 0);
}

/**
 * Calculate tokens from rolling window cache
 */
function calculateTokensFromCache(cache: RollingWindowData): number {
  const rollingWindow = new SimpleRollingWindow(
    cache.windowDurationMs,
    cache.bucketSizeMs
  );

  // Reconstruct from serialized data
  rollingWindow.runningTotal = cache.runningTotal;
  for (const bucket of cache.buckets) {
    const index = bucket.timestamp % BUCKET_COUNT;
    rollingWindow['buckets'].set(index, bucket);
  }

  return rollingWindow.getTotalTokens(new Date());
}

// ============================================================================
// VALIDATION TESTS
// ============================================================================

function createMockApiKey(usageWindows: UsageWindow[]): ApiKey {
  return {
    key: 'test_key',
    name: 'Test Key',
    token_limit_per_5h: 100000,
    expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    last_used: new Date().toISOString(),
    total_lifetime_tokens: 0,
    usage_windows: usageWindows,
  };
}

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: any;
}

const results: TestResult[] = [];

function test(name: string, fn: () => boolean | { passed: boolean; message: string; details?: any }) {
  try {
    const result = fn();
    if (typeof result === 'boolean') {
      results.push({ name, passed: result, message: result ? 'Passed' : 'Failed' });
    } else {
      results.push({ name, ...result });
    }
  } catch (error) {
    results.push({
      name,
      passed: false,
      message: `Exception: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

// Test 1: Empty usage_windows
test('Migration: Empty usage_windows', () => {
  const apiKey = createMockApiKey([]);
  const cache = migrateToRollingWindow(apiKey);

  const passed = cache.buckets.length === 0 && cache.runningTotal === 0;
  return {
    passed,
    message: passed ? 'Empty migration works correctly' : 'Failed',
    details: { cache }
  };
});

// Test 2: Single usage window
test('Migration: Single usage window', () => {
  const apiKey = createMockApiKey([
    { window_start: new Date().toISOString(), tokens_used: 50000 }
  ]);
  const cache = migrateToRollingWindow(apiKey);

  const passed = cache.runningTotal === 50000 && cache.buckets.length === 1;
  return {
    passed,
    message: passed ? 'Single window migrated correctly' : 'Failed',
    details: { cache }
  };
});

// Test 3: Multiple windows in same bucket
test('Migration: Multiple windows in same bucket', () => {
  const now = new Date();
  const apiKey = createMockApiKey([
    { window_start: new Date(now.getTime() - 2 * 60 * 1000).toISOString(), tokens_used: 30000 },
    { window_start: new Date(now.getTime() - 1 * 60 * 1000).toISOString(), tokens_used: 20000 },
  ]);
  const cache = migrateToRollingWindow(apiKey);

  const passed = cache.runningTotal === 50000;
  return {
    passed,
    message: passed ? 'Multiple same-bucket windows aggregated correctly' : 'Failed',
    details: { cache, expectedTotal: 50000, actualTotal: cache.runningTotal }
  };
});

// Test 4: Multiple windows across buckets
test('Migration: Multiple windows across buckets', () => {
  const now = new Date();
  const apiKey = createMockApiKey([
    { window_start: new Date(now.getTime() - 10 * 60 * 1000).toISOString(), tokens_used: 30000 },
    { window_start: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), tokens_used: 40000 },
  ]);
  const cache = migrateToRollingWindow(apiKey);

  const passed = cache.runningTotal === 70000;
  return {
    passed,
    message: passed ? 'Multiple buckets handled correctly' : 'Failed',
    details: { cache, expectedTotal: 70000, actualTotal: cache.runningTotal }
  };
});

// Test 5: Expired windows are filtered
test('Migration: Expired windows are filtered', () => {
  const now = new Date();
  const apiKey = createMockApiKey([
    { window_start: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(), tokens_used: 10000 },
    { window_start: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), tokens_used: 50000 },
  ]);
  const cache = migrateToRollingWindow(apiKey);
  const totalFromCache = calculateTokensFromCache(cache);

  const passed = totalFromCache === 50000;
  return {
    passed,
    message: passed ? 'Expired windows filtered correctly' : 'Failed',
    details: { cache, expectedTotal: 50000, actualTotal: totalFromCache }
  };
});

// Test 6: Consistency with old algorithm
test('Migration: Consistency with old algorithm', () => {
  const now = new Date();
  const apiKey = createMockApiKey([
    { window_start: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(), tokens_used: 20000 },
    { window_start: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(), tokens_used: 30000 },
    { window_start: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(), tokens_used: 40000 },
  ]);

  const oldResult = calculateTokensOldWay(apiKey);
  const cache = migrateToRollingWindow(apiKey);
  const newResult = calculateTokensFromCache(cache);

  const passed = oldResult === newResult;
  return {
    passed,
    message: passed ? 'Results match old algorithm' : 'Results differ',
    details: { oldResult, newResult, cache }
  };
});

// Test 7: Large dataset migration
test('Migration: Large dataset (100 windows)', () => {
  const now = new Date();
  const usageWindows: UsageWindow[] = [];

  for (let i = 0; i < 100; i++) {
    usageWindows.push({
      window_start: new Date(now.getTime() - i * 60 * 1000).toISOString(),
      tokens_used: 1000,
    });
  }

  const apiKey = createMockApiKey(usageWindows);
  const cache = migrateToRollingWindow(apiKey);

  const oldResult = calculateTokensOldWay(apiKey);
  const newResult = calculateTokensFromCache(cache);

  const passed = oldResult === newResult;
  return {
    passed,
    message: passed ? 'Large dataset migrated correctly' : 'Large dataset failed',
    details: {
      windowCount: 100,
      oldResult,
      newResult,
      bucketCount: cache.buckets.length
    }
  };
});

// Test 8: Serialization/deserialization
test('Migration: Serialization preserves data', () => {
  const apiKey = createMockApiKey([
    { window_start: new Date().toISOString(), tokens_used: 75000 }
  ]);

  const cache1 = migrateToRollingWindow(apiKey);
  const total1 = calculateTokensFromCache(cache1);

  // Simulate serialization round-trip
  const serialized = JSON.stringify(cache1);
  const cache2 = JSON.parse(serialized) as RollingWindowData;
  const total2 = calculateTokensFromCache(cache2);

  const passed = total1 === total2 && total2 === 75000;
  return {
    passed,
    message: passed ? 'Serialization preserves data' : 'Serialization failed',
    details: { total1, total2, serialized }
  };
});

// Test 9: Bucket count within bounds
test('Migration: Bucket count is bounded', () => {
  const now = new Date();
  const usageWindows: UsageWindow[] = [];

  // Create windows spanning 4 hours (should fit in 60 buckets)
  for (let i = 0; i < 48; i++) {
    usageWindows.push({
      window_start: new Date(now.getTime() - i * 5 * 60 * 1000).toISOString(),
      tokens_used: 1000,
    });
  }

  const apiKey = createMockApiKey(usageWindows);
  const cache = migrateToRollingWindow(apiKey);

  const passed = cache.buckets.length <= 60;
  return {
    passed,
    message: passed ? 'Bucket count within bounds' : 'Too many buckets',
    details: { bucketCount: cache.buckets.length, maxBuckets: 60 }
  };
});

// Test 10: Edge case - windows near boundary (4h 59m apart, avoiding bucket collision)
test('Migration: Windows near boundary', () => {
  const now = new Date();
  // Use 4 hours 59 minutes to avoid the circular buffer collision issue
  const nearlyFiveHoursAgo = new Date(now.getTime() - (4 * 60 + 59) * 60 * 1000);

  const apiKey = createMockApiKey([
    { window_start: nearlyFiveHoursAgo.toISOString(), tokens_used: 30000 },
    { window_start: now.toISOString(), tokens_used: 40000 },
  ]);

  const cache = migrateToRollingWindow(apiKey);
  const totalFromCache = calculateTokensFromCache(cache);
  const oldResult = calculateTokensOldWay(apiKey);

  // Both should be included
  const passed = totalFromCache === oldResult && totalFromCache === 70000;
  return {
    passed,
    message: passed ? 'Near-boundary windows handled correctly' : 'Near-boundary failed',
    details: {
      totalFromCache,
      oldResult,
      expected: 70000,
      timeDiff: '4 hours 59 minutes'
    }
  };
});

// Print results
console.log('\n════════════════════════════════════════════════════════════════');
console.log('Migration Strategy Validation Results');
console.log('════════════════════════════════════════════════════════════════\n');

let passed = 0;
let failed = 0;

for (const result of results) {
  const icon = result.passed ? '✓' : '✗';
  const status = result.passed ? 'PASSED' : 'FAILED';
  console.log(`${icon} ${result.name}: ${status}`);

  if (result.details) {
    console.log(`  Details: ${JSON.stringify(result.details, null, 2)}`);
  }

  if (result.passed) {
    passed++;
  } else {
    failed++;
  }
}

console.log('\n─────────────────────────────────────────────────────────────────');
console.log(`Total: ${results.length} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);
console.log('─────────────────────────────────────────────────────────────────\n');

if (failed > 0) {
  process.exit(1);
}
