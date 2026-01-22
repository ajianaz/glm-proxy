/**
 * Metrics Registry - Centralized metrics management
 *
 * Provides a singleton registry for managing metrics collectors
 * and exporting metrics in various formats (JSON, Prometheus).
 */

import type {
  MetricsRegistryOptions,
  SystemMetrics,
} from './types.js';
import { MetricsCollector } from './Collector.js';

/**
 * MetricsRegistry class for managing metrics collection
 *
 * Features:
 * - Singleton pattern for global access
 * - Multiple collector management
 * - JSON and Prometheus export formats
 * - Aggregated metrics across all collectors
 * - Graceful shutdown and cleanup
 */
export class MetricsRegistry {
  private static instance: MetricsRegistry | null = null;
  private enabled: boolean;
  private defaultAggregationIntervalMs: number;
  private enablePrometheusExport: boolean;

  private collectors: Map<string, MetricsCollector> = new Map();
  private systemCollector: MetricsCollector;

  private constructor(options: MetricsRegistryOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.defaultAggregationIntervalMs = options.defaultAggregationIntervalMs ?? 5000;
    this.enablePrometheusExport = options.enablePrometheusExport ?? true;

    // Create default system collector
    this.systemCollector = new MetricsCollector({
      enabled: this.enabled,
      aggregationIntervalMs: this.defaultAggregationIntervalMs,
    });

    this.collectors.set('system', this.systemCollector);
  }

  /**
   * Get or create the global metrics registry instance
   */
  static getInstance(options?: MetricsRegistryOptions): MetricsRegistry {
    if (!MetricsRegistry.instance) {
      MetricsRegistry.instance = new MetricsRegistry(options);
    }
    return MetricsRegistry.instance;
  }

  /**
   * Reset the global metrics registry instance
   */
  static resetInstance(): void {
    if (MetricsRegistry.instance) {
      MetricsRegistry.instance.shutdown();
      MetricsRegistry.instance = null;
    }
  }

  /**
   * Get the system metrics collector
   */
  getSystemCollector(): MetricsCollector {
    return this.systemCollector;
  }

  /**
   * Get a named collector
   */
  getCollector(name: string): MetricsCollector | undefined {
    return this.collectors.get(name);
  }

  /**
   * Create a new named collector
   */
  createCollector(name: string): MetricsCollector {
    if (this.collectors.has(name)) {
      return this.collectors.get(name)!;
    }

    const collector = new MetricsCollector({
      enabled: this.enabled,
      aggregationIntervalMs: this.defaultAggregationIntervalMs,
    });

    this.collectors.set(name, collector);
    return collector;
  }

  /**
   * Remove a named collector
   */
  removeCollector(name: string): boolean {
    if (name === 'system') {
      return false; // Cannot remove system collector
    }

    const collector = this.collectors.get(name);
    if (collector) {
      collector.stopAggregation();
      return this.collectors.delete(name);
    }
    return false;
  }

  /**
   * Get all collector names
   */
  getCollectorNames(): string[] {
    return Array.from(this.collectors.keys());
  }

  /**
   * Collect metrics from all collectors
   */
  collectAllMetrics(): Record<string, SystemMetrics> {
    const allMetrics: Record<string, SystemMetrics> = {};

    for (const [name, collector] of this.collectors) {
      allMetrics[name] = collector.collectSystemMetrics();
    }

    return allMetrics;
  }

  /**
   * Collect system metrics (default collector)
   */
  collectSystemMetrics(): SystemMetrics {
    return this.systemCollector.collectSystemMetrics();
  }

  /**
   * Export metrics as JSON
   */
  exportAsJSON(): string {
    const metrics = this.collectAllMetrics();
    return JSON.stringify(metrics, null, 2);
  }

