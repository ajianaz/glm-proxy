/**
 * Generic Object Pool - Reuse frequently allocated objects to reduce GC pressure
 *
 * Provides a generic object pooling mechanism with:
 * - Automatic object creation and reuse
 * - Configurable min/max pool sizes
 * - Object reset/validation callbacks
 * - Comprehensive metrics tracking
 * - Thread-safe operations
 * - Automatic pool expansion/contraction
 *
 * Ideal for pooling:
 * - Request/response objects
 * - Buffers and arrays
 * - Temporary data structures
 * - Expensive-to-create objects
 */

/**
 * Configuration options for the object pool
 */
export interface ObjectPoolOptions<T> {
  /** Factory function to create new objects */
  factory: () => T;
  /** Function to reset objects when returned to pool (optional) */
  reset?: (obj: T) => void;
  /** Function to validate objects before reuse (optional) */
  validate?: (obj: T) => boolean;
  /** Minimum number of objects to maintain (default: 0) */
  minSize?: number;
  /** Maximum number of objects to pool (default: 100) */
  maxSize?: number;
  /** Maximum time to wait for an object in ms (default: 1000) */
  acquireTimeout?: number;
  /** Enable metrics collection (default: true) */
  enableMetrics?: boolean;
  /** Cleanup interval in ms (default: 60000 = 1 minute) */
  cleanupInterval?: number;
  /** Maximum idle time for an object in ms (default: 300000 = 5 minutes) */
  maxIdleTime?: number;
  /** Enable pool warming on startup (default: false) */
  warmPool?: boolean;
}

/**
 * Pooled object wrapper with metadata
 */
interface PooledObject<T> {
  /** The pooled object */
  obj: T;
  /** Whether the object is currently in use */
  inUse: boolean;
  /** Timestamp when the object was created */
  createdAt: number;
  /** Timestamp when the object was last used */
  lastUsedAt: number;
  /** Number of times this object has been acquired */
  useCount: number;
}

/**
 * Object pool metrics
 */
export interface ObjectPoolMetrics {
  /** Current pool size */
  poolSize: number;
  /** Number of objects currently in use */
  inUseCount: number;
  /** Number of idle objects */
  idleCount: number;
  /** Total number of times objects were acquired */
  totalAcquisitions: number;
  /** Total number of times objects were released */
  totalReleases: number;
  /** Total number of objects created */
  totalCreated: number;
  /** Total number of objects destroyed */
  totalDestroyed: number;
  /** Number of times pool was exhausted (had to create new object) */
  poolExhaustedCount: number;
  /** Average time to acquire an object in microseconds */
  avgAcquireTime: number;
  /** P50 acquire time in microseconds */
  p50AcquireTime: number;
  /** P95 acquire time in microseconds */
  p95AcquireTime: number;
  /** P99 acquire time in microseconds */
  p99AcquireTime: number;
  /** Current pool utilization percentage (0-100) */
  utilization: number;
  /** Timestamp when metrics were collected */
  timestamp: number;
}

/**
 * Generic Object Pool for reusing objects
 */
export class ObjectPool<T> {
  private pool: PooledObject<T>[] = [];
  private waitQueue: Array<{
    resolve: (obj: T) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];

  private acquireTimes: number[] = [];
  private metricsEnabled: boolean;

  // Configuration
  private readonly factory: () => T;
  private readonly reset?: (obj: T) => void;
  private readonly validate?: (obj: T) => boolean;
  private readonly minSize: number;
  private readonly maxSize: number;
  private readonly acquireTimeout: number;
  private readonly cleanupInterval: number;
  private readonly maxIdleTime: number;

  // State
  private isShutdown: boolean = false;
  private totalAcquisitions: number = 0;
  private totalReleases: number = 0;
  private totalCreated: number = 0;
  private totalDestroyed: number = 0;
  private poolExhaustedCount: number = 0;

