/**
 * Dashboard API Tests
 *
 * Tests for the dashboard API endpoints.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { getMetricsRegistry, resetMetricsRegistry } from '../src/metrics/Registry';

describe('Dashboard API', () => {
  beforeAll(() => {
    // Reset metrics registry before tests
    resetMetricsRegistry();
  });

  afterAll(() => {
    // Cleanup after tests
    resetMetricsRegistry();
  });

  describe('Metrics Registry', () => {
    it('should get system metrics', () => {
      const registry = getMetricsRegistry();
      const metrics = registry.collectSystemMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.requests).toBeDefined();
      expect(metrics.throughput).toBeDefined();
      expect(metrics.errors).toBeDefined();
      expect(metrics.resources).toBeDefined();
    });

    it('should export metrics as JSON', () => {
      const registry = getMetricsRegistry();
      const json = registry.exportAsJSON();

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(parsed).toBeDefined();
      expect(parsed.system).toBeDefined();
    });

    it('should export metrics as Prometheus', () => {
      const registry = getMetricsRegistry();
      const prometheus = registry.exportAsPrometheus();

      expect(typeof prometheus).toBe('string');
      expect(prometheus).toContain('HELP');
      expect(prometheus).toContain('TYPE');
    });

    it('should check if registry is enabled', () => {
      const registry = getMetricsRegistry();
      expect(registry.isEnabled()).toBe(true);
    });
  });

  describe('System Metrics Structure', () => {
    it('should have correct request metrics structure', () => {
      const registry = getMetricsRegistry();
      const metrics = registry.collectSystemMetrics();

      expect(metrics.requests).toHaveProperty('totalRequests');
      expect(metrics.requests).toHaveProperty('successfulRequests');
      expect(metrics.requests).toHaveProperty('failedRequests');
      expect(metrics.requests).toHaveProperty('requestRate');
      expect(metrics.requests).toHaveProperty('errorRate');
      expect(metrics.requests).toHaveProperty('p50');
      expect(metrics.requests).toHaveProperty('p95');
      expect(metrics.requests).toHaveProperty('p99');
    });

    it('should have correct throughput metrics structure', () => {
      const registry = getMetricsRegistry();
      const metrics = registry.collectSystemMetrics();

      expect(metrics.throughput).toHaveProperty('requestsPerSecond');
      expect(metrics.throughput).toHaveProperty('bytesPerSecond');
      expect(metrics.throughput).toHaveProperty('avgRequestSize');
      expect(metrics.throughput).toHaveProperty('avgResponseSize');
      expect(metrics.throughput).toHaveProperty('peakRequestsPerSecond');
    });

    it('should have correct resource metrics structure', () => {
      const registry = getMetricsRegistry();
      const metrics = registry.collectSystemMetrics();

      expect(metrics.resources).toHaveProperty('memoryUsageMB');
      expect(metrics.resources).toHaveProperty('peakMemoryUsageMB');
      expect(metrics.resources).toHaveProperty('memoryGrowthRate');
      expect(metrics.resources).toHaveProperty('memoryTrend');
      expect(metrics.resources).toHaveProperty('cpuUsagePercent');
      expect(metrics.resources).toHaveProperty('eventLoopLag');
    });
  });
});
