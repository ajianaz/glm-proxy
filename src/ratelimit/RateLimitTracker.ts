/**
 * Rate Limit Tracker - Optimized rate limit checking with efficient data structures
 *
 * Provides an in-memory sliding window tracker with batched updates to storage.
 * Optimized for low-latency rate limit checks and minimal storage operations.
 */

import type { ApiKey } from '../types.js';

/**
 * Rate limit window tracker entry
 */
interface RateLimitWindow {
  /** Window start timestamp (ISO string) */
  windowStart: string;
  /** Pre-computed window end timestamp (ISO string) */
  windowEnd: string;
  /** Tokens used in this window */
  tokensUsed: number;
  /** Cached timestamp for window start (Date.now()) */
  startTime: number;
  /** Cached timestamp for window end (Date.now()) */
  endTime: number;
}

/**
 * Rate limit metrics
 */
export interface RateLimitMetrics {
  /** Total number of rate limit checks */
  totalChecks: number;
  /** Number of checks that were allowed */
  allowedChecks: number;
  /** Number of checks that were denied */
  deniedChecks: number;
  /** Number of storage writes performed */
  storageWrites: number;
  /** Number of checks served from in-memory cache */
  cachedChecks: number;
  /** Average check time in microseconds */
  avgCheckTime: number;
  /** Timestamp when metrics were collected */
  timestamp: number;
}

/**
 * Pending update for batching
 */
interface PendingUpdate {
  /** API key identifier */
  keyHash: string;
  /** Tokens to add */
  tokens: number;
  /** Timestamp of update */
  timestamp: number;
}

/**
 * Configuration options for rate limit tracker
 */
export interface RateLimitTrackerOptions {
  /** Window duration in milliseconds (default: 5 hours) */
  windowDuration?: number;
  /** Maximum number of windows to track per key (default: 10) */
  maxWindowsPerKey?: number;
  /** Batch update interval in milliseconds (default: 5000ms = 5 seconds) */
  batchUpdateInterval?: number;
  /** Maximum batch size before forcing flush (default: 100) */
  maxBatchSize?: number;
  /** Enable metrics collection (default: true) */
  enableMetrics?: boolean;
}

/**
 * RateLimitTracker class implementing optimized sliding window rate limiting
 *
 * Features:
 * - O(1) rate limit checks using pre-computed window boundaries
 * - In-memory token tracking with batched storage updates
 * - Efficient sliding window algorithm
 * - Comprehensive metrics tracking
 * - Automatic cleanup of expired windows
 */
export class RateLimitTracker {
  // Track windows per API key (keyHash -> array of windows)
  private windowsPerKey: Map<string, RateLimitWindow[]> = new Map();

  // Pre-computed window duration
  private readonly windowDuration: number;
  private readonly maxWindowsPerKey: number;
  private readonly batchUpdateInterval: number;
  private readonly maxBatchSize: number;
  private readonly metricsEnabled: boolean;

  // Pending updates for batching
  private pendingUpdates: Map<string, PendingUpdate> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  private storageUpdateCallback: ((key: string, tokens: number) => Promise<void>) | null = null;

  // Metrics tracking
  private totalChecks: number = 0;
  private allowedChecks: number = 0;
  private deniedChecks: number = 0;
  private storageWrites: number = 0;
  private cachedChecks: number = 0;
  private checkTimes: number[] = [];

  constructor(options: RateLimitTrackerOptions = {}) {
    this.windowDuration = options.windowDuration ?? 5 * 60 * 60 * 1000; // 5 hours
    this.maxWindowsPerKey = options.maxWindowsPerKey ?? 10;
    this.batchUpdateInterval = options.batchUpdateInterval ?? 5000; // 5 seconds
    this.maxBatchSize = options.maxBatchSize ?? 100;
    this.metricsEnabled = options.enableMetrics ?? true;

    // Start batch timer
    this.startBatchTimer();
  }

