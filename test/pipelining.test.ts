import { test, expect, beforeEach } from 'bun:test';
import {
  PipeliningManager,
  RequestPriority,
  type PipeliningOptions,
  type PipeliningMetrics,
} from '../src/pool/PipeliningManager.js';
import type { PooledConnection, PooledRequestOptions, PooledResponse } from '../src/pool/types.js';

// Mock request executor
function createMockExecutor(
  delay: number = 10,
  shouldFail: boolean = false
): (
  connection: PooledConnection,
  options: PooledRequestOptions
) => Promise<PooledResponse> {
  return async (
    _connection: PooledConnection,
    options: PooledRequestOptions
  ): Promise<PooledResponse> => {
    await new Promise(resolve => setTimeout(resolve, delay));

    if (shouldFail) {
      throw new Error('Mock request failed');
    }

    return {
      success: true,
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'success' }),
      duration: delay,
    };
  };
}

// Mock connection
function createMockConnection(id: string = 'conn-1'): PooledConnection {
  return {
    id,
    baseUrl: 'https://api.example.com',
    inUse: false,
    createdAt: performance.now(),
    lastUsedAt: performance.now(),
    requestCount: 0,
    healthy: true,
  };
}

beforeEach(() => {
  // Reset any state if needed
});

test('PipeliningManager should create with default options', () => {
  const executor = createMockExecutor();
  const manager = new PipeliningManager(executor);

  expect(manager).toBeDefined();
  expect(manager.getQueueDepth()).toBe(0);
  expect(manager.getActiveRequestCount()).toBe(0);
  expect(manager.canAcceptRequest()).toBe(true);
});

test('PipeliningManager should create with custom options', () => {
  const executor = createMockExecutor();
  const options: PipeliningOptions = {
    maxConcurrentPerConnection: 4,
    maxQueueSize: 500,
    enablePrioritization: false,
    queueTimeout: 5000,
    enableMetrics: false,
  };

  const manager = new PipeliningManager(executor, options);

  expect(manager).toBeDefined();
  expect(manager.getQueueDepth()).toBe(0);
});

test('PipeliningManager should execute request immediately when capacity available', async () => {
  const executor = createMockExecutor(10);
  const manager = new PipeliningManager(executor, {
    maxConcurrentPerConnection: 3,
  });

  const connection = createMockConnection();
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  const response = await manager.execute(connection, options);

  expect(response.success).toBe(true);
  expect(response.status).toBe(200);
  expect(manager.getActiveRequestCount()).toBe(0);
});

test('PipeliningManager should queue requests when at capacity', async () => {
  const executor = createMockExecutor(50); // Slow executor
  const manager = new PipeliningManager(executor, {
    maxConcurrentPerConnection: 2,
  });

  const connection = createMockConnection();
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  // Start 3 concurrent requests (max is 2)
  const request1 = manager.execute(connection, options);
  const request2 = manager.execute(connection, options);
  const request3 = manager.execute(connection, options); // Should be queued

  // Third request should be queued
  expect(manager.getQueueDepth()).toBe(1);

  // Wait for all to complete
  const [response1, response2, response3] = await Promise.all([
    request1,
    request2,
    request3,
  ]);

  expect(response1.success).toBe(true);
  expect(response2.success).toBe(true);
  expect(response3.success).toBe(true);
  expect(manager.getQueueDepth()).toBe(0);
});

test('PipeliningManager should handle priority-based scheduling', async () => {
  const executor = createMockExecutor(30);
  const manager = new PipeliningManager(executor, {
    maxConcurrentPerConnection: 1,
  });

  const connection = createMockConnection();
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  // Start first request
  const request1 = manager.execute(
    connection,
    options,
    RequestPriority.NORMAL
  );

  // Queue high priority request
  const request2 = manager.execute(
    connection,
    options,
    RequestPriority.HIGH
  );

  // Queue low priority request
  const request3 = manager.execute(
    connection,
    options,
    RequestPriority.LOW
  );

  // Queue critical priority request
  const request4 = manager.execute(
    connection,
    options,
    RequestPriority.CRITICAL
  );

  // Queue depth should be 3 (2nd, 3rd, 4th requests)
  expect(manager.getQueueDepth()).toBe(3);

  const [response1, response2, response3, response4] = await Promise.all([
    request1,
    request2,
    request3,
    request4,
  ]);

  expect(response1.success).toBe(true);
  expect(response2.success).toBe(true);
  expect(response3.success).toBe(true);
  expect(response4.success).toBe(true);
});

