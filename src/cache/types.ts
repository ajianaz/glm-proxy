/**
 * Cache Module Type Definitions
 *
 * Defines interfaces and types for response caching system.
 * Optimized for low-latency cache operations with LRU eviction.
 */

/**
 * Configuration options for the response cache
 */
export interface CacheOptions {
  /** Enable response caching (default: from env or false) */
  enabled?: boolean;
  /** Maximum number of cache entries (default: 1000) */
  maxSize?: number;
  /** Time-to-live for cache entries in ms (default: 300000 = 5 minutes) */
  ttl?: number;
  /** Enable metrics collection (default: true) */
  enableMetrics?: boolean;
}

/**
 * Cache entry containing response data and metadata
 */
export interface CacheEntry {
  /** Unique cache key */
  key: string;
  /** Cached response body (string for buffered, stream for streaming) */
  body: string | ReadableStream<Uint8Array>;
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Number of tokens used (if available) */
  tokensUsed?: number;
  /** Timestamp when entry was created */
  createdAt: number;
  /** Timestamp when entry was last accessed */
  lastAccessedAt: number;
  /** Number of times this entry was accessed */
  accessCount: number;
  /** Time-to-live in ms */
  ttl: number;
}

/**
 * Cache key generation parameters
 */
export interface CacheKeyParams {
  /** Model name */
  model: string;
  /** Request messages array */
  messages: Array<Record<string, unknown>>;
  /** Temperature parameter */
  temperature?: number;
  /** Max tokens parameter */
  maxTokens?: number;
  /** Top-p parameter */
  topP?: number;
  /** Additional parameters that affect response */
  [key: string]: unknown;
}

/**
 * Cache lookup result
 */
export interface CacheLookupResult {
  /** Whether cache entry was found */
  found: boolean;
  /** Cached entry (if found) */
  entry?: CacheEntry;
  /** Whether entry was expired */
  expired?: boolean;
}

/**
 * Cache performance metrics
 */
export interface CacheMetrics {
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
  /** Number of expired entries */
  expiredCount: number;
  /** Number of evicted entries */
  evictedCount: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
  /** Average lookup time in microseconds */
  avgLookupTime: number;
  /** Total bytes stored in cache */
  totalBytes: number;
  /** Timestamp when metrics were collected */
  timestamp: number;
}

/**
 * Cache statistics snapshot
 */
export interface CacheStats {
  /** Current cache size */
  size: number;
  /** Cache hit rate percentage */
  hitRate: number;
  /** Total hits */
  hits: number;
  /** Total misses */
  misses: number;
  /** Total evictions */
  evictions: number;
  /** Total expired entries */
  expired: number;
  /** Current memory usage estimate */
  memoryUsage: number;
}

/**
 * Cache entry for serialization
 */
export interface SerializedCacheEntry {
  key: string;
  body: string; // Streams are serialized as string
  status: number;
  headers: Record<string, string>;
  tokensUsed?: number;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
  ttl: number;
}
