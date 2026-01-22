# Rolling Window Implementation Guide

## Quick Reference

### Configuration Constants

```typescript
const WINDOW_DURATION_MS = 5 * 60 * 60 * 1000;  // 5 hours in milliseconds
const BUCKET_SIZE_MS = 5 * 60 * 1000;            // 5 minutes in milliseconds
const BUCKET_COUNT = 60;                         // 5 hours / 5 minutes = 60 buckets
```

### Type Definitions

```typescript
// Add to src/types.ts
interface TimeBucket {
  timestamp: number;  // Bucket start time in milliseconds since epoch
  tokens: number;     // Total tokens consumed in this bucket
}

interface RollingWindowData {
  buckets: TimeBucket[];      // Array of active buckets (sparse)
  runningTotal: number;       // Pre-calculated sum of all active buckets
  lastUpdated: string;        // ISO timestamp of last update
  windowDurationMs: number;   // Window duration (default: 18000000)
  bucketSizeMs: number;       // Bucket size (default: 300000)
}

// Update ApiKey interface
interface ApiKey {
  // ... existing fields
  rolling_window_cache?: RollingWindowData;  // Optional cache field
}
```

## Implementation Checklist

### Phase 2: RollingWindow Class

**File**: `src/rolling-window.ts`

- [ ] Create `RollingWindow` class
- [ ] Constructor: initialize window duration, bucket size, bucket count
- [ ] `addTokens(timestamp, tokens)`: Add tokens to appropriate bucket
- [ ] `getTotalTokens(currentTime)`: Return running total after cleanup
- [ ] `cleanup(currentTime)`: Remove expired buckets
- [ ] `_getBucketIndex(timestamp)`: Calculate bucket index
- [ ] `_getBucketTime(timestamp)`: Calculate bucket start time
- [ ] `_expireBucketIfNeeded(index)`: Subtract expired bucket from total
- [ ] `toSerializable()`: Convert to JSON-serializable format
- [ ] `static fromSerializable(data)`: Create instance from data

**Key Implementation Details**:

1. **Bucket Index Calculation**:
   ```typescript
   const bucketTime = Math.floor(timestamp.getTime() / bucketSizeMs) * bucketSizeMs;
   const index = bucketTime % bucketCount;
   ```

2. **Running Total Maintenance**:
   ```typescript
   // When adding tokens
   this.runningTotal += tokens;

   // When expiring bucket
   this.runningTotal -= bucket.tokens;
   ```

3. **Cleanup Logic**:
   ```typescript
   const expiryTime = currentTime.getTime() - this.windowDurationMs;
   for (const [index, bucket] of this.buckets) {
     if (bucket.timestamp < expiryTime) {
       this.runningTotal -= bucket.tokens;
       this.buckets.delete(index);
     }
   }
   ```

### Phase 3: ApiKey Type Extension

**File**: `src/types.ts`

- [ ] Add `TimeBucket` interface
- [ ] Add `RollingWindowData` interface
- [ ] Add optional `rolling_window_cache` field to `ApiKey` interface

### Phase 4: Rate Limit Logic

**File**: `src/ratelimit.ts`

- [ ] Import `RollingWindow` class
- [ ] Modify `checkRateLimit()` to use rolling window cache
- [ ] Add fallback to old algorithm if cache doesn't exist
- [ ] Initialize cache from `usage_windows` on first check
- [ ] Update window calculation logic

**Implementation Pattern**:
```typescript
export function checkRateLimit(key: ApiKey): RateLimitCheck {
  const now = new Date();
  let totalTokensUsed: number;

  // Try to use rolling window cache
  if (key.rolling_window_cache) {
    const rollingWindow = RollingWindow.fromSerializable(key.rolling_window_cache);
    totalTokensUsed = rollingWindow.getTotalTokens(now);
    // Update cache in key (will be persisted by storage layer)
    key.rolling_window_cache = rollingWindow.toSerializable();
  } else {
    // Fallback to old algorithm and initialize cache
    totalTokensUsed = /* old filter + reduce logic */;
    // Initialize cache from usage_windows
    const rollingWindow = new RollingWindow(WINDOW_DURATION_MS, BUCKET_SIZE_MS);
    for (const window of key.usage_windows) {
      rollingWindow.addTokens(new Date(window.window_start), window.tokens_used);
    }
    key.rolling_window_cache = rollingWindow.toSerializable();
  }

  // ... rest of the function remains the same
}
```