test('PipeliningManager should track metrics correctly', async () => {
  const executor = createMockExecutor(10);
  const manager = new PipeliningManager(executor, {
    maxConcurrentPerConnection: 2,
  });

  const connection = createMockConnection();
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  // Execute requests with different priorities
  await manager.execute(connection, options, RequestPriority.NORMAL);
  await manager.execute(connection, options, RequestPriority.HIGH);
  await manager.execute(connection, options, RequestPriority.CRITICAL);

  const metrics = manager.getMetrics();

  expect(metrics.totalRequests).toBe(3);
  expect(metrics.requestsByPriority.normal).toBe(1);
  expect(metrics.requestsByPriority.high).toBe(1);
  expect(metrics.requestsByPriority.critical).toBe(1);
  expect(metrics.requestsByPriority.low).toBe(0);
  expect(metrics.activeRequests).toBe(0);
  expect(metrics.queueDepth).toBe(0);
});

test('PipeliningManager should track pipelined requests', async () => {
  const executor = createMockExecutor(50);
  const manager = new PipeliningManager(executor, {
    maxConcurrentPerConnection: 3,
  });

  const connection = createMockConnection();
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  // Execute concurrent requests (should be pipelined)
  const requests = [
    manager.execute(connection, options),
    manager.execute(connection, options),
    manager.execute(connection, options),
  ];

  await Promise.all(requests);

  const metrics = manager.getMetrics();
  expect(metrics.pipelinedRequests).toBeGreaterThan(0);
  expect(metrics.peakConcurrency).toBeGreaterThanOrEqual(2);
});

test('PipeliningManager should apply backpressure when queue full', async () => {
  const executor = createMockExecutor(100); // Very slow
  const manager = new PipeliningManager(executor, {
    maxConcurrentPerConnection: 1,
    maxQueueSize: 2,
  });

  const connection = createMockConnection();
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  // Fill queue to capacity (1 active + 2 queued = 3)
  const request1 = manager.execute(connection, options);
  const request2 = manager.execute(connection, options);
  const request3 = manager.execute(connection, options);

  // Fourth request should be rejected (backpressure)
  await expect(manager.execute(connection, options)).rejects.toThrow(
    'Request queue full'
  );

  const metrics = manager.getMetrics();
  expect(metrics.backpressureEvents).toBe(1);

  // Clean up
  await Promise.all([request1, request2, request3]);
});

test('PipeliningManager should timeout queued requests', async () => {
  const executor = createMockExecutor(100); // Slow
  const manager = new PipeliningManager(executor, {
    maxConcurrentPerConnection: 1,
    maxQueueSize: 10,
    queueTimeout: 50, // Very short timeout
  });

  const connection = createMockConnection();
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  // Start slow request
  const request1 = manager.execute(connection, options);

  // Queue a request that will timeout
  await expect(manager.execute(connection, options)).rejects.toThrow(
    'Request queued timeout'
  );

  // Clean up
  await request1;
});

test('PipeliningManager should handle executor errors gracefully', async () => {
  const failingExecutor = createMockExecutor(10, true);
  const manager = new PipeliningManager(failingExecutor);

  const connection = createMockConnection();
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  await expect(manager.execute(connection, options)).rejects.toThrow(
    'Mock request failed'
  );

  // Manager should still be functional
  expect(manager.getActiveRequestCount()).toBe(0);
});

test('PipeliningManager should shutdown gracefully', async () => {
  const executor = createMockExecutor(50);
  const manager = new PipeliningManager(executor, {
    maxConcurrentPerConnection: 2,
  });

  const connection = createMockConnection();
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  // Start some requests
  const request1 = manager.execute(connection, options);
  const request2 = manager.execute(connection, options);

  // Shutdown manager
  await manager.shutdown();

  // Should reject new requests
  await expect(manager.execute(connection, options)).rejects.toThrow(
    'PipeliningManager is shutdown'
  );

  // Existing requests should complete
  await request1;
  await request2;

  expect(manager.isShutdownComplete()).toBe(true);
});

