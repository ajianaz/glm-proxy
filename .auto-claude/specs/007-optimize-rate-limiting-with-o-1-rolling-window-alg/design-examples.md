# Rolling Window Algorithm - Pseudocode and Examples

## Visual Representation

### Current Implementation (O(n))

```
usage_windows array (unbounded):
┌─────────────────────────────────────────────────────────────┐
│ Window1 (1h ago) │ Window2 (2h ago) │ ... │ Window100 (100h ago) │
│ 50K tokens       │ 40K tokens       │     │ 30K tokens          │
└─────────────────────────────────────────────────────────────┘
         │                    │                         │
         └────────────────────┴─────────────────────────┘
                            │
                    Filter ALL windows → O(n)
                    Sum active windows → O(n)

Result: 90K tokens (after checking all 100 windows)
```

### Proposed Implementation (O(1))

```
Rolling Window (60 buckets, 5 min each):

Time →  ────────────────────────────────────────────────>
        ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┐   ┌┐
        │ B0 │ B1 │ B2 │... │ B56│ B57│ B58│... │B59│
        │ 0  │ 0  │ 30K│... │ 10K│ 20K│ 30K│... │ 0 │
        └────┘└────┘└────┘└────┘└────┘└────┘└────┘┘   ┘┘
        ↑                                    ↑
   5 hours ago                      Current time

        Expired buckets                   Active buckets
        (subtracted from                  (included in
         running total)                   running total)

runningTotal = 90K ← Pre-calculated, O(1) access!
```

## Pseudocode

### Core RollingWindow Class

```typescript
class RollingWindow {
  private buckets: Map<number, TimeBucket>;
  private runningTotal: number;
  private readonly windowDurationMs: number;
  private readonly bucketSizeMs: number;
  private readonly bucketCount: number;

  constructor(windowDurationMs: number, bucketSizeMs: number) {
    this.windowDurationMs = windowDurationMs;
    this.bucketSizeMs = bucketSizeMs;
    this.bucketCount = Math.ceil(windowDurationMs / bucketSizeMs);
    this.buckets = new Map();
    this.runningTotal = 0;
  }

  /**
   * Add tokens to the appropriate bucket
   * Complexity: O(1)
   */
  addTokens(timestamp: Date, tokens: number): void {
    this.cleanup(timestamp);  // Remove expired buckets first

    const bucketIndex = this._getBucketIndex(timestamp);
    const bucketTime = this._getBucketTime(timestamp);

    const existingBucket = this.buckets.get(bucketIndex);

    if (existingBucket && existingBucket.timestamp === bucketTime) {
      // Add to existing bucket
      existingBucket.tokens += tokens;
    } else {
      // Create new bucket (may expire an old one)
      this._expireBucketIfNeeded(bucketIndex);
      this.buckets.set(bucketIndex, { timestamp: bucketTime, tokens });
    }

    this.runningTotal += tokens;
  }

  /**
   * Get total tokens in the active window
   * Complexity: O(1) amortized (cleanup is O(k) but amortized O(1))
   */
  getTotalTokens(currentTime: Date): number {
    this.cleanup(currentTime);  // Remove expired buckets
    return this.runningTotal;   // O(1) - direct return
  }

  /**
   * Remove expired buckets and update running total
   * Complexity: O(k) where k = expired buckets
   * Amortized: O(1) because each bucket expires exactly once
   */
  private cleanup(currentTime: Date): void {
    const expiryTime = currentTime.getTime() - this.windowDurationMs;

    for (const [index, bucket] of this.buckets) {
      if (bucket.timestamp < expiryTime) {
        this.runningTotal -= bucket.tokens;  // Subtract from total
        this.buckets.delete(index);           // Remove bucket
      }
    }
  }

  /**
   * Calculate bucket index from timestamp
   * Complexity: O(1)
   */
  private _getBucketIndex(timestamp: Date): number {
    const bucketTime = this._getBucketTime(timestamp);
    return bucketTime % this.bucketCount;
  }

  /**
   * Calculate the start time of the bucket
   * Complexity: O(1)
   */
  private _getBucketTime(timestamp: Date): number {
    return Math.floor(timestamp.getTime() / this.bucketSizeMs) * this.bucketSizeMs;
  }

  /**
   * Expire a bucket if it exists and is different from the new one
   * Complexity: O(1)
   */
  private _expireBucketIfNeeded(bucketIndex: number): void {
    const existingBucket = this.buckets.get(bucketIndex);
    if (existingBucket) {
      this.runningTotal -= existingBucket.tokens;
    }
  }

  /**
   * Convert to serializable format for storage
   */
  toSerializable(): RollingWindowData {
    return {
      buckets: Array.from(this.buckets.values()),
      runningTotal: this.runningTotal,
      lastUpdated: new Date().toISOString(),
      windowDurationMs: this.windowDurationMs,
      bucketSizeMs: this.bucketSizeMs,
    };
  }

  /**
   * Create instance from serialized data
   */
  static fromSerializable(data: RollingWindowData): RollingWindow {
    const window = new RollingWindow(data.windowDurationMs, data.bucketSizeMs);
    window.runningTotal = data.runningTotal;

    for (const bucket of data.buckets) {
      const index = window._getBucketIndex(new Date(bucket.timestamp));
      window.buckets.set(index, bucket);
    }

    return window;
  }
}
```

