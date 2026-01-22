/**
 * Connection Pool Module
 *
 * Exports connection pool functionality for low-latency API connections.
 * Provides HTTP/2 support, connection reuse, health checking, and metrics.
 */

export { ConnectionPool } from './ConnectionPool.js';
export { PoolManager, getPoolManager, getZaiPool, getAnthropicPool } from './PoolManager.js';
export type {
  ConnectionPoolOptions,
  PooledConnection,
  PooledRequestOptions,
  PooledResponse,
  PoolMetrics,
  HealthCheckResult,
} from './types.js';