### Phase 5: Storage Logic

**File**: `src/storage.ts`

- [ ] Import `RollingWindow` class
- [ ] Modify `updateApiKeyUsage()` to update rolling window cache
- [ ] Add `migrateToRollingWindow(key)` helper function
- [ ] Keep `usage_windows` as source of truth
- [ ] Use `rolling_window_cache` for O(1) performance

**Implementation Pattern**:
```typescript
export async function updateApiKeyUsage(
  key: string,
  tokensUsed: number,
  model: string
): Promise<void> {
  await withLock(async () => {
    const data = await readApiKeys();
    const keyIndex = data.keys.findIndex(k => k.key === key);

    if (keyIndex === -1) return;

    const apiKey = data.keys[keyIndex];
    const now = new Date().toISOString();

    // Update last_used and total tokens
    apiKey.last_used = now;
    apiKey.total_lifetime_tokens += tokensUsed;

    // Update usage_windows (source of truth)
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    let currentWindow = apiKey.usage_windows.find(
      w => w.window_start >= fiveHoursAgo
    );

    if (!currentWindow) {
      currentWindow = { window_start: now, tokens_used: 0 };
      apiKey.usage_windows.push(currentWindow);
    }

    currentWindow.tokens_used += tokensUsed;

    // Clean up old windows
    apiKey.usage_windows = apiKey.usage_windows.filter(
      w => w.window_start >= fiveHoursAgo
    );

    // Update rolling window cache (O(1) performance)
    if (!apiKey.rolling_window_cache) {
      // Initialize cache from existing usage_windows
      apiKey.rolling_window_cache = migrateToRollingWindow(apiKey);
    }

    const rollingWindow = RollingWindow.fromSerializable(apiKey.rolling_window_cache);
    rollingWindow.addTokens(new Date(now), tokensUsed);
    apiKey.rolling_window_cache = rollingWindow.toSerializable();

    await writeApiKeys(data);
  });
}

function migrateToRollingWindow(apiKey: ApiKey): RollingWindowData {
  const rollingWindow = new RollingWindow(WINDOW_DURATION_MS, BUCKET_SIZE_MS);

  for (const window of apiKey.usage_windows) {
    rollingWindow.addTokens(new Date(window.window_start), window.tokens_used);
  }

  return rollingWindow.toSerializable();
}
```

## Testing Strategy

### Unit Tests (test/rolling-window.test.ts)

```typescript
describe('RollingWindow', () => {
  describe('addTokens', () => {
    it('should add tokens to correct bucket');
    it('should accumulate tokens in same bucket');
    it('should create new bucket when time advances');
    it('should expire old bucket when creating new one in same slot');
  });

  describe('getTotalTokens', () => {
    it('should return 0 for empty window');
    it('should sum tokens across multiple buckets');
    it('should ignore expired buckets');
    it('should handle window boundary correctly');
  });

  describe('cleanup', () => {
    it('should remove buckets older than window duration');
    it('should update running total after cleanup');
    it('should handle empty buckets array');
  });

  describe('serialization', () => {
    it('should serialize and deserialize correctly');
    it('should preserve running total');
    it('should preserve all buckets');
  });
});
```

### Integration Tests (test/ratelimit.test.ts)

```typescript
describe('Rate Limiting with Rolling Window', () => {
  it('should use cache when available');
  it('should initialize cache from usage_windows on first check');
  it('should maintain backwards compatibility with old format');
  it('should produce same results as old algorithm');
});
```

