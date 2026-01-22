/**
 * Metrics Module Type Definitions
 *
 * Defines interfaces and types for comprehensive metrics collection.
 * Aggregates metrics from requests, connection pools, cache, and resources.
 */

/**
 * Metric types for categorization
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary',
}

/**
 * Metric dimensions for filtering and grouping
 */
export interface MetricDimensions {
  /** HTTP method */
  method?: string;
  /** Request path */
  path?: string;
  /** Status code */
  status?: number;
  /** Model name */
  model?: string;
  /** API key identifier (hashed) */
  apiKey?: string;
  /** Error type */
  errorType?: string;
  /** Custom dimensions */
  [key: string]: string | number | undefined;
}

/**
 * Base metric interface
 */
export interface Metric {
  /** Metric name */
  name: string;
  /** Metric type */
  type: MetricType;
  /** Metric value */
  value: number;
  /** Dimensions for filtering */
  dimensions?: MetricDimensions;
  /** Timestamp */
  timestamp: number;
}

/**
 * Counter metric (monotonically increasing)
 */
export interface Counter extends Metric {
  type: MetricType.COUNTER;
  value: number;
  rate?: number; // Rate per second
}

/**
 * Gauge metric (can go up or down)
 */
export interface Gauge extends Metric {
  type: MetricType.GAUGE;
  value: number;
  min?: number;
  max?: number;
  avg?: number;
}

/**
 * Histogram metric (distribution of values)
 */
export interface Histogram extends Metric {
  type: MetricType.HISTOGRAM;
  buckets: Record<string, number>; // bucket key -> count
  count: number;
  sum: number;
}

/**
 * Summary metric (statistics with percentiles)
 */
export interface Summary extends Metric {
  type: MetricType.SUMMARY;
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Request latency metrics
 */
export interface RequestMetrics {
  /** Total request count */
  totalRequests: number;
  /** Successful request count */
  successfulRequests: number;
  /** Failed request count */
  failedRequests: number;
  /** Request rate (requests/sec) */
  requestRate: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Latency percentiles in ms */
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Throughput metrics
 */
export interface ThroughputMetrics {
  /** Requests per second */
  requestsPerSecond: number;
  /** Bytes per second */
  bytesPerSecond: number;
  /** Average request size in bytes */
  avgRequestSize: number;
  /** Average response size in bytes */
  avgResponseSize: number;
  /** Peak requests per second */
  peakRequestsPerSecond: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Connection pool metrics (aggregated from all pools)
 */
export interface ConnectionPoolMetrics {
  /** Pool identifier */
  pool: string;
  /** Active connections */
  activeConnections: number;
  /** Idle connections */
  idleConnections: number;
  /** Total requests */
  totalRequests: number;
  /** Successful requests */
  successfulRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Average request duration in ms */
  avgRequestDuration: number;
  /** P50 request duration in ms */
  p50RequestDuration: number;
  /** P95 request duration in ms */
  p95RequestDuration: number;
  /** P99 request duration in ms */
  p99RequestDuration: number;
  /** Pool utilization percentage */
  poolUtilization: number;
  /** Average wait time in ms */
  avgWaitTime: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Cache metrics (aggregated from all caches)
 */
export interface CacheMetrics {
  /** Cache identifier */
  cache: string;
  /** Current size */
  size: number;
  /** Maximum size */
  maxSize: number;
  /** Total lookups */
  totalLookups: number;
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Average lookup time in microseconds */
  avgLookupTime: number;
  /** Evictions */
  evictedCount: number;
  /** Expired entries */
  expiredCount: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Error metrics
 */
export interface ErrorMetrics {
  /** Total errors */
  totalErrors: number;
  /** Errors by type */
  errorsByType: Record<string, number>;
  /** Errors by status code */
  errorsByStatus: Record<number, number>;
  /** Error rate (errors per request) */
  errorRate: number;
  /** Top error types */
  topErrors: Array<{ type: string; count: number; rate: number }>;
  /** Timestamp */
  timestamp: number;
}

/**
 * Resource usage metrics
 */
export interface ResourceMetrics {
  /** Memory usage in MB */
  memoryUsageMB: number;
  /** Peak memory usage in MB */
  peakMemoryUsageMB: number;
  /** Memory growth rate (MB/sec) */
  memoryGrowthRate: number;
  /** Memory trend (increasing/decreasing/stable) */
  memoryTrend: 'increasing' | 'decreasing' | 'stable';
  /** CPU usage percentage (0-100) */
  cpuUsagePercent: number;
  /** CPU usage cores */
  cpuUsageCores: number;
  /** Event loop lag in ms */
  eventLoopLag: number;
  /** Active handles */
  activeHandles: number;
  /** Active requests */
  activeRequests: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Aggregated system metrics
 */
export interface SystemMetrics {
  /** Request metrics */
  requests: RequestMetrics;
  /** Throughput metrics */
  throughput: ThroughputMetrics;
  /** Connection pool metrics (by pool) */
  connectionPools: ConnectionPoolMetrics[];
  /** Cache metrics (by cache) */
  caches: CacheMetrics[];
  /** Error metrics */
  errors: ErrorMetrics;
  /** Resource metrics */
  resources: ResourceMetrics;
  /** Timestamp */
  timestamp: number;
}

/**
 * Metrics collector configuration
 */
export interface MetricsCollectorOptions {
  /** Enable metrics collection (default: true) */
  enabled?: boolean;
  /** Retention period in ms (default: 60000 = 1 minute) */
  retentionMs?: number;
  /** Aggregation interval in ms (default: 1000 = 1 second) */
  aggregationIntervalMs?: number;
  /** Maximum latency samples to keep (default: 10000) */
  maxLatencySamples?: number;
  /** Enable percentile calculation (default: true) */
  enablePercentiles?: boolean;
}

/**
 * Metrics registry configuration
 */
export interface MetricsRegistryOptions {
  /** Enable registry (default: true) */
  enabled?: boolean;
  /** Default aggregation interval in ms (default: 5000 = 5 seconds) */
  defaultAggregationIntervalMs?: number;
  /** Enable Prometheus export format (default: true) */
  enablePrometheusExport?: boolean;
}