  /**
   * Export metrics as Prometheus format
   */
  exportAsPrometheus(): string {
    if (!this.enablePrometheusExport) {
      return '';
    }

    const metrics = this.collectSystemMetrics();
    const lines: string[] = [];

    // Request metrics
    lines.push('# HELP glm_proxy_requests_total Total number of requests');
    lines.push('# TYPE glm_proxy_requests_total counter');
    lines.push(`glm_proxy_requests_total ${metrics.requests.totalRequests}`);

    lines.push('# HELP glm_proxy_requests_successful Total number of successful requests');
    lines.push('# TYPE glm_proxy_requests_successful counter');
    lines.push(`glm_proxy_requests_successful ${metrics.requests.successfulRequests}`);

    lines.push('# HELP glm_proxy_requests_failed Total number of failed requests');
    lines.push('# TYPE glm_proxy_requests_failed counter');
    lines.push(`glm_proxy_requests_failed ${metrics.requests.failedRequests}`);

    // Latency metrics
    lines.push('# HELP glm_proxy_latency_avg Average request latency in milliseconds');
    lines.push('# TYPE glm_proxy_latency_avg gauge');
    lines.push(`glm_proxy_latency_avg ${metrics.requests.avg}`);

    lines.push('# HELP glm_proxy_latency_p50 P50 request latency in milliseconds');
    lines.push('# TYPE glm_proxy_latency_p50 gauge');
    lines.push(`glm_proxy_latency_p50 ${metrics.requests.p50}`);

    lines.push('# HELP glm_proxy_latency_p95 P95 request latency in milliseconds');
    lines.push('# TYPE glm_proxy_latency_p95 gauge');
    lines.push(`glm_proxy_latency_p95 ${metrics.requests.p95}`);

    lines.push('# HELP glm_proxy_latency_p99 P99 request latency in milliseconds');
    lines.push('# TYPE glm_proxy_latency_p99 gauge');
    lines.push(`glm_proxy_latency_p99 ${metrics.requests.p99}`);

    // Throughput metrics
    lines.push('# HELP glm_proxy_throughput_rps Requests per second');
    lines.push('# TYPE glm_proxy_throughput_rps gauge');
    lines.push(`glm_proxy_throughput_rps ${metrics.throughput.requestsPerSecond}`);

    // Connection pool metrics
    for (const pool of metrics.connectionPools) {
      const poolName = pool.pool;
      lines.push(`# HELP glm_proxy_pool_active_connections Active connections for ${poolName} pool`);
      lines.push(`# TYPE glm_proxy_pool_active_connections gauge`);
      lines.push(`glm_proxy_pool_active_connections{pool="${poolName}"} ${pool.activeConnections}`);

      lines.push(`# HELP glm_proxy_pool_utilization Pool utilization percentage for ${poolName} pool`);
      lines.push(`# TYPE glm_proxy_pool_utilization gauge`);
      lines.push(`glm_proxy_pool_utilization{pool="${poolName}"} ${pool.poolUtilization}`);
    }

    // Cache metrics
    for (const cache of metrics.caches) {
      const cacheName = cache.cache;
      lines.push(`# HELP glm_proxy_cache_size Current size of ${cacheName} cache`);
      lines.push(`# TYPE glm_proxy_cache_size gauge`);
      lines.push(`glm_proxy_cache_size{cache="${cacheName}"} ${cache.size}`);

      lines.push(`# HELP glm_proxy_cache_hit_rate Hit rate of ${cacheName} cache`);
      lines.push(`# TYPE glm_proxy_cache_hit_rate gauge`);
      lines.push(`glm_proxy_cache_hit_rate{cache="${cacheName}"} ${cache.hitRate}`);
    }

    // Error metrics
    lines.push('# HELP glm_proxy_errors_total Total number of errors');
    lines.push('# TYPE glm_proxy_errors_total counter');
    lines.push(`glm_proxy_errors_total ${metrics.errors.totalErrors}`);

    lines.push('# HELP glm_proxy_error_rate Error rate (errors per request)');
    lines.push('# TYPE glm_proxy_error_rate gauge');
    lines.push(`glm_proxy_error_rate ${metrics.errors.errorRate}`);

    // Resource metrics
    lines.push('# HELP glm_proxy_memory_usage_mb Memory usage in MB');
    lines.push('# TYPE glm_proxy_memory_usage_mb gauge');
    lines.push(`glm_proxy_memory_usage_mb ${metrics.resources.memoryUsageMB}`);

    lines.push('# HELP glm_proxy_memory_peak_mb Peak memory usage in MB');
    lines.push('# TYPE glm_proxy_memory_peak_mb gauge');
    lines.push(`glm_proxy_memory_peak_mb ${metrics.resources.peakMemoryUsageMB}`);

    lines.push('# HELP glm_proxy_cpu_usage_percent CPU usage percentage');
    lines.push('# TYPE glm_proxy_cpu_usage_percent gauge');
    lines.push(`glm_proxy_cpu_usage_percent ${metrics.resources.cpuUsagePercent}`);

    return lines.join('\n');
  }

  /**
   * Reset all metrics in all collectors
   */
  resetAll(): void {
    for (const collector of this.collectors.values()) {
      collector.reset();
    }
  }

  /**
   * Gracefully shutdown the registry
   */
  shutdown(): void {
    for (const collector of this.collectors.values()) {
      collector.stopAggregation();
    }
    this.collectors.clear();
  }

  /**
   * Check if registry is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Get the global metrics registry instance
 */
export function getMetricsRegistry(): MetricsRegistry {
  return MetricsRegistry.getInstance();
}

/**
 * Reset the global metrics registry instance
 */
export function resetMetricsRegistry(): void {
  MetricsRegistry.resetInstance();
}
