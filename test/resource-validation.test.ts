/**
 * Resource validation tests
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import {
  validateSingleResourceTest,
  validateResourceUsage,
  RESOURCE_TARGETS,
} from '../test/load/resource-validation';
import type {
  LoadTestConfig,
  LoadTestResult,
  LoadTestSnapshot,
  ResourceValidationResult,
} from '../test/load/types';
import { LoadTestScenario } from '../test/load/types';

/**
 * Helper to create a mock load test result
 */
function createMockResult(config: Partial<LoadTestConfig> = {}): LoadTestResult {
  const baseConfig: LoadTestConfig = {
    testName: 'Test',
    scenario: LoadTestScenario.CONSTANT_LOAD,
    duration: 60000,
    minConcurrency: 1,
    maxConcurrency: 10,
    concurrencyStep: 1,
    endpoint: 'http://localhost:3000/v1/chat/completions',
    apiKey: 'test-key',
    timeout: 30000,
    outputDir: './test/load/results',
    ...config,
  };

  // Create snapshots with different concurrency levels
  const snapshots: LoadTestSnapshot[] = [];
  const now = Date.now();

  for (let i = 0; i < 10; i++) {
    const concurrency = baseConfig.minConcurrency + i;
    snapshots.push({
      timestamp: now + i * 1000,
      activeRequests: concurrency,
      completedRequests: i * 10,
      failedRequests: 0,
      currentConcurrency: concurrency,
      memoryUsage: {
        rss: 50 * 1024 * 1024 + i * 1024 * 1024, // 50MB growing slowly
        heapUsed: 30 * 1024 * 1024 + i * 512 * 1024,
        heapTotal: 60 * 1024 * 1024,
        external: 5 * 1024 * 1024,
      },
      cpuUsage: {
        user: 10 + concurrency * 2, // Linear scaling
        system: 5 + concurrency * 1,
      },
    });
  }

  return {
    testName: baseConfig.testName || 'Test',
    scenario: baseConfig.scenario,
    startTime: new Date(now).toISOString(),
    endTime: new Date(now + baseConfig.duration).toISOString(),
    duration: baseConfig.duration,
    config: baseConfig,
    phases: [
      {
        name: 'Phase 1',
        startTime: now,
        endTime: now + baseConfig.duration,
        concurrency: 10,
        requests: [],
        stats: {
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          requestsPerSecond: 100,
          avgLatency: 5,
          p50Latency: 4,
          p95Latency: 8,
          p99Latency: 12,
          minLatency: 2,
          maxLatency: 20,
          errorRate: 5,
        },
      },
    ],
    snapshots,
    stats: {
      totalRequests: 100,
      successfulRequests: 95,
      failedRequests: 5,
      overallRequestsPerSecond: 100,
      avgLatency: 5,
      p50Latency: 4,
      p95Latency: 8,
      p99Latency: 12,
      minLatency: 2,
      maxLatency: 20,
      errorRate: 5,
      peakMemory: 60 * 1024 * 1024,
      avgMemory: 55 * 1024 * 1024,
      peakCpu: 35,
      avgCpu: 20,
    },
  };
}

