# LRU Cache with TTL - Design Document

**Author:** Auto-Claude
**Date:** 2026-01-22
**Status:** Design Phase
**Related Task:** 1.1 - Design cache data structure and interfaces

---

## Overview

This document outlines the design for an in-memory LRU (Least Recently Used) cache with TTL (Time-To-Live) support to eliminate file I/O overhead on every authenticated request. The cache will be integrated into the storage layer to cache API key lookups.

---

## 1. Core Interfaces

### 1.1 CacheEntry Interface

Represents a single cache entry with value, timestamp, and TTL tracking.

```typescript
interface CacheEntry<T> {
  /** The cached value (can be null for not-found keys) */
  value: T | null;
  /** Unix timestamp when this entry was created/updated (milliseconds) */
  timestamp: number;
  /** Time-to-live in milliseconds (default: 300000 = 5 minutes) */
  ttl: number;
}
```

**Design Decisions:**
- `value` is generic `<T | null>` to support caching of both `ApiKey` objects and `null` (for not-found keys)
- `timestamp` uses Unix milliseconds for efficient TTL comparisons
- `ttl` is stored per-entry to allow for dynamic TTL configuration in the future
- Null caching prevents repeated file lookups for invalid keys

### 1.2 LRUCache Interface

The main cache interface providing all CRUD operations.

```typescript
interface LRUCache<T> {
  /**
   * Retrieve a value from cache by key.
   * Returns null if key doesn't exist or entry has expired.
   * Updates the entry's "recently used" status on hit.
   */
  get(key: string): T | null;

  /**
   * Store a value in cache with optional TTL override.
   * If key exists, updates value and timestamp.
   * If cache is full, evicts least recently used entry.
   */
  set(key: string, value: T | null, ttl?: number): void;

  /**
   * Check if a key exists in cache (without retrieving).
   * Returns false for expired entries.
   */
  has(key: string): boolean;

  /**
   * Delete a specific entry from cache.
   * No-op if key doesn't exist.
   */
  delete(key: string): void;

  /**
   * Clear all entries from cache.
   * Resets statistics but preserves configuration.
   */
  clear(): void;

  /**
   * Get current cache size (number of entries).
   */
  readonly size: number;

  /**
   * Get maximum cache size limit.
   */
  readonly maxSize: number;

  /**
   * Get cache statistics (hits, misses, hit rate).
   */
  getStats(): CacheStats;
}

interface CacheStats {
  /** Number of successful cache retrievals */
  hits: number;
  /** Number of cache misses (not found or expired) */
  misses: number;
  /** Hit rate as percentage (0-100) */
  hitRate: number;
  /** Current number of entries */
  size: number;
  /** Maximum number of entries allowed */
  maxSize: number;
}
```

---

## 2. Cache Implementation Strategy

### 2.1 Data Structure

The cache will use a hybrid data structure for O(1) operations:

```typescript
class LRUCacheImpl<T> implements LRUCache<T> {
  // Map for O(1) lookups: key -> CacheEntry<T>
  private cache: Map<string, CacheEntry<T>>;

  // Doubly-linked list for LRU tracking (most recent -> least recent)
  private head: LRUNode | null = null;
  private tail: LRUNode | null = null;

  // Statistics tracking
  private hits: number = 0;
  private misses: number = 0;

  constructor(
    private maxSize: number = 1000,
    private defaultTTL: number = 300000 // 5 minutes
  ) {
    this.cache = new Map();
  }
}

interface LRUNode {
  key: string;
  prev: LRUNode | null;
  next: LRUNode | null;
}
```

**Rationale:**
- `Map` provides O(1) key lookup
- Doubly-linked list enables O(1) LRU eviction
- LRU list is updated on every `get()` and `set()` operation

### 2.2 LRU Eviction Algorithm

When the cache reaches `maxSize`, the least recently used entry is evicted:

1. Entry accessed via `get()` → moved to head (most recent)
2. Entry added via `set()` → added to head (most recent)
3. When `size > maxSize` → remove tail node and its Map entry

