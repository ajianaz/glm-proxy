/**
 * Cache Manager - High-level cache management interface
 *
 * Provides a simple API for caching responses with automatic
 * cache key generation, TTL management, and metrics tracking.
 */

import type { CacheOptions, CacheEntry, CacheMetrics, CacheStats } from './types.js';
import { CacheStore } from './CacheStore.js';
import { generateCacheKeyFromRequest } from './CacheKey.js';

/**
 * CacheManager class for managing response caching
 *
 * Features:
 * - Automatic cache key generation from requests
 * - Configurable TTL and size limits
 * - Comprehensive metrics tracking
 * - Periodic cleanup of expired entries
 * - Thread-safe operations
 */
export class CacheManager {
  private store: CacheStore;
  private enabled: boolean;
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private metricsEnabled: boolean;

  constructor(options: CacheOptions = {}) {
    // Read from environment if not provided
    const enabled = options.enabled ?? (
      process.env.CACHE_ENABLED === 'true' || process.env.CACHE_ENABLED === '1'
    );
    const maxSize = options.maxSize ?? parseInt(process.env.CACHE_MAX_SIZE || '1000', 10);
    const ttl = options.ttl ?? parseInt(process.env.CACHE_TTL_MS || '300000', 10);
    this.metricsEnabled = options.enableMetrics ?? true;

    this.enabled = enabled;
    this.store = new CacheStore(maxSize, ttl, this.metricsEnabled);

    // Start periodic cleanup (every 60 seconds)
    if (this.enabled) {
      this.cleanupTimer = setInterval(() => {
        this.store.cleanup();
      }, 60000);
    }
  }

  /**
   * Get a cached response
   *
   * @param method - HTTP method
   * @param body - Request body
   * @returns Cache entry or null if not found
   */
  get(method: string, body: string | null): CacheEntry | null {
    if (!this.enabled) {
      return null;
    }

    const key = generateCacheKeyFromRequest(method, body);
    if (!key) {
      return null;
    }

    return this.store.get(key);
  }

  /**
   * Set a cached response
   *
   * @param method - HTTP method
   * @param body - Request body
   * @param responseBody - Response body
   * @param status - HTTP status code
   * @param headers - Response headers
   * @param tokensUsed - Number of tokens used (optional)
   * @param ttl - Custom TTL (optional)
   */
  set(
    method: string,
    body: string | null,
    responseBody: string | ReadableStream<Uint8Array>,
    status: number,
    headers: Record<string, string>,
    tokensUsed?: number,
    ttl?: number
  ): void {
    if (!this.enabled) {
      return;
    }

    const key = generateCacheKeyFromRequest(method, body);
    if (!key) {
      return;
    }

    // Don't cache error responses
    if (status >= 400) {
      return;
    }

    this.store.set(key, responseBody, status, headers, tokensUsed, ttl);
  }

  /**
   * Check if caching is enabled
   *
   * @returns Whether caching is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable caching
   *
   * @param enabled - Whether to enable caching
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    // Start or stop cleanup timer
    if (enabled && !this.cleanupTimer) {
      this.cleanupTimer = setInterval(() => {
        this.store.cleanup();
      }, 60000);
    } else if (!enabled && this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * Invalidate a cache entry
   *
   * @param method - HTTP method
   * @param body - Request body
   * @returns Whether entry was invalidated
   */
  invalidate(method: string, body: string | null): boolean {
    if (!this.enabled) {
      return false;
    }

    const key = generateCacheKeyFromRequest(method, body);
    if (!key) {
      return false;
    }

    return this.store.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get cache metrics
   *
   * @returns Current cache metrics
   */
  getMetrics(): CacheMetrics {
    return this.store.getMetrics();
  }

  /**
   * Get cache statistics snapshot
   *
   * @returns Simplified cache statistics
   */
  getStats(): CacheStats {
    const metrics = this.store.getMetrics();
    return {
      size: metrics.size,
      hitRate: metrics.hitRate * 100, // Convert to percentage
      hits: metrics.hits,
      misses: metrics.misses,
      evictions: metrics.evictedCount,
      expired: metrics.expiredCount,
      memoryUsage: metrics.totalBytes,
    };
  }

  /**
   * Reset cache metrics
   */
  resetMetrics(): void {
    this.store.resetMetrics();
  }

  /**
   * Clean up expired entries
   *
   * @returns Number of entries removed
   */
  cleanup(): number {
    return this.store.cleanup();
  }

  /**
   * Shutdown the cache manager
   *
   * Stops cleanup timer and clears all entries.
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.store.clear();
  }
}

/**
 * Global cache manager instance
 */
let globalCacheManager: CacheManager | null = null;

/**
 * Get the global cache manager instance
 *
 * Creates a new instance if one doesn't exist.
 *
 * @param options - Cache options (only used on first call)
 * @returns Global cache manager
 */
export function getCacheManager(options?: CacheOptions): CacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new CacheManager(options);
  }
  return globalCacheManager;
}

/**
 * Reset the global cache manager
 *
 * Creates a new instance with the given options.
 *
 * @param options - Cache options
 * @returns New global cache manager
 */
export function resetCacheManager(options?: CacheOptions): CacheManager {
  if (globalCacheManager) {
    globalCacheManager.shutdown();
  }
  globalCacheManager = new CacheManager(options);
  return globalCacheManager;
}
