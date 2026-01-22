/**
 * Buffer Pool - Specialized pool for reusing buffers to reduce GC pressure
 *
 * Provides efficient buffer pooling with:
 * - Multiple buffer size tiers (4KB, 8KB, 16KB, 32KB, 64KB)
 * - Automatic buffer reset/zeroing
 * - Per-size-tier metrics tracking
 * - Automatic cleanup of idle buffers
 * - Optimized for JSON parsing and streaming operations
 *
 * Benefits:
 * - Reduces memory allocations for temporary buffers
 * - Decreases GC pressure under load
 * - Improves performance for streaming operations
 * - Zero-copy buffer reuse where possible
 */

import { ObjectPool, type ObjectPoolMetrics } from './ObjectPool.js';

/**
 * Buffer size tier configuration
 */
export interface BufferSizeTier {
  /** Buffer size in bytes */
  size: number;
  /** Minimum number of buffers to maintain (default: 0) */
  minSize?: number;
  /** Maximum number of buffers to pool (default: 50) */
  maxSize?: number;
}

/**
 * Buffer pool options
 */
export interface BufferPoolOptions {
  /** Buffer size tiers (default: predefined tiers) */
  tiers?: BufferSizeTier[];
  /** Enable pool warming on startup (default: false) */
  warmPool?: boolean;
}

/**
 * Buffer pool metrics
 */
export interface BufferPoolMetrics {
  /** Metrics per buffer size tier */
  tiers: {
    /** Buffer size in bytes */
    size: number;
    /** Object pool metrics for this tier */
    metrics: ObjectPoolMetrics;
  }[];
  /** Total buffers across all tiers */
  totalBuffers: number;
  /** Total buffers in use across all tiers */
  totalInUse: number;
  /** Total bytes allocated across all tiers */
  totalBytes: number;
  /** Timestamp when metrics were collected */
  timestamp: number;
}

/**
 * Default buffer size tiers optimized for common use cases
 */
const DEFAULT_TIERS: BufferSizeTier[] = [
  { size: 4096, maxSize: 100 },      // 4KB - Small JSON payloads
  { size: 8192, maxSize: 50 },       // 8KB - Medium JSON payloads
  { size: 16384, maxSize: 30 },      // 16KB - Large JSON payloads
  { size: 32768, maxSize: 20 },      // 32KB - Very large payloads
  { size: 65536, maxSize: 10 },      // 64KB - Extra large payloads
];

/**
 * Buffer Pool for reusing Uint8Array buffers
 */
export class BufferPool {
  private pools: Map<number, ObjectPool<Uint8Array>> = new Map();
  private readonly tiers: BufferSizeTier[];

  // Cleanup timer
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(options: BufferPoolOptions = {}) {
    this.tiers = options.tiers ?? DEFAULT_TIERS;

    // Create pools for each tier
    for (const tier of this.tiers) {
      const pool = new ObjectPool<Uint8Array>({
        factory: () => new Uint8Array(tier.size),
        reset: (buffer) => {
          // Zero out the buffer for security
          buffer.fill(0);
        },
        validate: (buffer) => {
          // Validate buffer size
          return buffer.byteLength === tier.size;
        },
        minSize: tier.minSize ?? 0,
        maxSize: tier.maxSize ?? 50,
        enableMetrics: true,
        cleanupInterval: 60000, // 1 minute
        maxIdleTime: 300000, // 5 minutes
        warmPool: options.warmPool ?? false,
      });

      this.pools.set(tier.size, pool);
    }

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Acquire a buffer of at least the specified size
   * Returns the next larger size tier if exact size not available
   */
  async acquire(size: number): Promise<Uint8Array> {
    // Find the smallest tier that can accommodate the size
    const tierSize = this.findTierSize(size);

    if (tierSize === null) {
      // No suitable tier, create a new buffer (not pooled)
      return new Uint8Array(size);
    }

    // Get or create pool for this tier
    const pool = this.pools.get(tierSize);
    if (!pool) {
      // Pool not found, create new buffer (not pooled)
      return new Uint8Array(tierSize);
    }

    // Acquire buffer from pool
    return pool.acquire();
  }

  /**
   * Release a buffer back to the pool
   */
  release(buffer: Uint8Array): void {
    const size = buffer.byteLength;

    // Find the pool for this buffer size
    const pool = this.pools.get(size);
    if (!pool) {
      // Buffer not from this pool, ignore
      return;
    }

    // Release buffer back to pool
    pool.release(buffer);
  }

  /**
   * Execute a callback with a buffer from the pool
   * Automatically releases the buffer when done
   */
  async use<R>(size: number, callback: (buffer: Uint8Array) => R | Promise<R>): Promise<R> {
    const buffer = await this.acquire(size);
    try {
      return await callback(buffer);
    } finally {
      this.release(buffer);
    }
  }

  /**
   * Find the smallest tier size that can accommodate the requested size
   */
  private findTierSize(size: number): number | null {
    // Sort tiers by size
    const sortedTiers = [...this.tiers].sort((a, b) => a.size - b.size);

    // Find the smallest tier that can accommodate the size
    for (const tier of sortedTiers) {
      if (tier.size >= size) {
        return tier.size;
      }
    }

    // No suitable tier found
    return null;
  }

  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      // Cleanup is handled by individual pools
    }, 60000); // Check every minute
  }

  /**
   * Get current pool metrics
   */
  getMetrics(): BufferPoolMetrics {
    const tiers: BufferPoolMetrics['tiers'] = [];
    let totalBuffers = 0;
    let totalInUse = 0;
    let totalBytes = 0;

    // Get metrics from each tier
    for (const [size, pool] of this.pools) {
      const metrics = pool.getMetrics();
      tiers.push({ size, metrics });

      totalBuffers += metrics.poolSize;
      totalInUse += metrics.inUseCount;
      totalBytes += metrics.poolSize * size;
    }

    // Sort tiers by size
    tiers.sort((a, b) => a.size - b.size);

    return {
      tiers,
      totalBuffers,
      totalInUse,
      totalBytes,
      timestamp: performance.now(),
    };
  }

  /**
   * Get metrics for a specific buffer size tier
   */
  getTierMetrics(size: number): ObjectPoolMetrics | null {
    const pool = this.pools.get(size);
    if (!pool) {
      return null;
    }
    return pool.getMetrics();
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    for (const pool of this.pools.values()) {
      pool.clearMetrics();
    }
  }

  /**
   * Shutdown all buffer pools
   */
  async shutdown(): Promise<void> {
    // Clear timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Shutdown all pools
    const shutdownPromises = Array.from(this.pools.values()).map(pool => pool.shutdown());
    await Promise.all(shutdownPromises);

    // Clear pools map
    this.pools.clear();
  }

  /**
   * Check if all pools are shutdown
   */
  isShutdownComplete(): boolean {
    return Array.from(this.pools.values()).every(pool => pool.isShutdownComplete());
  }
}

// Global buffer pool instance
let globalBufferPool: BufferPool | null = null;

/**
 * Get the global buffer pool instance
 */
export function getBufferPool(options?: BufferPoolOptions): BufferPool {
  if (!globalBufferPool) {
    globalBufferPool = new BufferPool(options);
  }
  return globalBufferPool;
}

/**
 * Reset the global buffer pool instance
 */
export function resetBufferPool(): void {
  if (globalBufferPool) {
    globalBufferPool.shutdown().catch(console.error);
    globalBufferPool = null;
  }
}
