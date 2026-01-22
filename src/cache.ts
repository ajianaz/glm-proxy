/**
 * LRU Cache with TTL support
 *
 * Implements an in-memory LRU (Least Recently Used) cache with configurable
 * TTL (Time-To-Live) to cache API keys and eliminate file I/O overhead.
 */

/**
 * Cache entry containing value, timestamp, and TTL
 */
interface CacheEntry<T> {
  /** The cached value (can be null for not-found keys) */
  value: T | null;
  /** Unix timestamp when this entry was created/updated (milliseconds) */
  timestamp: number;
  /** Time-to-live in milliseconds */
  ttl: number;
}

/**
 * Node for doubly-linked list used in LRU tracking
 */
interface LRUNode {
  key: string;
  prev: LRUNode | null;
  next: LRUNode | null;
}

/**
 * Cache statistics
 */
export interface CacheStats {
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

/**
 * LRU Cache interface
 */
export interface LRUCache<T> {
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

  /**
   * Reset statistics counters (for testing).
   */
  resetStats(): void;
}

/**
 * LRU Cache implementation
 */
class LRUCacheImpl<T> implements LRUCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private lruMap: Map<string, LRUNode>;
  private head: LRUNode | null = null;
  private tail: LRUNode | null = null;
  private hits: number = 0;
  private misses: number = 0;
  private _size: number = 0;

  constructor(
    public readonly maxSize: number = 1000,
    private defaultTTL: number = 300000 // 5 minutes
  ) {
    this.cache = new Map();
    this.lruMap = new Map();
  }

  get size(): number {
    return this._size;
  }

  /**
   * Check if entry has expired based on TTL
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    const now = Date.now();
    return (now - entry.timestamp) > entry.ttl;
  }

  /**
   * Move a node to the front of the LRU list (most recently used)
   */
  private moveToFront(key: string): void {
    const node = this.lruMap.get(key);
    if (!node) return;

    // Remove node from current position
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      // Node is already at head
      return;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      // Node is tail, update tail
      this.tail = node.prev;
    }

    // Add node to front
    node.prev = null;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    // If this was the only node, update tail
    if (!this.tail) {
      this.tail = node;
    }
  }

  /**
   * Add a new node to the front of the LRU list
   */
  private addToFront(key: string): void {
    const node: LRUNode = {
      key,
      prev: null,
      next: this.head,
    };

    this.lruMap.set(key, node);

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    // If this is the first node, update tail
    if (!this.tail) {
      this.tail = node;
    }
  }

  /**
   * Remove a node from the LRU list
   */
  private removeNode(node: LRUNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    this.lruMap.delete(node.key);
  }

  /**
   * Evict the least recently used entry (tail of LRU list)
   */
  private evictLRU(): void {
    if (this.tail) {
      this.cache.delete(this.tail.key);
      this.removeNode(this.tail);
      this._size--;
    }
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    this.moveToFront(key);
    return entry.value;
  }

  set(key: string, value: T | null, ttl?: number): void {
    // Check if key already exists
    const existing = this.cache.get(key);

    if (existing) {
      // Update existing entry
      existing.value = value;
      existing.timestamp = Date.now();
      existing.ttl = ttl ?? this.defaultTTL;
      this.moveToFront(key);
      return;
    }

    // Evict LRU if cache is full
    if (this._size >= this.maxSize) {
      this.evictLRU();
    }

    // Add new entry
    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTTL,
    };

    this.cache.set(key, entry);
    this.addToFront(key);
    this._size++;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): void {
    const entry = this.cache.get(key);
    if (!entry) {
      return;
    }

    const node = this.lruMap.get(key);
    if (node) {
      this.removeNode(node);
    }

    this.cache.delete(key);
    this._size--;
  }

  clear(): void {
    this.cache.clear();
    this.lruMap.clear();
    this.head = null;
    this.tail = null;
    this._size = 0;
    // Note: we don't reset statistics on clear
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate,
      size: this._size,
      maxSize: this.maxSize,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}

// Create and export singleton cache instance for API keys
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || '300000');
const CACHE_MAX_SIZE = parseInt(process.env.CACHE_MAX_SIZE || '1000');

/**
 * Singleton cache instance for API keys
 * Imported and used by storage.ts
 */
export const apiKeyCache: LRUCache<import('./types.js').ApiKey> = new LRUCacheImpl<import('./types.js').ApiKey>(
  CACHE_MAX_SIZE,
  CACHE_TTL_MS
);

export { LRUCacheImpl };