## Usage Example

### Checking Rate Limit

```typescript
// Setup
const apiKey: ApiKey = {
  key: 'pk_test',
  token_limit_per_5h: 100000,
  usage_windows: [
    { window_start: '2026-01-22T10:00:00Z', tokens_used: 30000 },
    { window_start: '2026-01-22T09:00:00Z', tokens_used: 40000 },
    { window_start: '2026-01-22T08:00:00Z', tokens_used: 20000 },
  ],
  // ... other fields
};

// Current implementation (O(n))
const result1 = checkRateLimit(apiKey);
// Iterates through all usage_windows → O(n)

// Proposed implementation (O(1))
const rollingWindow = RollingWindow.fromSerializable(apiKey.rolling_window_cache);
const result2 = {
  allowed: rollingWindow.getTotalTokens(new Date()) < apiKey.token_limit_per_5h,
  tokensUsed: rollingWindow.getTotalTokens(new Date()),
};
// Returns pre-calculated runningTotal → O(1)
```

### Recording Usage

```typescript
// Current implementation (O(n))
await updateApiKeyUsage(key, tokensUsed, model);
// Filters all windows to find active ones → O(n)
// Cleans up old windows → O(n)

// Proposed implementation (O(1))
const rollingWindow = RollingWindow.fromSerializable(apiKey.rolling_window_cache);
rollingWindow.addTokens(new Date(), tokensUsed);
apiKey.rolling_window_cache = rollingWindow.toSerializable();
await updateApiKeyUsage(key, tokensUsed, model);
// Add to bucket in O(1), update runningTotal in O(1)
```

## Example Scenarios

### Scenario 1: Normal Usage Pattern

```
Time: 0 min    5 min    10 min   15 min   20 min
      │        │        │        │        │
      ▼        ▼        ▼        ▼        ▼
Buckets: [10K]    [15K]    [20K]    [25K]    [30K]

runningTotal = 10K + 15K + 20K + 25K + 30K = 100K

After 5 hours and 1 minute:
Time: 300 min   305 min
      │         │
      ▼         ▼
Buckets: [10K - EXPIRED]  [new 5K]

runningTotal = 100K - 10K + 5K = 95K
```

### Scenario 2: Burst Traffic

```
Time: 0 min
      │
      ▼ Multiple requests in same bucket
Buckets: [100K]  (all accumulated in one 5-min bucket)

runningTotal = 100K

After 5 min:
Time: 5 min
      │
      ▼ More burst traffic
Buckets: [100K] [150K]

runningTotal = 250K (exceeds limit!)
```

### Scenario 3: Clock Skew Handling

```typescript
// Request comes in with future timestamp
const futureTimestamp = new Date(Date.now() + 60000); // 1 min in future

// Cap at current time
const effectiveTimestamp = new Date(Math.min(futureTimestamp.getTime(), Date.now()));
rollingWindow.addTokens(effectiveTimestamp, tokensUsed);

// Request comes in with old timestamp
const oldTimestamp = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 hours ago

// Cleanup will immediately expire it
rollingWindow.addTokens(oldTimestamp, tokensUsed);
rollingWindow.getTotalTokens(new Date()); // tokens not counted (expired)
```

## Performance Comparison

### Before: O(n) Implementation

```
Rate limit check with 100 usage windows:
- Filter windows: 100 iterations
- Sum tokens: 100 iterations
- Total: 200 operations

Time complexity: O(n) where n = 100
```

### After: O(1) Implementation

```
Rate limit check with 100 buckets:
- Cleanup expired: 0-2 iterations (typically)
- Return runningTotal: 1 operation
- Total: 1-3 operations

Time complexity: O(1) - constant regardless of bucket count
```

