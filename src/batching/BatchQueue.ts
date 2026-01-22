/**
 * Batch Queue - Queue for managing pending batchable requests
 *
 * Provides a queue-based system for collecting and grouping
 * similar requests that can be batched together.
 */

import type {
  PendingRequest,
  BatchGroup,
  BatchKeyParams,
  BatchingMetrics,
} from './types.js';
import { generateBatchKey } from './BatchManager.js';

/**
 * BatchQueue class for managing pending requests
 *
 * Features:
 * - Request queuing with FIFO ordering
 * - Automatic grouping by batch key
 * - Configurable max queue size
 * - Comprehensive metrics tracking
 * - Thread-safe operations
 */
export class BatchQueue {
  private queue: Map<string, PendingRequest> = new Map();
  private maxQueueSize: number;
  private metricsEnabled: boolean;

  // Metrics tracking
  private totalEnqueued: number = 0;
  private totalDequeued: number = 0;
  private rejectedCount: number = 0;
  private waitTimes: number[] = [];

  constructor(maxQueueSize: number = 1000, enableMetrics: boolean = true) {
    this.maxQueueSize = maxQueueSize;
    this.metricsEnabled = enableMetrics;
  }

  /**
   * Add a request to the queue
   *
   * @param requestId - Unique request ID
   * @param method - HTTP method
   * @param path - Request path
   * @param headers - Request headers
   * @param body - Request body
   * @param batchKey - Batch key for grouping
   * @param resolve - Promise resolve function
   * @param reject - Promise reject function
   * @returns Whether request was queued successfully
   */
  enqueue(
    requestId: string,
    method: string,
    path: string,
    headers: Record<string, string>,
    body: string | ReadableStream<Uint8Array> | null,
    batchKey: string,
    resolve: (result: any) => void,
    reject: (error: Error) => void
  ): boolean {
    // Check if queue is full
    if (this.queue.size >= this.maxQueueSize) {
      if (this.metricsEnabled) {
        this.rejectedCount++;
      }
      return false;
    }

    const pendingRequest: PendingRequest = {
      requestId,
      method,
      path,
      headers,
      body,
      batchKey,
      queuedAt: performance.now(),
      resolve,
      reject,
    };

    this.queue.set(requestId, pendingRequest);

    if (this.metricsEnabled) {
      this.totalEnqueued++;
    }

    return true;
  }

  /**
   * Remove a request from the queue
   *
   * @param requestId - Request ID to remove
   * @returns Pending request or null if not found
   */
  dequeue(requestId: string): PendingRequest | null {
    const request = this.queue.get(requestId);
    if (!request) {
      return null;
    }

    this.queue.delete(requestId);

    if (this.metricsEnabled) {
      this.totalDequeued++;
      const waitTime = performance.now() - request.queuedAt;
      this.waitTimes.push(waitTime);

      // Keep only last 1000 measurements
      if (this.waitTimes.length > 1000) {
        this.waitTimes.shift();
      }
    }

    return request;
  }

  /**
   * Get all requests grouped by batch key
   *
   * @returns Array of batch groups
   */
  getBatchGroups(): Array<BatchGroup> {
    const groups = new Map<string, PendingRequest[]>();

    // Group requests by batch key
    for (const request of this.queue.values()) {
      if (!groups.has(request.batchKey)) {
        groups.set(request.batchKey, []);
      }
      groups.get(request.batchKey)!.push(request);
    }

    // Convert to batch groups
    const batchGroups: Array<BatchGroup> = [];
    for (const [batchKey, requests] of groups) {
      // Extract batch key params from first request
      const params = this.extractBatchKeyParams(requests[0]);

      batchGroups.push({
        batchKey,
        requests,
        createdAt: performance.now(),
        params,
      });
    }

    return batchGroups;
  }

  /**
   * Get requests for a specific batch key
   *
   * @param batchKey - Batch key to filter by
   * @returns Array of pending requests
   */
  getRequestsByBatchKey(batchKey: string): PendingRequest[] {
    const requests: PendingRequest[] = [];

    for (const request of this.queue.values()) {
      if (request.batchKey === batchKey) {
        requests.push(request);
      }
    }

    return requests;
  }

  /**
   * Remove multiple requests from the queue
   *
   * @param requestIds - Array of request IDs to remove
   * @returns Array of removed requests
   */
  dequeueMultiple(requestIds: string[]): PendingRequest[] {
    const removed: PendingRequest[] = [];

    for (const requestId of requestIds) {
      const request = this.dequeue(requestId);
      if (request) {
        removed.push(request);
      }
    }

    return removed;
  }

  /**
   * Get current queue size
   *
   * @returns Number of requests in queue
   */
  size(): number {
    return this.queue.size;
  }

  /**
   * Check if queue is empty
   *
   * @returns Whether queue is empty
   */
  isEmpty(): boolean {
    return this.queue.size === 0;
  }

  /**
   * Check if queue is full
   *
   * @returns Whether queue is full
   */
  isFull(): boolean {
    return this.queue.size >= this.maxQueueSize;
  }

  /**
   * Clear all requests from the queue
   *
   * @param reason - Reason for clearing (used to reject promises)
   */
  clear(reason: string = 'Queue cleared'): void {
    const error = new Error(reason);

    for (const request of this.queue.values()) {
      request.reject(error);
    }

    this.queue.clear();
  }

  /**
   * Get batch key parameters from a request
   *
   * @param request - Pending request
   * @returns Batch key parameters
   */
  private extractBatchKeyParams(request: PendingRequest): BatchKeyParams {
    // Try to parse body to extract params
    if (request.body && typeof request.body === 'string') {
      try {
        const parsed = JSON.parse(request.body) as Record<string, unknown>;

        return {
          model: (parsed.model as string) || 'unknown',
          temperature: parsed.temperature as number | undefined,
          maxTokens: parsed.max_tokens as number | undefined,
          topP: parsed.top_p as number | undefined,
        };
      } catch {
        // Body not JSON, return defaults
      }
    }

    return {
      model: 'unknown',
    };
  }

  /**
   * Get queue metrics
   *
   * @returns Current queue metrics
   */
  getMetrics(): Partial<BatchingMetrics> {
    const avgWaitTime = this.waitTimes.length > 0
      ? this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length
      : 0;

    // Calculate p95 and p99 wait times
    const sorted = [...this.waitTimes].sort((a, b) => a - b);
    const p95WaitTime = sorted.length > 0
      ? sorted[Math.floor(sorted.length * 0.95)] || 0
      : 0;
    const p99WaitTime = sorted.length > 0
      ? sorted[Math.floor(sorted.length * 0.99)] || 0
      : 0;

    return {
      queueSize: this.queue.size,
      maxQueueSize: this.maxQueueSize,
      avgWaitTime,
      p95WaitTime,
      p99WaitTime,
      timestamp: Date.now(),
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.totalEnqueued = 0;
    this.totalDequeued = 0;
    this.rejectedCount = 0;
    this.waitTimes = [];
  }

  /**
   * Get all pending requests (for debugging/testing)
   *
   * @returns Array of pending requests
   */
  getAllRequests(): Array<PendingRequest> {
    return Array.from(this.queue.values());
  }

  /**
   * Get number of requests rejected due to full queue
   *
   * @returns Number of rejected requests
   */
  getRejectedCount(): number {
    return this.rejectedCount;
  }
}