### Performance Tests (bench/ratelimit.bench.ts)

```typescript
describe('Performance', () => {
  it('should check rate limit in O(1) time');
  it('should update usage in O(1) time');
  it('should be faster than old algorithm with many windows');

  const datasets = [
    { name: 'small', windows: 10 },
    { name: 'medium', windows: 100 },
    { name: 'large', windows: 1000 },
  ];

  for (const dataset of datasets) {
    it(`should handle ${dataset.name} dataset efficiently`, () => {
      // Benchmark implementation
    });
  }
});
```

## Common Pitfalls

### ❌ Don't Do This

```typescript
// DON'T: Recalculate total on every check
getTotalTokens(currentTime: Date): number {
  this.cleanup(currentTime);
  return Array.from(this.buckets.values())
    .reduce((sum, b) => sum + b.tokens, 0);  // O(n)!
}

// DON'T: Forget to update running total
addTokens(timestamp: Date, tokens: number): void {
  const bucket = this.getOrCreateBucket(timestamp);
  bucket.tokens += tokens;
  // Missing: this.runningTotal += tokens;
}

// DON'T: Use array instead of Map for buckets
private buckets: TimeBucket[];  // O(n) lookup!
```

### ✅ Do This Instead

```typescript
// DO: Return pre-calculated total
getTotalTokens(currentTime: Date): number {
  this.cleanup(currentTime);
  return this.runningTotal;  // O(1)!
}

// DO: Always update running total
addTokens(timestamp: Date, tokens: number): void {
  const bucket = this.getOrCreateBucket(timestamp);
  bucket.tokens += tokens;
  this.runningTotal += tokens;  // ✓ O(1)
}

// DO: Use Map for O(1) bucket access
private buckets: Map<number, TimeBucket>;  // O(1) lookup!
```

## Verification Steps

1. **Run tests**: `bun test`
2. **Check performance**: `bun test bench/ratelimit.bench.ts`
3. **Manual verification**:
   - Create API key
   - Make requests that consume tokens
   - Check rate limit enforcement
   - Verify cache is populated
   - Verify O(1) performance with many windows

## Migration Path

### Step 1: Deploy with both formats
- Old: `usage_windows` (source of truth)
- New: `rolling_window_cache` (optional cache)

### Step 2: Initialize cache on first access
- Check if `rolling_window_cache` exists
- If not, migrate from `usage_windows`
- Store cache for subsequent access

### Step 3: Gradual rollout
- Monitor performance
- Verify correctness
- Watch for edge cases

### Step 4: Full migration (future)
- After verification, can remove `usage_windows`
- Use `rolling_window_cache` as source of truth
- Update storage format

## Performance Expectations

### Before (O(n))
- 10 windows: ~0.1ms
- 100 windows: ~1ms
- 1000 windows: ~10ms

### After (O(1))
- Any number of windows: ~0.01ms
- Consistent performance regardless of data size
- 100x faster for large datasets

## Debugging Tips

### Enable Logging (for development only)

```typescript
class RollingWindow {
  private debug = false;

  addTokens(timestamp: Date, tokens: number): void {
    if (this.debug) {
      console.log(`[RollingWindow] Adding ${tokens} tokens at ${timestamp.toISOString()}`);
      console.log(`[RollingWindow] Bucket index: ${this._getBucketIndex(timestamp)}`);
      console.log(`[RollingWindow] Running total: ${this.runningTotal}`);
    }
    // ... implementation
  }
}
```

### Validate Running Total

```typescript
// Add validation method
validate(): boolean {
  const actualTotal = Array.from(this.buckets.values())
    .reduce((sum, b) => sum + b.tokens, 0);
  if (actualTotal !== this.runningTotal) {
    throw new Error(`Running total mismatch: expected ${actualTotal}, got ${this.runningTotal}`);
  }
  return true;
}
```

## Resources

- Design document: `design.md`
- Examples: `design-examples.md`
- Implementation plan: `implementation_plan.json`
- Spec: `spec.md`