  // Cleanup timer
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(options: ObjectPoolOptions<T>) {
    this.factory = options.factory;
    this.reset = options.reset;
    this.validate = options.validate;
    this.minSize = options.minSize ?? 0;
    this.maxSize = options.maxSize ?? 100;
    this.acquireTimeout = options.acquireTimeout ?? 1000;
    this.cleanupInterval = options.cleanupInterval ?? 60000;
    this.maxIdleTime = options.maxIdleTime ?? 300000;
    this.metricsEnabled = options.enableMetrics ?? true;

    // Validate configuration
    if (this.minSize < 0) {
      throw new Error('minSize must be >= 0');
    }
    if (this.maxSize < this.minSize) {
      throw new Error('maxSize must be >= minSize');
    }
    if (!this.factory) {
      throw new Error('factory function is required');
    }

    // Start cleanup timer
    this.startCleanup();

    // Initialize pool if warming is enabled
    if (options.warmPool) {
      this.warmUp().catch(console.error);
    }
  }

  /**
   * Acquire an object from the pool
   * Creates a new object if none are available
   */
  async acquire(): Promise<T> {
    if (this.isShutdown) {
      throw new Error('Object pool is shutdown');
    }

    const startTime = performance.now();
    this.totalAcquisitions++;

    // Try to find an idle, valid object
    for (let i = 0; i < this.pool.length; i++) {
      const pooled = this.pool[i];
      if (!pooled.inUse) {
        // Validate if validator is provided
        if (this.validate && !this.validate(pooled.obj)) {
          // Object is invalid, remove it
          this.pool.splice(i, 1);
          this.totalDestroyed++;
          i--;
          continue;
        }

        // Mark as in use
        pooled.inUse = true;
        pooled.lastUsedAt = performance.now();
        pooled.useCount++;

        this.recordAcquireTime(performance.now() - startTime);
        return pooled.obj;
      }
    }

    // No idle object available, try to create a new one
    if (this.pool.length < this.maxSize) {
      const obj = this.factory();
      const pooled: PooledObject<T> = {
        obj,
        inUse: true,
        createdAt: performance.now(),
        lastUsedAt: performance.now(),
        useCount: 1,
      };
      this.pool.push(pooled);
      this.totalCreated++;

      this.recordAcquireTime(performance.now() - startTime);
      return obj;
    }

    // Pool is exhausted, wait for an object to become available
    this.poolExhaustedCount++;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove from wait queue
        const index = this.waitQueue.findIndex(q => q.resolve === resolve);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
        }
        reject(new Error(`Object acquire timeout after ${this.acquireTimeout}ms`));
      }, this.acquireTimeout);

      this.waitQueue.push({
        resolve: (obj: T) => {
          clearTimeout(timeout);
          this.recordAcquireTime(performance.now() - startTime);
          resolve(obj);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timestamp: startTime,
      });
    });
  }

  /**
   * Release an object back to the pool
   */
  release(obj: T): void {
    if (this.isShutdown) {
      return;
    }

    // Find the object in the pool
    const pooled = this.pool.find(p => p.obj === obj);
    if (!pooled) {
      // Object not from this pool, ignore
      return;
    }

    // Reset if reset function is provided
    if (this.reset) {
      try {
        this.reset(obj);
      } catch (error) {
        // Reset failed, remove object from pool
        const index = this.pool.indexOf(pooled);
        if (index !== -1) {
          this.pool.splice(index, 1);
          this.totalDestroyed++;
        }
        return;
      }
    }

    // Mark as not in use
    pooled.inUse = false;
    pooled.lastUsedAt = performance.now();
    this.totalReleases++;

    // Check if there are waiters
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift();
      if (waiter) {
        pooled.inUse = true;
        pooled.lastUsedAt = performance.now();
        pooled.useCount++;
        waiter.resolve(obj);
      }
    }
  }

  /**
   * Execute a callback with an object from the pool
   * Automatically releases the object when done
   */
  async use<R>(callback: (obj: T) => R | Promise<R>): Promise<R> {
    const obj = await this.acquire();
    try {
      return await callback(obj);
    } finally {
      this.release(obj);
    }
  }

  /**
   * Warm up the pool by creating minimum objects
   */
  async warmUp(): Promise<void> {
    const warmupPromises: Promise<void>[] = [];

    while (this.pool.length < this.minSize) {
      const obj = this.factory();
      const pooled: PooledObject<T> = {
        obj,
        inUse: false,
        createdAt: performance.now(),
        lastUsedAt: performance.now(),
        useCount: 0,
      };
      this.pool.push(pooled);
      this.totalCreated++;
    }

    await Promise.all(warmupPromises);
  }

  /**
   * Start periodic cleanup of idle objects
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      if (this.isShutdown) return;

      const now = performance.now();

      // Remove idle objects that exceed timeout, but maintain minSize
      for (let i = this.pool.length - 1; i >= 0; i--) {
        const pooled = this.pool[i];
        if (
          !pooled.inUse &&
          this.pool.length > this.minSize &&
          now - pooled.lastUsedAt > this.maxIdleTime
        ) {
          this.pool.splice(i, 1);
          this.totalDestroyed++;
        }
      }
    }, this.cleanupInterval);
  }

  /**
   * Record acquire time for metrics
   */
  private recordAcquireTime(time: number): void {
    if (!this.metricsEnabled) return;

    const timeInMicroseconds = time * 1000;
    this.acquireTimes.push(timeInMicroseconds);
    // Keep only last 1000 acquire times
    if (this.acquireTimes.length > 1000) {
      this.acquireTimes.shift();
    }
  }

  /**
   * Get current pool metrics
   */
  getMetrics(): ObjectPoolMetrics {
    const inUseCount = this.pool.filter(p => p.inUse).length;
    const idleCount = this.pool.length - inUseCount;

    const avgAcquireTime = this.acquireTimes.length > 0
      ? this.acquireTimes.reduce((a, b) => a + b, 0) / this.acquireTimes.length
      : 0;

    // Calculate percentiles
    const sortedTimes = [...this.acquireTimes].sort((a, b) => a - b);
    const percentile = (p: number) => {
      if (sortedTimes.length === 0) return 0;
      const index = Math.floor((p / 100) * (sortedTimes.length - 1));
      return sortedTimes[index];
    };

    return {
      poolSize: this.pool.length,
      inUseCount,
      idleCount,
      totalAcquisitions: this.totalAcquisitions,
      totalReleases: this.totalReleases,
      totalCreated: this.totalCreated,
      totalDestroyed: this.totalDestroyed,
      poolExhaustedCount: this.poolExhaustedCount,
      avgAcquireTime,
      p50AcquireTime: percentile(50),
      p95AcquireTime: percentile(95),
      p99AcquireTime: percentile(99),
      utilization: this.maxSize > 0 ? (inUseCount / this.maxSize) * 100 : 0,
      timestamp: performance.now(),
    };
  }

  /**
   * Get current pool size
   */
  getPoolSize(): number {
    return this.pool.length;
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.acquireTimes = [];
    this.totalAcquisitions = 0;
    this.totalReleases = 0;
    this.totalCreated = 0;
    this.totalDestroyed = 0;
    this.poolExhaustedCount = 0;
  }

  /**
   * Shutdown the pool and clear all objects
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return;
    }

    this.isShutdown = true;

    // Clear timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Reject all pending waiters
    for (const waiter of this.waitQueue) {
      waiter.reject(new Error('Object pool is shutting down'));
    }
    this.waitQueue = [];

    // Clear pool
    this.pool = [];

    // Clear metrics
    this.acquireTimes = [];
  }

  /**
   * Check if pool is shutdown
   */
  isShutdownComplete(): boolean {
    return this.isShutdown;
  }
}
