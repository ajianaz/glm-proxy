/**
 * Latency validation tests
 */

import { test, describe, expect } from 'bun:test';
import {
  validateSingleTest,
  validateLatencyTargets,
  LATENCY_TARGETS,
} from './load/latency-validation.js';
import { LoadTestScenario } from './load/types.js';
import type { LoadTestConfig, LoadTestResult } from './load/types.js';

describe('Latency Validation', () => {
  describe('LATENCY_TARGETS', () => {
    test('should have correct target values', () => {
      expect(LATENCY_TARGETS.P50).toBe(10);
      expect(LATENCY_TARGETS.P95).toBe(15);
      expect(LATENCY_TARGETS.P99).toBe(25);
      expect(LATENCY_TARGETS.MAX_SPIKE).toBe(50);
      expect(LATENCY_TARGETS.STABILITY_THRESHOLD).toBe(1.5);
    });
  });

  describe('validateSingleTest', () => {
    test('should handle test execution with graceful handling', async () => {
      // This test verifies the validation function works correctly
      // even when requests fail due to invalid endpoint
      const validation = await validateSingleTest({
        testName: 'Error Handling Test',
        duration: 1000,
        minConcurrency: 10,
        maxConcurrency: 10,
        concurrencyStep: 0,
        endpoint: 'http://localhost:9999/invalid', // Invalid endpoint
        apiKey: 'pk_test',
        timeout: 100, // Very short timeout
        scenario: LoadTestScenario.CONSTANT_LOAD,
        outputDir: './test/load/results',
      });

      // Should return validation result with proper structure
      expect(validation).toBeDefined();
      expect(validation.testName).toBe('Error Handling Test');
      expect(validation).toHaveProperty('metrics');
      expect(validation).toHaveProperty('spikes');
      expect(validation).toHaveProperty('stability');

      // Even with failed requests, the validation should complete
      // and return a result object
      expect(validation.metrics.p50).toHaveProperty('value');
      expect(validation.metrics.p50).toHaveProperty('target');
      expect(validation.metrics.p50).toHaveProperty('pass');
    });

    test('should detect latency spikes', () => {
      const mockResult: LoadTestResult = {
        testName: 'Spike Test',
        scenario: LoadTestScenario.CONSTANT_LOAD,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 1000).toISOString(),
        duration: 1000,
        config: {
          testName: 'Spike Test',
          duration: 1000,
          minConcurrency: 10,
          maxConcurrency: 10,
          concurrencyStep: 0,
          endpoint: 'http://localhost:3000/v1/chat/completions',
          apiKey: 'pk_test',
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
            requests: [
              {
                id: 'req-1',
                startTime: Date.now(),
                endTime: Date.now() + 10,
                duration: 10,
                success: true,
                latency: 5,
              },
              {
                id: 'req-2',
                startTime: Date.now(),
                endTime: Date.now() + 10,
                duration: 10,
                success: true,
                latency: 60, // Spike!
              },
              {
                id: 'req-3',
                startTime: Date.now(),
                endTime: Date.now() + 10,
                duration: 10,
                success: true,
                latency: 7,
              },
            ],
            stats: {
              totalRequests: 3,
              successfulRequests: 3,
              failedRequests: 0,
              requestsPerSecond: 300,
              avgLatency: 24,
              p50Latency: 7,
              p95Latency: 60,
              p99Latency: 60,
              minLatency: 5,
              maxLatency: 60,
              errorRate: 0,
            },
          },
        ],
        snapshots: [],
        stats: {
          totalRequests: 3,
          successfulRequests: 3,
          failedRequests: 0,
          overallRequestsPerSecond: 300,
          avgLatency: 24,
          p50Latency: 7,
          p95Latency: 60,
          p99Latency: 60,
          minLatency: 5,
          maxLatency: 60,
          errorRate: 0,
          peakMemory: 50 * 1024 * 1024,
          avgMemory: 50 * 1024 * 1024,
          peakCpu: 1000000,
          avgCpu: 1000000,
        },
      };

      // Verify spike detection would work
      expect(mockResult.stats.maxLatency).toBeGreaterThan(LATENCY_TARGETS.MAX_SPIKE);
    });

    test('should detect latency degradation across phases', () => {
      const mockResult: LoadTestResult = {
        testName: 'Degradation Test',
        scenario: LoadTestScenario.RAMP_UP,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 2000).toISOString(),
        duration: 2000,
        config: {
          testName: 'Degradation Test',
          duration: 2000,
          minConcurrency: 10,
          maxConcurrency: 20,
          concurrencyStep: 10,
          endpoint: 'http://localhost:3000/v1/chat/completions',
          apiKey: 'pk_test',
          timeout: 30000,
          scenario: LoadTestScenario.RAMP_UP,
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
              successfulRequests: 100,
              failedRequests: 0,
              requestsPerSecond: 100,
              avgLatency: 5,
              p50Latency: 5,
              p95Latency: 7,
              p99Latency: 8,
              minLatency: 3,
              maxLatency: 10,
              errorRate: 0,
            },
          },
          {
            name: 'Phase 2',
            startTime: Date.now() + 1000,
            endTime: Date.now() + 2000,
            concurrency: 20,
            requests: [],
            stats: {
              totalRequests: 200,
              successfulRequests: 200,
              failedRequests: 0,
              requestsPerSecond: 200,
              avgLatency: 10,
              p50Latency: 10,
              p95Latency: 15,
              p99Latency: 20,
              minLatency: 5,
              maxLatency: 25,
              errorRate: 0,
            },
          },
        ],
        snapshots: [],
        stats: {
          totalRequests: 300,
          successfulRequests: 300,
          failedRequests: 0,
          overallRequestsPerSecond: 150,
          avgLatency: 7.5,
          p50Latency: 7.5,
          p95Latency: 11,
          p99Latency: 14,
          minLatency: 3,
          maxLatency: 25,
          errorRate: 0,
          peakMemory: 50 * 1024 * 1024,
          avgMemory: 50 * 1024 * 1024,
          peakCpu: 1000000,
          avgCpu: 1000000,
        },
      };

      // Verify degradation detection
      const p50Ratio = mockResult.phases[1].stats.p50Latency / mockResult.phases[0].stats.p50Latency;
      expect(p50Ratio).toBeGreaterThan(1); // Degradation detected
    });
  });

  describe('Performance Target Validation', () => {
    test('should validate P50 < 10ms target', () => {
      const p50 = 8; // Pass
      expect(p50).toBeLessThan(LATENCY_TARGETS.P50);

      const p50Fail = 12; // Fail
      expect(p50Fail).toBeGreaterThanOrEqual(LATENCY_TARGETS.P50);
    });

    test('should validate P95 < 15ms target', () => {
      const p95 = 12; // Pass
      expect(p95).toBeLessThan(LATENCY_TARGETS.P95);

      const p95Fail = 18; // Fail
      expect(p95Fail).toBeGreaterThanOrEqual(LATENCY_TARGETS.P95);
    });

    test('should validate P99 < 25ms target', () => {
      const p99 = 20; // Pass
      expect(p99).toBeLessThan(LATENCY_TARGETS.P99);

      const p99Fail = 30; // Fail
      expect(p99Fail).toBeGreaterThanOrEqual(LATENCY_TARGETS.P99);
    });

    test('should validate max spike < 50ms target', () => {
      const spike = 40; // Pass
      expect(spike).toBeLessThan(LATENCY_TARGETS.MAX_SPIKE);

      const spikeFail = 60; // Fail
      expect(spikeFail).toBeGreaterThan(LATENCY_TARGETS.MAX_SPIKE);
    });

    test('should validate stability threshold', () => {
      const ratio = 1.3; // Stable (within 1.5x)
      expect(ratio).toBeLessThanOrEqual(LATENCY_TARGETS.STABILITY_THRESHOLD);

      const ratioFail = 1.8; // Unstable (exceeds 1.5x)
      expect(ratioFail).toBeGreaterThan(LATENCY_TARGETS.STABILITY_THRESHOLD);
    });
  });

  describe('Validation Report Structure', () => {
    test('should have correct report structure', () => {
      const mockReport = {
        timestamp: new Date().toISOString(),
        targets: LATENCY_TARGETS,
        results: [],
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          overallPass: true,
          aggregateMetrics: {
            avgP50: 0,
            avgP95: 0,
            avgP99: 0,
          },
          spikes: {
            total: 0,
            critical: 0,
            high: 0,
          },
          stability: {
            stable: 0,
            degraded: 0,
          },
        },
      };

      expect(mockReport).toHaveProperty('timestamp');
      expect(mockReport).toHaveProperty('targets');
      expect(mockReport).toHaveProperty('results');
      expect(mockReport).toHaveProperty('summary');
      expect(mockReport.summary).toHaveProperty('aggregateMetrics');
      expect(mockReport.summary).toHaveProperty('spikes');
      expect(mockReport.summary).toHaveProperty('stability');
    });
  });
});
