/**
 * Pool Manager - High-level connection pool management
 *
 * Provides a singleton interface for managing connection pools
 * to different upstream APIs. Handles pool lifecycle, configuration,
 * and provides convenience methods for common operations.
 */

import { ConnectionPool } from './ConnectionPool.js';
import type {
  ConnectionPoolOptions,
  PooledRequestOptions,
  PooledResponse,
  PoolMetrics,
} from './types.js';

/**
 * Pool configuration for a specific API endpoint
 */
interface PoolConfig {
  name: string;
  baseUrl: string;
  options: ConnectionPoolOptions;
  pool?: ConnectionPool;
}

/**
 * PoolManager - Singleton manager for connection pools
 *
 * Manages multiple connection pools for different API endpoints.
 * Provides convenient access to pools and handles pool lifecycle.
 */
export class PoolManager {
  private static instance: PoolManager | null = null;
  private pools: Map<string, PoolConfig> = new Map();
  private isShutdown: boolean = false;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): PoolManager {
    if (!PoolManager.instance) {
      PoolManager.instance = new PoolManager();
    }
    return PoolManager.instance;
  }

  /**
   * Create or get a connection pool for a specific endpoint
   */
  getPool(name: string, baseUrl: string, options: ConnectionPoolOptions = {}): ConnectionPool {
    if (this.isShutdown) {
      throw new Error('PoolManager is shutdown');
    }

    // Check if pool already exists
    const existing = this.pools.get(name);
    if (existing && existing.pool) {
      return existing.pool;
    }

    // Create new pool
    const pool = new ConnectionPool({
      ...options,
      baseUrl,
    });

    this.pools.set(name, {
      name,
      baseUrl,
      options,
      pool,
    });

    return pool;
  }

  /**
   * Get the default Z.AI API pool
   */
  getZaiPool(): ConnectionPool {
    const baseUrl = process.env.ZAI_API_BASE || 'https://api.z.ai/api/coding/paas/v4';

    return this.getPool('zai-api', baseUrl, {
      minConnections: parseInt(process.env.POOL_MIN_CONNECTIONS || '2', 10),
      maxConnections: parseInt(process.env.POOL_MAX_CONNECTIONS || '10', 10),
      enableHttp2: true,
      warmPool: process.env.POOL_WARM === 'true',
    });
  }

  /**
   * Get the Anthropic API pool
   */
  getAnthropicPool(): ConnectionPool {
    const baseUrl = 'https://open.bigmodel.cn/api/anthropic';

    return this.getPool('anthropic-api', baseUrl, {
      minConnections: parseInt(process.env.POOL_MIN_CONNECTIONS || '2', 10),
      maxConnections: parseInt(process.env.POOL_MAX_CONNECTIONS || '10', 10),
      enableHttp2: true,
      warmPool: process.env.POOL_WARM === 'true',
    });
  }

  /**
   * Make a request using the specified pool
   */
  async request(poolName: string, options: PooledRequestOptions): Promise<PooledResponse> {
    if (this.isShutdown) {
      throw new Error('PoolManager is shutdown');
    }

    const poolConfig = this.pools.get(poolName);
    if (!poolConfig || !poolConfig.pool) {
      throw new Error(`Pool '${poolName}' not found. Create it first with getPool().`);
    }

    return poolConfig.pool.request(options);
  }

  /**
   * Get metrics for a specific pool
   */
  getPoolMetrics(poolName: string): PoolMetrics | null {
    const poolConfig = this.pools.get(poolName);
    if (!poolConfig || !poolConfig.pool) {
      return null;
    }

    return poolConfig.pool.getMetrics();
  }

  /**
   * Get metrics for all pools
   */
  getAllMetrics(): Record<string, PoolMetrics> {
    const metrics: Record<string, PoolMetrics> = {};

    for (const [name, config] of this.pools) {
      if (config.pool) {
        metrics[name] = config.pool.getMetrics();
      }
    }

    return metrics;
  }

  /**
   * Get a summary of all pools
   */
  getSummary(): {
    totalPools: number;
    totalConnections: number;
    activeConnections: number;
    pools: Array<{
      name: string;
      baseUrl: string;
      poolSize: number;
      metrics: PoolMetrics;
    }>;
  } {
    let totalConnections = 0;
    let activeConnections = 0;

    const pools = Array.from(this.pools.entries()).map(([name, config]) => {
      if (!config.pool) {
        return {
          name,
          baseUrl: config.baseUrl,
          poolSize: 0,
          metrics: {} as PoolMetrics,
        };
      }

      const metrics = config.pool.getMetrics();
      totalConnections += config.pool.getPoolSize();
      activeConnections += metrics.activeConnections;

      return {
        name,
        baseUrl: config.baseUrl,
        poolSize: config.pool.getPoolSize(),
        metrics,
      };
    });

    return {
      totalPools: this.pools.size,
      totalConnections,
      activeConnections,
      pools,
    };
  }

  /**
   * Warm up all pools
   */
  async warmUpAll(): Promise<void> {
    const warmupPromises: Promise<void>[] = [];

    for (const config of this.pools.values()) {
      if (config.pool) {
        warmupPromises.push(config.pool.warmUp());
      }
    }

    await Promise.all(warmupPromises);
  }

  /**
   * Shutdown a specific pool
   */
  async shutdownPool(poolName: string): Promise<void> {
    const poolConfig = this.pools.get(poolName);
    if (poolConfig && poolConfig.pool) {
      await poolConfig.pool.shutdown();
      this.pools.delete(poolName);
    }
  }

  /**
   * Shutdown all pools
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return;
    }

    this.isShutdown = true;

    const shutdownPromises: Promise<void>[] = [];

    for (const config of this.pools.values()) {
      if (config.pool) {
        shutdownPromises.push(config.pool.shutdown());
      }
    }

    await Promise.all(shutdownPromises);
    this.pools.clear();
  }

  /**
   * Check if PoolManager is shutdown
   */
  isShutdownComplete(): boolean {
    return this.isShutdown;
  }
}

/**
 * Convenience function to get the singleton instance
 */
export function getPoolManager(): PoolManager {
  return PoolManager.getInstance();
}

/**
 * Convenience function to get the default Z.AI API pool
 */
export function getZaiPool(): ConnectionPool {
  return getPoolManager().getZaiPool();
}

/**
 * Convenience function to get the Anthropic API pool
 */
export function getAnthropicPool(): ConnectionPool {
  return getPoolManager().getAnthropicPool();
}
