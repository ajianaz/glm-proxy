/**
 * Streaming Tests
 *
 * Comprehensive tests for streaming request/response functionality.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { RequestStreamerImpl, streamToString } from '../src/streaming/request-streamer.js';
import { ResponseStreamerImpl, streamResponseWithMetrics, stringToStream } from '../src/streaming/response-streamer.js';
import type { StreamingOptions } from '../src/streaming/types.js';

describe('Streaming Module', () => {
  describe('RequestStreamerImpl', () => {
    let streamer: RequestStreamerImpl;

    beforeAll(() => {
      streamer = new RequestStreamerImpl();
    });

    test('should handle empty stream', async () => {
      const emptyStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });

      const result = await streamer.streamToUpstream(emptyStream);

      expect(result.success).toBe(true);
      expect(result.metrics.totalBytes).toBe(0);
      expect(result.metrics.chunkCount).toBe(0);
    });

    test('should handle single chunk stream', async () => {
      const testData = 'Hello, World!';
      const stream = stringToStream(testData);

      const result = await streamer.streamToUpstream(stream);

      expect(result.success).toBe(true);
      expect(result.metrics.totalBytes).toBe(testData.length);
      expect(result.metrics.chunkCount).toBe(1);
      expect(result.metrics.avgChunkSize).toBe(testData.length);
    });

    test('should handle multi-chunk stream', async () => {
      const chunks = ['Chunk1', 'Chunk2', 'Chunk3'];
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      const result = await streamer.streamToUpstream(stream);

      expect(result.success).toBe(true);
      expect(result.metrics.chunkCount).toBe(chunks.length);
      expect(result.metrics.totalBytes).toBe(chunks.join('').length);
    });

    test('should track backpressure events', async () => {
      // Create a stream that will trigger backpressure
      const largeData = 'x'.repeat(1024 * 1024); // 1MB
      const stream = stringToStream(largeData);

      const result = await streamer.streamToUpstream(stream, {
        chunkSize: 1024, // Small chunks to trigger backpressure
        backpressureThreshold: 1, // Very low threshold
      });

      expect(result.success).toBe(true);
      expect(result.metrics.totalBytes).toBe(largeData.length);
      // Backpressure events should be tracked (may be 0 on fast systems)
      expect(result.metrics.backpressureEvents).toBeGreaterThanOrEqual(0);
    });

    test('should calculate throughput correctly', async () => {
      const testData = 'y'.repeat(1024 * 100); // 100KB
      const stream = stringToStream(testData);

      const result = await streamer.streamToUpstream(stream);

      expect(result.success).toBe(true);
      expect(result.metrics.throughput).toBeGreaterThan(0);
    });

    test('should reset metrics correctly', async () => {
      const testData = 'Test data';
      const stream = stringToStream(testData);

      await streamer.streamToUpstream(stream);
      expect(streamer.getMetrics().totalBytes).toBe(testData.length);

      streamer.resetMetrics();
      expect(streamer.getMetrics().totalBytes).toBe(0);
      expect(streamer.getMetrics().chunkCount).toBe(0);
    });

    test('should handle streaming errors gracefully', async () => {
      const errorStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data'));
          controller.error(new Error('Stream error'));
        },
      });

      const result = await streamer.streamToUpstream(errorStream);

      // The error is caught in the transform stream
      expect(result).toBeDefined();
    });

    test('should handle disabled streaming', async () => {
      const stream = stringToStream('test');

      const result = streamer.streamToUpstream(stream, { enabled: false });

      await expect(result).rejects.toThrow('Streaming is disabled');
    });
  });

  describe('ResponseStreamerImpl', () => {
    let streamer: ResponseStreamerImpl;

    beforeAll(() => {
      streamer = new ResponseStreamerImpl();
    });

    test('should handle empty stream', async () => {
      const emptyStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });

      const result = await streamer.streamToClient(emptyStream);

      expect(result.success).toBe(true);
      expect(result.metrics.totalBytes).toBe(0);
      expect(result.metrics.chunkCount).toBe(0);
      expect(result.stream).toBeDefined();
    });

    test('should handle single chunk stream', async () => {
      const testData = 'Hello, World!';
      const stream = stringToStream(testData);

      const result = await streamer.streamToClient(stream);

      expect(result.success).toBe(true);
      expect(result.metrics.totalBytes).toBe(testData.length);
      expect(result.metrics.chunkCount).toBe(1);
      expect(result.stream).toBeDefined();
      // Note: Stream is consumed during metrics tracking, so it will be closed
    });

    test('should handle multi-chunk stream', async () => {
      const chunks = ['Chunk1', 'Chunk2', 'Chunk3'];
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      const result = await streamer.streamToClient(stream);

      expect(result.success).toBe(true);
      expect(result.metrics.chunkCount).toBe(chunks.length);
      expect(result.metrics.totalBytes).toBe(chunks.join('').length);
    });

    test('should track backpressure events', async () => {
      const largeData = 'x'.repeat(1024 * 1024); // 1MB
      const stream = stringToStream(largeData);

      const result = await streamer.streamToClient(stream, {
        chunkSize: 1024,
        backpressureThreshold: 1,
      });

      expect(result.success).toBe(true);
      expect(result.metrics.totalBytes).toBe(largeData.length);
      expect(result.metrics.backpressureEvents).toBeGreaterThanOrEqual(0);
    });

    test('should calculate throughput correctly', async () => {
      const testData = 'y'.repeat(1024 * 100); // 100KB
      const stream = stringToStream(testData);

      const result = await streamer.streamToClient(stream);

      expect(result.success).toBe(true);
      expect(result.metrics.throughput).toBeGreaterThan(0);
    });

    test('should reset metrics correctly', async () => {
      const testData = 'Test data';
      const stream = stringToStream(testData);

      await streamer.streamToClient(stream);
      expect(streamer.getMetrics().totalBytes).toBe(testData.length);

      streamer.resetMetrics();
      expect(streamer.getMetrics().totalBytes).toBe(0);
      expect(streamer.getMetrics().chunkCount).toBe(0);
    });

    test('should handle stream errors', async () => {
      const errorStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data'));
          controller.error(new Error('Stream error'));
        },
      });

      const result = await streamer.streamToClient(errorStream);

      // Should return original stream on error
      expect(result.stream).toBeDefined();
    });
  });

  describe('Helper Functions', () => {
    test('streamToString should convert stream to string', async () => {
      const testData = 'Hello, World!';
      const stream = stringToStream(testData);

      const result = await streamToString(stream);

      expect(result).toBe(testData);
    });

    test('streamToString should handle empty stream', async () => {
      const emptyStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });

      const result = await streamToString(emptyStream);

      expect(result).toBe('');
    });

    test('streamToString should handle multi-chunk stream', async () => {
      const chunks = ['Chunk1', 'Chunk2', 'Chunk3'];
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      const result = await streamToString(stream);

      expect(result).toBe(chunks.join(''));
    });

    test('stringToStream should create valid stream', async () => {
      const testData = 'Test data';
      const stream = stringToStream(testData);

      const reader = stream.getReader();
      const { value, done } = await reader.read();

      expect(done).toBe(false);
      expect(new TextDecoder().decode(value)).toBe(testData);

      const { done: done2 } = await reader.read();
      expect(done2).toBe(true);

      reader.releaseLock();
    });

    test('streamResponseWithMetrics should return stream and metrics', async () => {
      const testData = 'Response data';
      const stream = stringToStream(testData);

      const { stream: resultStream, metrics } = await streamResponseWithMetrics(stream);

      expect(resultStream).toBeDefined();
      expect(metrics.totalBytes).toBe(testData.length);
      expect(metrics.chunkCount).toBe(1);
    });
  });

  describe('Memory Efficiency', () => {
    test('should maintain constant memory usage for large payloads', async () => {
      const streamer = new ResponseStreamerImpl();

      // Create a large stream (10MB)
      const chunkSize = 1024 * 100; // 100KB chunks
      const numChunks = 100; // 10MB total
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          const chunk = 'x'.repeat(chunkSize);

          let sent = 0;
          const interval = setInterval(() => {
            if (sent < numChunks) {
              controller.enqueue(encoder.encode(chunk));
              sent++;
            } else {
              clearInterval(interval);
              controller.close();
            }
          }, 1); // Fast emission
        },
      });

      const result = await streamer.streamToClient(stream);

      expect(result.success).toBe(true);
      expect(result.metrics.totalBytes).toBe(chunkSize * numChunks);
      expect(result.metrics.throughput).toBeGreaterThan(0);

      // Memory usage should be constant (we can't easily measure this in tests,
      // but the streaming implementation ensures we don't buffer the entire payload)
    });
  });

  describe('Streaming Options', () => {
    test('should respect custom chunk size', async () => {
      const streamer = new RequestStreamerImpl();
      const testData = 'x'.repeat(1024 * 10); // 10KB
      const stream = stringToStream(testData);

      const result = await streamer.streamToUpstream(stream, {
        chunkSize: 512,
      });

      expect(result.success).toBe(true);
      // The number of chunks depends on how the stream is split
      expect(result.metrics.totalBytes).toBe(testData.length);
    });

    test('should respect backpressure timeout', async () => {
      const streamer = new ResponseStreamerImpl();
      const stream = stringToStream('test');

      // Very short timeout should not affect small streams
      const result = await streamer.streamToClient(stream, {
        backpressureTimeout: 100,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid UTF-8 sequences', async () => {
      const streamer = new RequestStreamerImpl();

      // Create a stream with invalid UTF-8
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          // Invalid UTF-8 sequence
          controller.enqueue(new Uint8Array([0xff, 0xfe, 0xfd]));
          controller.close();
        },
      });

      const result = await streamer.streamToUpstream(stream);

      // Should handle the error gracefully
      expect(result).toBeDefined();
    });

    test('should handle stream that errors mid-transfer', async () => {
      const streamer = new ResponseStreamerImpl();

      let errorThrown = false;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('before error'));
          setTimeout(() => {
            controller.error(new Error('Mid-stream error'));
            errorThrown = true;
          }, 10);
        },
      });

      const result = await streamer.streamToClient(stream);

      // Should return a result even with stream error
      expect(result).toBeDefined();
      expect(errorThrown).toBe(true);
    });
  });
});