  /**
   * Check rate limit for an API key
   *
   * Uses pre-computed window boundaries and in-memory tracking for O(1) performance.
   * Integrates with existing usage_windows from ApiKey object.
   *
   * @param key - API key object
   * @param tokensRequested - Number of tokens being requested (default: 1)
   * @returns Rate limit check result
   */
  checkRateLimit(
    key: ApiKey,
    tokensRequested: number = 1
  ): {
    allowed: boolean;
    reason?: string;
    tokensUsed: number;
    tokensLimit: number;
    windowStart: string;
    windowEnd: string;
    retryAfter?: number;
  } {
    const startTime = this.metricsEnabled ? performance.now() : 0;

    if (this.metricsEnabled) {
      this.totalChecks++;
    }

    const keyHash = this.getKeyHash(key);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const cutoffTime = now - this.windowDuration;

    // Get or create windows for this key
    let windows = this.windowsPerKey.get(keyHash);
    if (!windows) {
      // Initialize from existing usage_windows
      windows = this.initializeFromApiKey(key);
      this.windowsPerKey.set(keyHash, windows);
    }

    // Clean up expired windows (O(n) but infrequent)
    this.cleanupExpiredWindows(windows, now);

    // Find or create current window
    let currentWindow = this.findCurrentWindow(windows, now);
    if (!currentWindow) {
      currentWindow = this.createWindow(now);
      windows.push(currentWindow);

      // Keep only the most recent N windows
      if (windows.length > this.maxWindowsPerKey) {
        // Remove oldest windows (sorted by start time)
        windows.sort((a, b) => a.startTime - b.startTime);
        windows.splice(0, windows.length - this.maxWindowsPerKey);
      }
    }

    // Calculate total tokens used in active windows
    let totalTokensUsed = 0;
    let windowStart = nowIso;
    let windowEnd = nowIso;

    // Single pass through windows to calculate totals and find boundaries
    for (const window of windows) {
      if (window.startTime >= cutoffTime) {
        totalTokensUsed += window.tokensUsed;

        // Track earliest window for boundary calculation
        if (window.startTime < new Date(windowStart).getTime()) {
          windowStart = window.windowStart;
          windowEnd = window.windowEnd;
        }
      }
    }

    // Check if over limit
    const allowed = totalTokensUsed + tokensRequested <= key.token_limit_per_5h;

    if (this.metricsEnabled) {
      if (allowed) {
        this.allowedChecks++;
      } else {
        this.deniedChecks++;
      }
      this.cachedChecks++; // Served from in-memory cache
      this.recordCheckTime(performance.now() - startTime);
    }

    if (!allowed) {
      // Calculate retry-after time
      const retryAfterSeconds = Math.max(0, Math.floor(
        (new Date(windowEnd).getTime() - now) / 1000
      ));

      return {
        allowed: false,
        reason: 'Token limit exceeded for 5-hour window',
        tokensUsed: totalTokensUsed,
        tokensLimit: key.token_limit_per_5h,
        windowStart,
        windowEnd,
        retryAfter: retryAfterSeconds,
      };
    }

    return {
      allowed: true,
      tokensUsed: totalTokensUsed,
      tokensLimit: key.token_limit_per_5h,
      windowStart,
      windowEnd,
    };
  }

  /**
   * Record token usage (adds to pending batch)
   *
   * @param key - API key object
   * @param tokensUsed - Number of tokens used
   */
  recordUsage(key: ApiKey, tokensUsed: number): void {
    const keyHash = this.getKeyHash(key);
    const now = Date.now();

    // Get or create windows for this key
    let windows = this.windowsPerKey.get(keyHash);
    if (!windows) {
      // Initialize from existing usage_windows
      windows = this.initializeFromApiKey(key);
      this.windowsPerKey.set(keyHash, windows);
    }

    // Clean up expired windows
    this.cleanupExpiredWindows(windows, now);

    // Find or create current window
    let currentWindow = this.findCurrentWindow(windows, now);
    if (!currentWindow) {
      currentWindow = this.createWindow(now);
      windows.push(currentWindow);

      // Keep only the most recent N windows
      if (windows.length > this.maxWindowsPerKey) {
        windows.sort((a, b) => a.startTime - b.startTime);
        windows.splice(0, windows.length - this.maxWindowsPerKey);
      }
    }

    // Update in-memory window immediately
    currentWindow.tokensUsed += tokensUsed;

    // Add to pending batch
    const existing = this.pendingUpdates.get(keyHash);
    if (existing) {
      existing.tokens += tokensUsed;
      existing.timestamp = now;
    } else {
      this.pendingUpdates.set(keyHash, {
        keyHash,
        tokens: tokensUsed,
        timestamp: now,
      });
    }

    // Flush if batch is full
    if (this.pendingUpdates.size >= this.maxBatchSize) {
      void this.flushBatch();
    }
  }

  /**
   * Set the storage update callback
   *
   * @param callback - Function to call when flushing batch
   */
  setStorageUpdateCallback(
    callback: (key: string, tokens: number) => Promise<void>
  ): void {
    this.storageUpdateCallback = callback;
  }

  /**
   * Flush pending updates to storage
   *
   * Called automatically on timer or when batch is full.
   * Can also be called manually for immediate flush.
   */
  async flushBatch(): Promise<void> {
    if (this.pendingUpdates.size === 0 || !this.storageUpdateCallback) {
      return;
    }

    // Create a copy of pending updates and clear the map
    const updates = Array.from(this.pendingUpdates.values());
    this.pendingUpdates.clear();

    // Stop timer while processing
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Process updates (could be parallelized)
    const promises = updates.map(update =>
      this.storageUpdateCallback!(update.keyHash, update.tokens)
    );

    await Promise.all(promises);

    if (this.metricsEnabled) {
      this.storageWrites += updates.length;
    }

    // Restart timer
    this.startBatchTimer();
  }