**Pseudocode:**
```typescript
private evictLRU(): void {
  if (this.tail) {
    this.cache.delete(this.tail.key);
    this.removeNode(this.tail);
  }
}

private moveToFront(key: string): void {
  // Remove node from current position
  // Add node to head of list
}
```

### 2.3 TTL Expiration

TTL is checked on every `get()` operation using lazy expiration:

```typescript
get(key: string): T | null {
  const entry = this.cache.get(key);

  if (!entry) {
    this.misses++;
    return null;
  }

  // Check if entry has expired
  const now = Date.now();
  const isExpired = (now - entry.timestamp) > entry.ttl;

  if (isExpired) {
    this.delete(key); // Remove expired entry
    this.misses++;
    return null;
  }

  this.hits++;
  this.moveToFront(key); // Update LRU status
  return entry.value;
}
```

**Design Decision:**
- No background cleanup thread - lazy expiration is simpler and sufficient
- Expired entries are removed on access (eventual consistency)
- Memory overhead is bounded by `maxSize`

---

## 3. Integration with Storage Layer

### 3.1 Modified findApiKey Function

The cache will be integrated into `src/storage.ts` by modifying the `findApiKey` function:

```typescript
// Import the singleton cache instance
import { apiKeyCache } from './cache.js';

export async function findApiKey(key: string): Promise<ApiKey | null> {
  // Check cache first (fast path)
  const cached = apiKeyCache.get(key);

  if (cached !== null) {
    // Cache hit - return cached ApiKey
    return cached;
  }

  if (cached === null && apiKeyCache.has(key)) {
    // Cached as null - key was previously not found
    return null;
  }

  // Cache miss - fall back to file read
  return await withLock(async () => {
    const data = await readApiKeys();
    const apiKey = data.keys.find(k => k.key === key) || null;

    // Populate cache for future requests
    apiKeyCache.set(key, apiKey);

    return apiKey;
  });
}
```

**Key Changes:**
1. Cache checked **before** acquiring file lock (eliminates lock contention)
2. Found keys cached as `ApiKey` object
3. Not-found keys cached as `null` (prevents repeated lookups)
4. Original file read logic preserved as fallback

### 3.2 Cache Invalidation on Write Operations

When API keys are modified, the cache must be invalidated to maintain consistency:

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

    // ... update logic ...

    await writeApiKeys(data);

    // Invalidate cache entry after successful write
    apiKeyCache.delete(key);
  });
}
```

**Invalidation Strategy:**
- Selective invalidation: only delete the modified key
- Alternative: full cache clear if multiple keys modified
- Cache will repopulate on next `findApiKey` call

### 3.3 Singleton Cache Instance

A singleton instance will be created in `src/cache.ts`:

```typescript
// Default configuration from environment variables
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || '300000');
const CACHE_MAX_SIZE = parseInt(process.env.CACHE_MAX_SIZE || '1000');
const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';

// Export singleton instance for API key caching
export const apiKeyCache: LRUCache<ApiKey> = new LRUCacheImpl<ApiKey>(
  CACHE_MAX_SIZE,
  CACHE_TTL_MS
);
```

---

## 4. Configuration Options

All cache settings are configurable via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CACHE_TTL_MS` | `300000` (5 min) | Time-to-live for cache entries in milliseconds |
| `CACHE_MAX_SIZE` | `1000` | Maximum number of entries before LRU eviction |
| `CACHE_ENABLED` | `true` | Enable/disable caching globally |
| `CACHE_WARMUP_ON_START` | `false` | Pre-load all API keys on startup |
| `CACHE_LOG_LEVEL` | `none` | Logging verbosity: `none`, `debug`, `info` |

---

## 5. Memory and Performance Considerations

### 5.1 Memory Usage

**Estimated memory per entry:**
- CacheEntry overhead: ~32 bytes
- ApiKey object: ~400 bytes (average)
- LRU node: ~48 bytes
- **Total per entry: ~480 bytes**

**Total memory usage:**
- 1000 entries × 480 bytes ≈ **480 KB** (well within acceptable limits)

### 5.2 Performance Targets

