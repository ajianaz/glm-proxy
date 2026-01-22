# Cache Invalidation Strategy

**Author:** Auto-Claude
**Date:** 2026-01-22
**Status:** Design Phase
**Related Task:** 1.2 - Plan cache invalidation strategy

---

## Overview

This document defines the comprehensive cache invalidation strategy for the in-memory LRU cache. It covers four key mechanisms: TTL expiration, LRU eviction, manual invalidation on updates, and cache clearing on file modifications. The strategy ensures cache coherency while maintaining high performance.

---

## 1. TTL Expiration Strategy

### 1.1 Time-To-Live Configuration

**Default TTL:** 5 minutes (300,000 milliseconds)
**Configurable via:** `CACHE_TTL_MS` environment variable

```typescript
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || '300000');
```

### 1.2 Lazy Expiration Mechanism

The cache uses **lazy expiration** - TTL is checked on every `get()` operation rather than using a background cleanup thread.

**Rationale:**
- Simpler implementation (no background threads)
- Lower overhead (no periodic scans)
- Eventual consistency is acceptable for this use case
- Memory is bounded by `maxSize` regardless

### 1.3 TTL Expiration Algorithm

```typescript
get(key: string): T | null {
  const entry = this.cache.get(key);

  if (!entry) {
    this.misses++;
    return null;
  }

  // Check if entry has expired
  const now = Date.now();
  const age = now - entry.timestamp;
  const isExpired = age > entry.ttl;

  if (isExpired) {
    // Remove expired entry
    this.cache.delete(key);
    this.removeNodeFromLRU(key);
    this.misses++;
    return null;
  }

  // Entry is valid - update LRU status and return
  this.hits++;
  this.moveToFront(key);
  return entry.value;
}
```

### 1.4 TTL Expiration Behavior

| Scenario | Action | Statistics |
|----------|--------|------------|
| Entry found, not expired | Return value, update LRU | `hits++` |
| Entry found, expired | Delete entry, return null | `misses++` |
| Entry not found | Return null | `misses++` |

### 1.5 TTL Edge Cases

**Edge Case 1: Clock Drift**
- **Issue:** System clock changes could affect TTL calculations
- **Mitigation:** Use `Date.now()` which is monotonic in most modern Node.js/Bun runtimes
- **Impact:** Minimal - worst case is slightly premature or delayed expiration

**Edge Case 2: Concurrent Access**
- **Issue:** Multiple threads checking TTL simultaneously
- **Mitigation:** JavaScript is single-threaded, but async operations could race
- **Solution:** Use Map operations which are atomic at the JavaScript level

**Edge Case 3: Zero or Negative TTL**
- **Issue:** Misconfiguration could cause immediate expiration
- **Validation:** Enforce minimum TTL of 1000ms (1 second)
- **Code:**
  ```typescript
  const defaultTTL = Math.max(1000, parseInt(ttl) || 300000);
  ```

---

## 2. LRU Eviction Strategy

### 2.1 Size Limit Configuration

**Default Max Size:** 1000 entries
**Configurable via:** `CACHE_MAX_SIZE` environment variable

```typescript
const CACHE_MAX_SIZE = parseInt(process.env.CACHE_MAX_SIZE || '1000');
```

### 2.2 LRU Data Structure

The cache maintains a doubly-linked list to track usage order:

```typescript
interface LRUNode {
  key: string;
  prev: LRUNode | null;
  next: LRUNode | null;
}

class LRUCacheImpl<T> {
  private cache: Map<string, CacheEntry<T>>;  // O(1) lookup
  private head: LRUNode | null = null;  // Most recently used
  private tail: LRUNode | null = null;  // Least recently used
}
```

**List Structure:**
- `head` → Most recently accessed entry
- `tail` → Least recently accessed entry (eviction candidate)

### 2.3 LRU Update Rules

The LRU list is updated on every cache access:

| Operation | LRU Action |
|-----------|------------|
| `get(key)` - hit | Move node to head (most recent) |
| `set(key, value)` - existing key | Move node to head (most recent) |
| `set(key, value)` - new key | Add node to head (most recent) |
| `delete(key)` | Remove node from list |
| `clear()` | Reset head and tail to null |

### 2.4 LRU Eviction Algorithm

When the cache is full and a new entry is added:

