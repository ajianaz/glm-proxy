# O(1) Rolling Window Algorithm Design

## Overview

This document outlines the design for a time-bucket based sliding window algorithm that maintains O(1) complexity for both reads and updates, replacing the current O(n) implementation in `ratelimit.ts`.

## Current Implementation Problem

The existing `checkRateLimit()` function in `src/ratelimit.ts` filters the entire `usage_windows` array on every check:

```typescript
const activeWindows = key.usage_windows.filter(
  w => w.window_start >= fiveHoursAgo
);
const totalTokensUsed = activeWindows.reduce(
  (sum, w) => sum + w.tokens_used,
  0
);
```

**Complexity**: O(n) where n = total number of usage_windows stored for the key

**Issue**: For keys with hundreds of windows (e.g., high-volume usage over weeks), this creates unnecessary CPU overhead on every rate limit check.

## Proposed Solution: Time-Bucket Based Rolling Window

### Algorithm Design

The algorithm uses fixed-size time buckets to aggregate token usage. Instead of storing individual usage windows, we maintain:

1. **Fixed-size buckets** (e.g., 5-minute buckets)
2. **Pre-calculated running total** of all active buckets
3. **Automatic expiration** of old buckets

### Data Structure

```typescript
interface TimeBucket {
  timestamp: number;  // Bucket start time in milliseconds
  tokens: number;     // Total tokens in this bucket
}

interface RollingWindowData {
  buckets: TimeBucket[];      // Array of buckets (circular buffer)
  runningTotal: number;       // Pre-calculated sum of active buckets
  lastUpdated: string;        // ISO timestamp of last update
  windowDurationMs: number;   // Window duration (5 hours = 18000000ms)
  bucketSizeMs: number;       // Bucket size (5 minutes = 300000ms)
}
```

### Configuration

- **Window Duration**: 5 hours (18000000ms)
- **Bucket Size**: 5 minutes (300000ms)
- **Total Buckets**: 60 (5 hours / 5 minutes)
- **Data Structure**: Circular buffer or sparse array

### Operations and Complexity

#### 1. Check Rate Limit (O(1) amortized)

```typescript
function getTotalTokens(currentTime: Date): number {
  cleanup(currentTime);  // Remove expired buckets - O(k) where k = expired buckets
  return runningTotal;   // O(1) - direct return
}
```

**Complexity**: O(1) amortized
- Cleanup is O(k) where k = number of expired buckets
- Amortized O(1) because each bucket is cleaned up exactly once
- The running total is pre-calculated and returned in O(1)

#### 2. Add Tokens (O(1))

```typescript
function addTokens(timestamp: Date, tokens: number): void {
  const bucketIndex = getBucketIndex(timestamp);  // O(1) - direct calculation

  if (buckets[bucketIndex]?.timestamp === bucketTime) {
    // Add to existing bucket
    buckets[bucketIndex].tokens += tokens;
  } else {
    // Create new bucket, expire old one if needed
    expireBucket(bucketIndex);  // O(1) - at most one bucket expires
    buckets[bucketIndex] = { timestamp: bucketTime, tokens };
  }

  runningTotal += tokens;  // O(1) - simple addition
}
```

**Complexity**: O(1)
- Bucket index calculation: O(1)
- Adding to bucket: O(1)
- Updating running total: O(1)

#### 3. Cleanup Expired Buckets (O(k))

```typescript
function cleanup(currentTime: Date): void {
  const expiryTime = currentTime.getTime() - windowDurationMs;

  for (const bucket of buckets) {
    if (bucket.timestamp < expiryTime) {
      runningTotal -= bucket.tokens;  // Subtract from running total
      bucket.tokens = 0;              // Clear bucket
    }
  }
}
```

**Complexity**: O(k) where k = number of expired buckets
- Amortized O(1) because each bucket is expired exactly once
- In practice, very few buckets expire per operation

### Key Design Decisions

#### 1. Bucket Size Selection

**Options considered:**
- 1-minute buckets (300 buckets): More granular, more memory, slower cleanup
- 5-minute buckets (60 buckets): **SELECTED** - Good balance of precision and performance
- 10-minute buckets (30 buckets): Less precise, faster cleanup

**Rationale**: 5-minute buckets provide:
- Sufficient precision for rate limiting (±5 minutes)
- Manageable memory footprint (60 buckets)
- Fast cleanup operations

#### 2. Running Total Maintenance

**Strategy**: Incrementally update running total on every add operation

**Pros:**
- O(1) read performance
- No need to iterate buckets on checks
- Consistent performance regardless of bucket count

**Cons:**
- Must be carefully maintained to avoid drift
- Requires expiration logic to subtract old buckets

#### 3. Bucket Indexing

**Approach**: Use circular buffer with modulo arithmetic

