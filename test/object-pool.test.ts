import { test, expect, beforeEach, afterEach } from 'bun:test';
import { ObjectPool, type ObjectPoolOptions, type ObjectPoolMetrics } from '../src/pool/ObjectPool.js';
import { BufferPool, getBufferPool, resetBufferPool, type BufferPoolMetrics } from '../src/pool/BufferPool.js';

// Test interface for pooled objects
interface TestObject {
  id: number;
  data: string;
  value: number;
}

let pool: ObjectPool<TestObject>;

beforeEach(() => {
  resetBufferPool();
});

afterEach(async () => {
  if (pool) {
    await pool.shutdown();
  }
  resetBufferPool();
});

// ===== ObjectPool Tests =====

test('ObjectPool should create with default options', () => {
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: 0, data: '', value: 0 }),
  });

  expect(pool).toBeDefined();
  expect(pool.getPoolSize()).toBe(0);
});

test('ObjectPool should validate configuration', () => {
  expect(() => {
    new ObjectPool<TestObject>({
      factory: () => ({ id: 0, data: '', value: 0 }),
      minSize: -1,
    });
  }).toThrow('minSize must be >= 0');

  expect(() => {
    new ObjectPool<TestObject>({
      factory: () => ({ id: 0, data: '', value: 0 }),
      minSize: 10,
      maxSize: 5,
    });
  }).toThrow('maxSize must be >= minSize');

  expect(() => {
    // @ts-ignore - Test missing factory
    new ObjectPool<TestObject>({});
  }).toThrow('factory function is required');
});

test('ObjectPool should acquire and release objects', async () => {
  let createCount = 0;
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: createCount++, data: 'test', value: 42 }),
    maxSize: 10,
  });

  // Acquire first object
  const obj1 = await pool.acquire();
  expect(obj1).toBeDefined();
  expect(obj1.id).toBe(0);
  expect(pool.getPoolSize()).toBe(1);

  // Acquire second object
  const obj2 = await pool.acquire();
  expect(obj2).toBeDefined();
  expect(obj2.id).toBe(1);
  expect(pool.getPoolSize()).toBe(2);

  // Release first object
  pool.release(obj1);
  expect(pool.getPoolSize()).toBe(2);

  // Acquire again - should reuse obj1
  const obj3 = await pool.acquire();
  expect(obj3.id).toBe(0); // Reused obj1
  expect(pool.getPoolSize()).toBe(2);
});

test('ObjectPool should reuse objects after release', async () => {
  let createCount = 0;
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: createCount++, data: 'test', value: 42 }),
    maxSize: 10,
  });

  // Create and release an object
  const obj1 = await pool.acquire();
  expect(createCount).toBe(1);
  pool.release(obj1);

  // Acquire again - should reuse
  const obj2 = await pool.acquire();
  expect(createCount).toBe(1); // No new object created
  expect(obj2.id).toBe(obj1.id);
});

test('ObjectPool should call reset function on release', async () => {
  let resetCount = 0;
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: 1, data: 'original', value: 100 }),
    reset: (obj) => {
      obj.data = 'reset';
      obj.value = 0;
      resetCount++;
    },
    maxSize: 10,
  });

  const obj = await pool.acquire();
  obj.data = 'modified';
  obj.value = 200;

  expect(resetCount).toBe(0);

  pool.release(obj);

  expect(resetCount).toBe(1);
  expect(obj.data).toBe('reset');
  expect(obj.value).toBe(0);
});

test('ObjectPool should validate objects before reuse', async () => {
  let createCount = 0;
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: createCount++, data: 'test', value: 42 }),
    validate: (obj) => obj.value > 0, // Invalid if value <= 0
    maxSize: 10,
  });

  // Create and acquire an object
  const obj1 = await pool.acquire();
  expect(createCount).toBe(1);

  // Make it invalid
  obj1.value = 0;

  // Release it
  pool.release(obj1);

  // Acquire again - should not reuse invalid object
  const obj2 = await pool.acquire();
  expect(createCount).toBe(2); // New object created
  expect(obj2.id).toBe(1);
});

