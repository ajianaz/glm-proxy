# Migration Strategy: Backwards Compatibility for Rolling Window Algorithm

## Overview

This document outlines the comprehensive strategy for migrating existing `usage_windows` data to the new O(1) rolling window format while maintaining full backwards compatibility.

## Goals

1. **Zero Downtime**: Existing deployments continue working without interruption
2. **Gradual Migration**: Migrate data lazily on first access
3. **Dual Format Support**: Support both old and new formats coexisting
4. **Safe Rollback**: Ability to revert to old algorithm if needed
5. **Data Integrity**: Ensure no data loss during migration

## Migration Approach: Lazy On-First-Access Migration

### Why Lazy Migration?

- **No upfront migration cost**: Don't need to migrate all keys at deployment
- **Natural adoption**: Active keys get migrated automatically
- **Minimal risk**: Only migrate keys that are actually used
- **Easy rollback**: Can switch back to old algorithm anytime

### Migration Flow

```
┌─────────────────────────────────────────────────────────────┐
│  API Key accessed (checkRateLimit or updateApiKeyUsage)     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │ Does cache     │──No──▶ Initialize cache from
              │ exist?         │        usage_windows (one-time)
              └────────┬───────┘
                       │ Yes
                       ▼
              ┌────────────────┐
              │ Use cache for  │
              │ O(1) operation │
              └────────────────┘
```

## Type System Changes

### Phase 1: Extend ApiKey Type

**File**: `src/types.ts`

Add new interfaces to support the rolling window cache:

```typescript
/**
 * Represents a single time bucket in the rolling window
 */
export interface TimeBucket {
  timestamp: number;  // Bucket start time in milliseconds since epoch
  tokens: number;     // Total tokens consumed in this bucket
}

/**
 * Rolling window cache data for O(1) rate limit checks
 */
export interface RollingWindowData {
  buckets: TimeBucket[];      // Array of active buckets (sparse)
  runningTotal: number;       // Pre-calculated sum of all active buckets
  lastUpdated: string;        // ISO timestamp of last update
  windowDurationMs: number;   // Window duration (default: 18000000 = 5 hours)
  bucketSizeMs: number;       // Bucket size (default: 300000 = 5 minutes)
}

/**
 * Update ApiKey interface to include optional rolling window cache
 */
export interface ApiKey {
  key: string;
  name: string;
  model?: string;
  token_limit_per_5h: number;
  expiry_date: string;
  created_at: string;
  last_used: string;
  total_lifetime_tokens: number;

  // Original format (source of truth for persistence)
  usage_windows: UsageWindow[];

  // New format (optional cache for O(1) performance)
  rolling_window_cache?: RollingWindowData;
}
```

**Key Points:**
- `rolling_window_cache` is **optional** (`?`) for backwards compatibility
- Old deployments without this field continue to work
- New deployments populate this field lazily
- Both formats coexist during transition period

## Migration Implementation

### Migration Helper Function

**File**: `src/storage.ts` (to be implemented in Phase 5)

```typescript
import { RollingWindow } from './rolling-window.js';
import type { ApiKey, RollingWindowData } from './types.js';

// Constants matching the design
const WINDOW_DURATION_MS = 5 * 60 * 60 * 1000;  // 5 hours
const BUCKET_SIZE_MS = 5 * 60 * 1000;            // 5 minutes

/**
 * Migrate existing usage_windows to rolling window cache format
 *
 * This function is called lazily on first access to an API key that doesn't
 * have a rolling window cache yet.
 *
 * @param apiKey - The API key to migrate
 * @returns RollingWindowData populated from existing usage_windows
 *
 * @example
 * ```typescript
 * if (!apiKey.rolling_window_cache) {
 *   apiKey.rolling_window_cache = migrateToRollingWindow(apiKey);
 * }
 * ```
 */
export function migrateToRollingWindow(apiKey: ApiKey): RollingWindowData {
  // Create a new RollingWindow instance
  const rollingWindow = new RollingWindow(WINDOW_DURATION_MS, BUCKET_SIZE_MS);

  // Populate buckets from existing usage_windows
  for (const window of apiKey.usage_windows) {
    const timestamp = new Date(window.window_start);
    const tokens = window.tokens_used;

    // Add tokens to appropriate bucket
    rollingWindow.addTokens(timestamp, tokens);
  }

  // Convert to serializable format
  return rollingWindow.toSerializable();
}
```