```typescript
set(key: string, value: T | null, ttl?: number): void {
  // If key exists, update and move to front
  if (this.cache.has(key)) {
    this.updateExistingEntry(key, value, ttl);
    this.moveToFront(key);
    return;
  }

  // Check if cache is full
  if (this.cache.size >= this.maxSize) {
    this.evictLRU();
  }

  // Add new entry
  const entry: CacheEntry<T> = {
    value,
    timestamp: Date.now(),
    ttl: ttl || this.defaultTTL
  };

  this.cache.set(key, entry);
  this.addToFront(key);
}
```

**Eviction Method:**

```typescript
private evictLRU(): void {
  if (!this.tail) {
    return; // Cache is empty
  }

  // Remove least recently used entry
  const lruKey = this.tail.key;
  this.cache.delete(lruKey);
  this.removeNode(this.tail);
}
```

### 2.5 LRU Eviction Behavior

| Scenario | Action | Statistics Impact |
|----------|--------|-------------------|
| Cache not full | Add entry normally | None |
| Cache full, existing key | Update value, move to front | None |
| Cache full, new key | Evict tail, add new entry at head | None |
| Concurrent sets | Evict in insertion order | None |

### 2.6 LRU Eviction Edge Cases

**Edge Case 1: All Entries Expired**
- **Scenario:** Cache is full but all entries have expired
- **Current Behavior:** Lazy expiration on next access
- **Alternative:** Could proactively scan and clean (not implemented)
- **Decision:** Lazy expiration is sufficient - expired entries will be removed on access

**Edge Case 2: maxSize = 0 or Negative**
- **Scenario:** Misconfiguration prevents any caching
- **Validation:** Enforce minimum maxSize of 1
- **Code:**
  ```typescript
  const maxSize = Math.max(1, parseInt(size) || 1000);
  ```

**Edge Case 3: Rapid Insertions**
- **Scenario:** Many concurrent insertions exceeding maxSize
- **Behavior:** Each insertion evicts LRU entry
- **Impact:** Oldest entries are evicted first (by design)

---

## 3. Manual Invalidation on Updates

### 3.1 When to Invalidate

Cache entries must be invalidated when the underlying data changes:

| Function | Modification Type | Invalidation Strategy |
|----------|------------------|----------------------|
| `updateApiKeyUsage()` | Update `last_used`, `total_lifetime_tokens`, `usage_windows` | **Selective invalidation** - Delete specific key |
| `findApiKey()` - miss | Read from file and populate cache | **Cache warming** - Add entry to cache |
| Future: `deleteApiKey()` | Remove key from file | **Selective invalidation** - Delete specific key |
| Future: `createApiKey()` | Add new key to file | **No action needed** - Will be cached on first use |
| Future: `updateApiKey()` | Modify key properties | **Selective invalidation** - Delete specific key |

### 3.2 Invalidation in updateApiKeyUsage

