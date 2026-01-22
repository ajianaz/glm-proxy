/**
 * Pipelining Manager - HTTP/2 request pipelining for concurrent requests
 *
 * Manages multiple in-flight requests per connection with priority-based
 * scheduling, backpressure handling, and comprehensive metrics tracking.
 * Designed to maximize connection utilization for low-latency API calls.
 */

import type {
  PooledRequestOptions,
  PooledResponse,
  PooledConnection,
} from './types.js';

/**
 * Request priority levels
 */
export enum RequestPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * Queued request with metadata
 */
interface QueuedRequest {
  id: string;
  options: PooledRequestOptions;
  priority: RequestPriority;
  timestamp: number;
  resolve: (response: PooledResponse) => void;
  reject: (error: Error) => void;
}

/**
 * Active request being processed
 */
interface ActiveRequest {
  id: string;
  connectionId: string;
  priority: RequestPriority;
  startTime: number;
  options: PooledRequestOptions;
}

/**
 * Connection capacity tracking
 */
interface ConnectionCapacity {
  connectionId: string;
  activeRequests: number;
  maxConcurrent: number;
}

/**
 * Pipelining configuration options
 */
export interface PipeliningOptions {
  /** Maximum concurrent requests per connection (default: 6) */
  maxConcurrentPerConnection?: number;
  /** Maximum queue size (default: 1000) */
  maxQueueSize?: number;
  /** Enable request prioritization (default: true) */
  enablePrioritization?: boolean;
  /** Queue timeout in ms (default: 10000) */
  queueTimeout?: number;
  /** Enable metrics collection (default: true) */
  enableMetrics?: boolean;
}

/**
 * Pipelining metrics
 */
export interface PipeliningMetrics {
  /** Current number of active requests */
  activeRequests: number;
  /** Current queue depth */
  queueDepth: number;
  /** Total requests handled */
  totalRequests: number;
  /** Total requests pipelined (concurrent) */
  pipelinedRequests: number;
  /** Average concurrent requests per connection */
  averageConcurrency: number;
  /** Peak concurrent requests */
  peakConcurrency: number;
  /** Requests by priority */
  requestsByPriority: {
    critical: number;
    high: number;
    normal: number;
    low: number;
  };
  /** Queue wait time percentiles (p50, p95, p99) */
  p50QueueWaitTime: number;
  p95QueueWaitTime: number;
  p99QueueWaitTime: number;
  /** Backpressure events count */
  backpressureEvents: number;
  /** Timestamp when metrics were collected */
  timestamp: number;
}

/**
 * PipeliningManager - Manages HTTP/2 request pipelining
 *
 * Features:
 * - Multiple in-flight requests per connection
 * - Priority-based request scheduling
 * - Request queuing when at capacity
 * - Backpressure handling
 * - Comprehensive metrics tracking
 */
export class PipeliningManager {
  private requestCounter: number = 0;
  private requestQueue: QueuedRequest[] = [];
  private activeRequests: Map<string, ActiveRequest> = new Map();
  private connectionCapacities: Map<string, ConnectionCapacity> = new Map();

  // Metrics tracking
  private queueWaitTimes: number[] = [];
  private peakConcurrentRequests: number = 0;
  private totalRequests: number = 0;
  private pipelinedRequests: number = 0;
  private backpressureEvents: number = 0;
  private requestsByPriority = {
    critical: 0,
    high: 0,
    normal: 0,
    low: 0,
  };

  // Configuration
  private readonly maxConcurrentPerConnection: number;
  private readonly maxQueueSize: number;
  private readonly enablePrioritization: boolean;
  private readonly queueTimeout: number;
  private readonly metricsEnabled: boolean;

  // Request executor function
  private requestExecutor: (
    connection: PooledConnection,
    options: PooledRequestOptions
  ) => Promise<PooledResponse>;

  // State
  private isShutdown: boolean = false;

  constructor(
    requestExecutor: (
      connection: PooledConnection,
      options: PooledRequestOptions
    ) => Promise<PooledResponse>,
    options: PipeliningOptions = {}
  ) {
    this.requestExecutor = requestExecutor;
    this.maxConcurrentPerConnection = options.maxConcurrentPerConnection ?? 6;
    this.maxQueueSize = options.maxQueueSize ?? 1000;
    this.enablePrioritization = options.enablePrioritization ?? true;
    this.queueTimeout = options.queueTimeout ?? 10000;
    this.metricsEnabled = options.enableMetrics ?? true;
  }

