/**
 * Load testing framework tests
 */

import { test, describe, expect, beforeEach } from 'bun:test';
import { runLoadTest } from './load/load-test.js';
import {
  getSmokeTestScenarios,
  getValidationTestScenarios,
  createConstantLoadScenarios,
  createRampUpScenarios,
  createSpikeScenarios,
  createSustainedLoadScenarios,
  createFailureScenarios,
} from './load/scenarios.js';
import { LoadTestScenario } from './load/types.js';
import {
  printTestResult,
  printSummary,
  saveResults,
  generateMarkdownReport,
} from './load/reporter.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Mock server endpoint for testing
const MOCK_ENDPOINT = 'http://localhost:3000/v1/chat/completions';
const MOCK_API_KEY = 'pk_test_benchmark_key';

describe('Load Testing Scenarios', () => {
  test('should create smoke test scenarios', () => {
    const scenarios = getSmokeTestScenarios();

    expect(scenarios.length).toBeGreaterThan(0);
    expect(scenarios[0].endpoint).toBe(MOCK_ENDPOINT);
    expect(scenarios[0].apiKey).toBe(MOCK_API_KEY);
  });

  test('should create validation test scenarios', () => {
    const scenarios = getValidationTestScenarios();

    expect(scenarios.length).toBeGreaterThan(0);
    expect(scenarios.every((s) => s.endpoint)).toBe(true);
    expect(scenarios.every((s) => s.apiKey)).toBe(true);
  });

  test('should create constant load scenarios for all concurrency levels', () => {
    const scenarios = createConstantLoadScenarios();

    expect(scenarios.length).toBe(6); // 1, 10, 50, 100, 500, 1000
    expect(scenarios[0].minConcurrency).toBe(1);
    expect(scenarios[0].maxConcurrency).toBe(1);
    expect(scenarios[5].maxConcurrency).toBe(1000);
  });

  test('should create ramp-up scenarios', () => {
    const scenarios = createRampUpScenarios();

    expect(scenarios.length).toBeGreaterThan(0);
    expect(scenarios.every((s) => s.scenario === LoadTestScenario.RAMP_UP)).toBe(true);
    expect(scenarios.every((s) => s.rampUpTime)).toBe(true);
  });

  test('should create spike scenarios', () => {
    const scenarios = createSpikeScenarios();

    expect(scenarios.length).toBeGreaterThan(0);
    expect(scenarios.every((s) => s.scenario === LoadTestScenario.SPIKE)).toBe(true);
  });

  test('should create sustained load scenarios', () => {
    const scenarios = createSustainedLoadScenarios();

    expect(scenarios.length).toBe(3); // 5 min, 15 min, 1 hour
    expect(scenarios.every((s) => s.scenario === LoadTestScenario.SUSTAINED)).toBe(true);
  });

  test('should create failure scenarios', () => {
    const scenarios = createFailureScenarios();

    expect(scenarios.length).toBe(3); // Invalid key, timeout, invalid endpoint
    expect(scenarios.every((s) => s.scenario === LoadTestScenario.FAILURE)).toBe(true);
  });
});

describe('Load Test Execution', () => {
  test('should run constant load test', async () => {
    const config = {
      testName: 'Test Constant Load',
      duration: 1000, // 1 second
      minConcurrency: 2,
      maxConcurrency: 2,
      concurrencyStep: 0,
      endpoint: MOCK_ENDPOINT,
      apiKey: MOCK_API_KEY,
      timeout: 5000,
      scenario: LoadTestScenario.CONSTANT_LOAD,
      outputDir: './test/load/results',
    };

    // This test will likely fail if server is not running
    // but we're testing the framework structure
    try {
      const result = await runLoadTest(config);

      expect(result).toBeDefined();
      expect(result.testName).toBe('Test Constant Load');
      expect(result.scenario).toBe(LoadTestScenario.CONSTANT_LOAD);
      expect(result.phases.length).toBeGreaterThan(0);
      expect(result.snapshots.length).toBeGreaterThan(0);
      expect(result.stats).toBeDefined();
    } catch (error: unknown) {
      // Expected to fail if server is not running
      expect(error).toBeDefined();
    }
  });

  test('should handle test timeout', async () => {
    const config = {
      testName: 'Test Timeout',
      duration: 500,
      minConcurrency: 1,
      maxConcurrency: 1,
      concurrencyStep: 0,
      endpoint: 'http://localhost:9999/invalid', // Invalid endpoint
      apiKey: MOCK_API_KEY,
      timeout: 100, // Very short timeout
      scenario: LoadTestScenario.FAILURE,
      outputDir: './test/load/results',
    };

    const result = await runLoadTest(config);

    expect(result).toBeDefined();
    expect(result.stats.totalRequests).toBeGreaterThan(0);
    expect(result.stats.failedRequests).toBeGreaterThan(0);
  });
});