The current implementation updates API key usage statistics. This requires cache invalidation:

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

    // Update usage windows
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

    await writeApiKeys(data);

    // Invalidate cache entry after successful write
    apiKeyCache.delete(key);
  });
}
```

**Why Invalidation is Necessary:**
- `last_used` timestamp changes
- `total_lifetime_tokens` increments
- `usage_windows` array is modified
- Cached value is now stale

**Why Delete Instead of Update:**
- Simpler implementation
- Avoids duplicating update logic
- Cache will be repopulated on next `findApiKey()` call
- Aligns with "cache as secondary source of truth" principle

### 3.3 Selective vs Full Cache Invalidation

**Selective Invalidation (Recommended):**
- **Strategy:** Delete only the modified key
- **Pros:** Minimal cache disruption, other cached keys remain valid
- **Cons:** Requires tracking which keys were modified
- **Use Case:** Single key updates (current implementation)

**Full Cache Invalidation (Alternative):**
- **Strategy:** Clear entire cache
- **Pros:** Simplest implementation, guarantees consistency
- **Cons:** Wipes all cached data, causes cache stampede
- **Use Case:** Bulk operations or file corruption recovery

**Hybrid Approach (Advanced):**
- **Strategy:** Tag-based invalidation
- **Pros:** Fine-grained control, can invalidate groups
- **Cons:** More complex, not needed for current use case
- **Use Case:** Multi-tenant or role-based caching

**Decision:** Use selective invalidation for single-key updates

### 3.4 Invalidation Edge Cases

**Edge Case 1: Update Before Cache Exists**
- **Scenario:** `updateApiKeyUsage()` called before key is cached
- **Behavior:** `cache.delete()` is no-op if key doesn't exist
- **Impact:** None - no-op is safe

**Edge Case 2: Update During Cache Miss**
- **Scenario:** Key is being read from file while update occurs
- **Behavior:** File lock serializes operations, update happens after read
- **Impact:** Cache may have brief staleness, fixed by invalidation

**Edge Case 3: Multiple Updates in Quick Succession**
- **Scenario:** Several rapid updates to same key
- **Behavior:** Each update calls `delete()`, subsequent calls are no-ops
- **Impact:** Minimal overhead, no double-counting

---

## 4. Cache Clear on File Modifications

### 4.1 External File Modification Detection

The cache must detect when the underlying `data/apikeys.json` file is modified externally (e.g., manual editing, external script).

**Options:**

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| File watcher (fs.watch) | Real-time detection | Complex, potential race conditions | ❌ Not implemented |
| Modification time check | Simple, reliable | Requires periodic polling | ❌ Not needed (TTL is sufficient) |
| TTL expiration | No infrastructure needed | 5-minute staleness window | ✅ **Primary strategy** |
| Manual cache clear endpoint | Admin control | Requires explicit action | ✅ **Secondary strategy** |

### 4.2 Primary Strategy: TTL Expiration

The 5-minute TTL naturally handles external file modifications:
- Maximum staleness: 5 minutes
- No additional infrastructure required
- Aligns with "eventual consistency" design

### 4.3 Secondary Strategy: Manual Clear Endpoint

For scenarios requiring immediate cache invalidation (e.g., bulk updates via external script):

```typescript
// In src/index.ts
app.get('/admin/cache/clear', async (c) => {
  // Admin authentication required
  const isAdmin = c.get('isAdmin');
  if (!isAdmin) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Clear cache
  apiKeyCache.clear();

  return c.json({
    success: true,
    message: 'Cache cleared successfully',
    timestamp: new Date().toISOString()
  });
});
```

**Use Cases:**
- After bulk API key updates via external script
- When debugging cache-related issues
- Before performing maintenance operations

### 4.4 Cache Clear API

**Endpoint:** `POST /admin/cache/clear`
**Authentication:** Required (admin only)
**Response:**
```json
{
  "success": true,
  "message": "Cache cleared successfully",
  "timestamp": "2026-01-22T04:30:00.000Z",
  "stats": {
    "size": 0,
    "hits": 0,
    "misses": 0
  }
}
```

### 4.5 File Modification Edge Cases

**Edge Case 1: File Deleted and Recreated**
- **Scenario:** `apikeys.json` is deleted and recreated
- **Detection:** TTL expiration handles this
- **Behavior:** Cache entries expire, new reads from fresh file
- **Impact:** Maximum 5-minute delay

**Edge Case 2: File Corrupted**
- **Scenario:** File contains invalid JSON
- **Behavior:** `readApiKeys()` returns empty array (see line 41 in storage.ts)
- **Caching:** Empty result is cached as null
- **Impact:** All requests fail until file is fixed and cache expires

**Edge Case 3: Concurrent External and Internal Updates**
- **Scenario:** External script modifies file while app is running
- **Behavior:** No atomicity guarantees, last write wins
- **Mitigation:** File lock provides some protection, but external scripts may not respect it
- **Impact:** Potential cache inconsistency until TTL expires

---

## 5. Invalidation Strategy Summary

### 5.1 Decision Matrix

| Scenario | Invalidation Method | Timing | Implementation |
|----------|-------------------|--------|----------------|
| Normal entry expiration | TTL expiration | On access (lazy) | Automatic in `get()` |
| Cache size limit reached | LRU eviction | On insert | Automatic in `set()` |
| API key usage updated | Selective delete | After write | In `updateApiKeyUsage()` |
| API key deleted | Selective delete | After write | In future `deleteApiKey()` |
| API key properties changed | Selective delete | After write | In future `updateApiKey()` |
| External file modification | TTL expiration | Within 5 min | Automatic via TTL |
| Manual/admin cache clear | Full cache clear | On demand | Via admin endpoint |
| Application startup | No action | N/A | Cache starts empty |

### 5.2 Invalidation Timing Guarantees

| Invalidation Type | Maximum Delay | Trigger |
|-------------------|---------------|---------|
| TTL expiration | 5 minutes | Next `get()` call |
| LRU eviction | Immediate | On `set()` when full |
| Selective delete | Immediate | After write operation |
| Full cache clear | Immediate | Admin API call |
| External file change | 5 minutes | Next `get()` call |

### 5.3 Cache Coherency Guarantees

**Strong Consistency (Not Guaranteed):**
- Cache is always perfectly in sync with file
- External modifications immediately reflected

**Eventual Consistency (Guaranteed):**
- Within 5 minutes, all stale entries expire
- Updates invalidate relevant entries immediately
- Cache converges to correct state

**Rationale:**
- Strong consistency would require complex locking or file watching
- Eventual consistency is acceptable for this use case (API key authentication)
- Performance benefits outweigh brief staleness

---

## 6. Monitoring and Observability

### 6.1 Cache Statistics

Track these metrics to monitor invalidation effectiveness:

```typescript
interface CacheStats {
  hits: number;           // Successful retrievals
  misses: number;         // Failed retrievals (not found or expired)
  hitRate: number;        // Percentage: hits / (hits + misses)
  size: number;           // Current entries
  maxSize: number;        // Maximum entries
  evictions: number;      // Total LRU evictions
  expirations: number;    // Total TTL expirations
}
```

### 6.2 Invalidation Metrics

**Key Metrics to Track:**
- **Eviction rate:** `evictions / total_sets` - Target: < 1%
- **Expiration rate:** `expirations / total_gets` - Target: < 5%
- **Hit rate:** `hits / (hits + misses)` - Target: > 95%
- **Invalidation frequency:** Manual deletes per minute

### 6.3 Alerting Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| Hit rate | < 90% | < 80% | Investigate cache configuration |
| Eviction rate | > 5% | > 10% | Increase `CACHE_MAX_SIZE` |
| Expiration rate | > 10% | > 20% | Increase `CACHE_TTL_MS` |
| Cache size | = maxSize | = maxSize | Monitor for memory pressure |

---

## 7. Testing Strategy

### 7.1 TTL Expiration Tests

```typescript
test('TTL expires after configured time', async () => {
  const cache = new LRUCache<ApiKey>(100, 100); // 100ms TTL
  const apiKey = createTestApiKey();

  cache.set('test-key', apiKey);
  expect(cache.get('test-key')).toBe(apiKey); // Not expired

  await sleep(150);
  expect(cache.get('test-key')).toBeNull(); // Expired
});

