import { test, expect, describe } from 'bun:test';
import {
  runComparisonBenchmark,
  getLiteLLMBenchmarks,
  generateComparisonReport,
  type ComparisonResult,
} from '../test/benchmark/comparison';

describe('Comparison Benchmark', () => {
  test('should generate LiteLLM benchmarks', () => {
    const benchmarks = getLiteLLMBenchmarks();

    expect(benchmarks).toBeArray();
    expect(benchmarks.length).toBeGreaterThan(0);

    benchmarks.forEach((benchmark) => {
      expect(benchmark.name).toBeString();
      expect(benchmark.latencyMeanMs).toBeNumber();
      expect(benchmark.latencyP95Ms).toBeNumber();
      expect(benchmark.latencyP99Ms).toBeNumber();
      expect(benchmark.source).toBeString();
    });
  });

  test('should have LiteLLM OpenAI proxy benchmark', () => {
    const benchmarks = getLiteLLMBenchmarks();
    const openaiProxy = benchmarks.find((b) => b.name.includes('OpenAI'));

    expect(openaiProxy).toBeDefined();
    expect(openaiProxy?.latencyMeanMs).toBe(25);
    expect(openaiProxy?.latencyP95Ms).toBe(40);
    expect(openaiProxy?.latencyP99Ms).toBe(60);
  });

  test('should generate comparison report', () => {
    // Create a mock result
    const mockResult: ComparisonResult = {
      name: 'Test Comparison',
      timestamp: new Date().toISOString(),
      duration: 1000,
      config: {
        iterations: 10,
        concurrency: 1,
        warmupIterations: 2,
        timeout: 30000,
        endpoint: 'http://localhost:3000/v1/chat/completions',
        apiKey: 'test-key',
      },
      proxy: {
        latency: [],
        stats: {
          min: 10,
          max: 20,
          mean: 15,
          median: 15,
          p50: 15,
          p95: 18,
          p99: 19,
        },
      },
      direct: {
        latency: [],
        stats: {
          min: 5,
          max: 10,
          mean: 7,
          median: 7,
          p50: 7,
          p95: 9,
          p99: 10,
        },
      },
      overhead: {
        meanMs: 8,
        p95Ms: 9,
        p99Ms: 9,
        meanPercent: 114.29,
        p95Percent: 100,
        p99Percent: 90,
      },
      componentBreakdown: {
        authentication: { meanMs: 2, percentOfOverhead: 25 },
        rateLimiting: { meanMs: 1, percentOfOverhead: 12.5 },
        jsonProcessing: { meanMs: 2, percentOfOverhead: 25 },
        requestValidation: { meanMs: 1, percentOfOverhead: 12.5 },
        networkOverhead: { meanMs: 1, percentOfOverhead: 12.5 },
        other: { meanMs: 1, percentOfOverhead: 12.5 },
      },
    };

    const litellmBenchmarks = getLiteLLMBenchmarks();
    const report = generateComparisonReport(mockResult, litellmBenchmarks);

    expect(report).toBeString();
    expect(report).toContain('# Proxy vs Direct API Performance Comparison');
    expect(report).toContain('## Executive Summary');
    expect(report).toContain('## Proxy Overhead Breakdown by Component');
    expect(report).toContain('## Comparison with LiteLLM');
    expect(report).toContain('## Performance Assertions');
    expect(report).toContain('15.00ms'); // proxy mean
    expect(report).toContain('7.00ms'); // direct mean
    expect(report).toContain('8.00ms'); // overhead
  });

  test('should include performance assertions in report', () => {
    const mockResult: ComparisonResult = {
      name: 'Test Comparison',
      timestamp: new Date().toISOString(),
      duration: 1000,
      config: {
        iterations: 10,
        concurrency: 1,
        warmupIterations: 2,
        timeout: 30000,
        endpoint: 'http://localhost:3000/v1/chat/completions',
        apiKey: 'test-key',
      },
      proxy: {
        latency: [],
        stats: {
          min: 10,
          max: 20,
          mean: 15,
          median: 15,
          p50: 15,
          p95: 18,
          p99: 19,
        },
      },
      direct: {
        latency: [],
        stats: {
          min: 5,
          max: 10,
          mean: 7,
          median: 7,
          p50: 7,
          p95: 9,
          p99: 10,
        },
      },
      overhead: {
        meanMs: 8,
        p95Ms: 9,
        p99Ms: 9,
        meanPercent: 114.29,
        p95Percent: 100,
        p99Percent: 90,
      },
      componentBreakdown: {
        authentication: { meanMs: 2, percentOfOverhead: 25 },
        rateLimiting: { meanMs: 1, percentOfOverhead: 12.5 },
        jsonProcessing: { meanMs: 2, percentOfOverhead: 25 },
        requestValidation: { meanMs: 1, percentOfOverhead: 12.5 },
        networkOverhead: { meanMs: 1, percentOfOverhead: 12.5 },
        other: { meanMs: 1, percentOfOverhead: 12.5 },
      },
    };

    const report = generateComparisonReport(mockResult, []);

    expect(report).toContain('Mean Overhead < 10ms');
    expect(report).toContain('P95 Overhead < 15ms');
    expect(report).toContain('P99 Overhead < 25ms');

    // Since meanMs is 8 (< 10), it should pass
    expect(report).toContain('✅ PASS');
  });

  test('should show FAIL for assertions that do not meet targets', () => {
    const mockResult: ComparisonResult = {
      name: 'Test Comparison',
      timestamp: new Date().toISOString(),
      duration: 1000,
      config: {
        iterations: 10,
        concurrency: 1,
        warmupIterations: 2,
        timeout: 30000,
        endpoint: 'http://localhost:3000/v1/chat/completions',
        apiKey: 'test-key',
      },
      proxy: {
        latency: [],
        stats: {
          min: 50,
          max: 80,
          mean: 65,
          median: 65,
          p50: 65,
          p95: 75,
          p99: 78,
        },
      },
      direct: {
        latency: [],
        stats: {
          min: 5,
          max: 10,
          mean: 7,
          median: 7,
          p50: 7,
          p95: 9,
          p99: 10,
        },
      },
      overhead: {
        meanMs: 58, // > 10, should fail
        p95Ms: 66, // > 15, should fail
        p99Ms: 68, // > 25, should fail
        meanPercent: 828.57,
        p95Percent: 733.33,
        p99Percent: 680,
      },
      componentBreakdown: {
        authentication: { meanMs: 10, percentOfOverhead: 17.24 },
        rateLimiting: { meanMs: 10, percentOfOverhead: 17.24 },
        jsonProcessing: { meanMs: 10, percentOfOverhead: 17.24 },
        requestValidation: { meanMs: 10, percentOfOverhead: 17.24 },
        networkOverhead: { meanMs: 10, percentOfOverhead: 17.24 },
        other: { meanMs: 8, percentOfOverhead: 13.8 },
      },
    };

    const report = generateComparisonReport(mockResult, []);

    // Should show FAIL for all assertions
    expect(report).toContain('❌ FAIL');
  });

  test('should generate component bar chart', () => {
    const mockResult: ComparisonResult = {
      name: 'Test Comparison',
      timestamp: new Date().toISOString(),
      duration: 1000,
      config: {
        iterations: 10,
        concurrency: 1,
        warmupIterations: 2,
        timeout: 30000,
        endpoint: 'http://localhost:3000/v1/chat/completions',
        apiKey: 'test-key',
      },
      proxy: {
        latency: [],
        stats: {
          min: 10,
          max: 20,
          mean: 15,
          median: 15,
          p50: 15,
          p95: 18,
          p99: 19,
        },
      },
      direct: {
        latency: [],
        stats: {
          min: 5,
          max: 10,
          mean: 7,
          median: 7,
          p50: 7,
          p95: 9,
          p99: 10,
        },
      },
      overhead: {
        meanMs: 8,
        p95Ms: 9,
        p99Ms: 9,
        meanPercent: 114.29,
        p95Percent: 100,
        p99Percent: 90,
      },
      componentBreakdown: {
        authentication: { meanMs: 2, percentOfOverhead: 25 },
        rateLimiting: { meanMs: 1, percentOfOverhead: 12.5 },
        jsonProcessing: { meanMs: 2, percentOfOverhead: 25 },
        requestValidation: { meanMs: 1, percentOfOverhead: 12.5 },
        networkOverhead: { meanMs: 1, percentOfOverhead: 12.5 },
        other: { meanMs: 1, percentOfOverhead: 12.5 },
      },
    };

    const report = generateComparisonReport(mockResult, []);

    expect(report).toContain('### Component Overhead Visualization');
    expect(report).toContain('Authentication');
    expect(report).toContain('Rate Limiting');
    expect(report).toContain('JSON Processing');
  });
});
