/**
 * Connection Pool Module
 *
 * Exports connection pool functionality for low-latency API connections.
 * Provides HTTP/2 support, connection reuse, health checking, and metrics.
 * Also exports generic object pool and buffer pool for reducing GC pressure.
 */

export { ConnectionPool } from './ConnectionPool.js';
export { PoolManager, getPoolManager, getZaiPool, getAnthropicPool } from './PoolManager.js';
export { PipeliningManager, RequestPriority } from './PipeliningManager.js';
export { ObjectPool } from './ObjectPool.js';
export { BufferPool, getBufferPool, resetBufferPool } from './BufferPool.js';
export type {
  ConnectionPoolOptions,
  PooledConnection,
  PooledRequestOptions,
  PooledResponse,
  PoolMetrics,
  HealthCheckResult,
} from './types.js';
export type { PipeliningOptions, PipeliningMetrics } from './PipeliningManager.js';
export type { ObjectPoolOptions, ObjectPoolMetrics } from './ObjectPool.js';
export type { BufferSizeTier, BufferPoolMetrics, BufferPoolOptions } from './BufferPool.js';