test('TTL expiration updates miss counter', () => {
  const cache = new LRUCache<ApiKey>(100, 100);
  const apiKey = createTestApiKey();

  cache.set('test-key', apiKey);

  await sleep(150);
  cache.get('test-key'); // Expired

  const stats = cache.getStats();
  expect(stats.misses).toBe(1);
});
```

### 7.2 LRU Eviction Tests

```typescript
test('LRU evicts least recently used entry when full', () => {
  const cache = new LRUCache<ApiKey>(3, 5000);
  const key1 = createTestApiKey({ key: 'key1' });
  const key2 = createTestApiKey({ key: 'key2' });
  const key3 = createTestApiKey({ key: 'key3' });
  const key4 = createTestApiKey({ key: 'key4' });

  cache.set('key1', key1);
  cache.set('key2', key2);
  cache.set('key3', key3);
  expect(cache.size).toBe(3);

  cache.set('key4', key4); // Should evict key1 (least recently used)

  expect(cache.get('key1')).toBeNull(); // Evicted
  expect(cache.get('key2')).toBe(key2); // Still present
  expect(cache.get('key3')).toBe(key3); // Still present
  expect(cache.get('key4')).toBe(key4); // Just added
});

test('LRU updates access order on get', () => {
  const cache = new LRUCache<ApiKey>(3, 5000);
  const key1 = createTestApiKey({ key: 'key1' });
  const key2 = createTestApiKey({ key: 'key2' });
  const key3 = createTestApiKey({ key: 'key3' });
  const key4 = createTestApiKey({ key: 'key4' });

  cache.set('key1', key1);
  cache.set('key2', key2);
  cache.set('key3', key3);

  cache.get('key1'); // Access key1, making it more recent

  cache.set('key4', key4); // Should evict key2 (now least recently used)

  expect(cache.get('key1')).toBe(key1); // Still present (was accessed)
  expect(cache.get('key2')).toBeNull(); // Evicted
  expect(cache.get('key3')).toBe(key3); // Still present
  expect(cache.get('key4')).toBe(key4); // Just added
});
```

### 7.3 Manual Invalidation Tests

```typescript
test('updateApiKeyUsage invalidates cache entry', async () => {
  const apiKey = createTestApiKey({
    key: 'test-key',
    total_lifetime_tokens: 100
  });

  // Cache the API key
  apiKeyCache.set('test-key', apiKey);

  // Update usage via storage function
  await updateApiKeyUsage('test-key', 50, 'claude-3-5-sonnet');

  // Cache should be invalidated
  const cached = apiKeyCache.get('test-key');
  expect(cached).toBeNull();

  // Next fetch should get updated value from file
  const fresh = await findApiKey('test-key');
  expect(fresh?.total_lifetime_tokens).toBe(150);
});