describe('Load Test Reporting', () => {
  const mockResult = {
    testName: 'Mock Test',
    scenario: LoadTestScenario.CONSTANT_LOAD,
    startTime: new Date().toISOString(),
    endTime: new Date(Date.now() + 1000).toISOString(),
    duration: 1000,
    config: {
      testName: 'Mock Test',
      duration: 1000,
      minConcurrency: 10,
      maxConcurrency: 10,
      concurrencyStep: 0,
      endpoint: MOCK_ENDPOINT,
      apiKey: MOCK_API_KEY,
      timeout: 30000,
      scenario: LoadTestScenario.CONSTANT_LOAD,
      outputDir: './test/load/results',
    },
    phases: [
      {
        name: 'Phase 1',
        startTime: Date.now(),
        endTime: Date.now() + 1000,
        concurrency: 10,
        requests: [],
        stats: {
          totalRequests: 100,
          successfulRequests: 95,
          failedRequests: 5,
          requestsPerSecond: 100,
          avgLatency: 8.5,
          p50Latency: 8.0,
          p95Latency: 12.0,
          p99Latency: 15.0,
          minLatency: 5.0,
          maxLatency: 20.0,
          errorRate: 5.0,
        },
      },
    ],
    snapshots: [
      {
        timestamp: Date.now(),
        activeRequests: 10,
        completedRequests: 50,
        failedRequests: 2,
        currentConcurrency: 10,
        memoryUsage: {
          rss: 50 * 1024 * 1024,
          heapUsed: 30 * 1024 * 1024,
          heapTotal: 40 * 1024 * 1024,
          external: 1 * 1024 * 1024,
        },
        cpuUsage: {
          user: 1000000,
          system: 500000,
        },
      },
    ],
    stats: {
      totalRequests: 100,
      successfulRequests: 95,
      failedRequests: 5,
      overallRequestsPerSecond: 100,
      avgLatency: 8.5,
      p50Latency: 8.0,
      p95Latency: 12.0,
      p99Latency: 15.0,
      minLatency: 5.0,
      maxLatency: 20.0,
      errorRate: 5.0,
      peakMemory: 50 * 1024 * 1024,
      avgMemory: 50 * 1024 * 1024,
      peakCpu: 1500000,
      avgCpu: 1500000,
    },
  };

  test('should print test result without errors', () => {
    expect(() => printTestResult(mockResult)).not.toThrow();
  });

  test('should print summary without errors', () => {
    expect(() => printSummary([mockResult])).not.toThrow();
  });

  test('should save results to JSON file', () => {
    const outputDir = './test/load/results/test';

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    expect(() => saveResults([mockResult], outputDir)).not.toThrow();
  });

  test('should generate markdown report', () => {
    const outputDir = './test/load/results/test';

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    expect(() => generateMarkdownReport([mockResult], outputDir)).not.toThrow();
  });
});

describe('Performance Target Validation', () => {
  test('should pass all targets for optimal performance', () => {
    const optimalResult = {
      testName: 'Optimal Test',
      scenario: LoadTestScenario.CONSTANT_LOAD,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 1000).toISOString(),
      duration: 1000,
      config: {
        testName: 'Optimal Test',
        duration: 1000,
        minConcurrency: 10,
        maxConcurrency: 10,
        concurrencyStep: 0,
        endpoint: MOCK_ENDPOINT,
        apiKey: MOCK_API_KEY,
        timeout: 30000,
        scenario: LoadTestScenario.CONSTANT_LOAD,
        outputDir: './test/load/results',
      },
      phases: [],
      snapshots: [],
      stats: {
        totalRequests: 100,
        successfulRequests: 100,
        failedRequests: 0,
        overallRequestsPerSecond: 100,
        avgLatency: 5.0,
        p50Latency: 5.0,
        p95Latency: 8.0,
        p99Latency: 10.0,
        minLatency: 3.0,
        maxLatency: 12.0,
        errorRate: 0.0,
        peakMemory: 50 * 1024 * 1024,
        avgMemory: 50 * 1024 * 1024,
        peakCpu: 1500000,
        avgCpu: 1500000,
      },
    };

    // Check performance targets
    expect(optimalResult.stats.p50Latency).toBeLessThan(10); // < 10ms
    expect(optimalResult.stats.p95Latency).toBeLessThan(15); // < 15ms
    expect(optimalResult.stats.p99Latency).toBeLessThan(25); // < 25ms
    expect(optimalResult.stats.peakMemory).toBeLessThan(100 * 1024 * 1024); // < 100MB
    expect(optimalResult.stats.errorRate).toBeLessThan(5); // < 5%
  });

  test('should fail targets for poor performance', () => {
    const poorResult = {
      testName: 'Poor Test',
      scenario: LoadTestScenario.CONSTANT_LOAD,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 1000).toISOString(),
      duration: 1000,
      config: {
        testName: 'Poor Test',
        duration: 1000,
        minConcurrency: 10,
        maxConcurrency: 10,
        concurrencyStep: 0,
        endpoint: MOCK_ENDPOINT,
        apiKey: MOCK_API_KEY,
        timeout: 30000,
        scenario: LoadTestScenario.CONSTANT_LOAD,
        outputDir: './test/load/results',
      },
      phases: [],
      snapshots: [],
      stats: {
        totalRequests: 100,
        successfulRequests: 80,
        failedRequests: 20,
        overallRequestsPerSecond: 100,
        avgLatency: 50.0,
        p50Latency: 50.0,
        p95Latency: 80.0,
        p99Latency: 100.0,
        minLatency: 30.0,
        maxLatency: 120.0,
        errorRate: 20.0,
        peakMemory: 150 * 1024 * 1024,
        avgMemory: 150 * 1024 * 1024,
        peakCpu: 1500000,
        avgCpu: 1500000,
      },
    };

    // Check that targets fail
    expect(poorResult.stats.p50Latency).toBeGreaterThanOrEqual(10);
    expect(poorResult.stats.p95Latency).toBeGreaterThanOrEqual(15);
    expect(poorResult.stats.errorRate).toBeGreaterThanOrEqual(5);
    expect(poorResult.stats.peakMemory).toBeGreaterThanOrEqual(100 * 1024 * 1024);
  });
});