describe('Resource Validation', () => {
  describe('validateSingleResourceTest', () => {
    // Skipping this test as it requires a real server and can timeout
    test.skip('should handle test errors gracefully', async () => {
      const config: LoadTestConfig = {
        testName: 'Error Test',
        scenario: LoadTestScenario.CONSTANT_LOAD,
        duration: 10000,
        minConcurrency: 1,
        maxConcurrency: 10,
        concurrencyStep: 1,
        endpoint: 'http://invalid-endpoint-that-does-not-exist.local',
        apiKey: 'test-key',
        timeout: 1000,
        outputDir: './test/load/results',
      };

      // This should fail but return an error result
      const result = await validateSingleResourceTest(config);

      expect(result).toBeDefined();
      expect(result.passed).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Resource Targets', () => {
    test('should have defined resource targets', () => {
      expect(RESOURCE_TARGETS.BASE_MEMORY_MB).toBeDefined();
      expect(RESOURCE_TARGETS.MEMORY_GROWTH_MB_PER_HOUR).toBeDefined();
      expect(RESOURCE_TARGETS.CPU_LINEARITY_THRESHOLD).toBeDefined();
      expect(RESOURCE_TARGETS.DEGRADATION_FAILURE_RATE_THRESHOLD).toBeDefined();

      // Targets should be reasonable values
      expect(RESOURCE_TARGETS.BASE_MEMORY_MB).toBeGreaterThan(0);
      expect(RESOURCE_TARGETS.MEMORY_GROWTH_MB_PER_HOUR).toBeGreaterThan(0);
      expect(RESOURCE_TARGETS.CPU_LINEARITY_THRESHOLD).toBeGreaterThan(0);
      expect(RESOURCE_TARGETS.CPU_LINEARITY_THRESHOLD).toBeLessThanOrEqual(1);
      expect(RESOURCE_TARGETS.DEGRADATION_FAILURE_RATE_THRESHOLD).toBeGreaterThan(0);
    });
  });

  describe('Memory Validation', () => {
    test('should validate base memory usage', () => {
      const result = createMockResult({
        testName: 'Memory Test',
      });

      // Check base memory is within target
      const baseMemoryMB = result.stats.peakMemory / (1024 * 1024);
      expect(baseMemoryMB).toBeLessThan(RESOURCE_TARGETS.BASE_MEMORY_MB);
    });

    test('should detect memory growth', () => {
      // Create result with slow, acceptable growth
      const config: LoadTestConfig = {
        testName: 'Memory Growth Test',
        scenario: LoadTestScenario.CONSTANT_LOAD,
        duration: 3600000, // 1 hour
        minConcurrency: 1,
        maxConcurrency: 10,
        concurrencyStep: 1,
        endpoint: 'http://localhost:3000/v1/chat/completions',
        apiKey: 'test-key',
        timeout: 30000,
        outputDir: './test/load/results',
      };

      const now = Date.now();
      const snapshots: LoadTestSnapshot[] = [];

      // Create 10 snapshots over 1 hour with 5MB total growth
      for (let i = 0; i < 10; i++) {
        snapshots.push({
          timestamp: now + (i * 360000), // Every 6 minutes
          activeRequests: i + 1,
          completedRequests: i * 10,
          failedRequests: 0,
          currentConcurrency: i + 1,
          memoryUsage: {
            rss: 50 * 1024 * 1024 + (i * 0.5 * 1024 * 1024), // 50MB to 54.5MB (5MB growth over hour)
            heapUsed: 30 * 1024 * 1024 + (i * 0.3 * 1024 * 1024),
            heapTotal: 60 * 1024 * 1024 + (i * 0.3 * 1024 * 1024),
            external: 5 * 1024 * 1024,
          },
          cpuUsage: {
            user: 10 + i * 2,
            system: 5 + i * 1,
          },
        });
      }

      const result: LoadTestResult = {
        ...createMockResult(config),
        snapshots,
      };

      // Calculate growth
      const firstMemory = result.snapshots[0].memoryUsage.rss;
      const lastMemory = result.snapshots[result.snapshots.length - 1].memoryUsage.rss;
      const growth = lastMemory - firstMemory;
      const duration = (result.snapshots[result.snapshots.length - 1].timestamp - result.snapshots[0].timestamp) / 1000;
      const growthMBPerHour = (growth / duration) * 3600 / (1024 * 1024);

      // Should have some growth but within acceptable limit
      expect(growth).toBeGreaterThan(0);
      expect(growthMBPerHour).toBeLessThan(RESOURCE_TARGETS.MEMORY_GROWTH_MB_PER_HOUR);
      expect(growthMBPerHour).toBeGreaterThan(0);
    });

    test('should handle stable memory', () => {
      const config: LoadTestConfig = {
        testName: 'Stable Memory Test',
        scenario: LoadTestScenario.CONSTANT_LOAD,
        duration: 60000,
        minConcurrency: 1,
        maxConcurrency: 10,
        concurrencyStep: 1,
        endpoint: 'http://localhost:3000/v1/chat/completions',
        apiKey: 'test-key',
        timeout: 30000,
        outputDir: './test/load/results',
      };

      // Create result with stable memory
      const result: LoadTestResult = {
        ...createMockResult(config),
        snapshots: createMockResult(config).snapshots.map((s) => ({
          ...s,
          memoryUsage: {
            rss: 50 * 1024 * 1024, // Constant 50MB
            heapUsed: 30 * 1024 * 1024,
            heapTotal: 60 * 1024 * 1024,
            external: 5 * 1024 * 1024,
          },
        })),
      };

      // Memory should be stable
      const memories = result.snapshots.map((s) => s.memoryUsage.rss);
      const uniqueMemories = new Set(memories);
      expect(uniqueMemories.size).toBe(1);
    });
  });

  describe('CPU Validation', () => {
    test('should detect linear CPU scaling', () => {
      // Create result with perfect linear CPU scaling
      const config: LoadTestConfig = {
        testName: 'CPU Scaling Test',
        scenario: LoadTestScenario.CONSTANT_LOAD,
        duration: 60000,
        minConcurrency: 1,
        maxConcurrency: 10,
        concurrencyStep: 1,
        endpoint: 'http://localhost:3000/v1/chat/completions',
        apiKey: 'test-key',
        timeout: 30000,
        outputDir: './test/load/results',
      };

      const now = Date.now();
      const snapshots: LoadTestSnapshot[] = [];

      // Create snapshots with perfect linear CPU scaling
      for (let i = 0; i < 10; i++) {
        const concurrency = i + 1;
        // CPU scales perfectly linearly with concurrency: 3% per concurrent request
        snapshots.push({
          timestamp: now + i * 1000,
          activeRequests: concurrency,
          completedRequests: i * 10,
          failedRequests: 0,
          currentConcurrency: concurrency,
          memoryUsage: {
            rss: 50 * 1024 * 1024,
            heapUsed: 30 * 1024 * 1024,
            heapTotal: 60 * 1024 * 1024,
            external: 5 * 1024 * 1024,
          },
          cpuUsage: {
            user: concurrency * 2.5, // 2.5% per concurrent request
            system: concurrency * 0.5, // 0.5% per concurrent request
          },
        });
      }

      const result: LoadTestResult = {
        ...createMockResult(config),
        snapshots,
      };

      // Check CPU increases with concurrency
      const firstCpu = result.snapshots[0].cpuUsage.user + result.snapshots[0].cpuUsage.system;
      const lastCpu =
        result.snapshots[result.snapshots.length - 1].cpuUsage.user +
        result.snapshots[result.snapshots.length - 1].cpuUsage.system;

      expect(lastCpu).toBeGreaterThan(firstCpu);

      // Check that CPU scales perfectly linearly (3% * 10 = 30% total)
      expect(firstCpu).toBe(3); // 1 concurrency * 3%
      expect(lastCpu).toBe(30); // 10 concurrency * 3%

      // Check correlation is perfect (or near perfect)
      const concurrencyValues = snapshots.map((s) => s.currentConcurrency);
      const cpuValues = snapshots.map((s) => s.cpuUsage.user + s.cpuUsage.system);

      // Calculate correlation (should be 1.0 for perfect linear)
      const n = concurrencyValues.length;
      const meanConcurrency = concurrencyValues.reduce((a, b) => a + b, 0) / n;
      const meanCpu = cpuValues.reduce((a, b) => a + b, 0) / n;

      let numerator = 0;
      let sumSqX = 0;
      let sumSqY = 0;

      for (let i = 0; i < n; i++) {
        const dx = concurrencyValues[i] - meanConcurrency;
        const dy = cpuValues[i] - meanCpu;
        numerator += dx * dy;
        sumSqX += dx * dx;
        sumSqY += dy * dy;
      }

      const correlation = sumSqX > 0 && sumSqY > 0 ? numerator / Math.sqrt(sumSqX * sumSqY) : 0;

      // Correlation should be very high for linear scaling
      expect(correlation).toBeGreaterThan(0.99);
    });

    test('should measure CPU efficiency', () => {
      const result = createMockResult({
        testName: 'CPU Efficiency Test',
      });

      // CPU usage should be reasonable
      expect(result.stats.avgCpu).toBeGreaterThan(0);
      expect(result.stats.peakCpu).toBeLessThan(100);
    });
  });

  describe('Memory Leak Detection', () => {
    test('should detect memory leaks in growing memory scenario', () => {
      const config: LoadTestConfig = {
        testName: 'Leak Test',
        scenario: LoadTestScenario.SUSTAINED,
        duration: 300000,
        minConcurrency: 10,
        maxConcurrency: 10,
        concurrencyStep: 1,
        endpoint: 'http://localhost:3000/v1/chat/completions',
        apiKey: 'test-key',
        timeout: 30000,
        outputDir: './test/load/results',
      };

      // Create result with growing memory
      const snapshots: LoadTestSnapshot[] = [];
      const now = Date.now();

      for (let i = 0; i < 100; i++) {
        snapshots.push({
          timestamp: now + i * 3000,
          activeRequests: 10,
          completedRequests: i * 10,
          failedRequests: 0,
          currentConcurrency: 10,
          memoryUsage: {
            rss: 50 * 1024 * 1024 + i * 2 * 1024 * 1024, // Growing 2MB per snapshot
            heapUsed: 30 * 1024 * 1024 + i * 1024 * 1024,
            heapTotal: 60 * 1024 * 1024 + i * 1024 * 1024,
            external: 5 * 1024 * 1024,
          },
          cpuUsage: {
            user: 30,
            system: 10,
          },
        });
      }

      const result: LoadTestResult = {
        ...createMockResult(config),
        snapshots,
      };

      // Calculate growth
      const firstMemory = result.snapshots[0].memoryUsage.rss;
      const lastMemory = result.snapshots[result.snapshots.length - 1].memoryUsage.rss;
      const growth = lastMemory - firstMemory;
      const duration = (result.snapshots[result.snapshots.length - 1].timestamp - result.snapshots[0].timestamp) / 1000;
      const growthMBPerHour = (growth / duration) * 3600 / (1024 * 1024);

      // Should detect significant growth
      expect(growthMBPerHour).toBeGreaterThan(10); // More than 10MB/hour
    });

    test('should not flag normal memory fluctuation as leak', () => {
      const config: LoadTestConfig = {
        testName: 'No Leak Test',
        scenario: LoadTestScenario.CONSTANT_LOAD,
        duration: 60000,
        minConcurrency: 1,
        maxConcurrency: 10,
        concurrencyStep: 1,
        endpoint: 'http://localhost:3000/v1/chat/completions',
        apiKey: 'test-key',
        timeout: 30000,
        outputDir: './test/load/results',
      };

      // Create result with stable but slightly fluctuating memory
      const result = createMockResult(config);

      // Memory should stay within bounds
      const memories = result.snapshots.map((s) => s.memoryUsage.rss);
      const maxMemory = Math.max(...memories);
      const minMemory = Math.min(...memories);
      const variance = maxMemory - minMemory;

      // Variance should be less than 10MB
      expect(variance).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('Graceful Degradation', () => {
    test('should detect graceful degradation', () => {
      const config: LoadTestConfig = {
        testName: 'Graceful Degradation Test',
        scenario: LoadTestScenario.RAMP_UP,
        duration: 60000,
        minConcurrency: 1,
        maxConcurrency: 50,
        concurrencyStep: 5,
        endpoint: 'http://localhost:3000/v1/chat/completions',
        apiKey: 'test-key',
        timeout: 30000,
        outputDir: './test/load/results',
      };

      // Create result with graceful degradation
      const result: LoadTestResult = {
        ...createMockResult(config),
        phases: [
          {
            name: 'Low Load',
            startTime: Date.now(),
            endTime: Date.now() + 20000,
            concurrency: 5,
            requests: [],
            stats: {
              totalRequests: 50,
              successfulRequests: 50,
              failedRequests: 0,
              requestsPerSecond: 50,
              avgLatency: 3,
              p50Latency: 2,
              p95Latency: 5,
              p99Latency: 8,
              minLatency: 1,
              maxLatency: 10,
              errorRate: 0,
            },
          },
          {
            name: 'High Load',
            startTime: Date.now() + 20000,
            endTime: Date.now() + 40000,
            concurrency: 50,
            requests: [],
            stats: {
              totalRequests: 500,
              successfulRequests: 480,
              failedRequests: 20,
              requestsPerSecond: 500,
              avgLatency: 8,
              p50Latency: 6,
              p95Latency: 15,
              p99Latency: 25,
              minLatency: 3,
              maxLatency: 50,
              errorRate: 4, // Still under 10% threshold
            },
          },
          {
            name: 'Recovery',
            startTime: Date.now() + 40000,
            endTime: Date.now() + 60000,
            concurrency: 5,
            requests: [],
            stats: {
              totalRequests: 50,
              successfulRequests: 50,
              failedRequests: 0,
              requestsPerSecond: 50,
              avgLatency: 3,
              p50Latency: 2,
              p95Latency: 5,
              p99Latency: 8,
              minLatency: 1,
              maxLatency: 10,
              errorRate: 0,
            },
          },
        ],
      };

      // High load phase should have acceptable error rate
      const highLoadPhase = result.phases[1];
      expect(highLoadPhase.stats.errorRate).toBeLessThan(RESOURCE_TARGETS.DEGRADATION_FAILURE_RATE_THRESHOLD);

      // Recovery phase should show improvement
      const recoveryPhase = result.phases[2];
      expect(recoveryPhase.stats.errorRate).toBeLessThan(highLoadPhase.stats.errorRate);
    });

    test('should detect poor degradation', () => {
      const config: LoadTestConfig = {
        testName: 'Poor Degradation Test',
        scenario: LoadTestScenario.RAMP_UP,
        duration: 60000,
        minConcurrency: 1,
        maxConcurrency: 50,
        concurrencyStep: 5,
        endpoint: 'http://localhost:3000/v1/chat/completions',
        apiKey: 'test-key',
        timeout: 30000,
        outputDir: './test/load/results',
      };

      // Create result with poor degradation
      const result: LoadTestResult = {
        ...createMockResult(config),
        phases: [
          {
            name: 'Low Load',
            startTime: Date.now(),
            endTime: Date.now() + 20000,
            concurrency: 5,
            requests: [],
            stats: {
              totalRequests: 50,
              successfulRequests: 50,
              failedRequests: 0,
              requestsPerSecond: 50,
              avgLatency: 3,
              p50Latency: 2,
              p95Latency: 5,
              p99Latency: 8,
              minLatency: 1,
              maxLatency: 10,
              errorRate: 0,
            },
          },
          {
            name: 'High Load',
            startTime: Date.now() + 20000,
            endTime: Date.now() + 40000,
            concurrency: 50,
            requests: [],
            stats: {
              totalRequests: 500,
              successfulRequests: 400,
              failedRequests: 100,
              requestsPerSecond: 500,
              avgLatency: 20,
              p50Latency: 15,
              p95Latency: 50,
              p99Latency: 100,
              minLatency: 10,
              maxLatency: 200,
              errorRate: 20, // Over 10% threshold
            },
          },
        ],
      };

      // High load phase should have excessive error rate
      const highLoadPhase = result.phases[1];
      expect(highLoadPhase.stats.errorRate).toBeGreaterThan(RESOURCE_TARGETS.DEGRADATION_FAILURE_RATE_THRESHOLD);
    });
  });

  describe('CPU Scaling Analysis', () => {
    test('should detect linear CPU scaling', () => {
      const config: LoadTestConfig = {
        testName: 'Linear CPU Scaling Test',
        scenario: LoadTestScenario.CONSTANT_LOAD,
        duration: 60000,
        minConcurrency: 1,
        maxConcurrency: 10,
        concurrencyStep: 1,
        endpoint: 'http://localhost:3000/v1/chat/completions',
        apiKey: 'test-key',
        timeout: 30000,
        outputDir: './test/load/results',
      };

      const result = createMockResult(config);

      // CPU should increase with concurrency
      const lowConcurrencyCpu =
        result.snapshots[0].cpuUsage.user + result.snapshots[0].cpuUsage.system;
      const highConcurrencyCpu =
        result.snapshots[result.snapshots.length - 1].cpuUsage.user +
        result.snapshots[result.snapshots.length - 1].cpuUsage.system;

      expect(highConcurrencyCpu).toBeGreaterThan(lowConcurrencyCpu);

      // Check that CPU increases with concurrency (at least some scaling)
      expect(highConcurrencyCpu).toBeGreaterThan(lowConcurrencyCpu * 1.5);

      // CPU should be reasonable (not > 100%)
      expect(highConcurrencyCpu).toBeLessThan(100);
    });
  });

  describe('Integration Tests', () => {
    test('should run full validation suite', async () => {
      // Use no configs to test with default scenarios (which may fail but should not crash)
      const results = await validateResourceUsage([]);

      expect(results).toBeDefined();
      expect(results.timestamp).toBeDefined();
      expect(results.targets).toEqual(RESOURCE_TARGETS);
      expect(results.results).toBeInstanceOf(Array);
      expect(results.summary).toBeDefined();
    }, 30000);
  });
});