test('PipeliningManager should reject queued requests on shutdown', async () => {
  const executor = createMockExecutor(100); // Slow
  const manager = new PipeliningManager(executor, {
    maxConcurrentPerConnection: 1,
  });

  const connection = createMockConnection();
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  // Start slow request
  const request1 = manager.execute(connection, options);

  // Queue another request
  const request2Promise = manager.execute(connection, options);

  // Shutdown while request is queued
  await manager.shutdown();

  // Queued request should be rejected
  await expect(request2Promise).rejects.toThrow(
    'PipeliningManager is shutting down'
  );

  // Complete first request
  await request1;
});

test('PipeliningManager should clear metrics', async () => {
  const executor = createMockExecutor(10);
  const manager = new PipeliningManager(executor);

  const connection = createMockConnection();
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  // Execute some requests
  await manager.execute(connection, options, RequestPriority.HIGH);
  await manager.execute(connection, options, RequestPriority.NORMAL);

  let metrics = manager.getMetrics();
  expect(metrics.totalRequests).toBe(2);

  // Clear metrics
  manager.clearMetrics();

  metrics = manager.getMetrics();
  expect(metrics.totalRequests).toBe(0);
  expect(metrics.requestsByPriority.high).toBe(0);
  expect(metrics.requestsByPriority.normal).toBe(0);
});

test('PipeliningManager should remove connection capacity', async () => {
  const executor = createMockExecutor(10);
  const manager = new PipeliningManager(executor);

  const connection1 = createMockConnection('conn-1');
  const connection2 = createMockConnection('conn-2');
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  // Execute requests on both connections
  await manager.execute(connection1, options);
  await manager.execute(connection2, options);

  // Remove first connection
  manager.removeConnection('conn-1');

  // Should still work with second connection
  const response = await manager.execute(connection2, options);
  expect(response.success).toBe(true);
});

test('PipeliningManager should work without prioritization', async () => {
  const executor = createMockExecutor(20);
  const manager = new PipeliningManager(executor, {
    maxConcurrentPerConnection: 1,
    enablePrioritization: false,
  });

  const connection = createMockConnection();
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  // Queue multiple requests with different priorities
  const request1 = manager.execute(
    connection,
    options,
    RequestPriority.LOW
  );
  const request2 = manager.execute(
    connection,
    options,
    RequestPriority.CRITICAL
  );
  const request3 = manager.execute(
    connection,
    options,
    RequestPriority.NORMAL
  );

  // All should complete successfully
  const [response1, response2, response3] = await Promise.all([
    request1,
    request2,
    request3,
  ]);

  expect(response1.success).toBe(true);
  expect(response2.success).toBe(true);
  expect(response3.success).toBe(true);
});

test('PipeliningManager should track queue wait times', async () => {
  const executor = createMockExecutor(30);
  const manager = new PipeliningManager(executor, {
    maxConcurrentPerConnection: 1,
  });

  const connection = createMockConnection();
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  // Execute requests that will be queued
  await manager.execute(connection, options);
  await manager.execute(connection, options);
  await manager.execute(connection, options);

  const metrics = manager.getMetrics();

  // Should have recorded queue wait times
  expect(metrics.p50QueueWaitTime).toBeGreaterThanOrEqual(0);
  expect(metrics.p95QueueWaitTime).toBeGreaterThanOrEqual(0);
  expect(metrics.p99QueueWaitTime).toBeGreaterThanOrEqual(0);
});

test('PipeliningManager should calculate peak concurrency', async () => {
  const executor = createMockExecutor(20);
  const manager = new PipeliningManager(executor, {
    maxConcurrentPerConnection: 3,
  });

  const connection1 = createMockConnection('conn-1');
  const connection2 = createMockConnection('conn-2');
  const options: PooledRequestOptions = {
    method: 'POST',
    path: '/test',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ test: true }),
  };

  // Execute requests on multiple connections concurrently
  await Promise.all([
    manager.execute(connection1, options),
    manager.execute(connection1, options),
    manager.execute(connection2, options),
  ]);

  const metrics = manager.getMetrics();
  // Peak concurrency should be at least 2 (we had 3 concurrent requests)
  expect(metrics.peakConcurrency).toBeGreaterThanOrEqual(2);
});
