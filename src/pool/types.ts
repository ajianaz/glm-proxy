/**
 * Connection Pool Type Definitions
 *
 * Defines interfaces and types for HTTP connection pooling.
 * Optimized for low-latency connections to Z.AI API.
 */

/**
 * Configuration options for the connection pool
 */
export interface ConnectionPoolOptions {
  /** Minimum number of connections to maintain (default: 2) */
  minConnections?: number;
  /** Maximum number of connections allowed (default: 10) */
  maxConnections?: number;
  /** Maximum time to wait for a connection in ms (default: 5000) */
  acquireTimeout?: number;
  /** Maximum idle time for a connection in ms (default: 60000) */
  idleTimeout?: number;
  /** Connection keep-alive timeout in ms (default: 30000) */
  keepAliveTimeout?: number;
  /** Health check interval in ms (default: 30000) */
  healthCheckInterval?: number;
  /** Enable HTTP/2 multiplexing (default: true) */
  enableHttp2?: boolean;
  /** Enable connection pool warming on startup (default: false) */
  warmPool?: boolean;
  /** Base URL for the upstream API (default: from env) */
  baseUrl?: string;
  /** Enable metrics collection (default: true) */
  enableMetrics?: boolean;
}

/**
 * Represents a pooled connection
 */
export interface PooledConnection {
  /** Unique connection identifier */
  id: string;
  /** Base URL for this connection */
  baseUrl: string;
  /** Whether the connection is currently in use */
  inUse: boolean;
  /** Timestamp when the connection was created */
  createdAt: number;
  /** Timestamp when the connection was last used */
  lastUsedAt: number;
  /** Number of requests handled by this connection */
  requestCount: number;
  /** Whether the connection is healthy */
  healthy: boolean;
  /** Last health check timestamp */
  lastHealthCheck?: number;
}

/**
 * Request options for pooled connections
 */
export interface PooledRequestOptions {
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Request headers */
  headers: Record<string, string>;
  /** Request body */
  body?: string | null;
  /** Request timeout in ms */
  timeout?: number;
}

/**
 * Response from pooled request
 */
export interface PooledResponse {
  /** Whether the request was successful */
  success: boolean;
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Response body */
  body: string;
  /** Request duration in ms */
  duration: number;
}

/**
 * Connection pool metrics
 */
export interface PoolMetrics {
  /** Current number of active connections */
  activeConnections: number;
  /** Current number of idle connections */
  idleConnections: number;
  /** Total number of requests handled */
  totalRequests: number;
  /** Total number of successful requests */
  successfulRequests: number;
  /** Total number of failed requests */
  failedRequests: number;
  /** Average request duration in ms */
  averageRequestDuration: number;
  /** P50 request duration in ms */
  p50RequestDuration: number;
  /** P95 request duration in ms */
  p95RequestDuration: number;
  /** P99 request duration in ms */
  p99RequestDuration: number;
  /** Current wait time for acquiring connection in ms */
  currentWaitTime: number;
  /** Average wait time for acquiring connection in ms */
  averageWaitTime: number;
  /** Pool utilization percentage (0-100) */
  poolUtilization: number;
  /** Timestamp when metrics were collected */
  timestamp: number;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  /** Whether the connection is healthy */
  healthy: boolean;
  /** Health check duration in ms */
  duration: number;
  /** Error message if unhealthy */
  error?: string;
  /** Timestamp of health check */
  timestamp: number;
}
