/**
 * Cache Module
 *
 * Provides response caching with LRU eviction, TTL support,
 * and comprehensive metrics tracking for low-latency operations.
 */

// Type definitions
export type {
  CacheOptions,
  CacheEntry,
  CacheKeyParams,
  CacheLookupResult,
  CacheMetrics,
  CacheStats,
  SerializedCacheEntry,
} from './types.js';

// Cache key generation
export {
  generateCacheKey,
  extractCacheKeyParams,
  isCacheableRequest,
  generateCacheKeyFromRequest,
} from './CacheKey.js';

// Cache store
export { CacheStore } from './CacheStore.js';

// Cache manager
export {
  CacheManager,
  getCacheManager,
  resetCacheManager,
} from './CacheManager.js';