```typescript
function getBucketIndex(timestamp: Date): number {
  const bucketTime = Math.floor(timestamp.getTime() / bucketSizeMs) * bucketSizeMs;
  return bucketTime % bucketCount;
}
```

**Benefits**:
- O(1) bucket location
- Automatic wrapping using modulo
- Fixed memory allocation

#### 4. Sparse Bucket Storage

**Approach**: Only store buckets that have data

```typescript
buckets: Map<number, TimeBucket>  // Key = bucket index
```

**Benefits**:
- Memory efficient for low-volume keys
- Still O(1) access with Map
- No need to pre-allocate empty buckets

### Edge Cases

#### 1. Clock Skew
- Use monotonic timestamps when available
- Handle timestamps in the future (cap at current time)
- Handle timestamps in the past (expire immediately)

#### 2. Concurrent Updates
- Storage layer uses file locking (`withLock`)
- Rolling window operations are atomic within the lock
- No additional synchronization needed

#### 3. Empty State
- Initialize with empty buckets array
- runningTotal starts at 0
- First check returns 0 tokens used

#### 4. Window Boundary
- Buckets exactly at the 5-hour boundary are included
- Cleanup removes buckets older than (currentTime - 5 hours)
- Consistent with existing implementation

### Backwards Compatibility

#### Migration Strategy

1. **Storage Format**: Keep `usage_windows` as source of truth
2. **Cache Field**: Add optional `rolling_window_cache` field to ApiKey type
3. **Lazy Migration**: On first rate limit check, migrate existing data

```typescript
// In types.ts
export interface ApiKey {
  // ... existing fields
  usage_windows: UsageWindow[];  // Source of truth (persistent)
  rolling_window_cache?: RollingWindowData;  // Optional cache (runtime)
}
```

#### Migration Logic

```typescript
function migrateToRollingWindow(apiKey: ApiKey): RollingWindowData {
  const rollingWindow = new RollingWindow(5 * 60 * 60 * 1000, 5 * 60 * 1000);

  // Populate buckets from existing usage_windows
  for (const window of apiKey.usage_windows) {
    rollingWindow.addTokens(new Date(window.window_start), window.tokens_used);
  }

  return rollingWindow.toSerializable();
}
```

### Performance Characteristics

#### Memory Usage

Per API key:
- Sparse buckets: ~O(active buckets)
- With 5-minute buckets and normal usage: 5-15 buckets
- Estimated: ~200-600 bytes per key

#### Time Complexity

| Operation | Current (O(n)) | Proposed (O(1)) |
|-----------|----------------|-----------------|
| Check     | O(n)           | O(1) amortized  |
| Update    | O(n)           | O(1)            |
| Cleanup   | O(n)           | O(k) amortized  |

Where:
- n = total windows stored for key (can be 100+)
- k = expired buckets (typically 0-5)

#### Scalability

The algorithm scales efficiently with:
- **High-volume keys**: O(1) regardless of window count
- **Low-volume keys**: Minimal memory overhead
- **Burst traffic**: Fast updates, no iteration
- **Long-running**: Consistent performance over time

## Implementation Plan

See `implementation_plan.json` for detailed subtasks:
1. **Phase 1**: Design and planning (current phase)
2. **Phase 2**: Implement RollingWindow class
3. **Phase 3**: Extend ApiKey type
4. **Phase 4**: Update rate limit logic
5. **Phase 5**: Update storage logic
6. **Phase 6**: Performance testing
7. **Phase 7**: Documentation and cleanup

## Testing Strategy

### Unit Tests
- Add tokens to correct bucket
- Sum tokens across multiple buckets
- Expire old buckets and update running total
- Edge cases: empty window, single bucket, window boundary
- Clock skew handling

### Integration Tests
- Migrate existing usage_windows to rolling window
- Cache hit vs cache miss scenarios
- Backwards compatibility with old format

### Performance Tests
- Benchmark O(n) vs O(1) with 10, 100, 1000 windows
- Verify constant-time operations
- Memory usage profiling

## Alternatives Considered

### 1. Redis Sliding Window
- **Pros**: Distributed, persistent
- **Cons**: External dependency, network latency
- **Verdict**: Overkill for single-instance deployment

### 2. Fixed Window Counter
- **Pros**: Simple, O(1)
- **Cons**: Bursty at boundaries, less accurate
- **Verdict**: Doesn't meet requirements

### 3. Token Bucket Algorithm
- **Pros**: Rate limiting, smooth throttling
- **Cons**: Complex state management
- **Verdict**: Doesn't match existing usage window model

## Conclusion

The time-bucket based rolling window algorithm provides:
- **O(1)** read and update performance
- **Backwards compatible** migration path
- **Minimal** memory overhead
- **Consistent** performance regardless of data size

This design is ready for implementation in Phase 2.