| Metric | Without Cache | With Cache | Improvement |
|--------|--------------|------------|-------------|
| Cache hit latency | 5-50 ms | <1 ms | **10-50x faster** |
| File I/O operations | 1 per request | 0.05 per request | **95% reduction** |
| Lock contention | High (up to 500ms) | None | **Eliminated** |
| Concurrent requests | Limited by lock | Unlimited | **Scalable** |

---

## 6. Testing Strategy

### 6.1 Unit Tests (test/cache.test.ts)

- ✅ Basic `get()`/`set()` operations
- ✅ TTL expiration after 5 minutes
- ✅ LRU eviction when `maxSize` reached
- ✅ Statistics tracking (hits/misses/hitRate)
- ✅ `delete()` and `clear()` operations
- ✅ Null value caching (not-found keys)
- ✅ Concurrent access safety

### 6.2 Integration Tests (test/storage.test.ts)

- ✅ Cache hit path returns correct `ApiKey`
- ✅ Cache miss triggers file read and populates cache
- ✅ Not-found keys cached as `null`
- ✅ Cache invalidation on `updateApiKeyUsage`
- ✅ All existing storage tests still pass

### 6.3 Performance Benchmarks (test/benchmarks/cache-benchmark.test.ts)

- ✅ Measure latency: cache hit vs file read
- ✅ Measure throughput: concurrent requests
- ✅ Measure I/O reduction percentage
- ✅ Validate >10x improvement target

---

## 7. Edge Cases and Error Handling

### 7.1 Cache Coherency

**Risk:** Concurrent file updates may stale cached entries.

**Mitigation:**
- TTL of 5 minutes limits staleness window
- Write operations invalidate relevant cache entries
- Cache is secondary source of truth (file is primary)

### 7.2 Memory Bloat

**Risk:** Many unique API keys could consume unbounded memory.

**Mitigation:**
- `maxSize` limit with LRU eviction
- Entry size is bounded (~480 bytes each)
- 1000 entry limit = ~480 KB max

### 7.3 TTL Accuracy

**Risk:** High load may delay expiration checks.

**Mitigation:**
- TTL checked on every `get()` operation (lazy expiration)
- No background thread to introduce complexity
- Eventual consistency is acceptable for this use case

### 7.4 Authentication Breakage

**Risk:** Cache bugs could break authentication flow.

**Mitigation:**
- Cache fallback to file read on miss
- Comprehensive integration tests
- Feature flag (`CACHE_ENABLED`) to disable if issues arise
- Cache returns `null` for not-found keys (same as file)

---

## 8. Implementation Checklist

**Phase 1: Design (This Document)**
- [x] Define CacheEntry interface
- [x] Define LRUCache interface
- [x] Document LRU eviction policy
- [x] Plan integration with storage.ts

**Phase 2: Implementation**
- [ ] Create `src/cache.ts` with LRUCacheImpl class
- [ ] Implement get/set/delete/has/clear methods
- [ ] Add TTL expiration logic
- [ ] Add LRU eviction logic
- [ ] Add statistics tracking
- [ ] Create singleton apiKeyCache instance

**Phase 3: Integration**
- [ ] Modify `findApiKey()` to use cache
- [ ] Add cache invalidation to `updateApiKeyUsage()`
- [ ] Optional: Add cache warm-up on startup

**Phase 4: Testing**
- [ ] Write unit tests for cache module
- [ ] Write integration tests for storage layer
- [ ] Write performance benchmarks
- [ ] Run all existing tests

**Phase 5: Monitoring**
- [ ] Add `/cache/stats` endpoint
- [ ] Add debug logging (optional)
- [ ] Update documentation

---

## 9. Acceptance Criteria

Subtask 1.1 will be considered complete when:

- [x] CacheEntry interface defined with value, timestamp, ttl
- [x] LRUCache interface defined with get, set, delete, clear, has methods
- [x] Cache size limits and LRU eviction policy documented
- [x] Integration approach with storage.ts documented
- [x] All design decisions justified with rationale
- [x] Edge cases and mitigations documented

---

## 10. References

- Original Spec: `./spec.md`
- Implementation Plan: `./implementation_plan.json`
- Context: `./context.json`
- Code Patterns: TypeScript/Bun, Hono framework, Vitest testing

---

**Next Step:** Proceed to subtask 1.2 - Plan cache invalidation strategy
