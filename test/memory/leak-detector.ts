/**
 * Memory Leak Detector - Identify memory leaks in long-running processes
 *
 * Runs workloads multiple times and detects memory leaks by checking if
 * memory grows without being released after garbage collection.
 */

import type { MemorySnapshot } from './profiler.js';
import { MemoryProfiler } from './profiler.js';

export interface LeakDetectionConfig {
  iterations?: number; // Number of iterations to run
  gcBetweenIterations?: boolean; // Force GC between iterations
  iterationDuration?: number; // Duration of each iteration in ms
  cooldownDuration?: number; // Cooldown period between iterations in ms
  threshold?: number; // Memory growth threshold in bytes (default: 1MB)
}

export interface LeakDetectionResult {
  hasLeak: boolean;
  leakSize: number; // bytes leaked per iteration
  leakRate: number; // bytes per second
  confidence: number; // 0-1
  iterations: IterationResult[];
  summary: LeakSummary;
  recommendations: string[];
}

export interface IterationResult {
  iteration: number;
  startMemory: MemorySnapshot;
  endMemory: MemorySnapshot;
  memoryGrowth: number;
  gcaffect?: number; // Memory freed by GC
}

export interface LeakSummary {
  totalIterations: number;
  totalDuration: number;
  baseMemory: number;
  peakMemory: number;
  finalMemory: number;
  totalGrowth: number;
  growthPerIteration: number;
  growthPerSecond: number;
  gcCount: number;
}

/**
 * Memory Leak Detector class
 *
 * Detects memory leaks by running workloads multiple times and analyzing memory patterns.
 */
export class MemoryLeakDetector {
  private config: Required<LeakDetectionConfig>;

  constructor(config: LeakDetectionConfig = {}) {
    this.config = {
      iterations: config.iterations ?? 10,
      gcBetweenIterations: config.gcBetweenIterations ?? true,
      iterationDuration: config.iterationDuration ?? 1000,
      cooldownDuration: config.cooldownDuration ?? 500,
      threshold: config.threshold ?? 1024 * 1024, // 1MB default
    };
  }

  /**
   * Capture a memory snapshot
   */
  private captureSnapshot(): MemorySnapshot {
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
  private forceGC(): boolean {
    if (global.gc) {
      global.gc();
      return true;
    }
    return false;
  }

  /**
   * Detect memory leaks in a workload function
   */
  async detectLeaks(
    workload: () => Promise<void> | void
  ): Promise<LeakDetectionResult> {
    const iterations: IterationResult[] = [];
    const startTime = Date.now();
    let gcCount = 0;
    let baseMemory = 0;
    let peakMemory = 0;

    // Warmup iteration
    if (this.config.gcBetweenIterations) {
      this.forceGC();
    }
    await workload();

    // Run detection iterations
    for (let i = 0; i < this.config.iterations; i++) {
      const startMemory = this.captureSnapshot();

      if (i === 0) {
        baseMemory = startMemory.heapUsed;
      }

      // Run workload
      await workload();

      // Cooldown period (allow async operations to complete)
      if (this.config.cooldownDuration > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.config.cooldownDuration)
        );
      }

      // Force GC if enabled
      let gcEffect = 0;
      if (this.config.gcBetweenIterations) {
        const beforeGC = this.captureSnapshot();
        this.forceGC();
        gcCount++;
        const afterGC = this.captureSnapshot();
        gcEffect = beforeGC.heapUsed - afterGC.heapUsed;
      }

      const endMemory = this.captureSnapshot();
      const memoryGrowth = endMemory.heapUsed - startMemory.heapUsed;

      // Update peak memory
      if (endMemory.heapUsed > peakMemory) {
        peakMemory = endMemory.heapUsed;
      }

      iterations.push({
        iteration: i + 1,
        startMemory,
        endMemory,
        memoryGrowth,
        gcaffect: gcEffect,
      });
    }

    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    const finalMemory = iterations[iterations.length - 1].endMemory.heapUsed;
    const totalGrowth = finalMemory - baseMemory;

    // Calculate leak statistics
    const growthPerIteration = totalGrowth / this.config.iterations;
    const growthPerSecond = totalGrowth / (totalDuration / 1000);

    // Determine if leak exists using linear regression
    const memoryValues = iterations.map((iter) => iter.endMemory.heapUsed);
    const hasLeak = this.detectLeakByTrend(memoryValues);
    const leakSize = hasLeak ? growthPerIteration : 0;