  /**
   * Get metrics
   *
   * @returns Current metrics
   */
  getMetrics(): RateLimitMetrics {
    const avgCheckTime = this.checkTimes.length > 0
      ? this.checkTimes.reduce((a, b) => a + b, 0) / this.checkTimes.length
      : 0;

    return {
      totalChecks: this.totalChecks,
      allowedChecks: this.allowedChecks,
      deniedChecks: this.deniedChecks,
      storageWrites: this.storageWrites,
      cachedChecks: this.cachedChecks,
      avgCheckTime: avgCheckTime * 1000, // Convert to microseconds
      timestamp: Date.now(),
    };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.totalChecks = 0;
    this.allowedChecks = 0;
    this.deniedChecks = 0;
    this.storageWrites = 0;
    this.cachedChecks = 0;
    this.checkTimes = [];
  }

  /**
   * Clear all tracked data
   */
  clear(): void {
    this.windowsPerKey.clear();
    this.pendingUpdates.clear();
  }

  /**
   * Get hash/key for an API key
   */
  private getKeyHash(key: ApiKey): string {
    return key.key;
  }

  /**
   * Initialize in-memory windows from existing API key usage_windows
   *
   * @param key - API key object
   * @returns Array of rate limit windows
   */
  private initializeFromApiKey(key: ApiKey): RateLimitWindow[] {
    const windows: RateLimitWindow[] = [];

    for (const usageWindow of key.usage_windows) {
      const startTime = new Date(usageWindow.window_start).getTime();
      const endTime = startTime + this.windowDuration;

      windows.push({
        windowStart: usageWindow.window_start,
        windowEnd: new Date(endTime).toISOString(),
        tokensUsed: usageWindow.tokens_used,
        startTime,
        endTime,
      });
    }

    return windows;
  }

  /**
   * Find current window for a given timestamp
   *
   * Uses binary search for O(log n) performance.
   */
  private findCurrentWindow(
    windows: RateLimitWindow[],
    timestamp: number
  ): RateLimitWindow | null {
    // Binary search for efficiency
    let left = 0;
    let right = windows.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const window = windows[mid];

      if (timestamp >= window.startTime && timestamp < window.endTime) {
        return window;
      } else if (timestamp < window.startTime) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return null;
  }

  /**
   * Create a new window starting at the given timestamp
   */
  private createWindow(timestamp: number): RateLimitWindow {
    // Align window to hour boundary for consistency
    const startTime = new Date(timestamp);
    startTime.setMinutes(0, 0, 0);

    const startIso = startTime.toISOString();
    const startNum = startTime.getTime();
    const endNum = startNum + this.windowDuration;
    const endIso = new Date(endNum).toISOString();

    return {
      windowStart: startIso,
      windowEnd: endIso,
      tokensUsed: 0,
      startTime: startNum,
      endTime: endNum,
    };
  }

  /**
   * Clean up expired windows
   *
   * Removes windows that are outside the sliding window range.
   */
  private cleanupExpiredWindows(windows: RateLimitWindow[], now: number): void {
    const cutoffTime = now - this.windowDuration;

    // Remove expired windows (in-place for efficiency)
    for (let i = windows.length - 1; i >= 0; i--) {
      if (windows[i].endTime < cutoffTime) {
        windows.splice(i, 1);
      }
    }
  }

  /**
   * Start batch timer for periodic flushing
   */
  private startBatchTimer(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      void this.flushBatch();
    }, this.batchUpdateInterval);
  }

  /**
   * Record check time for metrics
   */
  private recordCheckTime(time: number): void {
    if (!this.metricsEnabled) return;

    this.checkTimes.push(time);

    // Keep only last 1000 measurements
    if (this.checkTimes.length > 1000) {
      this.checkTimes.shift();
    }
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Flush any pending updates
    await this.flushBatch();
  }
}

/**
 * Global rate limit tracker instance
 */
let globalRateLimitTracker: RateLimitTracker | null = null;

/**
 * Get the global rate limit tracker instance
 *
 * Creates a new instance if one doesn't exist.
 *
 * @param options - Tracker options (only used on first call)
 * @returns Global rate limit tracker
 */
export function getRateLimitTracker(options?: RateLimitTrackerOptions): RateLimitTracker {
  if (!globalRateLimitTracker) {
    globalRateLimitTracker = new RateLimitTracker(options);
  }
  return globalRateLimitTracker;
}

/**
 * Reset the global rate limit tracker
 *
 * Creates a new instance with the given options.
 *
 * @param options - Tracker options
 * @returns New global rate limit tracker
 */
export function resetRateLimitTracker(options?: RateLimitTrackerOptions): RateLimitTracker {
  if (globalRateLimitTracker) {
    void globalRateLimitTracker.shutdown();
  }
  globalRateLimitTracker = new RateLimitTracker(options);
  return globalRateLimitTracker;
}
