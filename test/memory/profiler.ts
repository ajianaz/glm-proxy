/**
 * Memory Profiler - Track memory allocations and usage patterns
 *
 * Provides comprehensive memory profiling capabilities including:
 * - Memory usage tracking over time
 * - Heap snapshot analysis
 * - Large object allocation detection
 * - Memory growth trend analysis
 */

export interface MemorySnapshot {
  timestamp: string;
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
}

export interface AllocationRecord {
  type: string;
  size: number;
  count: number;
  timestamp: string;
}

export interface MemoryProfile {
  sessionId: string;
  startTime: string;
  endTime?: string;
  snapshots: MemorySnapshot[];
  allocations: AllocationRecord[];
  stats: MemoryStatistics;
}

export interface MemoryStatistics {
  baseHeapUsed: number;
  peakHeapUsed: number;
  currentHeapUsed: number;
  memoryGrowth: number;
  growthRate: number; // bytes per second
  averageHeapUsed: number;
  snapshotCount: number;
  allocationCount: number;
  gcCount: number;
}

export interface MemoryProfilerOptions {
  snapshotInterval?: number; // ms between snapshots
  trackAllocations?: boolean;
  maxSnapshots?: number;
  autoGC?: boolean;
}

/**
 * Memory Profiler class for tracking memory usage patterns
 *
 * Tracks memory usage over time and identifies potential issues.
 */
export class MemoryProfiler {
  private sessionId: string;
  private startTime: number;
  private endTime?: number;
  private snapshots: MemorySnapshot[] = [];
  private allocations: AllocationRecord[] = [];
  private gcCount: number = 0;
  private intervalId?: ReturnType<typeof setInterval>;
  private baseHeapUsed: number = 0;
  private peakHeapUsed: number = 0;

  private readonly snapshotInterval: number;
  private readonly trackAllocations: boolean;
  private readonly maxSnapshots: number;
  private readonly autoGC: boolean;

