/**
 * Response Body Streamer
 *
 * Streams response bodies from upstream to client without buffering.
 * Provides constant memory usage regardless of payload size.
 */

import type {
  StreamingOptions,
  StreamingMetrics,
  StreamResult,
  ResponseStreamer,
  BackpressureEvent,
} from './types.js';

/**
 * Default streaming configuration
 */
const DEFAULT_OPTIONS: Required<StreamingOptions> = {
  chunkSize: 65536, // 64KB chunks
  backpressureThreshold: 100, // 100ms
  enabled: true,
  backpressureTimeout: 5000, // 5 seconds
};

/**
 * Response streamer implementation
 */
export class ResponseStreamerImpl implements ResponseStreamer {
  private metrics: StreamingMetrics = {
    totalBytes: 0,
    chunkCount: 0,
    avgChunkSize: 0,
    duration: 0,
    throughput: 0,
    backpressureEvents: 0,
    backpressureTime: 0,
  };

  private backpressureHistory: BackpressureEvent[] = [];
  private chunkSizes: number[] = [];
  private startTime: number = 0;
  private isStreaming: boolean = false;

  /**
   * Stream response body to client without buffering
   */
  async streamToClient(
    body: ReadableStream<Uint8Array>,
    options: StreamingOptions = {}
  ): Promise<StreamResult & { stream: ReadableStream<Uint8Array> }> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (!opts.enabled) {
      throw new Error('Streaming is disabled');
    }

    // Reset metrics for new stream
    this.startTime = performance.now();
    this.metrics = {
      totalBytes: 0,
      chunkCount: 0,
      avgChunkSize: 0,
      duration: 0,
      throughput: 0,
      backpressureEvents: 0,
      backpressureTime: 0,
    };
    this.chunkSizes = [];
    this.backpressureHistory = [];
    this.isStreaming = true;

    let totalBytes = 0;
    let chunkCount = 0;
    let backpressureEvents = 0;
    let backpressureTime = 0;

    try {
      // Create a transform stream to monitor and process chunks
      const transformStream = new TransformStream<Uint8Array, Uint8Array>({
        transform: async (chunk, controller) => {
          const chunkStartTime = performance.now();

          // Track chunk metrics
          chunkCount++;
          totalBytes += chunk.length;
          this.chunkSizes.push(chunk.length);

          // Update metrics in real-time
          this.metrics.totalBytes = totalBytes;
          this.metrics.chunkCount = chunkCount;
          this.metrics.avgChunkSize = totalBytes / chunkCount;

          // Enqueue chunk immediately to client
          controller.enqueue(chunk);

          // Update duration
          this.metrics.duration = performance.now() - this.startTime;
          if (this.metrics.duration > 0) {
            this.metrics.throughput = (totalBytes / this.metrics.duration / 1024 / 1024) * 1000;
          }
        },

        flush: (controller) => {
          // Finalize metrics
          this.metrics.duration = performance.now() - this.startTime;
          if (this.metrics.duration > 0) {
            this.metrics.throughput = (totalBytes / this.metrics.duration / 1024 / 1024) * 1000;
          }
          this.isStreaming = false;
          controller.terminate();
        },
      });

      // Transform the stream
      const transformedStream = body.pipeThrough(transformStream);

      // Consume the stream to collect accurate metrics
      const reader = transformedStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // Data is flowing through the transform
        }
      } finally {
        reader.releaseLock();
        this.isStreaming = false;
      }

      // Finalize metrics
      this.metrics.duration = performance.now() - this.startTime;
      if (this.metrics.duration > 0) {
        this.metrics.throughput = (totalBytes / this.metrics.duration / 1024 / 1024) * 1000;
      }

      // Return the stream for the caller to use
      return {
        success: true,
        metrics: { ...this.metrics },
        stream: transformedStream,
      };
    } catch (error) {
      this.isStreaming = false;
      return {
        success: false,
        metrics: {
          totalBytes,
          chunkCount,
          avgChunkSize: chunkCount > 0 ? totalBytes / chunkCount : 0,
          duration: performance.now() - this.startTime,
          throughput: 0,
          backpressureEvents,
          backpressureTime,
        },
        error: error instanceof Error ? error.message : 'Unknown error',
        stream: body, // Return original stream on error
      };
    }
  }

  /**
   * Wait for backpressure to clear with timeout
   */
  private async waitForBackpressureWithTimeout(
    controller: TransformStreamDefaultController<Uint8Array>,
    options: Required<StreamingOptions>
  ): Promise<{ success: boolean; error?: Error }> {
    const startTime = performance.now();

    while (controller.desiredSize !== null && controller.desiredSize <= 0) {
      // Check timeout
      if (performance.now() - startTime > options.backpressureTimeout) {
        return {
          success: false,
          error: new Error(`Backpressure timeout after ${options.backpressureTimeout}ms`),
        };
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    return { success: true };
  }

  /**
   * Get current metrics
   */
  getMetrics(): StreamingMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalBytes: 0,
      chunkCount: 0,
      avgChunkSize: 0,
      duration: 0,
      throughput: 0,
      backpressureEvents: 0,
      backpressureTime: 0,
    };
    this.backpressureHistory = [];
    this.chunkSizes = [];
  }

  /**
   * Get backpressure history
   */
  getBackpressureHistory(): BackpressureEvent[] {
    return [...this.backpressureHistory];
  }
}

/**
 * Helper function to create a readable stream from a string (for testing)
 */
export function stringToStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = encoder.encode(text);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunks);
      controller.close();
    },
  });
}

/**
 * Helper to stream response and collect metrics
 */
export async function streamResponseWithMetrics(
  body: ReadableStream<Uint8Array>,
  options?: StreamingOptions
): Promise<{ stream: ReadableStream<Uint8Array>; metrics: StreamingMetrics }> {
  const streamer = new ResponseStreamerImpl();
  const result = await streamer.streamToClient(body, options);

  if (!result.success) {
    throw new Error(result.error || 'Streaming failed');
  }

  return {
    stream: result.stream,
    metrics: result.metrics,
  };
}

/**
 * Create a response streamer instance
 */
export function createResponseStreamer(): ResponseStreamerImpl {
  return new ResponseStreamerImpl();
}

/**
 * Default response streamer instance
 */
const defaultStreamer = new ResponseStreamerImpl();

/**
 * Convenience functions using default streamer
 */
export async function streamResponseToClient(
  body: ReadableStream<Uint8Array>,
  options?: StreamingOptions
): Promise<StreamResult & { stream: ReadableStream<Uint8Array> }> {
  return defaultStreamer.streamToClient(body, options);
}

export function getResponseStreamerMetrics(): StreamingMetrics {
  return defaultStreamer.getMetrics();
}

export function resetResponseStreamerMetrics(): void {
  defaultStreamer.resetMetrics();
}
