/**
 * Metrics Collector - Comprehensive metrics collection and aggregation
 *
 * Collects and aggregates metrics from requests, connection pools, cache,
 * and system resources. Provides efficient metric storage and retrieval.
 */

import type {
  MetricsCollectorOptions,
  RequestMetrics,
  ThroughputMetrics,
  ConnectionPoolMetrics,
  CacheMetrics,
  ErrorMetrics,
  ResourceMetrics,
  SystemMetrics,
  MetricDimensions,
} from './types.js';
import { getPoolManager } from '../pool/PoolManager.js';
import { getCacheManager } from '../cache/CacheManager.js';
import { getApiKeyCache } from '../cache/ApiKeyCache.js';

/**
 * MetricsCollector class for collecting and aggregating system metrics
 *
 * Features:
 * - Request latency tracking with percentiles
 * - Throughput measurement
 * - Connection pool metrics aggregation
 * - Cache metrics aggregation
 * - Error tracking and categorization
 * - Resource usage monitoring
 * - Efficient time-based aggregation
 */
export class MetricsCollector {
  private enabled: boolean;
  private retentionMs: number;
  private aggregationIntervalMs: number;
  private maxLatencySamples: number;
  private enablePercentiles: boolean;

  // Request tracking
  private requestLatencies: number[] = [];
  private requestTimestamps: number[] = [];
  private totalRequests: number = 0;
  private successfulRequests: number = 0;
  private failedRequests: number = 0;

  // Throughput tracking
  private requestBytes: number[] = [];
  private responseBytes: number[] = [];
  private throughputTimestamps: number[] = [];
  private peakRequestsPerSecond: number = 0;

  // Error tracking
  private errorsByType: Record<string, number> = {};
  private errorsByStatus: Record<number, number> = {};
  private errorTimestamps: number[] = [];

  // Resource tracking
  private memorySnapshots: Array<{ timestamp: number; usage: number }> = [];
  private cpuSnapshots: Array<{ timestamp: number; usage: number }> = [];
  private peakMemoryUsage: number = 0;

  // Aggregation timer
  private aggregationTimer?: ReturnType<typeof setInterval>;

  constructor(options: MetricsCollectorOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.retentionMs = options.retentionMs ?? 60000; // 1 minute
    this.aggregationIntervalMs = options.aggregationIntervalMs ?? 1000; // 1 second
    this.maxLatencySamples = options.maxLatencySamples ?? 10000;
    this.enablePercentiles = options.enablePercentiles ?? true;

    if (this.enabled) {
      this.startAggregation();
    }
  }

  /**
   * Record a request with its latency and outcome
   */
  recordRequest(
    latencyMs: number,
    success: boolean,
    statusCode: number,
    dimensions?: MetricDimensions
  ): void {
    if (!this.enabled) return;

    const now = Date.now();

    // Record latency
    this.requestLatencies.push(latencyMs);
    this.requestTimestamps.push(now);
    this.totalRequests++;

    if (success) {
      this.successfulRequests++;
    } else {
      this.failedRequests++;
      this.recordError(statusCode, dimensions?.errorType as string);
    }

    // Trim samples if needed
    this.trimLatencySamples();
  }

  /**
   * Record throughput data
   */
  recordThroughput(
    requestBytes: number,
    responseBytes: number,
    requestCount: number
  ): void {
    if (!this.enabled) return;

    const now = Date.now();

    this.requestBytes.push(requestBytes);
    this.responseBytes.push(responseBytes);
    this.throughputTimestamps.push(now);

    // Track peak RPS
    if (requestCount > this.peakRequestsPerSecond) {
      this.peakRequestsPerSecond = requestCount;
    }

    this.trimThroughputSamples();
  }

  /**
   * Record an error
   */
  recordError(statusCode: number, errorType?: string): void {
    if (!this.enabled) return;

    const now = Date.now();
    this.errorTimestamps.push(now);

    // Track by status code
    this.errorsByStatus[statusCode] = (this.errorsByStatus[statusCode] || 0) + 1;

    // Track by error type
    if (errorType) {
      this.errorsByType[errorType] = (this.errorsByType[errorType] || 0) + 1;
    }

    this.trimErrorSamples();
  }