    // Calculate confidence based on R-squared
    const confidence = this.calculateLeakConfidence(memoryValues);

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      hasLeak,
      leakSize,
      growthPerIteration,
      growthPerSecond,
      totalGrowth,
      gcCount,
      confidence,
    });

    const summary: LeakSummary = {
      totalIterations: this.config.iterations,
      totalDuration,
      baseMemory,
      peakMemory,
      finalMemory,
      totalGrowth,
      growthPerIteration,
      growthPerSecond,
      gcCount,
    };

    return {
      hasLeak,
      leakSize,
      leakRate: growthPerSecond,
      confidence,
      iterations,
      summary,
      recommendations,
    };
  }

  /**
   * Detect leak by analyzing trend using linear regression
   */
  private detectLeakByTrend(memoryValues: number[]): boolean {
    if (memoryValues.length < 3) return false;

    // Simple linear regression
    const n = memoryValues.length;
    const xValues = Array.from({ length: n }, (_, i) => i);
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = memoryValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * memoryValues[i], 0);
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

    // Leak detected if slope is positive and statistically significant
    return slope > this.config.threshold / this.config.iterations;
  }

  /**
   * Calculate confidence in leak detection using R-squared
   */
  private calculateLeakConfidence(memoryValues: number[]): number {
    if (memoryValues.length < 3) return 0;

    const n = memoryValues.length;
    const xValues = Array.from({ length: n }, (_, i) => i);
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = memoryValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * memoryValues[i], 0);
    const sumXX = xValues.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    const meanY = sumY / n;
    const ssTot = memoryValues.reduce(
      (sum, y) => sum + Math.pow(y - meanY, 2),
      0
    );
    const ssRes = memoryValues.reduce(
      (sum, y, i) => sum + Math.pow(y - (slope * xValues[i] + intercept), 2),
      0
    );

    const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    return Math.max(0, Math.min(1, rSquared));
  }

  /**
   * Generate recommendations based on leak detection results
   */
  private generateRecommendations(params: {
    hasLeak: boolean;
    leakSize: number;
    growthPerIteration: number;
    growthPerSecond: number;
    totalGrowth: number;
    gcCount: number;
    confidence: number;
  }): string[] {
    const recommendations: string[] = [];
    const {
      hasLeak,
      leakSize,
      growthPerIteration,
      growthPerSecond,
      totalGrowth,
      gcCount,
      confidence,
    } = params;

    if (hasLeak && confidence > 0.7) {
      const leakMB = (leakSize / 1024 / 1024).toFixed(2);
      const totalMB = (totalGrowth / 1024 / 1024).toFixed(2);
      recommendations.push(
        `Memory leak detected! Leaking ${leakMB} MB per iteration (${totalMB} MB total) with ${Math.floor(
          confidence * 100
        )}% confidence.`
      );
      recommendations.push(
        `Growth rate: ${(growthPerSecond / 1024).toFixed(2)} KB/s`
      );

      // Specific recommendations
      recommendations.push(
        'Check for:'
      );
      recommendations.push('  - Event listeners not being removed');
      recommendations.push('  - Closures holding references to large objects');
      recommendations.push('  - Global variables accumulating data');
      recommendations.push('  - Unclosed streams or file handles');
      recommendations.push('  - Cache growing without limits');
      recommendations.push('  - Timers/intervals not being cleared');
    } else if (hasLeak && confidence <= 0.7) {
      recommendations.push(
        `Possible memory leak detected (confidence: ${Math.floor(
          confidence * 100
        )}%). Growing ${(growthPerIteration / 1024).toFixed(2)} KB per iteration.`
      );
      recommendations.push(
        'Run more iterations to increase confidence or check for intermittent leaks.'
      );
    } else if (totalGrowth > this.config.threshold) {
      const growthMB = (totalGrowth / 1024 / 1024).toFixed(2);
      recommendations.push(
        `Memory grew by ${growthMB} MB but no clear leak pattern detected.`
      );
      recommendations.push(
        'This could be normal cache warmup or pending async operations.'
      );

      if (gcCount === 0) {
        recommendations.push(
          'Consider running with --expose-gc flag for accurate leak detection.'
        );
      }
    } else {
      recommendations.push(
        'No memory leak detected. Memory usage is stable across iterations.'
      );
    }

    if (gcCount > 0) {
      recommendations.push(
        `Performed ${gcCount} garbage collections during detection.`
      );
    }

    return recommendations;
  }

  /**
   * Run a comprehensive leak detection on a component
   */
  async detectComponentLeak<T>(
    setup: () => T | Promise<T>,
    teardown: (instance: T) => void | Promise<void>,
    use: (instance: T) => void | Promise<void>
  ): Promise<LeakDetectionResult> {
    const instances: T[] = [];

    return this.detectLeaks(async () => {
      // Create new instance
      const instance = await setup();
      instances.push(instance);

      // Use the instance
      await use(instance);

      // Teardown
      await teardown(instances.shift()!);
    });
  }

  /**
   * Detect leaks from repeated function calls
   */
  async detectFunctionLeak(
    fn: () => void | Promise<void>
  ): Promise<LeakDetectionResult> {
    return this.detectLeaks(fn);
  }

  /**
   * Generate a detailed leak report
   */
  generateReport(result: LeakDetectionResult): string {
    const lines: string[] = [];
    const { hasLeak, leakSize, leakRate, confidence, summary, recommendations } =
      result;

    lines.push('='.repeat(60));
    lines.push('MEMORY LEAK DETECTION REPORT');
    lines.push('='.repeat(60));
    lines.push('');

    // Summary
    lines.push('SUMMARY');
    lines.push('-'.repeat(60));
    lines.push(`Leak Detected: ${hasLeak ? 'YES' : 'NO'}`);
    if (hasLeak) {
      lines.push(
        `Leak Size: ${(leakSize / 1024).toFixed(2)} KB per iteration`
      );
      lines.push(
        `Leak Rate: ${(leakRate / 1024).toFixed(2)} KB/s`
      );
      lines.push(`Confidence: ${(confidence * 100).toFixed(1)}%`);
    }
    lines.push('');

    // Statistics
    lines.push('STATISTICS');
    lines.push('-'.repeat(60));
    lines.push(
      `Base Memory: ${(summary.baseMemory / 1024 / 1024).toFixed(2)} MB`
    );
    lines.push(
      `Peak Memory: ${(summary.peakMemory / 1024 / 1024).toFixed(2)} MB`
    );
    lines.push(
      `Final Memory: ${(summary.finalMemory / 1024 / 1024).toFixed(2)} MB`
    );
    lines.push(
      `Total Growth: ${(summary.totalGrowth / 1024 / 1024).toFixed(2)} MB`
    );
    lines.push(
      `Growth per Iteration: ${(summary.growthPerIteration / 1024).toFixed(2)} KB`
    );
    lines.push(
      `Growth per Second: ${(summary.growthPerSecond / 1024).toFixed(2)} KB`
    );
    lines.push(`GC Count: ${summary.gcCount}`);
    lines.push(`Total Duration: ${(summary.totalDuration / 1000).toFixed(2)} s`);
    lines.push('');

    // Iterations
    lines.push('ITERATION DETAILS');
    lines.push('-'.repeat(60));
    for (const iter of result.iterations) {
      lines.push(`Iteration ${iter.iteration}:`);
      lines.push(
        `  Start: ${(iter.startMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`
      );
      lines.push(
        `  End:   ${(iter.endMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`
      );
      lines.push(
        `  Growth: ${(iter.memoryGrowth / 1024).toFixed(2)} KB`
      );
      if (iter.gcaffect !== undefined) {
        lines.push(
          `  GC Freed: ${(iter.gcaffect / 1024).toFixed(2)} KB`
        );
      }
    }
    lines.push('');

    // Recommendations
    lines.push('RECOMMENDATIONS');
    lines.push('-'.repeat(60));
    for (const rec of recommendations) {
      lines.push(`• ${rec}`);
    }
    lines.push('');

    lines.push('='.repeat(60));

    return lines.join('\n');
  }
}

/**
 * Quick memory leak check
 */
export async function quickLeakCheck(
  workload: () => void | Promise<void>,
  iterations: number = 5
): Promise<{ hasLeak: boolean; message: string }> {
  const detector = new MemoryLeakDetector({
    iterations,
    gcBetweenIterations: true,
    iterationDuration: 100,
    cooldownDuration: 100,
  });

  const result = await detector.detectLeaks(workload);

  return {
    hasLeak: result.hasLeak,
    message: result.recommendations.join('\n'),
  };
}

/**
 * Run a comprehensive leak detection suite
 */
export async function runLeakDetectionSuite(
  workloads: Record<string, () => void | Promise<void>>
): Promise<Record<string, LeakDetectionResult>> {
  const results: Record<string, LeakDetectionResult> = {};

  for (const [name, workload] of Object.entries(workloads)) {
    const detector = new MemoryLeakDetector({
      iterations: 20,
      gcBetweenIterations: true,
      iterationDuration: 500,
      cooldownDuration: 200,
    });

    results[name] = await detector.detectLeaks(workload);
  }

  return results;
}