  constructor(options: MemoryProfilerOptions = {}) {
    this.sessionId = `mem-profile-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = Date.now();
    this.snapshotInterval = options.snapshotInterval ?? 1000; // 1 second default
    this.trackAllocations = options.trackAllocations ?? true;
    this.maxSnapshots = options.maxSnapshots ?? 3600; // 1 hour at 1 sec intervals
    this.autoGC = options.autoGC ?? false;
  }

  /**
   * Start memory profiling
   */
  start(): void {
    // Capture initial snapshot
    const initialSnapshot = this.captureSnapshot();
    this.snapshots.push(initialSnapshot);
    this.baseHeapUsed = initialSnapshot.heapUsed;
    this.peakHeapUsed = initialSnapshot.heapUsed;

    // Set up periodic snapshots
    this.intervalId = setInterval(() => {
      const snapshot = this.captureSnapshot();

      // Maintain max snapshots limit
      if (this.snapshots.length >= this.maxSnapshots) {
        this.snapshots.shift(); // Remove oldest snapshot
      }

      this.snapshots.push(snapshot);

      // Update peak memory
      if (snapshot.heapUsed > this.peakHeapUsed) {
        this.peakHeapUsed = snapshot.heapUsed;
      }

      // Auto GC if enabled
      if (this.autoGC && global.gc) {
        this.gc();
      }
    }, this.snapshotInterval);
  }

  /**
   * Stop memory profiling
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    this.endTime = Date.now();

    // Capture final snapshot
    const finalSnapshot = this.captureSnapshot();
    this.snapshots.push(finalSnapshot);
  }

  /**
   * Capture a memory snapshot
   */
  captureSnapshot(): MemorySnapshot {
    const usage = process.memoryUsage();

    return {
      timestamp: new Date().toISOString(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      rss: usage.rss,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
    };
  }

  /**
   * Force garbage collection if available
   */
  gc(): void {
    if (global.gc) {
      global.gc();
      this.gcCount++;

      // Capture snapshot after GC
      const snapshot = this.captureSnapshot();
      snapshot.timestamp = `${snapshot.timestamp} (after GC)`;
      this.snapshots.push(snapshot);
    }
  }

  /**
   * Record an allocation event
   */
  recordAllocation(type: string, size: number, count: number = 1): void {
    if (!this.trackAllocations) return;

    this.allocations.push({
      type,
      size,
      count,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get the current memory profile
   */
  getProfile(): MemoryProfile {
    const currentSnapshot = this.captureSnapshot();
    const duration = this.endTime
      ? this.endTime - this.startTime
      : Date.now() - this.startTime;

    const heapUsedValues = this.snapshots.map((s) => s.heapUsed);
    const averageHeapUsed =
      heapUsedValues.reduce((a, b) => a + b, 0) / heapUsedValues.length;

    const stats: MemoryStatistics = {
      baseHeapUsed: this.baseHeapUsed,
      peakHeapUsed: this.peakHeapUsed,
      currentHeapUsed: currentSnapshot.heapUsed,
      memoryGrowth: currentSnapshot.heapUsed - this.baseHeapUsed,
      growthRate: (currentSnapshot.heapUsed - this.baseHeapUsed) / (duration / 1000),
      averageHeapUsed,
      snapshotCount: this.snapshots.length,
      allocationCount: this.allocations.length,
      gcCount: this.gcCount,
    };

    return {
      sessionId: this.sessionId,
      startTime: new Date(this.startTime).toISOString(),
      endTime: this.endTime
        ? new Date(this.endTime).toISOString()
        : undefined,
      snapshots: [...this.snapshots],
      allocations: [...this.allocations],
      stats,
    };
  }

  /**
   * Get memory usage trend
   */
  getTrend(): {
    trend: 'increasing' | 'decreasing' | 'stable';
    slope: number; // bytes per second
    confidence: number; // 0-1
  } {
    if (this.snapshots.length < 2) {
      return { trend: 'stable', slope: 0, confidence: 0 };
    }

    // Simple linear regression
    const n = this.snapshots.length;
    const times = this.snapshots.map((s, i) => i);
    const memory = this.snapshots.map((s) => s.heapUsed);

    const sumX = times.reduce((a, b) => a + b, 0);
    const sumY = memory.reduce((a, b) => a + b, 0);
    const sumXY = times.reduce((sum, x, i) => sum + x * memory[i], 0);
    const sumXX = times.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const slopePerSecond = slope * (1000 / this.snapshotInterval);

    // Calculate R-squared for confidence
    const meanY = sumY / n;
    const ssTot = memory.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0);
    const ssRes = memory.reduce(
      (sum, y, i) => sum + Math.pow(y - (slope * times[i] + (sumY - slope * sumX) / n), 2),
      0
    );
    const rSquared = 1 - ssRes / ssTot;

    let trend: 'increasing' | 'decreasing' | 'stable';
    const stabilityThreshold = this.baseHeapUsed * 0.01; // 1% of base memory

    if (Math.abs(slopePerSecond) < stabilityThreshold / 10) {
      trend = 'stable';
    } else if (slopePerSecond > 0) {
      trend = 'increasing';
    } else {
      trend = 'decreasing';
    }

    return {
      trend,
      slope: slopePerSecond,
      confidence: Math.max(0, Math.min(1, rSquared)),
    };
  }

  /**
   * Get large allocations (top N by size)
   */
  getLargeAllocations(limit: number = 10): AllocationRecord[] {
    return [...this.allocations]
      .sort((a, b) => b.size - a.size)
      .slice(0, limit);
  }

  /**
   * Get allocation summary by type
   */
  getAllocationSummary(): Map<string, { count: number; totalSize: number; avgSize: number }> {
    const summary = new Map<
      string,
      { count: number; totalSize: number; avgSize: number }
    >();

    for (const alloc of this.allocations) {
      const existing = summary.get(alloc.type);
      if (existing) {
        existing.count += alloc.count;
        existing.totalSize += alloc.size;
      } else {
        summary.set(alloc.type, {
          count: alloc.count,
          totalSize: alloc.size,
          avgSize: alloc.size / alloc.count,
        });
      }
    }

    // Calculate average sizes
    for (const [type, data] of summary.entries()) {
      data.avgSize = data.totalSize / data.count;
    }

    return summary;
  }

  /**
   * Generate recommendations based on memory profile
   */
  generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const profile = this.getProfile();
    const trend = this.getTrend();

    // Check memory growth
    if (trend.trend === 'increasing' && trend.confidence > 0.7) {
      const growthMB = (profile.stats.memoryGrowth / 1024 / 1024).toFixed(2);
      recommendations.push(
        `Memory is increasing at ${(trend.slope / 1024).toFixed(2)} KB/s (${growthMB} MB total). Potential memory leak detected.`
      );
    }

    // Check peak memory usage
    if (profile.stats.peakHeapUsed > 100 * 1024 * 1024) {
      recommendations.push(
        `Peak memory usage exceeds 100MB (${(profile.stats.peakHeapUsed / 1024 / 1024).toFixed(2)}MB). Consider implementing object pooling or caching limits.`
      );
    }

    // Check for large allocations
    const largeAllocs = this.getLargeAllocations(5);
    if (largeAllocs.length > 0 && largeAllocs[0].size > 1024 * 1024) {
      recommendations.push(
        `Large allocations detected (largest: ${(largeAllocs[0].size / 1024 / 1024).toFixed(2)}MB of type ${largeAllocs[0].type}). Consider streaming or chunking.`
      );
    }

    // Check GC frequency
    if (this.gcCount > 100) {
      recommendations.push(
        `${this.gcCount} garbage collections detected. High GC pressure can impact performance. Consider object pooling to reduce allocations.`
      );
    }

    // Check if GC is available
    if (!global.gc) {
      recommendations.push(
        'Garbage collection not available. Run with --expose-gc flag for accurate memory profiling.'
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Memory usage looks healthy. No obvious issues detected.');
    }

    return recommendations;
  }

  /**
   * Export profile as JSON
   */
  exportJSON(): string {
    return JSON.stringify(this.getProfile(), null, 2);
  }

  /**
   * Clear all recorded data
   */
  clear(): void {
    this.snapshots = [];
    this.allocations = [];
    this.gcCount = 0;
    this.startTime = Date.now();
    this.endTime = undefined;
    this.baseHeapUsed = 0;
    this.peakHeapUsed = 0;
  }
}

/**
 * Create a memory profiler and start it
 */
export function startMemoryProfiling(
  options?: MemoryProfilerOptions
): MemoryProfiler {
  const profiler = new MemoryProfiler(options);
  profiler.start();
  return profiler;
}

/**
 * Run a quick memory health check
 */
export async function memoryHealthCheck(): Promise<{
  healthy: boolean;
  current: MemorySnapshot;
  stats: MemoryStatistics;
  recommendations: string[];
}> {
  const profiler = new MemoryProfiler({
    snapshotInterval: 100,
    autoGC: false,
  });

  profiler.start();

  // Run for 1 second
  await new Promise((resolve) => setTimeout(resolve, 1000));

  profiler.stop();

  const profile = profiler.getProfile();
  const trend = profiler.getTrend();
  const recommendations = profiler.generateRecommendations();

  const healthy =
    trend.trend !== 'increasing' &&
    profile.stats.memoryGrowth < 10 * 1024 * 1024; // Less than 10MB growth

  return {
    healthy,
    current: profiler.captureSnapshot(),
    stats: profile.stats,
    recommendations,
  };
}
