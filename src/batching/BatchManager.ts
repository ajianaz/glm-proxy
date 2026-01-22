/**
 * Batch Manager - Request batching manager for low-latency API calls
 *
 * Provides intelligent request batching to reduce upstream API calls
 * while maintaining low latency for individual requests.
 */

import type { createHash } from 'node:crypto';
import type {
  BatchingOptions,
  BatchKeyParams,
  PendingRequest,
  BatchResult,
  BatchingMetrics,
  BatchingStats,
} from './types.js';
import { BatchQueue } from './BatchQueue.js';

/**
 * Batch executor function type
 *
 * This function is called to execute a batch of requests.
 * It should return results for all requests in the same order.
 */
export type BatchExecutor = (
  requests: Array<{
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string | ReadableStream<Uint8Array> | null;
  }>
) => Promise<Array<{
  success: boolean;
  status: number;
  headers: Record<string, string>;
  body: string | ReadableStream<Uint8Array>;
  tokensUsed?: number;
  streamed?: boolean;
}>>;

/**
 * BatchManager class for managing request batching
 *
 * Features:
 * - Automatic request batching with configurable window
 * - Intelligent grouping by model and parameters
 * - Fallback to immediate execution on timeout
 * - Comprehensive metrics tracking
 * - Thread-safe operations
 */
export class BatchManager {
  private queue: BatchQueue;
  private enabled: boolean;
  private batchWindowMs: number;
  private maxBatchSize: number;
  private metricsEnabled: boolean;
  private executor?: BatchExecutor;

  // Batch processing timer
  private batchTimer?: ReturnType<typeof setTimeout>;

  // Metrics tracking
  private totalRequests: number = 0;
  private batchedRequests: number = 0;
  private immediateRequests: number = 0;
  private totalBatches: number = 0;
  private batchSizes: number[] = [];
  private batchWaitTimes: number[] = [];
  private totalTimeSaved: number = 0;

  // State
  private isShutdown: boolean = false;

  constructor(options: BatchingOptions = {}) {
    // Read from environment if not provided
    const enabled = options.enabled ?? (
      process.env.BATCHING_ENABLED === 'true' || process.env.BATCHING_ENABLED === '1'
    );
    const batchWindowMs = options.batchWindowMs ?? parseInt(process.env.BATCH_WINDOW_MS || '50', 10);
    const maxBatchSize = options.maxBatchSize ?? parseInt(process.env.BATCH_MAX_SIZE || '10', 10);
    const maxQueueSize = options.maxQueueSize ?? parseInt(process.env.BATCH_MAX_QUEUE_SIZE || '1000', 10);

    this.enabled = enabled;
    this.batchWindowMs = batchWindowMs;
    this.maxBatchSize = maxBatchSize;
    this.metricsEnabled = options.enableMetrics ?? true;
    this.queue = new BatchQueue(maxQueueSize, this.metricsEnabled);
  }

  /**
   * Set the batch executor function
   *
   * @param executor - Function to execute batched requests
   */
  setExecutor(executor: BatchExecutor): void {
    this.executor = executor;
  }