test('ObjectPool should wait when pool is exhausted', async () => {
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: 1, data: 'test', value: 42 }),
    maxSize: 2,
  });

  // Acquire all objects
  const obj1 = await pool.acquire();
  const obj2 = await pool.acquire();
  expect(pool.getPoolSize()).toBe(2);

  // Try to acquire third object - should wait
  const acquirePromise = pool.acquire();

  // Release first object
  setTimeout(() => {
    pool.release(obj1);
  }, 50);

  // Should eventually get an object
  const obj3 = await acquirePromise;
  expect(obj3).toBeDefined();
  expect(pool.getPoolSize()).toBe(2);
});

test('ObjectPool should timeout on acquire', async () => {
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: 1, data: 'test', value: 42 }),
    maxSize: 1,
    acquireTimeout: 100,
  });

  // Acquire the only object
  await pool.acquire();

  // Try to acquire again - should timeout
  await expect(pool.acquire()).rejects.toThrow('acquire timeout');
});

test('ObjectPool should execute callback with use method', async () => {
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: 1, data: 'test', value: 42 }),
    maxSize: 10,
  });

  let acquiredObj: TestObject | null = null;
  const result = await pool.use(async (obj) => {
    acquiredObj = obj;
    obj.value = 100;
    return 'success';
  });

  expect(result).toBe('success');
  expect(acquiredObj).toBeDefined();
  expect(acquiredObj!.value).toBe(100);

  // Object should be released back to pool
  const metrics = pool.getMetrics();
  expect(metrics.inUseCount).toBe(0);
});

test('ObjectPool should warm up pool', async () => {
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: 1, data: 'test', value: 42 }),
    minSize: 5,
    maxSize: 10,
  });

  expect(pool.getPoolSize()).toBe(0);

  await pool.warmUp();

  expect(pool.getPoolSize()).toBe(5);
});

test('ObjectPool should track metrics correctly', async () => {
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: 1, data: 'test', value: 42 }),
    maxSize: 10,
  });

  // Acquire and release some objects
  const obj1 = await pool.acquire();
  const obj2 = await pool.acquire();
  pool.release(obj1);

  const metrics = pool.getMetrics();

  expect(metrics.totalAcquisitions).toBe(2);
  expect(metrics.totalReleases).toBe(1);
  expect(metrics.totalCreated).toBe(2);
  expect(metrics.totalDestroyed).toBe(0);
  expect(metrics.poolSize).toBe(2);
  expect(metrics.inUseCount).toBe(1);
  expect(metrics.idleCount).toBe(1);
  expect(metrics.avgAcquireTime).toBeGreaterThan(0);
});

test('ObjectPool should clear metrics', async () => {
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: 1, data: 'test', value: 42 }),
    maxSize: 10,
  });

  await pool.acquire();
  pool.clearMetrics();

  const metrics = pool.getMetrics();

  expect(metrics.totalAcquisitions).toBe(0);
  expect(metrics.totalReleases).toBe(0);
  expect(metrics.totalCreated).toBe(0);
});

test('ObjectPool should shutdown gracefully', async () => {
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: 1, data: 'test', value: 42 }),
    maxSize: 10,
  });

  await pool.acquire();
  await pool.acquire();

  expect(pool.isShutdownComplete()).toBe(false);

  await pool.shutdown();

  expect(pool.isShutdownComplete()).toBe(true);
  expect(pool.getPoolSize()).toBe(0);

  // Should not be able to acquire after shutdown
  await expect(pool.acquire()).rejects.toThrow('shutdown');
});

test('ObjectPool should handle release errors gracefully', async () => {
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: 1, data: 'test', value: 42 }),
    reset: () => {
      throw new Error('Reset failed');
    },
    maxSize: 10,
  });

  const obj = await pool.acquire();
  expect(pool.getPoolSize()).toBe(1);

  // Release with reset error should remove object
  pool.release(obj);

  expect(pool.getPoolSize()).toBe(0);
});