### Integration Points

#### 1. Rate Limit Check (ratelimit.ts)

**Phase 4** - Modify `checkRateLimit()` function:

```typescript
export function checkRateLimit(key: ApiKey): RateLimitCheck {
  const now = new Date();
  let totalTokensUsed: number;

  // Try to use rolling window cache for O(1) performance
  if (key.rolling_window_cache) {
    // Cache hit: O(1) operation
    const rollingWindow = RollingWindow.fromSerializable(key.rolling_window_cache);
    totalTokensUsed = rollingWindow.getTotalTokens(now);

    // Update cache (cleanup may have removed expired buckets)
    key.rolling_window_cache = rollingWindow.toSerializable();
  } else {
    // Cache miss: Use old algorithm and initialize cache
    totalTokensUsed = calculateTokensOldWay(key);

    // One-time migration: Initialize cache from existing usage_windows
    const rollingWindow = new RollingWindow(WINDOW_DURATION_MS, BUCKET_SIZE_MS);
    for (const window of key.usage_windows) {
      rollingWindow.addTokens(new Date(window.window_start), window.tokens_used);
    }
    key.rolling_window_cache = rollingWindow.toSerializable();
  }

  // ... rest of rate limit logic remains the same
}

// Keep old function for backwards compatibility and migration
function calculateTokensOldWay(key: ApiKey): number {
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const activeWindows = key.usage_windows.filter(w => w.window_start >= fiveHoursAgo);
  return activeWindows.reduce((sum, w) => sum + w.tokens_used, 0);
}
```

#### 2. Storage Update (storage.ts)

**Phase 5** - Modify `updateApiKeyUsage()` function:

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
    const now = new Date();

    // Update metadata
    apiKey.last_used = now.toISOString();
    apiKey.total_lifetime_tokens += tokensUsed;

    // Update usage_windows (source of truth for persistence)
    const fiveHoursAgo = new Date(Date.now() - WINDOW_DURATION_MS).toISOString();
    let currentWindow = apiKey.usage_windows.find(
      w => w.window_start >= fiveHoursAgo
    );

    if (!currentWindow) {
      currentWindow = { window_start: now.toISOString(), tokens_used: 0 };
      apiKey.usage_windows.push(currentWindow);
    }

    currentWindow.tokens_used += tokensUsed;

    // Clean up old windows from usage_windows
    apiKey.usage_windows = apiKey.usage_windows.filter(
      w => w.window_start >= fiveHoursAgo
    );

    // Update rolling window cache (O(1) performance)
    if (!apiKey.rolling_window_cache) {
      // Lazy migration: Initialize cache from existing usage_windows
      apiKey.rolling_window_cache = migrateToRollingWindow(apiKey);
    }

    const rollingWindow = RollingWindow.fromSerializable(apiKey.rolling_window_cache);
    rollingWindow.addTokens(now, tokensUsed);
    apiKey.rolling_window_cache = rollingWindow.toSerializable();

    // Persist both formats
    await writeApiKeys(data);
  });
}
```

## Data Coexistence Strategy

### Dual Format Persistence

During the transition period, both formats are persisted:

```json
{
  "key": "pk_test123",
  "usage_windows": [
    {
      "window_start": "2026-01-22T10:00:00Z",
      "tokens_used": 50000
    }
  ],
  "rolling_window_cache": {
    "buckets": [
      {
        "timestamp": 1737549600000,
        "tokens": 50000
      }
    ],
    "runningTotal": 50000,
    "lastUpdated": "2026-01-22T10:30:00Z",
    "windowDurationMs": 18000000,
    "bucketSizeMs": 300000
  }
}
```

### Source of Truth

**During transition:**
- `usage_windows` = Source of truth for persistence
- `rolling_window_cache` = Performance optimization cache

**After full migration (future):**
- Can remove `usage_windows` entirely
- Use `rolling_window_cache` as sole source of truth
- Update storage format to remove old field

### Synchronization Logic

Both formats are kept in sync:

```typescript
// When adding usage:
// 1. Update usage_windows (for backwards compatibility and persistence)
// 2. Update rolling_window_cache (for O(1) performance)