  /**
   * Execute a request with pipelining support
   */
  async execute(
    connection: PooledConnection,
    options: PooledRequestOptions,
    priority: RequestPriority = RequestPriority.NORMAL
  ): Promise<PooledResponse> {
    if (this.isShutdown) {
      throw new Error('PipeliningManager is shutdown');
    }

    // Check if we can execute immediately
    const capacity = this.getConnectionCapacity(connection.id);
    if (capacity.activeRequests < capacity.maxConcurrent) {
      return this.executeImmediate(connection, options, priority);
    }

    // Queue the request
    return this.enqueueRequest(connection, options, priority);
  }

  /**
   * Execute a request immediately on a connection
   */
  private async executeImmediate(
    connection: PooledConnection,
    options: PooledRequestOptions,
    priority: RequestPriority
  ): Promise<PooledResponse> {
    const requestId = `req-${++this.requestCounter}`;
    const startTime = performance.now();

    // Track active request
    const activeRequest: ActiveRequest = {
      id: requestId,
      connectionId: connection.id,
      priority,
      startTime,
      options,
    };
    this.activeRequests.set(requestId, activeRequest);

    // Update connection capacity
    const capacity = this.getConnectionCapacity(connection.id);
    capacity.activeRequests++;

    // Update metrics
    this.totalRequests++;
    this.updatePriorityCount(priority);
    this.updatePeakConcurrency();

    try {
      // Execute the request
      const response = await this.requestExecutor(connection, options);

      // Check if this was pipelined (other requests were active)
      if (capacity.activeRequests > 1) {
        this.pipelinedRequests++;
      }

      return response;
    } finally {
      // Clean up active request
      this.activeRequests.delete(requestId);
      capacity.activeRequests--;

      // Process queue
      this.processQueue(connection.id);
    }
  }

