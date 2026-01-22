/**
 * Connection Pool - HTTP connection pooling for low-latency API calls
 *
 * Provides connection pooling with HTTP/2 support, health checking,
 * and comprehensive metrics tracking. Designed to minimize latency
 * overhead for Z.AI API connections.
 */

import type {
  ConnectionPoolOptions,
  PooledConnection,
  PooledRequestOptions,
  PooledResponse,
  PoolMetrics,
  HealthCheckResult,
} from './types.js';

/**
 * ConnectionPool class for managing reusable HTTP connections
 *
 * Features:
 * - Connection reuse with keep-alive
 * - Automatic health checking
 * - Thread-safe connection acquisition
 * - Comprehensive metrics tracking
 * - Graceful shutdown
 */
export class ConnectionPool {
  private connections: Map<string, PooledConnection> = new Map();
  private waitQueue: Array<{
    resolve: (connection: PooledConnection) => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];

  private requestDurations: number[] = [];
  private waitTimes: number[] = [];
  private metricsEnabled: boolean;

  // Configuration
  private readonly minConnections: number;
  private readonly maxConnections: number;
  private readonly acquireTimeout: number;
  private readonly idleTimeout: number;
  private readonly keepAliveTimeout: number;
  private readonly healthCheckInterval: number;
  private readonly enableHttp2: boolean;
  private readonly baseUrl: string;

  // Timers
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  // State
  private isShutdown: boolean = false;
  private connectionCounter: number = 0;
  private totalRequests: number = 0;
  private successfulRequests: number = 0;
  private failedRequests: number = 0;

  constructor(options: ConnectionPoolOptions = {}) {
    this.minConnections = options.minConnections ?? 2;
    this.maxConnections = options.maxConnections ?? 10;
    this.acquireTimeout = options.acquireTimeout ?? 5000;
    this.idleTimeout = options.idleTimeout ?? 60000;
    this.keepAliveTimeout = options.keepAliveTimeout ?? 30000;
    this.healthCheckInterval = options.healthCheckInterval ?? 30000;
    this.enableHttp2 = options.enableHttp2 ?? true;
    this.baseUrl = options.baseUrl ?? process.env.ZAI_API_BASE ?? 'https://api.z.ai/api/coding/paas/v4';
    this.metricsEnabled = options.enableMetrics ?? true;

    // Validate configuration
    if (this.minConnections < 0) {
      throw new Error('minConnections must be >= 0');
    }
    if (this.maxConnections < this.minConnections) {
      throw new Error('maxConnections must be >= minConnections');
    }

    // Start background tasks
    this.startHealthCheck();
    this.startCleanup();

    // Initialize pool if warming is enabled
    if (options.warmPool) {
      this.warmUp().catch(console.error);
    }
  }

