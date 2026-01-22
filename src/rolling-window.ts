/**
 * O(1) Rolling Window Algorithm for Rate Limiting
 *
 * Uses time-based buckets to maintain O(1) complexity for both reads and updates.
 * Instead of filtering all windows on every check, we maintain a pre-calculated
 * running total and automatically expire old buckets.
 */

/**
 * Represents a single time bucket containing token usage
 */
export interface TimeBucket {
  timestamp: number;  // Bucket start time in milliseconds since epoch
  tokens: number;     // Total tokens consumed in this bucket
}

/**
 * Serializable rolling window data for persistence
 */
export interface RollingWindowData {
  buckets: TimeBucket[];      // Array of active buckets (sparse representation)
  runningTotal: number;       // Pre-calculated sum of all active buckets
  lastUpdated: string;        // ISO timestamp of last update
  windowDurationMs: number;   // Window duration (default: 18000000 = 5 hours)
  bucketSizeMs: number;       // Bucket size (default: 300000 = 5 minutes)
}

export class RollingWindow {
  private buckets: Map<number, TimeBucket>;  // Sparse bucket storage (key: bucket timestamp)
  private runningTotal: number;              // Pre-calculated sum of active buckets
  private readonly windowDurationMs: number; // Window duration in milliseconds
  private readonly bucketSizeMs: number;     // Bucket size in milliseconds
  private readonly bucketCount: number;      // Total number of buckets (window / bucket size)

  /**
   * Create a new RollingWindow
   * @param windowDurationMs - Window duration in milliseconds (default: 5 hours)
   * @param bucketSizeMs - Bucket size in milliseconds (default: 5 minutes)
   */
  constructor(windowDurationMs: number = 5 * 60 * 60 * 1000, bucketSizeMs: number = 5 * 60 * 1000) {
    this.windowDurationMs = windowDurationMs;
    this.bucketSizeMs = bucketSizeMs;
    this.bucketCount = Math.ceil(windowDurationMs / bucketSizeMs);
    this.buckets = new Map();
    this.runningTotal = 0;
  }

  /**
   * Add tokens to the appropriate bucket
   * Complexity: O(1)
   * @param timestamp - When the tokens were consumed
   * @param tokens - Number of tokens to add
   */
  addTokens(timestamp: Date, tokens: number): void {
    if (tokens <= 0) return;

    const bucketTime = this._getBucketTime(timestamp);

    const existingBucket = this.buckets.get(bucketTime);

    if (existingBucket) {
      // Add to existing bucket
      existingBucket.tokens += tokens;
    } else {
      // Create new bucket
      this.buckets.set(bucketTime, { timestamp: bucketTime, tokens });
    }

    // Update running total
    this.runningTotal += tokens;
  }

  /**
   * Get total tokens in the active window
   * Complexity: O(1) amortized (cleanup is O(k) where k = expired buckets)
   * @param currentTime - Current time for calculating active window
   * @returns Total tokens in the active window
   */
  getTotalTokens(currentTime: Date): number {
    this.cleanup(currentTime);
    return this.runningTotal;
  }

  /**
   * Remove expired buckets from the window
   * Complexity: O(k) where k = number of expired buckets (amortized O(1))
   * @param currentTime - Current time for calculating expiry
   */
  cleanup(currentTime: Date): void {
    const expiryTime = currentTime.getTime() - this.windowDurationMs;

    // Remove expired buckets and update running total
    // Buckets with timestamp <= expiryTime are outside the window and should be removed
    for (const [timestamp, bucket] of this.buckets) {
      if (bucket.timestamp <= expiryTime) {
        this.runningTotal -= bucket.tokens;
        this.buckets.delete(timestamp);
      }
    }

    // Ensure running total never goes negative (safety check)
    if (this.runningTotal < 0) {
      this.runningTotal = 0;
    }
  }

  /**
   * Calculate bucket index from bucket time
   * Uses circular buffer with modulo arithmetic
   * Note: This is now only used for analysis/debugging, not as Map key
   * Complexity: O(1)
   * @param bucketTime - Bucket start time in milliseconds
   * @returns Bucket index (0 to bucketCount-1)
   */
  private _getBucketIndex(bucketTime: number): number {
    const bucketNumber = bucketTime / this.bucketSizeMs;
    return bucketNumber % this.bucketCount;
  }

  /**
   * Calculate bucket start time from timestamp
   * Rounds down to nearest bucket boundary
   * Complexity: O(1)
   * @param timestamp - Timestamp to round down
   * @returns Bucket start time in milliseconds
   */
  private _getBucketTime(timestamp: Date): number {
    return Math.floor(timestamp.getTime() / this.bucketSizeMs) * this.bucketSizeMs;
  }

  /**
   * Convert to JSON-serializable format
   * Useful for persisting to storage
   * @returns Serializable rolling window data
   */
  toSerializable(): RollingWindowData {
    return {
      buckets: Array.from(this.buckets.values()),
      runningTotal: this.runningTotal,
      lastUpdated: new Date().toISOString(),
      windowDurationMs: this.windowDurationMs,
      bucketSizeMs: this.bucketSizeMs,
    };
  }

  /**
   * Create RollingWindow instance from serialized data
   * Useful for loading from storage
   * @param data - Serialized rolling window data
   * @returns New RollingWindow instance
   */
  static fromSerializable(data: RollingWindowData): RollingWindow {
    const window = new RollingWindow(data.windowDurationMs, data.bucketSizeMs);

    // Restore buckets (key by timestamp, not index)
    for (const bucket of data.buckets) {
      window.buckets.set(bucket.timestamp, bucket);
    }

    // Restore running total
    window.runningTotal = data.runningTotal;

    return window;
  }

  /**
   * Get current bucket count (for testing/debugging)
   * @returns Number of active buckets
   */
  getBucketCount(): number {
    return this.buckets.size;
  }

  /**
   * Validate running total (for testing/debugging)
   * @returns true if running total matches actual sum
   */
  validate(): boolean {
    const actualTotal = Array.from(this.buckets.values())
      .reduce((sum, b) => sum + b.tokens, 0);

    if (actualTotal !== this.runningTotal) {
      throw new Error(
        `Running total mismatch: expected ${actualTotal}, got ${this.runningTotal}`
      );
    }

    return true;
  }
}
