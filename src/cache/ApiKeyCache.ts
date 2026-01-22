/**
 * API Key Cache - LRU cache for API key lookups
 *
 * Provides an in-memory LRU (Least Recently Used) cache for API keys
 * to avoid expensive storage reads. Optimized for low-latency authentication.
 */

import type { ApiKey } from '../types.js';

/**
 * API key cache entry with metadata
 */
interface ApiKeyCacheEntry {
  /** The API key object */
  apiKey: ApiKey;
  /** Timestamp when entry was created */
  createdAt: number;
  /** Timestamp when entry was last accessed */
  lastAccessedAt: number;
  /** Number of times this entry was accessed */
  accessCount: number;
}

/**
 * API key cache metrics
 */
export interface ApiKeyCacheMetrics {
  /** Current number of entries in cache */
  size: number;
  /** Maximum cache size */
  maxSize: number;
  /** Total number of cache lookups */
  totalLookups: number;
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
  /** Average lookup time in microseconds */
  avgLookupTime: number;
  /** Timestamp when metrics were collected */
  timestamp: number;
}

/**
 * Configuration options for API key cache
 */
export interface ApiKeyCacheOptions {
  /** Maximum number of cache entries (default: 1000) */
  maxSize?: number;
  /** Time-to-live for cache entries in ms (default: 300000 = 5 minutes) */
  ttl?: number;
  /** Enable metrics collection (default: true) */
  enableMetrics?: boolean;
}

/**
 * ApiKeyCache class implementing LRU cache for API keys
 *
 * Features:
 * - O(1) get/set operations
 * - Automatic LRU eviction when size limit reached
 * - TTL-based expiration with refresh on access
 * - Invalidation on key updates
 * - Comprehensive metrics tracking
 * - Thread-safe operations
 */
export class ApiKeyCache {
  private cache: Map<string, ApiKeyCacheEntry> = new Map();
  private maxSize: number;
  private defaultTtl: number;
  private metricsEnabled: boolean;

  // Metrics tracking
  private totalLookups: number = 0;
  private hits: number = 0;
  private misses: number = 0;
  private expiredCount: number = 0;
  private evictedCount: number = 0;
  private lookupTimes: number[] = [];

  constructor(options: ApiKeyCacheOptions = {}) {
    // Read from environment if not provided
    const maxSize = options.maxSize ?? parseInt(process.env.APIKEY_CACHE_SIZE || '1000', 10);
    const ttl = options.ttl ?? parseInt(process.env.APIKEY_CACHE_TTL_MS || '300000', 10);
    this.metricsEnabled = options.enableMetrics ?? true;

    this.maxSize = maxSize;
    this.defaultTtl = ttl;
  }

  /**
   * Get an API key from the cache
   *
   * Updates the last accessed time and moves entry to MRU position.
   * Returns null if entry not found or expired.
   *
   * @param key - API key string
   * @returns API key object or null if not found/expired
   */
  get(key: string): ApiKey | null {
    const startTime = this.metricsEnabled ? performance.now() : 0;

    if (this.metricsEnabled) {
      this.totalLookups++;
    }

    const entry = this.cache.get(key);

    if (!entry) {
      if (this.metricsEnabled) {
        this.misses++;
        this.recordLookupTime(performance.now() - startTime);
      }
      return null;
    }

    // Check if entry is expired (TTL is based on last access)
    const now = Date.now();
    if (now - entry.lastAccessedAt > this.defaultTtl) {
      // Entry expired, remove it
      this.cache.delete(key);
      if (this.metricsEnabled) {
        this.expiredCount++;
        this.misses++;
        this.recordLookupTime(performance.now() - startTime);
      }
      return null;
    }

    // Update last accessed time and access count
    entry.lastAccessedAt = now;
    entry.accessCount++;

    // Move to end of map (MRU position in insertion-order iteration)
    this.cache.delete(key);
    this.cache.set(key, entry);

    if (this.metricsEnabled) {
      this.hits++;
      this.recordLookupTime(performance.now() - startTime);
    }

    return entry.apiKey;
  }