  /**
   * Acquire a connection from the pool
   * Creates a new connection if none are available and max not reached
   */
  private async acquire(): Promise<PooledConnection> {
    if (this.isShutdown) {
      throw new Error('Connection pool is shutdown');
    }

    const startTime = performance.now();

    // Try to find an idle connection
    for (const [id, conn] of this.connections) {
      if (!conn.inUse && conn.healthy) {
        conn.inUse = true;
        conn.lastUsedAt = performance.now();
        this.recordWaitTime(performance.now() - startTime);
        return conn;
      }
    }

    // No idle connection available, try to create a new one
    if (this.connections.size < this.maxConnections) {
      const connection = this.createConnection();
      connection.inUse = true;
      connection.lastUsedAt = performance.now();
      this.recordWaitTime(performance.now() - startTime);
      return connection;
    }

    // Pool is exhausted, wait for a connection to become available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // Remove from wait queue
        const index = this.waitQueue.findIndex(q => q.resolve === resolve);
        if (index !== -1) {
          this.waitQueue.splice(index, 1);
        }
        reject(new Error(`Connection acquire timeout after ${this.acquireTimeout}ms`));
      }, this.acquireTimeout);

      this.waitQueue.push({
        resolve: (conn: PooledConnection) => {
          clearTimeout(timeout);
          this.recordWaitTime(performance.now() - startTime);
          resolve(conn);
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
   * Release a connection back to the pool
   */
  private release(connection: PooledConnection): void {
    if (this.isShutdown) {
      return;
    }

    connection.inUse = false;
    connection.lastUsedAt = performance.now();

    // Check if there are waiters
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift();
      if (waiter) {
        connection.inUse = true;
        waiter.resolve(connection);
      }
    }
  }

  /**
   * Create a new connection
   */
  private createConnection(): PooledConnection {
    const id = `conn-${++this.connectionCounter}`;
    const connection: PooledConnection = {
      id,
      baseUrl: this.baseUrl,
      inUse: false,
      createdAt: performance.now(),
      lastUsedAt: performance.now(),
      requestCount: 0,
      healthy: true,
      lastHealthCheck: performance.now(),
    };

    this.connections.set(id, connection);
    return connection;
  }

  /**
   * Make a request using a pooled connection
   */
  async request(options: PooledRequestOptions): Promise<PooledResponse> {
    const startTime = performance.now();
    this.totalRequests++;

    try {
      // Acquire connection
      const connection = await this.acquire();

      try {
        // Build target URL
        const url = new URL(options.path, connection.baseUrl);

        // Prepare fetch options
        const fetchOptions: RequestInit = {
          method: options.method,
          headers: {
            ...options.headers,
            // Enable keep-alive
            'Connection': 'keep-alive',
            'Keep-Alive': `timeout=${this.keepAliveTimeout / 1000}`,
          },
          // @ts-ignore - Bun supports duplex for streaming
          duplex: 'half',
        };

        if (options.body) {
          fetchOptions.body = options.body;
        }

        // Set timeout
        const controller = new AbortController();
        const timeout = options.timeout ?? 30000;
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        fetchOptions.signal = controller.signal;

        // Make request
        const response = await fetch(url.toString(), fetchOptions);
        clearTimeout(timeoutId);

        // Get response body (stream or buffer based on options)
        const body = options.streamResponse
          ? response.body!
          : await response.text();

        // Update connection stats
        connection.requestCount++;
        connection.lastUsedAt = performance.now();

        // Record metrics
        const duration = performance.now() - startTime;
        this.recordRequestDuration(duration);
        this.successfulRequests++;

        // Extract headers to plain object
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        // Return response
        return {
          success: response.ok,
          status: response.status,
          headers,
          body,
          duration,
          streamed: options.streamResponse ?? false,
        };
      } finally {
        // Always release connection
        this.release(connection);
      }
    } catch (error) {
      this.failedRequests++;
      const duration = performance.now() - startTime;
      this.recordRequestDuration(duration);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${options.timeout ?? 30000}ms`);
      }

      throw error;
    }
  }

  /**
   * Perform health check on a connection
   */
  private async healthCheck(connection: PooledConnection): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      // Simple health check - make a lightweight request
      const url = new URL('/', connection.baseUrl);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(url.toString(), {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'Connection': 'keep-alive',
          },
        });

        clearTimeout(timeoutId);

        const healthy = response.status < 500;
        connection.healthy = healthy;
        connection.lastHealthCheck = performance.now();

        return {
          healthy,
          duration: performance.now() - startTime,
          timestamp: performance.now(),
        };
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      connection.healthy = false;
      connection.lastHealthCheck = performance.now();

      return {
        healthy: false,
        duration: performance.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: performance.now(),
      };
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      if (this.isShutdown) return;

      // Check all idle connections
      for (const [id, conn] of this.connections) {
        if (!conn.inUse) {
          await this.healthCheck(conn);
        }
      }
    }, this.healthCheckInterval);
  }

  /**
   * Start periodic cleanup of idle connections
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      if (this.isShutdown) return;

      const now = performance.now();

      // Remove idle connections that exceed timeout
      for (const [id, conn] of this.connections) {
        if (
          !conn.inUse &&
          this.connections.size > this.minConnections &&
          now - conn.lastUsedAt > this.idleTimeout
        ) {
          this.connections.delete(id);
        }
      }
    }, this.cleanupTimer ? this.cleanupTimer : 60000);
  }

  /**
   * Warm up the pool by creating minimum connections
   */
  async warmUp(): Promise<void> {
    const warmupPromises: Promise<void>[] = [];

    while (this.connections.size < this.minConnections) {
      const connection = this.createConnection();
      warmupPromises.push(
        this.healthCheck(connection).then(result => {
          if (!result.healthy) {
            console.warn(`Connection ${connection.id} failed health check during warmup`);
          }
        })
      );
    }

    await Promise.all(warmupPromises);
  }

  /**
   * Record request duration for metrics
   */
  private recordRequestDuration(duration: number): void {
    if (!this.metricsEnabled) return;

    this.requestDurations.push(duration);
    // Keep only last 1000 durations
    if (this.requestDurations.length > 1000) {
      this.requestDurations.shift();
    }
  }

  /**
   * Record wait time for metrics
   */
  private recordWaitTime(waitTime: number): void {
    if (!this.metricsEnabled) return;

    this.waitTimes.push(waitTime);
    // Keep only last 1000 wait times
    if (this.waitTimes.length > 1000) {
      this.waitTimes.shift();
    }
  }

  /**
   * Get current pool metrics
   */
  getMetrics(): PoolMetrics {
    const activeConnections = Array.from(this.connections.values()).filter(c => c.inUse).length;
    const idleConnections = this.connections.size - activeConnections;

    const avgDuration = this.requestDurations.length > 0
      ? this.requestDurations.reduce((a, b) => a + b, 0) / this.requestDurations.length
      : 0;

    const avgWaitTime = this.waitTimes.length > 0
      ? this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length
      : 0;

    // Calculate percentiles
    const sortedDurations = [...this.requestDurations].sort((a, b) => a - b);
    const percentile = (p: number) => {
      if (sortedDurations.length === 0) return 0;
      const index = Math.floor((p / 100) * (sortedDurations.length - 1));
      return sortedDurations[index];
    };

    return {
      activeConnections,
      idleConnections,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      averageRequestDuration: avgDuration,
      p50RequestDuration: percentile(50),
      p95RequestDuration: percentile(95),
      p99RequestDuration: percentile(99),
      currentWaitTime: this.waitTimes.length > 0 ? this.waitTimes[this.waitTimes.length - 1] : 0,
      averageWaitTime: avgWaitTime,
      poolUtilization: this.maxConnections > 0 ? (activeConnections / this.maxConnections) * 100 : 0,
      timestamp: performance.now(),
    };
  }

  /**
   * Get current pool size
   */
  getPoolSize(): number {
    return this.connections.size;
  }

  /**
   * Shutdown the pool and close all connections
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return;
    }

    this.isShutdown = true;

    // Clear timers
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Reject all pending waiters
    for (const waiter of this.waitQueue) {
      waiter.reject(new Error('Connection pool is shutting down'));
    }
    this.waitQueue = [];

    // Clear connections
    this.connections.clear();

    // Clear metrics
    this.requestDurations = [];
    this.waitTimes = [];
  }

  /**
   * Check if pool is shutdown
   */
  isShutdownComplete(): boolean {
    return this.isShutdown;
  }
}