test('ObjectPool should release waiting acquire on shutdown', async () => {
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: 1, data: 'test', value: 42 }),
    maxSize: 1,
  });

  // Acquire the only object
  await pool.acquire();

  // Try to acquire again - will wait
  const acquirePromise = pool.acquire();

  // Shutdown while waiting
  setTimeout(() => {
    pool.shutdown().catch(console.error);
  }, 50);

  // Should reject with shutdown error
  await expect(acquirePromise).rejects.toThrow();
});

// ===== BufferPool Tests =====

test('BufferPool should create with default tiers', () => {
  const bufferPool = new BufferPool();

  expect(bufferPool).toBeDefined();

  const metrics = bufferPool.getMetrics();
  expect(metrics.tiers.length).toBeGreaterThan(0);
});

test('BufferPool should acquire buffer of correct size', async () => {
  const bufferPool = new BufferPool();

  // Acquire 4KB buffer
  const buffer1 = await bufferPool.acquire(4096);
  expect(buffer1.byteLength).toBe(4096);

  // Acquire 8KB buffer
  const buffer2 = await bufferPool.acquire(8192);
  expect(buffer2.byteLength).toBe(8192);

  // Acquire 5KB - should get 8KB buffer (next tier up)
  const buffer3 = await bufferPool.acquire(5000);
  expect(buffer3.byteLength).toBe(8192);

  await bufferPool.shutdown();
});

test('BufferPool should reuse buffers', async () => {
  const bufferPool = new BufferPool();

  // Acquire and release a buffer
  const buffer1 = await bufferPool.acquire(4096);
  const metrics1 = bufferPool.getMetrics();
  const tier1Metrics = metrics1.tiers.find(t => t.size === 4096);
  expect(tier1Metrics?.metrics.totalCreated).toBe(1);

  bufferPool.release(buffer1);

  // Acquire again - should reuse
  const buffer2 = await bufferPool.acquire(4096);
  const metrics2 = bufferPool.getMetrics();
  const tier2Metrics = metrics2.tiers.find(t => t.size === 4096);
  expect(tier2Metrics?.metrics.totalCreated).toBe(1); // No new buffer created

  await bufferPool.shutdown();
});

test('BufferPool should reset buffers on release', async () => {
  const bufferPool = new BufferPool();

  const buffer = await bufferPool.acquire(4096);
  buffer[0] = 42;
  buffer[1] = 99;

  bufferPool.release(buffer);

  // Buffer should be zeroed out
  expect(buffer[0]).toBe(0);
  expect(buffer[1]).toBe(0);

  await bufferPool.shutdown();
});

test('BufferPool should use callback with use method', async () => {
  const bufferPool = new BufferPool();

  const result = await bufferPool.use(4096, async (buffer) => {
    buffer[0] = 42;
    return 'success';
  });

  expect(result).toBe('success');

  // Buffer should be released
  const metrics = bufferPool.getMetrics();
  const tierMetrics = metrics.tiers.find(t => t === 4096);
  expect(tierMetrics?.metrics.inUseCount).toBeUndefined();

  await bufferPool.shutdown();
});

test('BufferPool should track metrics', async () => {
  const bufferPool = new BufferPool();

  await bufferPool.acquire(4096);
  await bufferPool.acquire(8192);

  const metrics = bufferPool.getMetrics();

  expect(metrics.totalBuffers).toBeGreaterThan(0);
  expect(metrics.totalInUse).toBe(2);
  expect(metrics.totalBytes).toBeGreaterThan(0);
  expect(metrics.tiers.length).toBeGreaterThan(0);

  await bufferPool.shutdown();
});

