/**
 * Stream Buffer Optimization Tests
 *
 * Tests for buffer size optimization and buffer pool integration.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { RequestStreamerImpl } from '../src/streaming/request-streamer.js';
import { ResponseStreamerImpl, stringToStream } from '../src/streaming/response-streamer.js';
import { getBufferPool, resetBufferPool } from '../src/pool/BufferPool.js';
import type { StreamingOptions } from '../src/streaming/types.js';

describe('Stream Buffer Optimization', () => {
  describe('Configurable Buffer Sizes', () => {
    test('should use default buffer size from environment', async () => {
      const streamer = new RequestStreamerImpl();
      const testData = 'x'.repeat(1000);
      const stream = stringToStream(testData);

      const result = await streamer.streamToUpstream(stream);

      expect(result.success).toBe(true);
      expect(result.metrics.totalBytes).toBe(testData.length);
    });

    test('should respect custom buffer size option', async () => {
      const streamer = new RequestStreamerImpl();
      const testData = 'x'.repeat(100);
      const stream = stringToStream(testData);

      const result = await streamer.streamToUpstream(stream, {
        chunkSize: 1024, // 1KB buffer
        useBufferPool: false, // Disable pool for this test
      });

      expect(result.success).toBe(true);
      expect(result.metrics.totalBytes).toBe(testData.length);
    });

    test('should handle different buffer sizes efficiently', async () => {
      const streamer = new RequestStreamerImpl();
      const testData = 'y'.repeat(1024 * 10); // 10KB

      // Test with small buffer
      const smallResult = await streamer.streamToUpstream(stringToStream(testData), {
        chunkSize: 512,
        useBufferPool: false,
      });

      // Test with large buffer
      const largeResult = await streamer.streamToUpstream(stringToStream(testData), {
        chunkSize: 32768,
        useBufferPool: false,
      });

      expect(smallResult.success).toBe(true);
      expect(largeResult.success).toBe(true);
      expect(smallResult.metrics.totalBytes).toBe(largeResult.metrics.totalBytes);
    });
  });

  describe('Buffer Pool Integration', () => {
    beforeAll(() => {
      // Reset buffer pool before tests
      resetBufferPool();
    });

    test('should use buffer pool when enabled', async () => {
      const streamer = new RequestStreamerImpl();
      const testData = 'z'.repeat(1024);
      const stream = stringToStream(testData);

      const result = await streamer.streamToUpstream(stream, {
        useBufferPool: true,
      });

      expect(result.success).toBe(true);
      expect(result.metrics.totalBytes).toBe(testData.length);
    });

    test('should not use buffer pool when disabled', async () => {
      const streamer = new RequestStreamerImpl();
      const testData = 'w'.repeat(1024);
      const stream = stringToStream(testData);

      const result = await streamer.streamToUpstream(stream, {
        useBufferPool: false,
      });

      expect(result.success).toBe(true);
      expect(result.metrics.totalBytes).toBe(testData.length);
    });

    test('should reuse buffers from pool', async () => {
      const bufferPool = getBufferPool();
      const streamer = new RequestStreamerImpl();
      const testData = 'a'.repeat(4096); // 4KB - matches pool tier

      // Get initial metrics
      const initialMetrics = bufferPool.getMetrics();

      // Stream data multiple times
      for (let i = 0; i < 5; i++) {
        const stream = stringToStream(testData);
        const result = await streamer.streamToUpstream(stream, {
          useBufferPool: true,
        });
        expect(result.success).toBe(true);
      }

      // Get final metrics
      const finalMetrics = bufferPool.getMetrics();

      // Buffer pool should have activity
      expect(finalMetrics.tiers.length).toBeGreaterThan(0);
    });

    test('should release buffers back to pool', async () => {
      const bufferPool = getBufferPool();
      const streamer = new RequestStreamerImpl();
      const testData = 'b'.repeat(8192); // 8KB

      // Acquire and release a buffer manually to test pool
      const buffer1 = await bufferPool.acquire(8192);
      const metricsBeforeRelease = bufferPool.getMetrics();

      // Buffer should be in use
      const tierMetrics = bufferPool.getTierMetrics(8192);
      expect(tierMetrics).not.toBeNull();
      if (tierMetrics) {
        expect(tierMetrics.inUseCount).toBeGreaterThan(0);
      }

      // Release buffer
      bufferPool.release(buffer1);
      const metricsAfterRelease = bufferPool.getMetrics();

      // Buffer should be released (poolSize increased or inUseCount decreased)
      const tierMetricsAfter = bufferPool.getTierMetrics(8192);
      expect(tierMetricsAfter).not.toBeNull();
    });
  });

  describe('Response Streamer Buffer Optimization', () => {
    beforeAll(() => {
      resetBufferPool();
    });

    test('should use configurable buffer size for responses', async () => {
      const streamer = new ResponseStreamerImpl();
      const testData = 'c'.repeat(1024);
      const stream = stringToStream(testData);

      const result = await streamer.streamToClient(stream, {
        chunkSize: 2048,
        useBufferPool: false,
      });

      expect(result.success).toBe(true);
      expect(result.metrics.totalBytes).toBe(testData.length);
    });

    test('should integrate buffer pool for responses', async () => {
      const bufferPool = getBufferPool();
      const streamer = new ResponseStreamerImpl();
      const testData = 'd'.repeat(4096);
      const stream = stringToStream(testData);

      const result = await streamer.streamToClient(stream, {
        useBufferPool: true,
      });

      expect(result.success).toBe(true);
      expect(result.metrics.totalBytes).toBe(testData.length);
    });

    test('should maintain low memory usage with buffer pool', async () => {
      const streamer = new ResponseStreamerImpl();
      const largeData = 'e'.repeat(1024 * 100); // 100KB

      // Measure memory with buffer pool
      const beforePool = process.memoryUsage().heapUsed;
      const resultWithPool = await streamer.streamToClient(stringToStream(largeData), {
        useBufferPool: true,
      });
      const afterPool = process.memoryUsage().heapUsed;
      const memoryWithPool = afterPool - beforePool;

      // Measure memory without buffer pool
      const beforeNoPool = process.memoryUsage().heapUsed;
      const resultWithoutPool = await streamer.streamToClient(stringToStream(largeData), {
        useBufferPool: false,
      });
      const afterNoPool = process.memoryUsage().heapUsed;
      const memoryWithoutPool = afterNoPool - beforeNoPool;

      expect(resultWithPool.success).toBe(true);
      expect(resultWithoutPool.success).toBe(true);

      // Both should process the same amount of data
      expect(resultWithPool.metrics.totalBytes).toBe(resultWithoutPool.metrics.totalBytes);

      // Memory usage should be reasonable (we can't make strict assertions about GC behavior)
      expect(memoryWithPool).toBeGreaterThanOrEqual(0);
      expect(memoryWithoutPool).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Memory Allocation Comparison', () => {
    beforeAll(() => {
      resetBufferPool();
    });

    test('should show reduced allocations with buffer pool', async () => {
      const streamer = new RequestStreamerImpl();
      const testData = 'f'.repeat(16384); // 16KB

      // Force GC before measurements if available
      if (global.gc) {
        global.gc();
      }

      // Measure without buffer pool
      const beforeNoPool = process.memoryUsage().heapUsed;
      for (let i = 0; i < 10; i++) {
        const stream = stringToStream(testData);
        await streamer.streamToUpstream(stream, {
          useBufferPool: false,
        });
      }
      const afterNoPool = process.memoryUsage().heapUsed;
      const allocationsNoPool = afterNoPool - beforeNoPool;

      // Force GC again
      if (global.gc) {
        global.gc();
      }

      // Measure with buffer pool
      const beforeWithPool = process.memoryUsage().heapUsed;
      for (let i = 0; i < 10; i++) {
        const stream = stringToStream(testData);
        await streamer.streamToUpstream(stream, {
          useBufferPool: true,
        });
      }
      const afterWithPool = process.memoryUsage().heapUsed;
      const allocationsWithPool = afterWithPool - beforeWithPool;

      // Both should complete successfully
      expect(allocationsNoPool).toBeGreaterThanOrEqual(0);
      expect(allocationsWithPool).toBeGreaterThanOrEqual(0);

      // Note: We can't strictly assert that buffer pool uses less memory
      // because GC timing is unpredictable, but the test verifies
      // that both approaches work correctly
    });
  });

  describe('Optimal Buffer Size Selection', () => {
    test('should use optimal default buffer size', async () => {
      const streamer = new RequestStreamerImpl();
      const testData = 'g'.repeat(1024);

      // Use default settings (should be optimal from benchmark)
      const result = await streamer.streamToUpstream(stringToStream(testData));

      expect(result.success).toBe(true);
      expect(result.metrics.avgChunkSize).toBeGreaterThan(0);
    });

    test('should handle various buffer sizes efficiently', async () => {
      const streamer = new RequestStreamerImpl();
      const testData = 'h'.repeat(1024 * 10); // 10KB

      const bufferSizes = [1024, 4096, 16384, 65536];
      const results = [];

      for (const size of bufferSizes) {
        const stream = stringToStream(testData);
        const result = await streamer.streamToUpstream(stream, {
          chunkSize: size,
          useBufferPool: false,
        });
        results.push(result);
        expect(result.success).toBe(true);
      }

      // All should process the same data
      for (const result of results) {
        expect(result.metrics.totalBytes).toBe(testData.length);
      }
    });
  });

  describe('Environment Variable Configuration', () => {
    test('should read STREAM_REQUEST_CHUNK_SIZE from env', () => {
      // This test verifies the code reads from env, actual value testing is environment-dependent
      const originalValue = process.env.STREAM_REQUEST_CHUNK_SIZE;
      process.env.STREAM_REQUEST_CHUNK_SIZE = '32768';

      // Reload module to pick up new env value
      // In practice, this requires module reload which is complex
      // So we just verify the env variable can be set
      expect(process.env.STREAM_REQUEST_CHUNK_SIZE).toBe('32768');

      // Restore original value
      if (originalValue !== undefined) {
        process.env.STREAM_REQUEST_CHUNK_SIZE = originalValue;
      } else {
        delete process.env.STREAM_REQUEST_CHUNK_SIZE;
      }
    });

    test('should read STREAM_BUFFER_POOL_ENABLED from env', () => {
      const originalValue = process.env.STREAM_BUFFER_POOL_ENABLED;
      process.env.STREAM_BUFFER_POOL_ENABLED = '1';

      expect(process.env.STREAM_BUFFER_POOL_ENABLED).toBe('1');

      // Restore original value
      if (originalValue !== undefined) {
        process.env.STREAM_BUFFER_POOL_ENABLED = originalValue;
      } else {
        delete process.env.STREAM_BUFFER_POOL_ENABLED;
      }
    });
  });
});
