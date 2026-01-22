/**
 * Object Pool Benchmark
 *
 * Demonstrates the performance benefits of object pooling for reducing
 * GC pressure and improving allocation performance.
 */

import { ObjectPool } from '../../src/pool/ObjectPool.js';
import { BufferPool } from '../../src/pool/BufferPool.js';

interface TestObject {
  id: number;
  data: string;
  value: number;
  timestamp: number;
}

/**
 * Benchmark object allocations with and without pooling
 */
async function benchmarkObjectPooling() {
  console.log('\n=== Object Pool Benchmark ===\n');

  const iterations = 10000;

  // Benchmark without pooling
  console.log('Benchmarking without pooling...');
  const startNoPool = performance.now();
  for (let i = 0; i < iterations; i++) {
    const obj: TestObject = {
      id: i,
      data: 'test data',
      value: 42,
      timestamp: Date.now(),
    };
    // Simulate some work
    obj.value *= 2;
  }
  const durationNoPool = performance.now() - startNoPool;

  // Benchmark with pooling
  console.log('Benchmarking with pooling...');
  const pool = new ObjectPool<TestObject>({
    factory: () => ({
      id: 0,
      data: '',
      value: 0,
      timestamp: 0,
    }),
    reset: (obj) => {
      obj.id = 0;
      obj.data = '';
      obj.value = 0;
      obj.timestamp = 0;
    },
    maxSize: 100,
    warmPool: true,
  });

  const startWithPool = performance.now();
  for (let i = 0; i < iterations; i++) {
    await pool.use((obj) => {
      obj.id = i;
      obj.data = 'test data';
      obj.value = 42;
      obj.timestamp = Date.now();
      obj.value *= 2;
    });
  }
  const durationWithPool = performance.now() - startWithPool;

  // Calculate improvements
  const improvement = ((durationNoPool - durationWithPool) / durationNoPool) * 100;
  const speedup = durationNoPool / durationWithPool;

  console.log('\nResults:');
  console.log(`  Without pool: ${durationNoPool.toFixed(2)}ms (${(durationNoPool / iterations).toFixed(4)}ms per iteration)`);
  console.log(`  With pool:    ${durationWithPool.toFixed(2)}ms (${(durationWithPool / iterations).toFixed(4)}ms per iteration)`);
  console.log(`  Improvement:  ${improvement.toFixed(2)}% (${speedup.toFixed(2)}x faster)`);

  // Show metrics
  const metrics = pool.getMetrics();
  console.log('\nPool Metrics:');
  console.log(`  Pool size: ${metrics.poolSize}`);
  console.log(`  Total acquisitions: ${metrics.totalAcquisitions}`);
  console.log(`  Total created: ${metrics.totalCreated}`);
  console.log(`  Pool utilization: ${metrics.utilization.toFixed(2)}%`);
  console.log(`  Avg acquire time: ${metrics.avgAcquireTime.toFixed(2)}μs`);

  await pool.shutdown().catch(() => {});
}

/**
 * Benchmark buffer allocations with and without pooling
 */