test('delete removes entry from cache', () => {
  const cache = new LRUCache<ApiKey>(100, 5000);
  const apiKey = createTestApiKey();

  cache.set('test-key', apiKey);
  expect(cache.has('test-key')).toBe(true);

  cache.delete('test-key');
  expect(cache.has('test-key')).toBe(false);
  expect(cache.get('test-key')).toBeNull();
});

test('clear wipes entire cache', () => {
  const cache = new LRUCache<ApiKey>(100, 5000);

  cache.set('key1', createTestApiKey({ key: 'key1' }));
  cache.set('key2', createTestApiKey({ key: 'key2' }));
  cache.set('key3', createTestApiKey({ key: 'key3' }));

  expect(cache.size).toBe(3);

  cache.clear();

  expect(cache.size).toBe(0);
  expect(cache.get('key1')).toBeNull();
  expect(cache.get('key2')).toBeNull();
  expect(cache.get('key3')).toBeNull();
});
```

### 7.4 Integration Tests

```typescript
test('cache remains consistent after external file modification', async () => {
  // Cache an API key
  const apiKey1 = await findApiKey('test-key');
  expect(apiKey1?.model).toBe('claude-3-5-sonnet');

  // Externally modify the file
  await modifyApiKeyInFile('test-key', { model: 'claude-3-opus' });

  // Cache still returns old value (stale)
  const cached = apiKeyCache.get('test-key');
  expect(cached?.model).toBe('claude-3-5-sonnet');

  // Wait for TTL to expire
  await sleep(300000); // 5 minutes

  // Now cache miss triggers re-read from file
  const apiKey2 = await findApiKey('test-key');
  expect(apiKey2?.model).toBe('claude-3-opus');
});
```

---

## 8. Implementation Checklist

**Phase 1.2: Cache Invalidation Strategy**

- [x] Document TTL expiration mechanism
  - [x] Lazy expiration algorithm
  - [x] 5-minute default TTL
  - [x] Edge cases (clock drift, concurrency, zero TTL)
  - [x] Statistics tracking (misses on expiration)

- [x] Document LRU eviction strategy
  - [x] Size limit enforcement (1000 entries default)
  - [x] Doubly-linked list data structure
  - [x] LRU update rules (get/set operations)
  - [x] Eviction algorithm (remove tail node)
  - [x] Edge cases (all expired, zero maxSize, rapid insertions)

- [x] Document manual invalidation on updates
  - [x] Invalidation points (updateApiKeyUsage, future delete/update)
  - [x] Selective vs full invalidation analysis
  - [x] Implementation in updateApiKeyUsage
  - [x] Edge cases (update before cache exists, concurrent updates)

- [x] Document cache clear on file modifications
  - [x] External modification detection (TTL as primary strategy)
  - [x] Manual clear endpoint design (admin API)
  - [x] Edge cases (file deleted, corrupted, concurrent updates)

- [x] Define monitoring and observability
  - [x] Cache statistics interface
  - [x] Invalidation metrics
  - [x] Alerting thresholds

- [x] Create testing strategy
  - [x] Unit tests for TTL expiration
  - [x] Unit tests for LRU eviction
  - [x] Integration tests for manual invalidation
  - [x] Integration tests for file modifications

---

## 9. Acceptance Criteria Verification

**Subtask 1.2 will be considered complete when:**

- [x] TTL expiration strategy documented (5 minutes)
  - Mechanism: Lazy expiration on `get()`
  - Algorithm: Check `(now - timestamp) > ttl`
  - Edge cases handled

- [x] LRU eviction strategy documented when size limit reached
  - Mechanism: Evict least recently used entry
  - Algorithm: Remove tail node from doubly-linked list
  - Update rules for all operations

- [x] Cache invalidation on API key updates/deletions planned
  - Strategy: Selective invalidation (delete specific key)
  - Implementation: In `updateApiKeyUsage()` and future CRUD operations
  - Alternative: Full cache clear for bulk operations

- [x] Cache clear on file modifications documented
  - Primary strategy: TTL expiration handles external changes
  - Secondary strategy: Admin endpoint for manual clear
  - Maximum staleness: 5 minutes

---

## 10. References

- Cache Design Document: `./cache-design.md`
- Implementation Plan: `./implementation_plan.json`
- Original Spec: `./spec.md`
- Context: `./context.json`

---

**Next Step:** Proceed to subtask 1.3 - Review existing code patterns