  /**
   * Collect current resource usage
   */
  private collectResourceMetrics(): ResourceMetrics {
    const memUsage = process.memoryUsage();
    const memoryUsageMB = memUsage.heapUsed / 1024 / 1024;

    // Update peak memory
    if (memoryUsageMB > this.peakMemoryUsage) {
      this.peakMemoryUsage = memoryUsageMB;
    }

    // Store snapshot for trend analysis
    this.memorySnapshots.push({
      timestamp: Date.now(),
      usage: memoryUsageMB,
    });

    // Trim snapshots
    const cutoffTime = Date.now() - this.retentionMs;
    this.memorySnapshots = this.memorySnapshots.filter(s => s.timestamp > cutoffTime);

    // Calculate memory trend
    const memoryTrend = this.calculateTrend(this.memorySnapshots.map(s => s.usage));
    const memoryGrowthRate = this.calculateGrowthRate(this.memorySnapshots);

    // Get CPU usage (approximation)
    const cpuUsage = process.cpuUsage();
    const cpuUsagePercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds

    return {
      memoryUsageMB,
      peakMemoryUsageMB: this.peakMemoryUsage,
      memoryGrowthRate,
      memoryTrend,
      cpuUsagePercent,
      cpuUsageCores: process.cpuUsage ? 1 : 0, // Simplified
      eventLoopLag: 0, // Would need async measurement
      activeHandles: (process as unknown as { _getActiveHandles?: () => unknown })._getActiveHandles?.()?.length || 0,
      activeRequests: (process as unknown as { _getActiveRequests?: () => unknown })._getActiveRequests?.()?.length || 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Collect connection pool metrics
   */
  private collectConnectionPoolMetrics(): ConnectionPoolMetrics[] {
    const metrics: ConnectionPoolMetrics[] = [];
    const poolManager = getPoolManager();

    if (!poolManager) {
      return metrics;
    }

    // Get metrics for Z.AI pool
    const zaiPool = poolManager.getPool('zai');
    if (zaiPool) {
      const poolMetrics = zaiPool.getMetrics();
      metrics.push({
        pool: 'zai',
        activeConnections: poolMetrics.activeConnections,
        idleConnections: poolMetrics.idleConnections,
        totalRequests: poolMetrics.totalRequests,
        successfulRequests: poolMetrics.successfulRequests,
        failedRequests: poolMetrics.failedRequests,
        avgRequestDuration: poolMetrics.averageRequestDuration,
        p50RequestDuration: poolMetrics.p50RequestDuration,
        p95RequestDuration: poolMetrics.p95RequestDuration,
        p99RequestDuration: poolMetrics.p99RequestDuration,
        poolUtilization: poolMetrics.poolUtilization,
        avgWaitTime: poolMetrics.averageWaitTime,
        timestamp: Date.now(),
      });
    }

    // Get metrics for Anthropic pool
    const anthropicPool = poolManager.getPool('anthropic');
    if (anthropicPool) {
      const poolMetrics = anthropicPool.getMetrics();
      metrics.push({
        pool: 'anthropic',
        activeConnections: poolMetrics.activeConnections,
        idleConnections: poolMetrics.idleConnections,
        totalRequests: poolMetrics.totalRequests,
        successfulRequests: poolMetrics.successfulRequests,
        failedRequests: poolMetrics.failedRequests,
        avgRequestDuration: poolMetrics.averageRequestDuration,
        p50RequestDuration: poolMetrics.p50RequestDuration,
        p95RequestDuration: poolMetrics.p95RequestDuration,
        p99RequestDuration: poolMetrics.p99RequestDuration,
        poolUtilization: poolMetrics.poolUtilization,
        avgWaitTime: poolMetrics.averageWaitTime,
        timestamp: Date.now(),
      });
    }

    return metrics;
  }

  /**
   * Collect cache metrics
   */
  private collectCacheMetrics(): CacheMetrics[] {
    const metrics: CacheMetrics[] = [];

    // Response cache metrics
    const responseCache = getCacheManager();
    if (responseCache) {
      const cacheMetrics = responseCache.getMetrics();
      metrics.push({
        cache: 'response',
        size: cacheMetrics.size,
        maxSize: cacheMetrics.maxSize,
        totalLookups: cacheMetrics.totalLookups,
        hits: cacheMetrics.hits,
        misses: cacheMetrics.misses,
        hitRate: cacheMetrics.hitRate,
        avgLookupTime: cacheMetrics.avgLookupTime,
        evictedCount: cacheMetrics.evictedCount,
        expiredCount: cacheMetrics.expiredCount,
        timestamp: Date.now(),
      });
    }

    // API key cache metrics
    const apiKeyCache = getApiKeyCache();
    if (apiKeyCache) {
      const cacheMetrics = apiKeyCache.getMetrics();
      metrics.push({
        cache: 'apikey',
        size: cacheMetrics.size,
        maxSize: cacheMetrics.maxSize,
        totalLookups: cacheMetrics.totalLookups,
        hits: cacheMetrics.hits,
        misses: cacheMetrics.misses,
        hitRate: cacheMetrics.hitRate,
        avgLookupTime: cacheMetrics.avgLookupTime,
        evictedCount: 0, // API key cache doesn't track this
        expiredCount: cacheMetrics.expiredCount,
        timestamp: Date.now(),
      });
    }

    return metrics;
  }

  /**
   * Collect error metrics
   */
  private collectErrorMetrics(): ErrorMetrics {
    // Count errors from both errorType and errorStatus
    const totalErrorsByType = Object.values(this.errorsByType).reduce((sum, count) => sum + count, 0);
    const totalErrorsByStatus = Object.values(this.errorsByStatus).reduce((sum, count) => sum + count, 0);
    const totalErrors = Math.max(totalErrorsByType, totalErrorsByStatus);

    const totalRequests = this.totalRequests || 1; // Avoid division by zero

    // Calculate top errors
    const topErrors = Object.entries(this.errorsByType)
      .map(([type, count]) => ({
        type,
        count,
        rate: count / totalRequests,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalErrors,
      errorsByType: { ...this.errorsByType },
      errorsByStatus: { ...this.errorsByStatus },
      errorRate: totalErrors / totalRequests,
      topErrors,
      timestamp: Date.now(),
    };
  }

  /**
   * Collect request metrics
   */
  private collectRequestMetrics(): RequestMetrics {
    const latencies = this.requestLatencies;
    const totalRequests = this.totalRequests || 1;

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      requestRate: this.calculateRequestRate(),
      errorRate: this.failedRequests / totalRequests,
      p50: this.calculatePercentile(latencies, 50),
      p95: this.calculatePercentile(latencies, 95),
      p99: this.calculatePercentile(latencies, 99),
      avg: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      min: latencies.length > 0 ? Math.min(...latencies) : 0,
      max: latencies.length > 0 ? Math.max(...latencies) : 0,
      timestamp: Date.now(),
    };
  }

  /**
   * Collect throughput metrics
   */
  private collectThroughputMetrics(): ThroughputMetrics {
    const windowSize = this.aggregationIntervalMs / 1000; // Convert to seconds
    const requestsPerSecond = this.requestTimestamps.length / windowSize;

    return {
      requestsPerSecond,
      bytesPerSecond: (this.requestBytes.reduce((a, b) => a + b, 0) +
                       this.responseBytes.reduce((a, b) => a + b, 0)) / windowSize,
      avgRequestSize: this.requestBytes.length > 0
        ? this.requestBytes.reduce((a, b) => a + b, 0) / this.requestBytes.length
        : 0,
      avgResponseSize: this.responseBytes.length > 0
        ? this.responseBytes.reduce((a, b) => a + b, 0) / this.responseBytes.length
        : 0,
      peakRequestsPerSecond: this.peakRequestsPerSecond,
      timestamp: Date.now(),
    };
  }

  /**
   * Collect all system metrics
   */
  collectSystemMetrics(): SystemMetrics {
    return {
      requests: this.collectRequestMetrics(),
      throughput: this.collectThroughputMetrics(),
      connectionPools: this.collectConnectionPoolMetrics(),
      caches: this.collectCacheMetrics(),
      errors: this.collectErrorMetrics(),
      resources: this.collectResourceMetrics(),
      timestamp: Date.now(),
    };
  }

  /**
   * Start periodic aggregation
   */
  private startAggregation(): void {
    this.aggregationTimer = setInterval(() => {
      this.cleanupOldSamples();
    }, this.aggregationIntervalMs);
  }

  /**
   * Stop periodic aggregation
   */
  stopAggregation(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = undefined;
    }
  }

  /**
   * Clean up old samples based on retention period
   */
  private cleanupOldSamples(): void {
    const cutoffTime = Date.now() - this.retentionMs;

    this.requestTimestamps = this.requestTimestamps.filter(t => t > cutoffTime);
    this.requestLatencies = this.requestLatencies.slice(-this.maxLatencySamples);
    this.throughputTimestamps = this.throughputTimestamps.filter(t => t > cutoffTime);
    this.errorTimestamps = this.errorTimestamps.filter(t => t > cutoffTime);
  }

  /**
   * Trim latency samples to max size
   */
  private trimLatencySamples(): void {
    if (this.requestLatencies.length > this.maxLatencySamples) {
      const removeCount = this.requestLatencies.length - this.maxLatencySamples;
      this.requestLatencies = this.requestLatencies.slice(removeCount);
      this.requestTimestamps = this.requestTimestamps.slice(removeCount);
    }
  }

  /**
   * Trim throughput samples
   */
  private trimThroughputSamples(): void {
    const maxSamples = Math.floor(this.retentionMs / this.aggregationIntervalMs) * 2;
    if (this.throughputTimestamps.length > maxSamples) {
      const removeCount = this.throughputTimestamps.length - maxSamples;
      this.throughputTimestamps = this.throughputTimestamps.slice(removeCount);
      this.requestBytes = this.requestBytes.slice(removeCount);
      this.responseBytes = this.responseBytes.slice(removeCount);
    }
  }

  /**
   * Trim error samples
   */
  private trimErrorSamples(): void {
    const maxSamples = 1000;
    if (this.errorTimestamps.length > maxSamples) {
      this.errorTimestamps = this.errorTimestamps.slice(-maxSamples);
    }
  }

  /**
   * Calculate percentile from sorted array
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    if (!this.enablePercentiles) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Calculate request rate (requests/sec)
   */
  private calculateRequestRate(): number {
    if (this.requestTimestamps.length < 2) return 0;

    const timeWindow = (Date.now() - this.requestTimestamps[0]) / 1000;
    return this.requestTimestamps.length / Math.max(timeWindow, 1);
  }

  /**
   * Calculate trend from values
   */
  private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';

    const first = values[0];
    const last = values[values.length - 1];
    const change = ((last - first) / first) * 100;

    if (change > 5) return 'increasing';
    if (change < -5) return 'decreasing';
    return 'stable';
  }

  /**
   * Calculate growth rate
   */
  private calculateGrowthRate(
    snapshots: Array<{ timestamp: number; usage: number }>
  ): number {
    if (snapshots.length < 2) return 0;

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const timeDiff = (last.timestamp - first.timestamp) / 1000 / 60; // minutes

    if (timeDiff === 0) return 0;

    return ((last.usage - first.usage) / timeDiff); // MB per minute
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.requestLatencies = [];
    this.requestTimestamps = [];
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.requestBytes = [];
    this.responseBytes = [];
    this.throughputTimestamps = [];
    this.peakRequestsPerSecond = 0;
    this.errorsByType = {};
    this.errorsByStatus = {};
    this.errorTimestamps = [];
    this.memorySnapshots = [];
    this.cpuSnapshots = [];
    this.peakMemoryUsage = 0;
  }

  /**
   * Get collector status
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}