  /**
   * Enqueue a request for later execution
   */
  private async enqueueRequest(
    connection: PooledConnection,
    options: PooledRequestOptions,
    priority: RequestPriority
  ): Promise<PooledResponse> {
    // Check queue capacity
    if (this.requestQueue.length >= this.maxQueueSize) {
      this.backpressureEvents++;
      throw new Error(
        `Request queue full (${this.maxQueueSize}). Backpressure applied.`
      );
    }

    const requestId = `req-${++this.requestCounter}`;
    const timestamp = performance.now();

    return new Promise((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        id: requestId,
        options,
        priority,
        timestamp,
        resolve,
        reject,
      };

      // Add to queue with priority
      this.addToQueue(queuedRequest);

      // Set queue timeout
      const timeout = setTimeout(() => {
        // Remove from queue
        const index = this.requestQueue.findIndex(r => r.id === requestId);
        if (index !== -1) {
          this.requestQueue.splice(index, 1);
        }
        reject(
          new Error(`Request queued timeout after ${this.queueTimeout}ms`)
        );
      }, this.queueTimeout);

      // Store timeout in request for cleanup
      // @ts-ignore - Adding timeout to request for cleanup
      queuedRequest.timeout = timeout;
    });
  }

  /**
   * Add request to queue with priority ordering
   */
  private addToQueue(request: QueuedRequest): void {
    if (!this.enablePrioritization) {
      this.requestQueue.push(request);
      return;
    }

    // Insert in priority order (higher priority first)
    let inserted = false;
    for (let i = 0; i < this.requestQueue.length; i++) {
      if (request.priority > this.requestQueue[i].priority) {
        this.requestQueue.splice(i, 0, request);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      this.requestQueue.push(request);
    }
  }

  /**
   * Process queued requests for a connection
   */
  private processQueue(connectionId: string): void {
    const capacity = this.getConnectionCapacity(connectionId);

    // Fill available capacity
    while (
      capacity.activeRequests < capacity.maxConcurrent &&
      this.requestQueue.length > 0
    ) {
      const queuedRequest = this.requestQueue.shift();

      if (!queuedRequest) {
        break;
      }

      // Clear timeout
      // @ts-ignore - Access timeout we added
      if (queuedRequest.timeout) {
        // @ts-ignore
        clearTimeout(queuedRequest.timeout);
      }

      // Record queue wait time
      const waitTime = performance.now() - queuedRequest.timestamp;
      this.recordQueueWaitTime(waitTime);

      // Execute request
      const connection = {
        id: connectionId,
        baseUrl: '', // Will be set by executor
        inUse: false,
        createdAt: 0,
        lastUsedAt: 0,
        requestCount: 0,
        healthy: true,
      };

      this.executeImmediate(connection, queuedRequest.options, queuedRequest.priority)
        .then(queuedRequest.resolve)
        .catch(queuedRequest.reject);
    }
  }

  /**
   * Get or create connection capacity tracking
   */
  private getConnectionCapacity(connectionId: string): ConnectionCapacity {
    let capacity = this.connectionCapacities.get(connectionId);

    if (!capacity) {
      capacity = {
        connectionId,
        activeRequests: 0,
        maxConcurrent: this.maxConcurrentPerConnection,
      };
      this.connectionCapacities.set(connectionId, capacity);
    }

    return capacity;
  }

  /**
   * Update priority count for metrics
   */
  private updatePriorityCount(priority: RequestPriority): void {
    switch (priority) {
      case RequestPriority.CRITICAL:
        this.requestsByPriority.critical++;
        break;
      case RequestPriority.HIGH:
        this.requestsByPriority.high++;
        break;
      case RequestPriority.NORMAL:
        this.requestsByPriority.normal++;
        break;
      case RequestPriority.LOW:
        this.requestsByPriority.low++;
        break;
    }
  }

  /**
   * Update peak concurrent requests metric
   */
  private updatePeakConcurrency(): void {
    const currentConcurrency = this.activeRequests.size;
    if (currentConcurrency > this.peakConcurrentRequests) {
      this.peakConcurrentRequests = currentConcurrency;
    }
  }

  /**
   * Record queue wait time for metrics
   */
  private recordQueueWaitTime(waitTime: number): void {
    if (!this.metricsEnabled) return;

    this.queueWaitTimes.push(waitTime);
    // Keep only last 1000 wait times
    if (this.queueWaitTimes.length > 1000) {
      this.queueWaitTimes.shift();
    }
  }

  /**
   * Get current pipelining metrics
   */
  getMetrics(): PipeliningMetrics {
    // Calculate percentiles
    const sortedWaitTimes = [...this.queueWaitTimes].sort((a, b) => a - b);
    const percentile = (p: number) => {
      if (sortedWaitTimes.length === 0) return 0;
      const index = Math.floor((p / 100) * (sortedWaitTimes.length - 1));
      return sortedWaitTimes[index];
    };

    // Calculate average concurrency
    const activeConnections = this.connectionCapacities.size;
    const averageConcurrency =
      activeConnections > 0
        ? this.activeRequests.size / activeConnections
        : 0;

    return {
      activeRequests: this.activeRequests.size,
      queueDepth: this.requestQueue.length,
      totalRequests: this.totalRequests,
      pipelinedRequests: this.pipelinedRequests,
      averageConcurrency,
      peakConcurrency: this.peakConcurrentRequests,
      requestsByPriority: { ...this.requestsByPriority },
      p50QueueWaitTime: percentile(50),
      p95QueueWaitTime: percentile(95),
      p99QueueWaitTime: percentile(99),
      backpressureEvents: this.backpressureEvents,
      timestamp: performance.now(),
    };
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.queueWaitTimes = [];
    this.peakConcurrentRequests = 0;
    this.totalRequests = 0;
    this.pipelinedRequests = 0;
    this.backpressureEvents = 0;
    this.requestsByPriority = {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
    };
  }

  /**
   * Get current queue depth
   */
  getQueueDepth(): number {
    return this.requestQueue.length;
  }

  /**
   * Get number of active requests
   */
  getActiveRequestCount(): number {
    return this.activeRequests.size;
  }

  /**
   * Check if manager can accept requests
   */
  canAcceptRequest(): boolean {
    return (
      !this.isShutdown && this.requestQueue.length < this.maxQueueSize
    );
  }

  /**
   * Reject all queued requests and prepare for shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      return;
    }

    this.isShutdown = true;

    // Reject all queued requests
    for (const request of this.requestQueue) {
      // @ts-ignore - Access timeout we added
      if (request.timeout) {
        // @ts-ignore
        clearTimeout(request.timeout);
      }
      request.reject(new Error('PipeliningManager is shutting down'));
    }

    this.requestQueue = [];
    this.connectionCapacities.clear();
  }

  /**
   * Check if shutdown is complete
   */
  isShutdownComplete(): boolean {
    return this.isShutdown && this.activeRequests.size === 0;
  }

  /**
   * Remove connection capacity tracking
   */
  removeConnection(connectionId: string): void {
    this.connectionCapacities.delete(connectionId);
  }
}