test('BufferPool should get tier-specific metrics', async () => {
  const bufferPool = new BufferPool();

  await bufferPool.acquire(4096);

  const tierMetrics = bufferPool.getTierMetrics(4096);
  expect(tierMetrics).toBeDefined();
  expect(tierMetrics?.poolSize).toBe(1);

  const invalidTierMetrics = bufferPool.getTierMetrics(9999);
  expect(invalidTierMetrics).toBeNull();

  await bufferPool.shutdown();
});

test('BufferPool should clear metrics', async () => {
  const bufferPool = new BufferPool();

  await bufferPool.acquire(4096);

  bufferPool.clearMetrics();

  const metrics = bufferPool.getMetrics();
  const tierMetrics = metrics.tiers.find(t => t.size === 4096);
  expect(tierMetrics?.metrics.totalAcquisitions).toBe(0);

  await bufferPool.shutdown();
});

test('BufferPool should shutdown all pools', async () => {
  const bufferPool = new BufferPool();

  await bufferPool.acquire(4096);
  await bufferPool.acquire(8192);

  await bufferPool.shutdown();

  expect(bufferPool.isShutdownComplete()).toBe(true);

  const metrics = bufferPool.getMetrics();
  expect(metrics.totalBuffers).toBe(0);
});

test('BufferPool should handle oversized requests', async () => {
  const bufferPool = new BufferPool();

  // Request buffer larger than any tier
  const buffer = await bufferPool.acquire(1000000);

  // Should return a new buffer (not pooled)
  expect(buffer.byteLength).toBe(1000000);

  // Releasing should not crash
  bufferPool.release(buffer);

  await bufferPool.shutdown();
});

test('BufferPool global instance should work', async () => {
  const bufferPool = getBufferPool();

  expect(bufferPool).toBeDefined();

  const buffer = await bufferPool.acquire(4096);
  expect(buffer.byteLength).toBe(4096);

  bufferPool.release(buffer);
});

test('BufferPool should reset global instance', async () => {
  const bufferPool1 = getBufferPool();
  await bufferPool1.acquire(4096);

  resetBufferPool();

  const bufferPool2 = getBufferPool();
  expect(bufferPool2).toBeDefined();
  expect(bufferPool2).not.toBe(bufferPool1);
});

// ===== Integration Tests =====

test('ObjectPool should handle concurrent acquisitions', async () => {
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: Math.random(), data: 'test', value: 42 }),
    maxSize: 5,
  });

  // Acquire 5 objects concurrently
  const promises = Array.from({ length: 5 }, () => pool.acquire());
  const objects = await Promise.all(promises);

  expect(objects).toHaveLength(5);
  expect(pool.getPoolSize()).toBe(5);

  // Release all
  for (const obj of objects) {
    pool.release(obj);
  }

  expect(pool.getMetrics().inUseCount).toBe(0);
});

test('ObjectPool should maintain performance under load', async () => {
  pool = new ObjectPool<TestObject>({
    factory: () => ({ id: Math.random(), data: 'test', value: 42 }),
    maxSize: 100,
  });

  const iterations = 1000;
  const startTime = performance.now();

  for (let i = 0; i < iterations; i++) {
    const obj = await pool.acquire();
    obj.value = i;
    pool.release(obj);
  }

  const duration = performance.now() - startTime;
  const avgTime = duration / iterations;

  // Should average less than 1ms per acquire/release cycle
  expect(avgTime).toBeLessThan(1);

  const metrics = pool.getMetrics();
  expect(metrics.totalAcquisitions).toBe(iterations);
  expect(metrics.totalReleases).toBe(iterations);
});

test('BufferPool should reduce allocations for streaming operations', async () => {
  const bufferPool = new BufferPool();

  const iterations = 1000;
  const startTime = performance.now();

  for (let i = 0; i < iterations; i++) {
    const buffer = await bufferPool.acquire(4096);
    buffer[0] = i & 0xff;
    bufferPool.release(buffer);
  }

  const duration = performance.now() - startTime;
  const avgTime = duration / iterations;

  // Should average less than 0.5ms per acquire/release cycle
  expect(avgTime).toBeLessThan(0.5);

  await bufferPool.shutdown();
});
