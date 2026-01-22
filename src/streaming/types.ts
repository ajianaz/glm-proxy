/**
 * Streaming Types and Interfaces
 *
 * Defines types for streaming request and response bodies.
 * Optimized for low-memory, constant-memory streaming.
 */

/**
 * Streaming configuration options
 */
export interface StreamingOptions {
  /** Buffer size for chunks in bytes (default: 64KB) */
  chunkSize?: number;
  /** Maximum backpressure delay in ms before applying backpressure (default: 100ms) */
  backpressureThreshold?: number;
  /** Enable streaming (default: true) */
  enabled?: boolean;
  /** Maximum time to wait for backpressure to clear in ms (default: 5000ms) */
  backpressureTimeout?: number;
}

/**
 * Streaming metrics for performance monitoring
 */
export interface StreamingMetrics {
  /** Total bytes streamed */
  totalBytes: number;
  /** Number of chunks processed */
  chunkCount: number;
  /** Average chunk size in bytes */
  avgChunkSize: number;
  /** Total streaming duration in ms */
  duration: number;
  /** Streaming throughput in MB/s */
  throughput: number;
  /** Number of backpressure events */
  backpressureEvents: number;
  /** Time spent waiting for backpressure in ms */
  backpressureTime: number;
}

/**
 * Result from streaming operation
 */
export interface StreamResult {
  /** Whether streaming completed successfully */
  success: boolean;
  /** Streaming metrics */
  metrics: StreamingMetrics;
  /** Error message if unsuccessful */
  error?: string;
}

/**
 * Request streamer interface
 */
export interface RequestStreamer {
  /** Stream request body to upstream */
  streamToUpstream(
    body: ReadableStream<Uint8Array>,
    options: StreamingOptions
  ): Promise<StreamResult>;
}

/**
 * Response streamer interface
 */
export interface ResponseStreamer {
  /** Stream response body to client */
  streamToClient(
    body: ReadableStream<Uint8Array>,
    options: StreamingOptions
  ): Promise<StreamResult>;
}

/**
 * Chunk information for streaming
 */
export interface ChunkInfo {
  /** Chunk data */
  data: Uint8Array;
  /** Chunk size in bytes */
  size: number;
  /** Timestamp when chunk was processed */
  timestamp: number;
}

/**
 * Backpressure event information
 */
export interface BackpressureEvent {
  /** Timestamp when backpressure occurred */
  timestamp: number;
  /** Duration of backpressure in ms */
  duration: number;
  /** Buffer size at time of backpressure */
  bufferSize: number;
}