// When reading:
// 1. Prefer rolling_window_cache (O(1))
// 2. Fall back to usage_windows if cache doesn't exist
```

## Rollback Strategy

### Safe Rollback Procedure

If issues are discovered with the new implementation:

1. **Feature Flag**: Add environment variable to disable rolling window
   ```typescript
   const USE_ROLLING_WINDOW = process.env.USE_ROLLING_WINDOW !== 'false';
   ```

2. **Code Rollback**: Revert `checkRateLimit()` to use only old algorithm
   ```typescript
   export function checkRateLimit(key: ApiKey): RateLimitCheck {
     // Always use old algorithm
     const totalTokensUsed = calculateTokensOldWay(key);
     // ... rest of logic
   }
   ```

3. **Data Cleanup**: Remove `rolling_window_cache` fields (optional)
   ```bash
   # One-time cleanup script to remove cache fields
   node scripts/cleanup-rolling-window-cache.js
   ```

### Data Integrity Guarantees

- **No data loss**: `usage_windows` remains authoritative
- **Rebuildable**: `rolling_window_cache` can be rebuilt from `usage_windows`
- **Atomic**: File locks prevent concurrent corruption
- **Validated**: Checksums can verify cache consistency

## Testing Strategy

### Migration Tests

**File**: `test/migration.test.ts` (to be created in Phase 5)

```typescript
import { describe, test, expect } from 'bun:test';
import { migrateToRollingWindow } from '../src/storage.js';
import { RollingWindow } from '../src/rolling-window.js';
import type { ApiKey } from '../src/types.js';