  /**
   * Set an API key in the cache
   *
   * If cache is full, evicts the LRU entry before adding.
   *
   * @param key - API key string
   * @param apiKey - API key object
   */
  set(key: string, apiKey: ApiKey): void {
    const now = Date.now();

    // Evict LRU entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Get first key (LRU in insertion-order map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        if (this.metricsEnabled) {
          this.evictedCount++;
        }
      }
    }

    // Create cache entry
    const entry: ApiKeyCacheEntry = {
      apiKey,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    };

    // Add to cache (replaces existing if present)
    this.cache.set(key, entry);
  }

  /**
   * Check if a key exists in the cache and is not expired
   *
   * @param key - API key string
   * @returns Whether key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check if expired (TTL is based on last access)
    const now = Date.now();
    if (now - entry.lastAccessedAt > this.defaultTtl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Invalidate (delete) an entry from the cache
   *
   * Should be called when an API key is updated in storage.
   *
   * @param key - API key string
   * @returns Whether entry was deleted
   */
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Delete an entry from the cache (alias for invalidate)
   *
   * @param key - API key string
   * @returns Whether entry was deleted
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size
   *
   * @returns Number of entries in cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clean up expired entries
   *
   * @returns Number of entries removed
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.lastAccessedAt > this.defaultTtl) {
        this.cache.delete(key);
        removed++;
        if (this.metricsEnabled) {
          this.expiredCount++;
        }
      }
    }

    return removed;
  }

  /**
   * Get cache metrics
   *
   * @returns Current cache metrics
   */
  getMetrics(): ApiKeyCacheMetrics {
    const hitRate = this.totalLookups > 0
      ? this.hits / this.totalLookups
      : 0;

    const avgLookupTime = this.lookupTimes.length > 0
      ? this.lookupTimes.reduce((a, b) => a + b, 0) / this.lookupTimes.length
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      totalLookups: this.totalLookups,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      avgLookupTime: avgLookupTime * 1000, // Convert to microseconds
      timestamp: Date.now(),
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.totalLookups = 0;
    this.hits = 0;
    this.misses = 0;
    this.expiredCount = 0;
    this.evictedCount = 0;
    this.lookupTimes = [];
  }

  /**
   * Get all entries (for debugging/testing)
   *
   * @returns Array of cache entries
   */
  entries(): Array<{ key: string; entry: ApiKeyCacheEntry }> {
    return Array.from(this.cache.entries()).map(([key, entry]) => ({ key, entry }));
  }

  /**
   * Convert to array of keys (for debugging/testing)
   *
   * @returns Array of cache keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Record lookup time for metrics
   */
  private recordLookupTime(time: number): void {
    if (!this.metricsEnabled) return;

    this.lookupTimes.push(time);

    // Keep only last 1000 measurements
    if (this.lookupTimes.length > 1000) {
      this.lookupTimes.shift();
    }
  }
}

/**
 * Global API key cache instance
 */
let globalApiKeyCache: ApiKeyCache | null = null;

/**
 * Get the global API key cache instance
 *
 * Creates a new instance if one doesn't exist.
 *
 * @param options - Cache options (only used on first call)
 * @returns Global API key cache
 */
export function getApiKeyCache(options?: ApiKeyCacheOptions): ApiKeyCache {
  if (!globalApiKeyCache) {
    globalApiKeyCache = new ApiKeyCache(options);
  }
  return globalApiKeyCache;
}

/**
 * Reset the global API key cache
 *
 * Creates a new instance with the given options.
 *
 * @param options - Cache options
 * @returns New global API key cache
 */
export function resetApiKeyCache(options?: ApiKeyCacheOptions): ApiKeyCache {
  if (globalApiKeyCache) {
    globalApiKeyCache.clear();
  }
  globalApiKeyCache = new ApiKeyCache(options);
  return globalApiKeyCache;
}
