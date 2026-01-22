import { test, expect, beforeEach, afterEach } from 'bun:test';
import { ConnectionPool } from '../src/pool/ConnectionPool.js';
import { PoolManager, getPoolManager } from '../src/pool/PoolManager.js';

// Mock server for testing
const mockServer = Bun.serve({
  port: 0, // Random available port
  fetch: (req) => {
    const url = new URL(req.url);

    // Health check endpoint
    if (req.method === 'HEAD' && url.pathname === '/') {
      return new Response(null, { status: 200 });
    }

    // Test endpoint
    if (url.pathname === '/test') {
      return new Response(
        JSON.stringify({ message: 'test response' }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }

    // Slow endpoint for timeout testing
    if (url.pathname === '/slow') {
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(
            new Response(
              JSON.stringify({ message: 'slow response' }),
              { status: 200, headers: { 'content-type': 'application/json' } }
            )
          );
        }, 500); // 500ms delay
      });
    }

    // Echo endpoint
    if (url.pathname === '/echo') {
      return new Response(JSON.stringify({ echoed: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
});

const MOCK_BASE_URL = `http://localhost:${mockServer.port}`;

beforeEach(() => {
  // Reset pool manager before each test
  const manager = getPoolManager();
  // @ts-ignore - Access private method for testing
  manager.pools.clear();
  // @ts-ignore
  manager.isShutdown = false;
});

afterEach(async () => {
  // Cleanup after tests
  const manager = getPoolManager();
  await manager.shutdown();
});

test('ConnectionPool should create with default options', () => {
  const pool = new ConnectionPool({
    baseUrl: MOCK_BASE_URL,
  });

  expect(pool).toBeDefined();
  expect(pool.getPoolSize()).toBe(0);
});

test('ConnectionPool should validate configuration', () => {
  expect(() => {
    new ConnectionPool({
      minConnections: -1,
      baseUrl: MOCK_BASE_URL,
    });
  }).toThrow('minConnections must be >= 0');

  expect(() => {
    new ConnectionPool({
      minConnections: 10,
      maxConnections: 5,
      baseUrl: MOCK_BASE_URL,
    });
  }).toThrow('maxConnections must be >= minConnections');
});

test('ConnectionPool should warm up connections', async () => {
  const pool = new ConnectionPool({
    minConnections: 3,
    maxConnections: 10,
    baseUrl: MOCK_BASE_URL,
  });

  await pool.warmUp();

  expect(pool.getPoolSize()).toBe(3);
});

test('ConnectionPool should make successful request', async () => {
  const pool = new ConnectionPool({
    minConnections: 1,
    maxConnections: 5,
    baseUrl: MOCK_BASE_URL,
  });

  const response = await pool.request({
    method: 'GET',
    path: '/test',
    headers: {},
  });

  expect(response.success).toBe(true);
  expect(response.status).toBe(200);
  expect(response.body).toContain('test response');
  expect(response.duration).toBeGreaterThan(0);
});

test('ConnectionPool should handle concurrent requests', async () => {
  const pool = new ConnectionPool({
    minConnections: 2,
    maxConnections: 5,
    baseUrl: MOCK_BASE_URL,
  });

  // Make concurrent requests
  const promises = Array.from({ length: 10 }, () =>
    pool.request({
      method: 'GET',
      path: '/echo',
      headers: {},
    })
  );

  const responses = await Promise.all(promises);

  expect(responses).toHaveLength(10);
  expect(responses.every(r => r.success)).toBe(true);
});

test('ConnectionPool should track metrics', async () => {
  const pool = new ConnectionPool({
    minConnections: 1,
    maxConnections: 5,
    baseUrl: MOCK_BASE_URL,
    enableMetrics: true,
  });

  // Make some requests
  await pool.request({
    method: 'GET',
    path: '/test',
    headers: {},
  });

  await pool.request({
    method: 'GET',
    path: '/echo',
    headers: {},
  });

  const metrics = pool.getMetrics();

  expect(metrics.totalRequests).toBe(2);
  expect(metrics.successfulRequests).toBe(2);
  expect(metrics.failedRequests).toBe(0);
  expect(metrics.averageRequestDuration).toBeGreaterThan(0);
  expect(metrics.activeConnections).toBe(0); // Released after request
  expect(metrics.idleConnections).toBe(1);
});

test('ConnectionPool should acquire timeout when pool exhausted', async () => {
  const pool = new ConnectionPool({
    minConnections: 0,
    maxConnections: 1,
    acquireTimeout: 100,
    baseUrl: MOCK_BASE_URL,
  });

  // Create a slow request that will keep the connection busy
  const slowRequest = pool.request({
    method: 'GET',
    path: '/slow',
    headers: {},
  });

  // Wait a bit to ensure the first request has acquired the connection
  await new Promise(resolve => setTimeout(resolve, 10));

  // Try to acquire another connection (should timeout since pool is exhausted)
  try {
    await pool.request({
      method: 'GET',
      path: '/test',
      headers: {},
    });
    expect(true).toBe(false); // Should not reach here
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('timeout');
  }

  // Wait for slow request to complete
  await slowRequest;
});

test('ConnectionPool should shutdown gracefully', async () => {
  const pool = new ConnectionPool({
    minConnections: 2,
    maxConnections: 5,
    baseUrl: MOCK_BASE_URL,
  });

  await pool.warmUp();
  expect(pool.getPoolSize()).toBe(2);

  await pool.shutdown();

  expect(pool.isShutdownComplete()).toBe(true);
  expect(pool.getPoolSize()).toBe(0);

  // Should not be able to make requests after shutdown
  try {
    await pool.request({
      method: 'GET',
      path: '/test',
      headers: {},
    });
    expect(true).toBe(false);
  } catch (error) {
    expect((error as Error).message).toContain('shutdown');
  }
});

test('PoolManager should be singleton', () => {
  const manager1 = getPoolManager();
  const manager2 = getPoolManager();

  expect(manager1).toBe(manager2);
});

test('PoolManager should create and retrieve pools', () => {
  const manager = getPoolManager();

  const pool1 = manager.getPool('test-pool', MOCK_BASE_URL, {
    minConnections: 1,
    maxConnections: 5,
  });

  const pool2 = manager.getPool('test-pool', MOCK_BASE_URL);

  expect(pool1).toBe(pool2);
});

test('PoolManager should get Z.AI pool', () => {
  const manager = getPoolManager();
  const pool = manager.getZaiPool();

  expect(pool).toBeDefined();
  expect(pool).toBeInstanceOf(ConnectionPool);
});

test('PoolManager should get Anthropic pool', () => {
  const manager = getPoolManager();
  const pool = manager.getAnthropicPool();

  expect(pool).toBeDefined();
  expect(pool).toBeInstanceOf(ConnectionPool);
});

test('PoolManager should make request through pool', async () => {
  const manager = getPoolManager();

  manager.getPool('test-api', MOCK_BASE_URL, {
    minConnections: 1,
    maxConnections: 5,
  });

  const response = await manager.request('test-api', {
    method: 'GET',
    path: '/test',
    headers: {},
  });

  expect(response.success).toBe(true);
});

test('PoolManager should get pool metrics', async () => {
  const manager = getPoolManager();

  manager.getPool('metrics-pool', MOCK_BASE_URL, {
    minConnections: 1,
    maxConnections: 5,
    enableMetrics: true,
  });

  await manager.request('metrics-pool', {
    method: 'GET',
    path: '/test',
    headers: {},
  });

  const metrics = manager.getPoolMetrics('metrics-pool');

  expect(metrics).toBeDefined();
  expect(metrics?.totalRequests).toBe(1);
});

test('PoolManager should get all metrics', async () => {
  const manager = getPoolManager();

  manager.getPool('pool1', MOCK_BASE_URL, {
    minConnections: 1,
    maxConnections: 5,
    enableMetrics: true,
  });

  manager.getPool('pool2', MOCK_BASE_URL, {
    minConnections: 1,
    maxConnections: 5,
    enableMetrics: true,
  });

  await manager.request('pool1', {
    method: 'GET',
    path: '/test',
    headers: {},
  });

  await manager.request('pool2', {
    method: 'GET',
    path: '/test',
    headers: {},
  });

  const allMetrics = manager.getAllMetrics();

  expect(allMetrics).toHaveProperty('pool1');
  expect(allMetrics).toHaveProperty('pool2');
  expect(allMetrics.pool1.totalRequests).toBe(1);
  expect(allMetrics.pool2.totalRequests).toBe(1);
});

test('PoolManager should get summary', async () => {
  const manager = getPoolManager();

  manager.getPool('pool1', MOCK_BASE_URL, {
    minConnections: 1,
    maxConnections: 5,
  });

  manager.getPool('pool2', MOCK_BASE_URL, {
    minConnections: 1,
    maxConnections: 5,
  });

  const summary = manager.getSummary();

  expect(summary.totalPools).toBe(2);
  expect(summary.pools).toHaveLength(2);
  expect(summary.pools[0].name).toBeDefined();
  expect(summary.pools[0].baseUrl).toBeDefined();
  expect(summary.pools[0].metrics).toBeDefined();
});

test('PoolManager should warm up all pools', async () => {
  const manager = getPoolManager();

  manager.getPool('pool1', MOCK_BASE_URL, {
    minConnections: 2,
    maxConnections: 5,
  });

  manager.getPool('pool2', MOCK_BASE_URL, {
    minConnections: 3,
    maxConnections: 5,
  });

  await manager.warmUpAll();

  const summary = manager.getSummary();
  expect(summary.pools[0].poolSize).toBe(2);
  expect(summary.pools[1].poolSize).toBe(3);
});

test('PoolManager should shutdown specific pool', async () => {
  const manager = getPoolManager();

  manager.getPool('pool1', MOCK_BASE_URL, {
    minConnections: 2,
    maxConnections: 5,
  });

  manager.getPool('pool2', MOCK_BASE_URL, {
    minConnections: 2,
    maxConnections: 5,
  });

  await manager.warmUpAll();

  let summary = manager.getSummary();
  expect(summary.totalPools).toBe(2);

  await manager.shutdownPool('pool1');

  summary = manager.getSummary();
  expect(summary.totalPools).toBe(1);
});

test('PoolManager should shutdown all pools', async () => {
  const manager = getPoolManager();

  manager.getPool('pool1', MOCK_BASE_URL, {
    minConnections: 2,
    maxConnections: 5,
  });

  manager.getPool('pool2', MOCK_BASE_URL, {
    minConnections: 2,
    maxConnections: 5,
  });

  await manager.warmUpAll();
  await manager.shutdown();

  expect(manager.isShutdownComplete()).toBe(true);

  const summary = manager.getSummary();
  expect(summary.totalPools).toBe(0);
});

test('ConnectionPool should handle error responses', async () => {
  const pool = new ConnectionPool({
    minConnections: 1,
    maxConnections: 5,
    baseUrl: MOCK_BASE_URL,
  });

  const response = await pool.request({
    method: 'GET',
    path: '/notfound',
    headers: {},
  });

  expect(response.success).toBe(false);
  expect(response.status).toBe(404);
});

test('ConnectionPool should include request headers', async () => {
  const pool = new ConnectionPool({
    minConnections: 1,
    maxConnections: 5,
    baseUrl: MOCK_BASE_URL,
  });

  const response = await pool.request({
    method: 'GET',
    path: '/test',
    headers: {
      'X-Custom-Header': 'test-value',
    },
  });

  expect(response.success).toBe(true);
});

test('ConnectionPool should handle POST requests with body', async () => {
  const pool = new ConnectionPool({
    minConnections: 1,
    maxConnections: 5,
    baseUrl: MOCK_BASE_URL,
  });

  const response = await pool.request({
    method: 'POST',
    path: '/echo',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ test: 'data' }),
  });

  expect(response.success).toBe(true);
});
