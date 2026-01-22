/**
 * Batching Module Type Definitions
 *
 * Defines interfaces and types for request batching system.
 * Optimized for grouping similar requests to reduce upstream API calls.
 */

/**
 * Configuration options for request batching
 */
export interface BatchingOptions {
  /** Enable request batching (default: from env or false) */
  enabled?: boolean;
  /** Maximum time to wait for batch formation in ms (default: 50) */
  batchWindowMs?: number;
  /** Maximum number of requests per batch (default: 10) */
  maxBatchSize?: number;
  /** Maximum number of pending requests in queue (default: 1000) */
  maxQueueSize?: number;
  /** Enable metrics collection (default: true) */
  enableMetrics?: boolean;
}

/**
 * Batch key parameters for grouping similar requests
 */
export interface BatchKeyParams {
  /** Model name */
  model: string;
  /** Temperature parameter */
  temperature?: number;
  /** Max tokens parameter */
  maxTokens?: number;
  /** Top-p parameter */
  topP?: number;
  /** Additional parameters that affect batching */
  [key: string]: unknown;
}

/**
 * Pending request in the batch queue
 */
export interface PendingRequest {
  /** Unique request ID */
  requestId: string;
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Request headers */
  headers: Record<string, string>;
  /** Request body (string for buffered, stream for streaming) */
  body: string | ReadableStream<Uint8Array> | null;
  /** Batch key for grouping */
  batchKey: string;
  /** Timestamp when request was queued */
  queuedAt: number;
  /** Resolve function for the promise */
  resolve: (result: BatchResult) => void;
  /** Reject function for the promise */
  reject: (error: Error) => void;
}

/**
 * Batch result for individual request
 */
export interface BatchResult {
  /** Whether the request was successful */
  success: boolean;
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Response body */
  body: string | ReadableStream<Uint8Array>;
  /** Number of tokens used (if available) */
  tokensUsed?: number;
  /** Whether response was streamed */
  streamed?: boolean;
  /** Time from queue to response (ms) */
  totalTime: number;
  /** Time spent waiting in batch (ms) */
  batchWaitTime: number;
  /** Whether this was part of a batch */
  batched: boolean;
  /** Batch size (number of requests in batch) */
  batchSize: number;
}

/**
 * Batch group of similar requests
 */
export interface BatchGroup {
  /** Batch key for this group */
  batchKey: string;
  /** Pending requests in this batch */
  requests: PendingRequest[];
  /** Timestamp when batch was formed */
  createdAt: number;
  /** Batch key parameters */
  params: BatchKeyParams;
}

/**
 * Batching performance metrics
 */
export interface BatchingMetrics {
  /** Total number of requests batched */
  totalRequests: number;
  /** Number of requests processed in batches */
  batchedRequests: number;
  /** Number of requests processed immediately (not batched) */
  immediateRequests: number;
  /** Number of batches formed */
  totalBatches: number;
  /** Average batch size */
  avgBatchSize: number;
  /** Maximum batch size */
  maxBatchSize: number;
  /** Current queue size */
  queueSize: number;
  /** Maximum queue size */
  maxQueueSize: number;
  /** Average wait time in batch (ms) */
  avgWaitTime: number;
  /** P95 wait time in batch (ms) */
  p95WaitTime: number;
  /** P99 wait time in batch (ms) */
  p99WaitTime: number;
  /** Batch rate (0-1) */
  batchRate: number;
  /** Time saved by batching (ms) */
  totalTimeSaved: number;
  /** Timestamp when metrics were collected */
  timestamp: number;
}

/**
 * Batching statistics snapshot
 */
export interface BatchingStats {
  /** Number of requests currently in queue */
  queueSize: number;
  /** Batch rate percentage */
  batchRate: number;
  /** Average batch size */
  avgBatchSize: number;
  /** Total batches formed */
  totalBatches: number;
  /** Average wait time in ms */
  avgWaitTime: number;
  /** P95 wait time in ms */
  p95WaitTime: number;
  /** Total time saved by batching (ms) */
  totalTimeSaved: number;
}