describe('Migration Strategy', () => {
  test('should migrate empty usage_windows', () => {
    const apiKey: ApiKey = {
      key: 'test_empty',
      usage_windows: [],
      // ... other fields
    };

    const cache = migrateToRollingWindow(apiKey);

    expect(cache.buckets).toHaveLength(0);
    expect(cache.runningTotal).toBe(0);
  });

  test('should migrate single usage window', () => {
    const apiKey: ApiKey = {
      key: 'test_single',
      usage_windows: [
        {
          window_start: '2026-01-22T10:00:00Z',
          tokens_used: 50000,
        },
      ],
      // ... other fields
    };

    const cache = migrateToRollingWindow(apiKey);

    expect(cache.runningTotal).toBe(50000);
    expect(cache.buckets).toHaveLength(1);
  });

  test('should migrate multiple usage windows in same bucket', () => {
    const apiKey: ApiKey = {
      key: 'test_multiple_same_bucket',
      usage_windows: [
        {
          window_start: '2026-01-22T10:00:00Z',
          tokens_used: 30000,
        },
        {
          window_start: '2026-01-22T10:03:00Z',
          tokens_used: 20000,
        },
      ],
      // ... other fields
    };

    const cache = migrateToRollingWindow(apiKey);

    // Should be aggregated into single bucket
    expect(cache.runningTotal).toBe(50000);
    expect(cache.buckets).toHaveLength(1);
  });

  test('should migrate multiple usage windows across buckets', () => {
    const apiKey: ApiKey = {
      key: 'test_multiple_buckets',
      usage_windows: [
        {
          window_start: '2026-01-22T10:00:00Z',
          tokens_used: 30000,
        },
        {
          window_start: '2026-01-22T10:10:00Z',
          tokens_used: 40000,
        },
      ],
      // ... other fields
    };

    const cache = migrateToRollingWindow(apiKey);

    expect(cache.runningTotal).toBe(70000);
    expect(cache.buckets.length).toBeGreaterThanOrEqual(2);
  });

  test('should filter out expired windows during migration', () => {
    const oldWindow = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 hours ago

    const apiKey: ApiKey = {
      key: 'test_expired',
      usage_windows: [
        {
          window_start: oldWindow.toISOString(),
          tokens_used: 10000,
        },
        {
          window_start: new Date().toISOString(),
          tokens_used: 50000,
        },
      ],
      // ... other fields
    };

    const cache = migrateToRollingWindow(apiKey);
    const rollingWindow = RollingWindow.fromSerializable(cache);

    // Expired window should not be counted
    expect(rollingWindow.getTotalTokens(new Date())).toBe(50000);
  });

  test('should produce same results as old algorithm', () => {
    const apiKey: ApiKey = {
      key: 'test_consistency',
      usage_windows: [
        {
          window_start: '2026-01-22T08:00:00Z',
          tokens_used: 20000,
        },
        {
          window_start: '2026-01-22T09:00:00Z',
          tokens_used: 30000,
        },
        {
          window_start: '2026-01-22T10:00:00Z',
          tokens_used: 40000,
        },
      ],
      // ... other fields
    };

    // Calculate using old algorithm
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const oldResult = apiKey.usage_windows
      .filter(w => w.window_start >= fiveHoursAgo)
      .reduce((sum, w) => sum + w.tokens_used, 0);

    // Calculate using migrated cache
    const cache = migrateToRollingWindow(apiKey);
    const rollingWindow = RollingWindow.fromSerializable(cache);
    const newResult = rollingWindow.getTotalTokens(new Date());

    expect(newResult).toBe(oldResult);
  });
});
```

### Integration Tests

```typescript
describe('Backwards Compatibility', () => {
  test('should work with keys that have no cache', async () => {
    // Create API key without rolling_window_cache
    const apiKey = createApiKeyWithoutCache();

    // First call should migrate and use cache
    const result1 = await checkRateLimit(apiKey);

    // Second call should use existing cache
    const result2 = await checkRateLimit(apiKey);

    expect(apiKey.rolling_window_cache).toBeDefined();
    expect(result1.tokensUsed).toBe(result2.tokensUsed);
  });

  test('should work with keys that have cache', async () => {
    const apiKey = createApiKeyWithCache();

    const result = await checkRateLimit(apiKey);

    expect(result.allowed).toBeDefined();
    expect(result.tokensUsed).toBeGreaterThanOrEqual(0);
  });

  test('should maintain usage_windows as source of truth', async () => {
    const apiKey = createApiKeyWithoutCache();

    // Update usage
    await updateApiKeyUsage(apiKey.key, 1000, 'model');

    // Both formats should be updated
    expect(apiKey.usage_windows.length).toBeGreaterThan(0);
    expect(apiKey.rolling_window_cache).toBeDefined();
  });
});
```

## Deployment Strategy

### Phase 1: Deploy Type Changes (Zero Impact)

1. Add `TimeBucket` and `RollingWindowData` interfaces to `types.ts`
2. Add optional `rolling_window_cache` field to `ApiKey` interface
3. Deploy with no behavior changes
4. Verify: Existing deployments continue working

### Phase 2: Deploy RollingWindow Class (Zero Impact)

1. Create `src/rolling-window.ts` with `RollingWindow` class
2. Add comprehensive unit tests
3. Deploy with no integration yet
4. Verify: Tests pass, no production impact

### Phase 3: Deploy Migration Logic (Zero Impact)

1. Add `migrateToRollingWindow()` helper function to `storage.ts`
2. Add migration tests
3. Deploy with no calling code yet
4. Verify: Function works correctly when called manually

### Phase 4: Deploy Rate Limit Integration (Low Risk)

1. Update `checkRateLimit()` to use rolling window cache
2. Include fallback to old algorithm
3. Deploy with feature flag (disabled by default)
4. Test with feature flag enabled on staging
5. Gradually enable for production traffic

### Phase 5: Deploy Storage Integration (Low Risk)

1. Update `updateApiKeyUsage()` to maintain both formats
2. Deploy with feature flag
3. Monitor for data consistency issues
4. Gradually roll out to all keys

### Phase 6: Full Rollout (After Verification)

1. Enable rolling window for all traffic
2. Monitor performance metrics
3. Verify O(1) complexity achieved
4. Keep old algorithm as fallback

### Phase 7: Cleanup (Future, Optional)

1. After extended verification period (e.g., 30 days)
2. Remove `usage_windows` field from type
3. Remove old algorithm code
4. Data migration script to clean up old format

## Monitoring and Validation

### Metrics to Track

1. **Migration Rate**: Percentage of keys with cache populated
2. **Cache Hit Rate**: Percentage of requests using cache vs old algorithm
3. **Performance Improvement**: Time for rate limit checks (before vs after)
4. **Data Consistency**: Verify cache matches usage_windows
5. **Error Rate**: Any errors during migration or operation

### Validation Queries

```typescript
// Check migration progress
async function getMigrationStats() {
  const data = await readApiKeys();
  const totalKeys = data.keys.length;
  const migratedKeys = data.keys.filter(k => k.rolling_window_cache).length;

  return {
    total: totalKeys,
    migrated: migratedKeys,
    percentage: (migratedKeys / totalKeys) * 100,
  };
}

