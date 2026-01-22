/**
 * Cache Store - LRU cache implementation for response caching
 *
 * Provides an LRU (Least Recently Used) cache with TTL support,
 * automatic eviction, and efficient lookups optimized for low latency.
 */

import type { CacheEntry, CacheMetrics } from './types.js';

/**
 * CacheStore class implementing LRU cache with TTL
 *
 * Features:
 * - O(1) get/set operations
 * - Automatic LRU eviction when size limit reached
 * - TTL-based expiration
 * - Efficient memory usage
 * - Thread-safe operations
 */
export class CacheStore {
  private cache: Map<string, CacheEntry> = new Map();
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

  constructor(maxSize: number = 1000, defaultTtl: number = 300000, enableMetrics: boolean = true) {
    this.maxSize = maxSize;
    this.defaultTtl = defaultTtl;
    this.metricsEnabled = enableMetrics;
  }

  /**
   * Get an entry from the cache
   *
   * Updates the last accessed time and moves entry to MRU position.
   * Returns null if entry not found or expired.
   *
   * @param key - Cache key
   * @returns Cache entry or null if not found/expired
   */
  get(key: string): CacheEntry | null {
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

    // Check if entry is expired
    const now = Date.now();
    if (now - entry.createdAt > entry.ttl) {
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

    return entry;
  }

  /**
   * Set an entry in the cache
   *
   * If cache is full, evicts the LRU entry before adding.
   *
   * @param key - Cache key
   * @param body - Response body
   * @param status - HTTP status code
   * @param headers - Response headers
   * @param tokensUsed - Number of tokens used (optional)
   * @param ttl - Custom TTL (optional, uses default if not provided)
   */
  set(
    key: string,
    body: string | ReadableStream<Uint8Array>,
    status: number,
    headers: Record<string, string>,
    tokensUsed?: number,
    ttl?: number
  ): void {
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
    const entry: CacheEntry = {
      key,
      body,
      status,
      headers,
      tokensUsed,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      ttl: ttl ?? this.defaultTtl,
    };

    // Add to cache (replaces existing if present)
    this.cache.set(key, entry);
  }

  /**
   * Check if a key exists in the cache and is not expired
   *
   * @param key - Cache key
   * @returns Whether key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.createdAt > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete an entry from the cache
   *
   * @param key - Cache key
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
      if (now - entry.createdAt > entry.ttl) {
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
  getMetrics(): CacheMetrics {
    const hitRate = this.totalLookups > 0
      ? this.hits / this.totalLookups
      : 0;

    const avgLookupTime = this.lookupTimes.length > 0
      ? this.lookupTimes.reduce((a, b) => a + b, 0) / this.lookupTimes.length
      : 0;

    // Estimate total bytes (rough estimate)
    let totalBytes = 0;
    for (const entry of this.cache.values()) {
      if (typeof entry.body === 'string') {
        totalBytes += entry.body.length * 2; // UTF-16
      }
      // Streams are hard to estimate, skip for now
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      totalLookups: this.totalLookups,
      hits: this.hits,
      misses: this.misses,
      expiredCount: this.expiredCount,
      evictedCount: this.evictedCount,
      hitRate,
      avgLookupTime: avgLookupTime * 1000, // Convert to microseconds
      totalBytes,
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
  entries(): Array<CacheEntry> {
    return Array.from(this.cache.values());
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
