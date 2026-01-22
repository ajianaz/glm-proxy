/**
 * Profiler - Performance tracking and measurement
 *
 * Tracks request lifecycle and operation timing with minimal overhead.
 * Designed to add < 1ms overhead when profiling is enabled.
 */

export interface ProfilingMark {
  name: string;
  startTime: number;
  duration: number;
  metadata?: Record<string, unknown>;
}

export interface ProfilingData {
  requestId: string;
  startTime: number;
  endTime: number;
  totalDuration: number;
  marks: ProfilingMark[];
  metadata: Record<string, unknown>;
}

export interface ProfilerOptions {
  enabled?: boolean;
  maxEntries?: number;
  includeMetadata?: boolean;
}

/**
 * Profiler class for tracking performance metrics
 *
 * Thread-safe and designed for concurrent request handling.
 * Each request gets its own profiler instance.
 */
export class Profiler {
  private static globalEnabled = true;
  private static globalDataStore = new Map<string, ProfilingData>();
  private static maxGlobalEntries = 1000;

  private enabled: boolean;
  private includeMetadata: boolean;
  private marks: ProfilingMark[] = [];
  private metadata: Record<string, unknown> = {};
  private startTime: number = 0;
  private endTime: number = 0;

  constructor(options: ProfilerOptions = {}) {
    this.enabled = options.enabled ?? Profiler.globalEnabled;
    this.includeMetadata = options.includeMetadata ?? true;
  }

  /**
   * Start profiling a request
   */
  start(requestId: string): void {
    if (!this.enabled) return;

    this.startTime = performance.now();
    this.metadata.requestId = requestId;
    this.metadata.startTime = new Date().toISOString();
  }

  /**
   * Mark a specific operation with timing
   */
  mark(name: string, metadata?: Record<string, unknown>): void {
    if (!this.enabled) return;

    const now = performance.now();
    const mark: ProfilingMark = {
      name,
      startTime: now - this.startTime,
      duration: 0, // Will be updated when end() is called for this mark
    };

    if (this.includeMetadata && metadata) {
      mark.metadata = metadata;
    }

    this.marks.push(mark);
  }

  /**
   * End a specific mark and calculate its duration
   */
  endMark(name: string): void {
    if (!this.enabled) return;

    const mark = this.marks.find(m => m.name === name && m.duration === 0);
    if (mark) {
      const now = performance.now();
      mark.duration = now - this.startTime - mark.startTime;
    }
  }

  /**
   * End profiling and generate final data
   */
  end(): ProfilingData | null {
    if (!this.enabled || this.startTime === 0) {
      return null;
    }

    this.endTime = performance.now();
    const totalDuration = this.endTime - this.startTime;

    // Close any open marks
    for (const mark of this.marks) {
      if (mark.duration === 0) {
        mark.duration = totalDuration - mark.startTime;
      }
    }

    const data: ProfilingData = {
      requestId: String(this.metadata.requestId || 'unknown'),
      startTime: this.startTime,
      endTime: this.endTime,
      totalDuration,
      marks: [...this.marks],
      metadata: { ...this.metadata },
    };

    // Store in global data store
    if (Profiler.globalDataStore.size >= Profiler.maxGlobalEntries) {
      // Remove oldest entry (FIFO)
      const firstKey = Profiler.globalDataStore.keys().next().value;
      if (firstKey) {
        Profiler.globalDataStore.delete(firstKey);
      }
    }
    Profiler.globalDataStore.set(data.requestId, data);

    return data;
  }

  /**
   * Get current profiling data (without ending)
   */
  getData(): Partial<ProfilingData> | null {
    if (!this.enabled || this.startTime === 0) {
      return null;
    }

    return {
      requestId: String(this.metadata.requestId || 'unknown'),
      startTime: this.startTime,
      endTime: this.endTime || performance.now(),
      totalDuration: (this.endTime || performance.now()) - this.startTime,
      marks: [...this.marks],
      metadata: { ...this.metadata },
    };
  }

  /**
   * Add metadata to the profiling session
   */
  addMetadata(key: string, value: unknown): void {
    if (!this.enabled || !this.includeMetadata) return;
    this.metadata[key] = value;
  }

  /**
   * Configure global profiler settings
   */
  static configure(options: { enabled?: boolean; maxEntries?: number }): void {
    if (options.enabled !== undefined) {
      Profiler.globalEnabled = options.enabled;
    }
    if (options.maxEntries !== undefined) {
      Profiler.maxGlobalEntries = options.maxEntries;
    }
  }

  /**
   * Get all stored profiling data
   */
  static getAllData(): ProfilingData[] {
    return Array.from(Profiler.globalDataStore.values());
  }

  /**
   * Get profiling data by request ID
   */
  static getDataById(requestId: string): ProfilingData | undefined {
    return Profiler.globalDataStore.get(requestId);
  }

  /**
   * Clear all stored profiling data
   */
  static clearData(): void {
    Profiler.globalDataStore.clear();
  }

  /**
   * Get aggregated statistics from all stored data
   */
  static getStatistics(): {
    totalRequests: number;
    averageDuration: number;
    p50Duration: number;
    p95Duration: number;
    p99Duration: number;
    slowestRequests: ProfilingData[];
  } {
    const allData = Profiler.getAllData();

    if (allData.length === 0) {
      return {
        totalRequests: 0,
        averageDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        slowestRequests: [],
      };
    }

    const durations = allData.map(d => d.totalDuration).sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);

    const percentile = (p: number) => {
      const index = Math.floor((p / 100) * (durations.length - 1));
      return durations[index];
    };

    return {
      totalRequests: allData.length,
      averageDuration: sum / allData.length,
      p50Duration: percentile(50),
      p95Duration: percentile(95),
      p99Duration: percentile(99),
      slowestRequests: allData
        .sort((a, b) => b.totalDuration - a.totalDuration)
        .slice(0, 10),
    };
  }

  /**
   * Check if profiling is enabled
   */
  static isEnabled(): boolean {
    return Profiler.globalEnabled;
  }

  /**
   * Enable or disable profiling globally
   */
  static setEnabled(enabled: boolean): void {
    Profiler.globalEnabled = enabled;
  }
}