// Validate cache consistency
async function validateCacheConsistency() {
  const data = await readApiKeys();
  const inconsistencies = [];

  for (const key of data.keys) {
    if (!key.rolling_window_cache) continue;

    // Calculate from usage_windows
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    const fromUsageWindows = key.usage_windows
      .filter(w => w.window_start >= fiveHoursAgo)
      .reduce((sum, w) => sum + w.tokens_used, 0);

    // Calculate from cache
    const rollingWindow = RollingWindow.fromSerializable(key.rolling_window_cache);
    const fromCache = rollingWindow.getTotalTokens(new Date());

    if (fromUsageWindows !== fromCache) {
      inconsistencies.push({
        key: key.key,
        usageWindows: fromUsageWindows,
        cache: fromCache,
      });
    }
  }

  return inconsistencies;
}
```

## Edge Cases and Considerations

### 1. Empty usage_windows

**Scenario**: New API key with no usage history

**Handling**:
```typescript
if (apiKey.usage_windows.length === 0) {
  // Create empty cache
  apiKey.rolling_window_cache = {
    buckets: [],
    runningTotal: 0,
    lastUpdated: new Date().toISOString(),
    windowDurationMs: WINDOW_DURATION_MS,
    bucketSizeMs: BUCKET_SIZE_MS,
  };
}
```

### 2. All usage_windows expired

**Scenario**: Key hasn't been used in 5+ hours

**Handling**:
- Migration creates cache with all buckets
- First `getTotalTokens()` call cleans up expired buckets
- Result: empty cache with `runningTotal: 0`

### 3. Corrupted cache data

**Scenario**: `rolling_window_cache` has invalid data

**Handling**:
```typescript
try {
  const rollingWindow = RollingWindow.fromSerializable(key.rolling_window_cache);
  const total = rollingWindow.getTotalTokens(new Date());
} catch (error) {
  // Fallback: Rebuild cache from usage_windows
  key.rolling_window_cache = migrateToRollingWindow(key);
}
```

### 4. Concurrent updates

**Scenario**: Multiple requests updating same key simultaneously

**Handling**:
- File locking in `withLock()` prevents concurrent writes
- Each update is atomic within the lock
- Both formats updated together in same transaction

### 5. Clock skew

**Scenario**: Server clock changes forward/backward

**Handling**:
- Bucket calculations use relative time (milliseconds since epoch)
- Cleanup logic handles buckets with future timestamps
- Old timestamps expired immediately

### 6. Large deployment

**Scenario**: 10,000+ API keys to migrate

**Handling**:
- Lazy migration: only migrate keys that are actually used
- Migration cost: O(n) per key, one-time cost
- Typical: Only 10-20% of keys actively used
- Result: Manageable migration load

## Future Considerations

### Post-Migration Cleanup

After the rolling window algorithm is verified and stable (e.g., after 30-60 days):

1. **Remove usage_windows field**:
   ```typescript
   export interface ApiKey {
     // ... other fields
     // OLD: usage_windows: UsageWindow[];
     // NEW: Only keep rolling_window_cache
     rolling_window_cache: RollingWindowData;
   }
   ```

2. **Remove old algorithm**:
   ```typescript
   // OLD: Keep fallback function
   // NEW: Remove calculateTokensOldWay()
   ```

3. **Update storage format**:
   ```typescript
   // One-time migration script
   await removeUsageWindowsFromAllKeys();
   ```

### Storage Optimization

Future optimization to reduce storage size:

```typescript
// Current: Store full buckets array
rolling_window_cache: {
  buckets: [...],  // Can be large
  runningTotal: 0,
}

// Optimized: Store sparse buckets as Map
rolling_window_cache: {
  buckets: [["index1", bucket1], ["index2", bucket2]],  // Only active buckets
  runningTotal: 0,
}
```

## Summary

The migration strategy ensures:

✅ **Zero Downtime**: Lazy migration on first access
✅ **Backwards Compatible**: Old and new formats coexist
✅ **Safe Rollback**: Can revert to old algorithm anytime
✅ **Data Integrity**: `usage_windows` remains source of truth
✅ **Gradual Rollout**: Feature flags enable controlled deployment
✅ **Comprehensive Testing**: Migration, integration, and performance tests
✅ **Monitoring**: Track migration progress and consistency

This strategy provides a clear path from the current O(n) implementation to the O(1) rolling window algorithm while maintaining production stability and data integrity.
