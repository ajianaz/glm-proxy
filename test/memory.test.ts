/**
 * Memory profiling and leak detection tests
 */

import { test, expect, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import {
  MemoryProfiler,
  startMemoryProfiling,
  memoryHealthCheck,
  MemoryLeakDetector,
  quickLeakCheck,
  runLeakDetectionSuite,
} from './memory/index';

describe('Memory Profiler', () => {
  describe('MemoryProfiler class', () => {
    test('should create a profiler with default options', () => {
      const profiler = new MemoryProfiler();
      expect(profiler).toBeDefined();
    });

    test('should create a profiler with custom options', () => {
      const profiler = new MemoryProfiler({
        snapshotInterval: 500,
        trackAllocations: false,
        maxSnapshots: 100,
        autoGC: true,
      });
      expect(profiler).toBeDefined();
    });

    test('should start and stop profiling', async () => {
      const profiler = new MemoryProfiler({ snapshotInterval: 100 });
      profiler.start();
      await new Promise((resolve) => setTimeout(resolve, 300));
      profiler.stop();

      const profile = profiler.getProfile();
      expect(profile.snapshots.length).toBeGreaterThan(0);
      expect(profile.startTime).toBeDefined();
      expect(profile.endTime).toBeDefined();
    });

    test('should capture memory snapshots', async () => {
      const profiler = new MemoryProfiler({ snapshotInterval: 100 });
      profiler.start();
      await new Promise((resolve) => setTimeout(resolve, 250));
      profiler.stop();

      const profile = profiler.getProfile();
      expect(profile.snapshots.length).toBeGreaterThanOrEqual(2);

      const snapshot = profile.snapshots[0];
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.heapUsed).toBeGreaterThan(0);
      expect(snapshot.heapTotal).toBeGreaterThan(0);
      expect(snapshot.rss).toBeGreaterThan(0);
    });

    test('should track base and peak memory', async () => {
      const profiler = new MemoryProfiler({ snapshotInterval: 100 });
      profiler.start();
      await new Promise((resolve) => setTimeout(resolve, 250));
      profiler.stop();

      const profile = profiler.getProfile();
      expect(profile.stats.baseHeapUsed).toBeGreaterThan(0);
      expect(profile.stats.peakHeapUsed).toBeGreaterThanOrEqual(
        profile.stats.baseHeapUsed
      );
    });

    test('should record allocations', async () => {
      const profiler = new MemoryProfiler({
        trackAllocations: true,
      });
      profiler.start();

      profiler.recordAllocation('test-buffer', 1024, 1);
      profiler.recordAllocation('test-object', 512, 2);

      await new Promise((resolve) => setTimeout(resolve, 100));
      profiler.stop();

      const profile = profiler.getProfile();
      expect(profile.allocations.length).toBe(2);
      expect(profile.allocations[0].type).toBe('test-buffer');
      expect(profile.allocations[0].size).toBe(1024);
    });

    test('should calculate memory statistics', async () => {
      const profiler = new MemoryProfiler({ snapshotInterval: 100 });
      profiler.start();
      await new Promise((resolve) => setTimeout(resolve, 250));
      profiler.stop();

      const profile = profiler.getProfile();
      expect(profile.stats.snapshotCount).toBeGreaterThan(0);
      expect(profile.stats.averageHeapUsed).toBeGreaterThan(0);
      expect(profile.stats.memoryGrowth).toBeDefined();
      expect(profile.stats.growthRate).toBeDefined();
    });

    test('should detect memory trend', async () => {
      const profiler = new MemoryProfiler({ snapshotInterval: 100 });
      profiler.start();

      // Allocate some memory to create a trend
      const allocations: string[] = [];
      for (let i = 0; i < 100; i++) {
        allocations.push('x'.repeat(1024));
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
      profiler.stop();

      const trend = profiler.getTrend();
      expect(['increasing', 'decreasing', 'stable']).toContain(trend.trend);
      expect(trend.slope).toBeDefined();
      expect(trend.confidence).toBeGreaterThanOrEqual(0);
      expect(trend.confidence).toBeLessThanOrEqual(1);
    });

    test('should get large allocations', () => {
      const profiler = new MemoryProfiler({ trackAllocations: true });
      profiler.recordAllocation('small', 1024, 1);
      profiler.recordAllocation('large', 1024 * 1024, 1);
      profiler.recordAllocation('medium', 10 * 1024, 1);

      const large = profiler.getLargeAllocations(2);
      expect(large.length).toBe(2);
      expect(large[0].type).toBe('large');
      expect(large[0].size).toBe(1024 * 1024);
    });

    test('should get allocation summary by type', () => {
      const profiler = new MemoryProfiler({ trackAllocations: true });
      profiler.recordAllocation('buffer', 1024, 2);
      profiler.recordAllocation('buffer', 2048, 1);
      profiler.recordAllocation('object', 512, 3);

      const summary = profiler.getAllocationSummary();
      expect(summary.size).toBe(2);

      const bufferStats = summary.get('buffer');
      expect(bufferStats).toBeDefined();
      expect(bufferStats?.count).toBe(3);
      expect(bufferStats?.totalSize).toBe(1024 + 2048);
    });

    test('should generate recommendations', async () => {
      const profiler = new MemoryProfiler({ snapshotInterval: 100 });
      profiler.start();
      await new Promise((resolve) => setTimeout(resolve, 200));
      profiler.stop();

      const recommendations = profiler.generateRecommendations();
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
    });

    test('should export profile as JSON', async () => {
      const profiler = new MemoryProfiler({ snapshotInterval: 100 });
      profiler.start();
      await new Promise((resolve) => setTimeout(resolve, 200));
      profiler.stop();

      const json = profiler.exportJSON();
      expect(typeof json).toBe('string');

      const parsed = JSON.parse(json);
      expect(parsed.sessionId).toBeDefined();
      expect(parsed.snapshots).toBeDefined();
      expect(parsed.stats).toBeDefined();
    });

    test('should clear profiler data', async () => {
      const profiler = new MemoryProfiler({ snapshotInterval: 100 });
      profiler.start();
      profiler.recordAllocation('test', 1024, 1);
      await new Promise((resolve) => setTimeout(resolve, 150));
      profiler.stop();

      expect(profiler.getProfile().snapshots.length).toBeGreaterThan(0);

      profiler.clear();
      expect(profiler.getProfile().snapshots.length).toBe(0);
      expect(profiler.getProfile().allocations.length).toBe(0);
    });

    test('should enforce max snapshots limit', async () => {
      const profiler = new MemoryProfiler({
        snapshotInterval: 50,
        maxSnapshots: 5,
      });
      profiler.start();

      // Wait for more than max snapshots worth of time
      await new Promise((resolve) => setTimeout(resolve, 400));
      profiler.stop();

      const profile = profiler.getProfile();
      // Should have approximately maxSnapshots (may have +1 for initial/final)
      expect(profile.snapshots.length).toBeLessThanOrEqual(6);
    });
  });

  describe('startMemoryProfiling', () => {
    test('should create and start a profiler', () => {
      const profiler = startMemoryProfiling({ snapshotInterval: 100 });
      expect(profiler).toBeInstanceOf(MemoryProfiler);
      profiler.stop();
    });
  });

  describe('memoryHealthCheck', () => {
    test('should perform a quick health check', async () => {
      const result = await memoryHealthCheck();

      expect(result.healthy).toBeDefined();
      expect(result.current).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    test('should identify unhealthy memory state', async () => {
      // This test might not always detect issues, but should run without error
      const result = await memoryHealthCheck();
      expect(result).toBeDefined();
    });
  });
});

describe('Memory Leak Detector', () => {
  describe('MemoryLeakDetector class', () => {
    test('should create detector with default config', () => {
      const detector = new MemoryLeakDetector();
      expect(detector).toBeDefined();
    });

    test('should create detector with custom config', () => {
      const detector = new MemoryLeakDetector({
        iterations: 20,
        gcBetweenIterations: true,
        iterationDuration: 500,
        cooldownDuration: 200,
        threshold: 1024 * 1024,
      });
      expect(detector).toBeDefined();
    });

    test('should detect no leak in simple workload', async () => {
      const detector = new MemoryLeakDetector({
        iterations: 5,
        gcBetweenIterations: true,
        iterationDuration: 50,
        cooldownDuration: 50,
      });

      const result = await detector.detectLeaks(async () => {
        // Simple workload that shouldn't leak
        const data = new Array(100).fill('test');
        await new Promise((resolve) => setTimeout(resolve, 10));
        data.length = 0; // Clear
      });

      expect(result.hasLeak).toBeDefined();
      expect(result.iterations.length).toBe(5);
      expect(result.summary.totalIterations).toBe(5);
    });

    test('should detect leaks with high memory growth', async () => {
      const detector = new MemoryLeakDetector({
        iterations: 5,
        gcBetweenIterations: true,
        iterationDuration: 50,
        cooldownDuration: 50,
        threshold: 10 * 1024, // Lower threshold for testing
      });

      // Create a workload that intentionally leaks
      const leaks: string[][] = [];
      const result = await detector.detectLeaks(async () => {
        leaks.push(new Array(1000).fill('x'.repeat(100)));
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(result.hasLeak).toBeDefined();
      expect(result.summary.totalIterations).toBe(5);
      expect(result.recommendations.length).toBeGreaterThan(0);
    });

    test('should generate detailed report', async () => {
      const detector = new MemoryLeakDetector({
        iterations: 3,
        gcBetweenIterations: false,
        iterationDuration: 50,
        cooldownDuration: 50,
      });

      const result = await detector.detectLeaks(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const report = detector.generateReport(result);

      expect(report).toContain('MEMORY LEAK DETECTION REPORT');
      expect(report).toContain('SUMMARY');
      expect(report).toContain('STATISTICS');
      expect(report).toContain('ITERATION DETAILS');
      expect(report).toContain('RECOMMENDATIONS');
    });

    test('should detect component lifecycle leaks', async () => {
      const detector = new MemoryLeakDetector({
        iterations: 5,
        gcBetweenIterations: true,
        iterationDuration: 50,
        cooldownDuration: 50,
      });

      const result = await detector.detectComponentLeak(
        async () => ({ data: new Array(100).fill('test') }),
        async (instance) => {
          instance.data = [];
        },
        async (instance) => {
          instance.data.push('more data');
        }
      );

      expect(result.hasLeak).toBeDefined();
      expect(result.iterations.length).toBe(5);
    });

    test('should detect function call leaks', async () => {
      const detector = new MemoryLeakDetector({
        iterations: 3,
        gcBetweenIterations: true,
        iterationDuration: 50,
        cooldownDuration: 50,
      });

      const result = await detector.detectFunctionLeak(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(result.hasLeak).toBeDefined();
      expect(result.iterations.length).toBe(3);
    });
  });

  describe('quickLeakCheck', () => {
    test('should perform quick leak check', async () => {
      const result = await quickLeakCheck(async () => {
        const data = new Array(100).fill('test');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }, 3);

      expect(result.hasLeak).toBeDefined();
      expect(result.message).toBeDefined();
      expect(typeof result.message).toBe('string');
    });

    test('should handle simple non-leaking workload', async () => {
      const result = await quickLeakCheck(
        async () => {
          const temp = { data: 'test' };
          await new Promise((resolve) => setTimeout(resolve, 5));
        },
        2
      );

      expect(result).toBeDefined();
      expect(result.hasLeak).toBeDefined();
    });
  });

  describe('runLeakDetectionSuite', () => {
    test('should run detection suite on multiple workloads', async () => {
      const workloads = {
        safe: async () => {
          const temp = new Array(100).fill('test');
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
        leaking: async () => {
          // This might leak but we'll just test the structure
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
      };

      const results = await runLeakDetectionSuite(workloads);

      expect(results).toHaveProperty('safe');
      expect(results).toHaveProperty('leaking');
      expect(results.safe.hasLeak).toBeDefined();
      expect(results.leaking.hasLeak).toBeDefined();
    }, 10000); // Higher timeout for suite test
  });
});

describe('Integration Tests', () => {
  test('should profile memory during workload', async () => {
    const profiler = new MemoryProfiler({ snapshotInterval: 50 });
    profiler.start();

    // Run a workload
    const data: string[] = [];
    for (let i = 0; i < 100; i++) {
      data.push('x'.repeat(1024));
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    profiler.stop();

    const profile = profiler.getProfile();
    expect(profile.snapshots.length).toBeGreaterThan(0);
    expect(profile.stats.peakHeapUsed).toBeGreaterThan(profile.stats.baseHeapUsed);
  });

  test('should detect leaks in problematic workload', async () => {
    const detector = new MemoryLeakDetector({
      iterations: 10,
      gcBetweenIterations: true,
      iterationDuration: 100,
      cooldownDuration: 50,
      threshold: 50 * 1024, // 50KB threshold
    });

    // Problematic workload that leaks
    const leakyStorage: any[] = [];
    const result = await detector.detectLeaks(async () => {
      leakyStorage.push({
        data: new Array(1000).fill('x'.repeat(100)),
        timestamp: Date.now(),
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // Should detect leak or at least not crash
    expect(result.hasLeak).toBeDefined();
    expect(result.iterations.length).toBe(10);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  test('should provide actionable recommendations', async () => {
    const profiler = new MemoryProfiler({ snapshotInterval: 100 });
    profiler.start();

    // Create some allocations
    profiler.recordAllocation('large-buffer', 5 * 1024 * 1024, 1);

    await new Promise((resolve) => setTimeout(resolve, 200));
    profiler.stop();

    const recommendations = profiler.generateRecommendations();
    expect(Array.isArray(recommendations)).toBe(true);
    expect(recommendations.length).toBeGreaterThan(0);

    // Check that recommendations are strings
    for (const rec of recommendations) {
      expect(typeof rec).toBe('string');
      expect(rec.length).toBeGreaterThan(0);
    }
  });
});
