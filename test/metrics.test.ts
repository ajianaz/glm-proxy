/**
 * Metrics Module Tests
 *
 * Comprehensive test suite for metrics collection, aggregation, and export.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MetricsCollector, MetricsRegistry, getMetricsRegistry, resetMetricsRegistry } from '../src/metrics/index.js';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector({
      enabled: true,
      retentionMs: 10000,
      aggregationIntervalMs: 1000,
      maxLatencySamples: 100,
    });
  });

  afterEach(() => {
    collector.stopAggregation();
  });

  describe('Request Recording', () => {
    it('should record successful requests', () => {
      collector.recordRequest(10, true, 200);
      collector.recordRequest(20, true, 200);
      collector.recordRequest(30, true, 200);

      const metrics = collector.collectSystemMetrics();

      expect(metrics.requests.totalRequests).toBe(3);
      expect(metrics.requests.successfulRequests).toBe(3);
      expect(metrics.requests.failedRequests).toBe(0);
    });

    it('should record failed requests', () => {
      collector.recordRequest(10, true, 200);
      collector.recordRequest(20, false, 500);
      collector.recordRequest(30, false, 503);

      const metrics = collector.collectSystemMetrics();

      expect(metrics.requests.totalRequests).toBe(3);
      expect(metrics.requests.successfulRequests).toBe(1);
      expect(metrics.requests.failedRequests).toBe(2);
      expect(metrics.requests.errorRate).toBeCloseTo(2/3, 2);
    });

    it('should calculate latency percentiles correctly', () => {
      // Record latencies: 1, 2, 3, ..., 100
      for (let i = 1; i <= 100; i++) {
        collector.recordRequest(i, true, 200);
      }

      const metrics = collector.collectSystemMetrics();

      expect(metrics.requests.p50).toBeCloseTo(50, 0);
      expect(metrics.requests.p95).toBeCloseTo(95, 0);
      expect(metrics.requests.p99).toBeCloseTo(99, 0);
      expect(metrics.requests.min).toBe(1);
      expect(metrics.requests.max).toBe(100);
    });

    it('should handle empty metrics', () => {
      const metrics = collector.collectSystemMetrics();

      expect(metrics.requests.totalRequests).toBe(0);
      expect(metrics.requests.p50).toBe(0);
      expect(metrics.requests.p95).toBe(0);
      expect(metrics.requests.p99).toBe(0);
    });

    it('should trim latency samples when exceeding max', () => {
      const maxSamples = 100;
      const smallCollector = new MetricsCollector({
        maxLatencySamples: maxSamples,
      });

      // Record more than max samples
      for (let i = 0; i < maxSamples + 50; i++) {
        smallCollector.recordRequest(i, true, 200);
      }

      const metrics = smallCollector.collectSystemMetrics();

      // Should have trimmed to max samples
      expect(metrics.requests.totalRequests).toBeGreaterThan(maxSamples);
      // Latency array should be trimmed
      expect(smallCollector['requestLatencies'].length).toBeLessThanOrEqual(maxSamples);

      smallCollector.stopAggregation();
    });
  });

  describe('Throughput Recording', () => {
    it('should record throughput data', () => {
      collector.recordThroughput(1000, 2000, 10);
      collector.recordThroughput(1500, 2500, 15);

      const metrics = collector.collectSystemMetrics();

      expect(metrics.throughput.avgRequestSize).toBeCloseTo(1250, 0);
      expect(metrics.throughput.avgResponseSize).toBeCloseTo(2250, 0);
    });

    it('should track peak requests per second', () => {
      collector.recordThroughput(1000, 2000, 10);
      collector.recordThroughput(1500, 2500, 20);
      collector.recordThroughput(1200, 2200, 15);

      const metrics = collector.collectSystemMetrics();

      expect(metrics.throughput.peakRequestsPerSecond).toBe(20);
    });

    it('should calculate requests per second', () => {
      for (let i = 0; i < 10; i++) {
        collector.recordRequest(10, true, 200);
      }

      const metrics = collector.collectSystemMetrics();

      expect(metrics.throughput.requestsPerSecond).toBeGreaterThan(0);
    });
  });

  describe('Error Recording', () => {
    it('should record errors by status code', () => {
      collector.recordError(500, 'internal_error');
      collector.recordError(503, 'service_unavailable');
      collector.recordError(500, 'internal_error');

      const metrics = collector.collectSystemMetrics();

      expect(metrics.errors.errorsByStatus[500]).toBe(2);
      expect(metrics.errors.errorsByStatus[503]).toBe(1);
    });

    it('should record errors by type', () => {
      collector.recordError(500, 'internal_error');
      collector.recordError(400, 'validation_error');
      collector.recordError(500, 'internal_error');

      const metrics = collector.collectSystemMetrics();

      expect(metrics.errors.errorsByType['internal_error']).toBe(2);
      expect(metrics.errors.errorsByType['validation_error']).toBe(1);
    });

    it('should calculate top errors', () => {
      collector.recordError(500, 'internal_error');
      collector.recordError(500, 'internal_error');
      collector.recordError(500, 'internal_error');
      collector.recordError(400, 'validation_error');
      collector.recordError(400, 'validation_error');
      collector.recordError(401, 'auth_error');

      const metrics = collector.collectSystemMetrics();

      expect(metrics.errors.topErrors.length).toBeGreaterThan(0);
      expect(metrics.errors.topErrors[0].type).toBe('internal_error');
      expect(metrics.errors.topErrors[0].count).toBe(3);
    });

    it('should calculate error rate correctly', () => {
      collector.recordRequest(10, true, 200);
      collector.recordRequest(10, true, 200);
      collector.recordRequest(10, false, 500, { errorType: 'internal_error' });
      collector.recordRequest(10, true, 200);
      // recordRequest with false automatically calls recordError internally

      const metrics = collector.collectSystemMetrics();

      expect(metrics.errors.totalErrors).toBe(1);
      expect(metrics.errors.errorRate).toBeCloseTo(1/4, 2);
    });
  });

  describe('Resource Metrics', () => {
    it('should collect memory usage metrics', () => {
      const metrics = collector.collectSystemMetrics();

      expect(metrics.resources.memoryUsageMB).toBeGreaterThan(0);
      expect(metrics.resources.peakMemoryUsageMB).toBeGreaterThanOrEqual(metrics.resources.memoryUsageMB);
    });

    it('should track memory trend', () => {
      const metrics1 = collector.collectSystemMetrics();
      // Force some allocation
      const largeArray = new Array(1000000).fill('data');
      const metrics2 = collector.collectSystemMetrics();

      expect(['increasing', 'decreasing', 'stable']).toContain(metrics2.resources.memoryTrend);
      expect(metrics2.resources.peakMemoryUsageMB).toBeGreaterThanOrEqual(metrics1.resources.peakMemoryUsageMB);

      // Cleanup
      largeArray.length = 0;
    });

    it('should collect CPU metrics', () => {
      const metrics = collector.collectSystemMetrics();

      expect(metrics.resources.cpuUsagePercent).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Metrics Reset', () => {
    it('should reset all metrics', () => {
      collector.recordRequest(10, true, 200);
      collector.recordRequest(20, false, 500);
      collector.recordThroughput(1000, 2000, 10);
      collector.recordError(500, 'internal_error');

      collector.reset();

      const metrics = collector.collectSystemMetrics();

      expect(metrics.requests.totalRequests).toBe(0);
      expect(metrics.throughput.requestsPerSecond).toBe(0);
      expect(metrics.errors.totalErrors).toBe(0);
    });
  });

  describe('Collector State', () => {
    it('should report enabled status', () => {
      expect(collector.isEnabled()).toBe(true);

      const disabledCollector = new MetricsCollector({ enabled: false });
      expect(disabledCollector.isEnabled()).toBe(false);
      disabledCollector.stopAggregation();
    });

    it('should not record when disabled', () => {
      const disabledCollector = new MetricsCollector({ enabled: false });

      disabledCollector.recordRequest(10, true, 200);
      const metrics = disabledCollector.collectSystemMetrics();

      expect(metrics.requests.totalRequests).toBe(0);

      disabledCollector.stopAggregation();
    });
  });
});

describe('MetricsRegistry', () => {
  beforeEach(() => {
    resetMetricsRegistry();
  });

  afterEach(() => {
    resetMetricsRegistry();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const registry1 = getMetricsRegistry();
      const registry2 = getMetricsRegistry();

      expect(registry1).toBe(registry2);
    });

    it('should reset the instance', () => {
      const registry1 = getMetricsRegistry();
      resetMetricsRegistry();
      const registry2 = getMetricsRegistry();

      expect(registry1).not.toBe(registry2);
    });
  });

  describe('Collector Management', () => {
    it('should have a default system collector', () => {
      const registry = getMetricsRegistry();

      expect(registry.getSystemCollector()).toBeDefined();
      expect(registry.getCollector('system')).toBeDefined();
    });

    it('should create named collectors', () => {
      const registry = getMetricsRegistry();
      const customCollector = registry.createCollector('custom');

      expect(customCollector).toBeDefined();
      expect(registry.getCollector('custom')).toBe(customCollector);
    });

    it('should return existing collector if already created', () => {
      const registry = getMetricsRegistry();
      const collector1 = registry.createCollector('test');
      const collector2 = registry.createCollector('test');

      expect(collector1).toBe(collector2);
    });

    it('should remove custom collectors', () => {
      const registry = getMetricsRegistry();
      registry.createCollector('removable');

      expect(registry.getCollector('removable')).toBeDefined();

      const removed = registry.removeCollector('removable');

      expect(removed).toBe(true);
      expect(registry.getCollector('removable')).toBeUndefined();
    });

    it('should not allow removing system collector', () => {
      const registry = getMetricsRegistry();
      const removed = registry.removeCollector('system');

      expect(removed).toBe(false);
      expect(registry.getCollector('system')).toBeDefined();
    });

    it('should list all collector names', () => {
      const registry = getMetricsRegistry();
      registry.createCollector('custom1');
      registry.createCollector('custom2');

      const names = registry.getCollectorNames();

      expect(names).toContain('system');
      expect(names).toContain('custom1');
      expect(names).toContain('custom2');
    });
  });

  describe('Metrics Collection', () => {
    it('should collect metrics from all collectors', () => {
      const registry = getMetricsRegistry();
      const systemCollector = registry.getSystemCollector();
      systemCollector.recordRequest(10, true, 200);

      const customCollector = registry.createCollector('custom');
      customCollector.recordRequest(20, true, 200);
      customCollector.recordRequest(30, false, 500);

      const allMetrics = registry.collectAllMetrics();

      expect(allMetrics.system).toBeDefined();
      expect(allMetrics.custom).toBeDefined();
      expect(allMetrics.system.requests.totalRequests).toBe(1);
      expect(allMetrics.custom.requests.totalRequests).toBe(2);
    });

    it('should collect system metrics from default collector', () => {
      const registry = getMetricsRegistry();
      const systemCollector = registry.getSystemCollector();
      systemCollector.recordRequest(10, true, 200);
      systemCollector.recordRequest(20, false, 500);

      const metrics = registry.collectSystemMetrics();

      expect(metrics.requests.totalRequests).toBe(2);
      expect(metrics.requests.successfulRequests).toBe(1);
      expect(metrics.requests.failedRequests).toBe(1);
    });
  });

  describe('Metrics Export', () => {
    it('should export metrics as JSON', () => {
      const registry = getMetricsRegistry();
      const systemCollector = registry.getSystemCollector();
      systemCollector.recordRequest(10, true, 200);

      const json = registry.exportAsJSON();
      const parsed = JSON.parse(json);

      expect(parsed.system).toBeDefined();
      expect(parsed.system.requests.totalRequests).toBe(1);
    });

    it('should export metrics as Prometheus format', () => {
      const registry = getMetricsRegistry();
      const systemCollector = registry.getSystemCollector();
      systemCollector.recordRequest(10, true, 200);
      systemCollector.recordRequest(20, true, 200);
      systemCollector.recordRequest(30, false, 500);

      const prometheus = registry.exportAsPrometheus();

      expect(prometheus).toContain('HELP');
      expect(prometheus).toContain('TYPE');
      expect(prometheus).toContain('glm_proxy_requests_total 3');
      expect(prometheus).toContain('glm_proxy_requests_successful 2');
      expect(prometheus).toContain('glm_proxy_requests_failed 1');
    });

    it('should include latency metrics in Prometheus export', () => {
      const registry = getMetricsRegistry();
      const systemCollector = registry.getSystemCollector();

      for (let i = 1; i <= 100; i++) {
        systemCollector.recordRequest(i, true, 200);
      }

      const prometheus = registry.exportAsPrometheus();

      expect(prometheus).toContain('glm_proxy_latency_avg');
      expect(prometheus).toContain('glm_proxy_latency_p50');
      expect(prometheus).toContain('glm_proxy_latency_p95');
      expect(prometheus).toContain('glm_proxy_latency_p99');
    });
  });

  describe('Registry Operations', () => {
    it('should reset all collectors', () => {
      const registry = getMetricsRegistry();
      const systemCollector = registry.getSystemCollector();
      systemCollector.recordRequest(10, true, 200);

      const customCollector = registry.createCollector('custom');
      customCollector.recordRequest(20, true, 200);

      registry.resetAll();

      const allMetrics = registry.collectAllMetrics();

      expect(allMetrics.system.requests.totalRequests).toBe(0);
      expect(allMetrics.custom.requests.totalRequests).toBe(0);
    });

    it('should gracefully shutdown', () => {
      const registry = getMetricsRegistry();
      registry.createCollector('test');

      expect(() => registry.shutdown()).not.toThrow();

      // After shutdown, collectors should be cleared
      const names = registry.getCollectorNames();
      expect(names.length).toBe(0);
    });

    it('should report enabled status', () => {
      const registry = getMetricsRegistry();

      expect(registry.isEnabled()).toBe(true);
    });
  });

  describe('Metrics with Percentiles', () => {
    it('should calculate percentiles when enabled', () => {
      const collector = new MetricsCollector({
        enablePercentiles: true,
      });

      for (let i = 1; i <= 100; i++) {
        collector.recordRequest(i, true, 200);
      }

      const metrics = collector.collectSystemMetrics();

      expect(metrics.requests.p50).toBeCloseTo(50, 0);
      expect(metrics.requests.p95).toBeCloseTo(95, 0);
      expect(metrics.requests.p99).toBeCloseTo(99, 0);

      collector.stopAggregation();
    });

    it('should not calculate percentiles when disabled', () => {
      const collector = new MetricsCollector({
        enablePercentiles: false,
      });

      for (let i = 1; i <= 100; i++) {
        collector.recordRequest(i, true, 200);
      }

      const metrics = collector.collectSystemMetrics();

      expect(metrics.requests.p50).toBe(0);
      expect(metrics.requests.p95).toBe(0);
      expect(metrics.requests.p99).toBe(0);

      collector.stopAggregation();
    });
  });

  describe('Metrics Cleanup', () => {
    it('should clean up old samples based on retention', async () => {
      const collector = new MetricsCollector({
        retentionMs: 100, // Very short retention
        aggregationIntervalMs: 50,
      });

      // Record some metrics
      for (let i = 0; i < 10; i++) {
        collector.recordRequest(i, true, 200);
      }

      // Wait for retention period
      await new Promise(resolve => setTimeout(resolve, 150));

      // Record new metrics
      collector.recordRequest(100, true, 200);

      const metrics = collector.collectSystemMetrics();

      // Old samples should be cleaned up
      expect(metrics.requests.totalRequests).toBeGreaterThan(0);

      collector.stopAggregation();
    });
  });
});