async function benchmarkBufferPooling() {
  console.log('\n=== Buffer Pool Benchmark ===\n');

  const iterations = 10000;
  const bufferSize = 4096; // 4KB

  // Benchmark without pooling
  console.log('Benchmarking without pooling...');
  const startNoPool = performance.now();
  for (let i = 0; i < iterations; i++) {
    const buffer = new Uint8Array(bufferSize);
    buffer[0] = i & 0xff;
    buffer[1] = (i >> 8) & 0xff;
  }
  const durationNoPool = performance.now() - startNoPool;

  // Benchmark with pooling
  console.log('Benchmarking with pooling...');
  const bufferPool = new BufferPool({ warmPool: true });

  const startWithPool = performance.now();
  for (let i = 0; i < iterations; i++) {
    await bufferPool.use(bufferSize, (buffer) => {
      buffer[0] = i & 0xff;
      buffer[1] = (i >> 8) & 0xff;
    });
  }
  const durationWithPool = performance.now() - startWithPool;

  // Calculate improvements
  const improvement = ((durationNoPool - durationWithPool) / durationNoPool) * 100;
  const speedup = durationNoPool / durationWithPool;

  console.log('\nResults:');
  console.log(`  Without pool: ${durationNoPool.toFixed(2)}ms (${(durationNoPool / iterations).toFixed(4)}ms per iteration)`);
  console.log(`  With pool:    ${durationWithPool.toFixed(2)}ms (${(durationWithPool / iterations).toFixed(4)}ms per iteration)`);
  console.log(`  Improvement:  ${improvement.toFixed(2)}% (${speedup.toFixed(2)}x faster)`);

  // Show metrics
  const metrics = bufferPool.getMetrics();
  console.log('\nPool Metrics:');
  console.log(`  Total buffers: ${metrics.totalBuffers}`);
  console.log(`  Total in use: ${metrics.totalInUse}`);
  console.log(`  Total bytes: ${metrics.totalBytes}`);

  await bufferPool.shutdown().catch(() => {});
}

/**
 * Benchmark GC pressure with and without pooling
 */
async function benchmarkGCPressure() {
  console.log('\n=== GC Pressure Benchmark ===\n');

  const iterations = 50000;

  // Force GC before benchmark (requires --expose-gc)
  if (typeof global.gc === 'function') {
    global.gc();
  }

  // Benchmark without pooling
  console.log('Benchmarking without pooling...');
  const startNoPool = performance.now();
  const startMemNoPool = process.memoryUsage().heapUsed;

  for (let i = 0; i < iterations; i++) {
    const obj: TestObject = {
      id: i,
      data: 'test data',
      value: 42,
      timestamp: Date.now(),
    };
  }

  const endMemNoPool = process.memoryUsage().heapUsed;
  const durationNoPool = performance.now() - startNoPool;

  // Force GC between tests
  if (typeof global.gc === 'function') {
    global.gc();
  }

  // Benchmark with pooling
  console.log('Benchmarking with pooling...');
  const pool = new ObjectPool<TestObject>({
    factory: () => ({
      id: 0,
      data: '',
      value: 0,
      timestamp: 0,
    }),
    maxSize: 100,
    warmPool: true,
  });

  const startWithPool = performance.now();
  const startMemWithPool = process.memoryUsage().heapUsed;

  for (let i = 0; i < iterations; i++) {
    await pool.use((obj) => {
      obj.id = i;
      obj.data = 'test data';
      obj.value = 42;
      obj.timestamp = Date.now();
    });
  }

  const endMemWithPool = process.memoryUsage().heapUsed;
  const durationWithPool = performance.now() - startWithPool;

  // Calculate memory usage
  const memUsedNoPool = (endMemNoPool - startMemNoPool) / 1024 / 1024;
  const memUsedWithPool = (endMemWithPool - startMemWithPool) / 1024 / 1024;
  const memImprovement = ((memUsedNoPool - memUsedWithPool) / memUsedNoPool) * 100;

  console.log('\nResults:');
  console.log(`  Without pool: ${durationNoPool.toFixed(2)}ms, ${memUsedNoPool.toFixed(2)}MB heap used`);
  console.log(`  With pool:    ${durationWithPool.toFixed(2)}ms, ${memUsedWithPool.toFixed(2)}MB heap used`);
  console.log(`  Memory reduction: ${memImprovement.toFixed(2)}%`);

  await pool.shutdown().catch(() => {});
}

/**
 * Run all benchmarks
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Object Pool Performance Benchmark                     ║');
  console.log('║     Demonstrating GC pressure reduction benefits          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  await benchmarkObjectPooling();
  await benchmarkBufferPooling();
  await benchmarkGCPressure();

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     Benchmark Complete                                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
}

// Run benchmarks
main().catch(console.error);