## Migration Example

```typescript
// Before: usage_windows only
const apiKey: ApiKey = {
  usage_windows: [
    { window_start: '2026-01-22T08:00:00Z', tokens_used: 20000 },
    { window_start: '2026-01-22T09:00:00Z', tokens_used: 40000 },
    { window_start: '2026-01-22T10:00:00Z', tokens_used: 30000 },
  ],
};

// Migration (one-time cost)
const rollingWindow = new RollingWindow(5 * 60 * 60 * 1000, 5 * 60 * 1000);
for (const window of apiKey.usage_windows) {
  rollingWindow.addTokens(new Date(window.window_start), window.tokens_used);
}
apiKey.rolling_window_cache = rollingWindow.toSerializable();

// After: both formats coexist
const apiKey: ApiKey = {
  usage_windows: [
    // ... original data (source of truth)
  ],
  rolling_window_cache: {
    buckets: [
      { timestamp: 1737542400000, tokens: 20000 },
      { timestamp: 1737546000000, tokens: 40000 },
      { timestamp: 1737549600000, tokens: 30000 },
    ],
    runningTotal: 90000,
    lastUpdated: '2026-01-22T10:30:00Z',
    windowDurationMs: 18000000,
    bucketSizeMs: 300000,
  },
};

// Subsequent checks use cache
const totalTokens = RollingWindow
  .fromSerializable(apiKey.rolling_window_cache)
  .getTotalTokens(new Date());  // O(1)
```

## Test Cases

### Test 1: Basic Addition
```typescript
const rw = new RollingWindow(18000000, 300000); // 5h window, 5min buckets
rw.addTokens(new Date('2026-01-22T10:00:00Z'), 10000);
rw.addTokens(new Date('2026-01-22T10:00:00Z'), 20000); // Same bucket

expect(rw.getTotalTokens(new Date('2026-01-22T10:30:00Z'))).toBe(30000);
```

### Test 2: Bucket Expiration
```typescript
const rw = new RollingWindow(18000000, 300000);
rw.addTokens(new Date('2026-01-22T08:00:00Z'), 10000);
rw.addTokens(new Date('2026-01-22T10:00:00Z'), 20000);

const checkTime = new Date('2026-01-22T13:01:00Z'); // 5h + 1min after first bucket
expect(rw.getTotalTokens(checkTime)).toBe(20000); // First bucket expired
```

### Test 3: Multiple Buckets
```typescript
const rw = new RollingWindow(18000000, 300000);
const baseTime = new Date('2026-01-22T10:00:00Z');

rw.addTokens(new Date(baseTime.getTime() + 0 * 300000), 10000);    // 0 min
rw.addTokens(new Date(baseTime.getTime() + 5 * 300000), 20000);    // 5 min
rw.addTokens(new Date(baseTime.getTime() + 10 * 300000), 30000);   // 10 min

expect(rw.getTotalTokens(new Date(baseTime.getTime() + 15 * 300000))).toBe(60000);
```

### Test 4: Sparse Buckets
```typescript
const rw = new RollingWindow(18000000, 300000);
const baseTime = new Date('2026-01-22T10:00:00Z');

rw.addTokens(baseTime, 10000);  // Bucket at 0 min
rw.addTokens(new Date(baseTime.getTime() + 60 * 300000), 20000);  // Bucket at 60 min

expect(rw.getTotalTokens(new Date(baseTime.getTime() + 65 * 300000))).toBe(30000);
expect(rw.buckets.size).toBe(2); // Only 2 buckets stored
```

## Complexity Analysis

### Space Complexity

Per API key:
- **Best case**: O(1) - 1 bucket
- **Average case**: O(5-15) - typical usage spread across buckets
- **Worst case**: O(60) - all 60 buckets active

### Time Complexity

| Operation | Best Case | Average Case | Worst Case |
|-----------|-----------|--------------|------------|
| addTokens | O(1) | O(1) | O(k) |
| getTotalTokens | O(1) | O(1) | O(k) |
| cleanup | O(0) | O(1-2) | O(60) |

Where k = number of expired buckets (typically 0-5)

### Amortized Analysis

Each bucket is:
1. **Created**: Once, in O(1)
2. **Read**: Multiple times, in O(1) each
3. **Expired**: Once, in O(1)

Total operations per bucket over its lifetime: O(1)
Therefore, amortized cost per operation: **O(1)**