  /**
   * Submit a request for batching or immediate execution
   *
   * @param method - HTTP method
   * @param path - Request path
   * @param headers - Request headers
   * @param body - Request body
   * @returns Promise that resolves with the result
   */
  async submitRequest(
    method: string,
    path: string,
    headers: Record<string, string>,
    body: string | ReadableStream<Uint8Array> | null
  ): Promise<BatchResult> {
    if (this.isShutdown) {
      throw new Error('Batch manager is shutdown');
    }

    if (!this.enabled || !this.executor) {
      // Batching disabled, execute immediately
      return this.executeImmediately(method, path, headers, body);
    }

    // Generate batch key
    const batchKey = this.generateBatchKeyFromRequest(method, body);
    if (!batchKey) {
      // Cannot batch this request, execute immediately
      return this.executeImmediately(method, path, headers, body);
    }

    // Create promise for this request
    let requestId: string;
    const resultPromise = new Promise<BatchResult>((resolve, reject) => {
      requestId = `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      const enqueued = this.queue.enqueue(
        requestId!,
        method,
        path,
        headers,
        body,
        batchKey,
        resolve,
        reject
      );

      if (!enqueued) {
        // Queue is full, execute immediately
        reject(new Error('Batch queue is full'));
      }
    });

    // Schedule batch processing
    this.scheduleBatchProcessing();

    // If queue is rejected, execute immediately
    return resultPromise.catch(() => {
      return this.executeImmediately(method, path, headers, body);
    });
  }

  /**
   * Execute a single request immediately (without batching)
   *
   * @param method - HTTP method
   * @param path - Request path
   * @param headers - Request headers
   * @param body - Request body
   * @returns Batch result
   */
  private async executeImmediately(
    method: string,
    path: string,
    headers: Record<string, string>,
    body: string | ReadableStream<Uint8Array> | null
  ): Promise<BatchResult> {
    const startTime = performance.now();

    if (this.metricsEnabled) {
      this.totalRequests++;
      this.immediateRequests++;
    }

    try {
      if (!this.executor) {
        throw new Error('Batch executor not set');
      }

      const results = await this.executor([{
        method,
        path,
        headers,
        body,
      }]);

      const result = results[0];
      const totalTime = performance.now() - startTime;

      return {
        success: result.success,
        status: result.status,
        headers: result.headers,
        body: result.body,
        tokensUsed: result.tokensUsed,
        streamed: result.streamed,
        totalTime,
        batchWaitTime: 0,
        batched: false,
        batchSize: 1,
      };
    } catch (error: any) {
      const totalTime = performance.now() - startTime;

      return {
        success: false,
        status: 502,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          error: {
            message: `Immediate execution failed: ${error.message}`,
            type: 'batch_error',
          },
        }),
        totalTime,
        batchWaitTime: 0,
        batched: false,
        batchSize: 1,
      };
    }
  }

  /**
   * Generate a batch key from a request
   *
   * @param method - HTTP method
   * @param body - Request body
   * @returns Batch key or null if not batchable
   */
  private generateBatchKeyFromRequest(
    method: string,
    body: string | ReadableStream<Uint8Array> | null
  ): string | null {
    // Only batch POST requests
    if (method !== 'POST') {
      return null;
    }

    // Must have a body
    if (!body || typeof body !== 'string') {
      return null;
    }

    // Extract batch key params
    const params = this.extractBatchKeyParams(body);
    if (!params) {
      return null;
    }

    return generateBatchKey(params);
  }

  /**
   * Extract batch key parameters from request body
   *
   * @param body - Request body JSON string
   * @returns Batch key parameters or null if not applicable
   */
  private extractBatchKeyParams(body: string): BatchKeyParams | null {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;

      // Extract model
      const model = parsed.model as string | undefined;
      if (!model) {
        return null; // Model is required for batching
      }

      // Build batch key params
      const params: BatchKeyParams = {
        model,
      };

      // Extract temperature (affects output)
      if (parsed.temperature !== undefined) {
        params.temperature = parsed.temperature as number;
      }

      // Extract max_tokens (affects batching)
      if (parsed.max_tokens !== undefined) {
        params.maxTokens = parsed.max_tokens as number;
      }

      // Extract top_p (affects output)
      if (parsed.top_p !== undefined) {
        params.topP = parsed.top_p as number;
      }

      return params;
    } catch {
      // Failed to parse body
      return null;
    }
  }

  /**
   * Schedule batch processing
   *
   * Resets the timer to process pending requests.
   */
  private scheduleBatchProcessing(): void {
    // Clear existing timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    // Schedule new batch processing
    this.batchTimer = setTimeout(() => {
      this.processBatch();
    }, this.batchWindowMs);
  }

  /**
   * Process batched requests
   *
   * Groups pending requests by batch key and executes them.
   */
  private async processBatch(): Promise<void> {
    if (this.isShutdown) {
      return;
    }

    // Get all batch groups
    const batchGroups = this.queue.getBatchGroups();

    if (batchGroups.length === 0) {
      return;
    }

    // Process each batch group
    for (const group of batchGroups) {
      await this.processBatchGroup(group);
    }
  }

  /**
   * Process a single batch group
   *
   * @param group - Batch group to process
   */
  private async processBatchGroup(group: {
    batchKey: string;
    requests: PendingRequest[];
    createdAt: number;
    params: BatchKeyParams;
  }): Promise<void> {
    if (group.requests.length === 0 || this.isShutdown) {
      return;
    }

    // Limit batch size
    const requestsToProcess = group.requests.slice(0, this.maxBatchSize);

    // Remove requests from queue
    const requestIds = requestsToProcess.map(r => r.requestId);
    this.queue.dequeueMultiple(requestIds);

    if (this.metricsEnabled) {
      this.totalBatches++;
      this.batchSizes.push(requestsToProcess.length);
    }

    const batchStartTime = performance.now();

    try {
      if (!this.executor) {
        throw new Error('Batch executor not set');
      }

      // Execute batch
      const results = await this.executor(
        requestsToProcess.map(r => ({
          method: r.method,
          path: r.path,
          headers: r.headers,
          body: r.body,
        }))
      );

      // Distribute results to individual requesters
      for (let i = 0; i < requestsToProcess.length; i++) {
        const request = requestsToProcess[i];
        const result = results[i];
        const totalTime = performance.now() - request.queuedAt;
        const batchWaitTime = batchStartTime - request.queuedAt;

        if (this.metricsEnabled) {
          this.totalRequests++;
          this.batchedRequests++;
          this.batchWaitTimes.push(batchWaitTime);
        }

        request.resolve({
          success: result.success,
          status: result.status,
          headers: result.headers,
          body: result.body,
          tokensUsed: result.tokensUsed,
          streamed: result.streamed,
          totalTime,
          batchWaitTime,
          batched: true,
          batchSize: requestsToProcess.length,
        });
      }

      // Calculate time saved
      // If we processed N requests in batch, saved (N-1) upstream calls
      const timeSaved = (requestsToProcess.length - 1) * this.batchWindowMs;
      if (this.metricsEnabled) {
        this.totalTimeSaved += timeSaved;
      }
    } catch (error: any) {
      // Reject all requests in batch
      for (const request of requestsToProcess) {
        request.reject(new Error(`Batch execution failed: ${error.message}`));
      }
    }
  }

  /**
   * Check if batching is enabled
   *
   * @returns Whether batching is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable batching
   *
   * @param enabled - Whether to enable batching
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    // Process pending requests if disabling
    if (!enabled && !this.queue.isEmpty()) {
      this.processBatch();
    }
  }

  /**
   * Get batching metrics
   *
   * @returns Current batching metrics
   */
  getMetrics(): BatchingMetrics {
    const queueMetrics = this.queue.getMetrics();

    const avgBatchSize = this.batchSizes.length > 0
      ? this.batchSizes.reduce((a, b) => a + b, 0) / this.batchSizes.length
      : 0;

    const maxBatchSize = this.batchSizes.length > 0
      ? Math.max(...this.batchSizes)
      : 0;

    const avgWaitTime = this.batchWaitTimes.length > 0
      ? this.batchWaitTimes.reduce((a, b) => a + b, 0) / this.batchWaitTimes.length
      : 0;

    // Calculate p95 and p99 wait times
    const sorted = [...this.batchWaitTimes].sort((a, b) => a - b);
    const p95WaitTime = sorted.length > 0
      ? sorted[Math.floor(sorted.length * 0.95)] || 0
      : 0;
    const p99WaitTime = sorted.length > 0
      ? sorted[Math.floor(sorted.length * 0.99)] || 0
      : 0;

    const batchRate = this.totalRequests > 0
      ? this.batchedRequests / this.totalRequests
      : 0;

    return {
      totalRequests: this.totalRequests,
      batchedRequests: this.batchedRequests,
      immediateRequests: this.immediateRequests,
      totalBatches: this.totalBatches,
      avgBatchSize,
      maxBatchSize,
      queueSize: queueMetrics.queueSize || 0,
      maxQueueSize: queueMetrics.maxQueueSize || 0,
      avgWaitTime,
      p95WaitTime,
      p99WaitTime,
      batchRate,
      totalTimeSaved: this.totalTimeSaved,
      timestamp: Date.now(),
    };
  }

  /**
   * Get batching statistics snapshot
   *
   * @returns Simplified batching statistics
   */
  getStats(): BatchingStats {
    const metrics = this.getMetrics();
    return {
      queueSize: metrics.queueSize,
      batchRate: metrics.batchRate * 100, // Convert to percentage
      avgBatchSize: metrics.avgBatchSize,
      totalBatches: metrics.totalBatches,
      avgWaitTime: metrics.avgWaitTime,
      p95WaitTime: metrics.p95WaitTime,
      totalTimeSaved: metrics.totalTimeSaved,
    };
  }

  /**
   * Reset batching metrics
   */
  resetMetrics(): void {
    this.totalRequests = 0;
    this.batchedRequests = 0;
    this.immediateRequests = 0;
    this.totalBatches = 0;
    this.batchSizes = [];
    this.batchWaitTimes = [];
    this.totalTimeSaved = 0;
    this.queue.resetMetrics();
  }

  /**
   * Process any remaining pending requests
   *
   * @returns Promise that resolves when all pending requests are processed
   */
  async flush(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    await this.processBatch();
  }

  /**
   * Shutdown the batch manager
   *
   * Processes pending requests and prevents new requests from being queued.
   */
  async shutdown(): Promise<void> {
    this.isShutdown = true;

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = undefined;
    }

    // Process remaining requests
    await this.flush();

    // Reject any remaining requests
    this.queue.clear('Batch manager is shutting down');
  }
}

/**
 * Generates a batch key from batch key parameters
 *
 * @param params - Batch key parameters
 * @returns Deterministic batch key
 */
export function generateBatchKey(params: BatchKeyParams): string {
  // Create canonical representation
  const canonical: Record<string, unknown> = {
    model: params.model,
  };

  // Include temperature if present
  if (params.temperature !== undefined && params.temperature !== 0.7) {
    canonical.temperature = params.temperature;
  }

  // Include max_tokens if present
  if (params.maxTokens !== undefined) {
    canonical.max_tokens = params.maxTokens;
  }

  // Include top_p if present
  if (params.topP !== undefined && params.topP !== 1.0) {
    canonical.top_p = params.topP;
  }

  // Return JSON string as batch key (simple and fast)
  return JSON.stringify(canonical);
}

/**
 * Global batch manager instance
 */
let globalBatchManager: BatchManager | null = null;

/**
 * Get the global batch manager instance
 *
 * Creates a new instance if one doesn't exist.
 *
 * @param options - Batching options (only used on first call)
 * @returns Global batch manager
 */
export function getBatchManager(options?: BatchingOptions): BatchManager {
  if (!globalBatchManager) {
    globalBatchManager = new BatchManager(options);
  }
  return globalBatchManager;
}

/**
 * Reset the global batch manager
 *
 * Creates a new instance with the given options.
 *
 * @param options - Batching options
 * @returns New global batch manager
 */
export function resetBatchManager(options?: BatchingOptions): BatchManager {
  if (globalBatchManager) {
    globalBatchManager.shutdown().catch(console.error);
  }
  globalBatchManager = new BatchManager(options);
  return globalBatchManager;
}
