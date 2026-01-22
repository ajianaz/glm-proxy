/**
 * Benchmark framework tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { benchmarkLatency, benchmarkThroughput } from './proxy-benchmark.js';
import { benchmarkMemoryUsage, benchmarkCpuUsage } from './memory-benchmark.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('Benchmark Framework', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('benchmarkLatency', () => {
    it('should measure latency for successful requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (key: string) => {
            if (key === 'content-type') return 'application/json';
            return null;
          },
        },
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'Test response' } }],
            usage: { total_tokens: 10 },
          }),
      });

      const result = await benchmarkLatency({
        iterations: 5,
        warmupIterations: 2,
      });

      expect(result.name).toBe('Proxy Latency Benchmark');
      expect(result.measurements).toHaveLength(5);
      expect(result.stats.mean).toBeGreaterThan(0);
      expect(result.measurements[0].totalDuration).toBeGreaterThan(0);
      // Proxy overhead should be >= 0 (can be 0 in tests without upstream timing)
      expect(result.measurements[0].proxyOverhead).toBeGreaterThanOrEqual(0);
    });

    it('should handle mixed successful and failed requests', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount % 3 === 0) {
          throw new Error('Network error');
        }
        return {
          ok: true,
          status: 200,
          headers: {
            get: (key: string) => {
              if (key === 'content-type') return 'application/json';
              return null;
            },
          },
          text: async () =>
            JSON.stringify({
              choices: [{ message: { content: 'Test' } }],
            }),
        };
      });

      await expect(
        benchmarkLatency({
          iterations: 3,
          warmupIterations: 0,
        })
      ).rejects.toThrow();
    });
  });

  describe('benchmarkThroughput', () => {
    it('should measure throughput with concurrent requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: () => 'application/json',
        },
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'Test' } }],
          }),
      });

      const result = await benchmarkThroughput({
        iterations: 20,
        concurrency: 5,
        warmupIterations: 2,
      });

      expect(result.name).toBe('Proxy Throughput Benchmark');
      expect(result.measurements.length).toBeGreaterThan(0);
      expect(result.stats.totalRequests).toBe(20);
      expect(result.stats.meanRps).toBeGreaterThan(0);
    });

    it('should calculate success rate correctly', async () => {
      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        return {
          ok: callCount % 4 !== 0,
          status: callCount % 4 === 0 ? 500 : 200,
          headers: {
            get: () => 'application/json',
          },
          text: async () =>
            JSON.stringify({
              choices: [{ message: { content: 'Test' } }],
            }),
        };
      });

      const result = await benchmarkThroughput({
        iterations: 20,
        concurrency: 5,
        warmupIterations: 0,
      });

      expect(result.stats.totalErrors).toBeGreaterThan(0);
      expect(result.stats.overallSuccessRate).toBeLessThan(100);
      expect(result.stats.overallSuccessRate).toBeGreaterThan(0);
    });
  });

  describe('benchmarkMemoryUsage', () => {
    it('should capture memory snapshots', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: () => 'application/json',
        },
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'Test' } }],
          }),
      });

      const result = await benchmarkMemoryUsage({
        iterations: 10,
        concurrency: 2,
        warmupIterations: 2,
      });

      expect(result.name).toBe('Memory Usage Benchmark');
      expect(result.snapshots.length).toBeGreaterThan(0);
      expect(result.snapshots[0].heapUsed).toBeGreaterThan(0);
      expect(result.stats.baseMemory).toBeGreaterThan(0);
      expect(result.stats.peakMemory).toBeGreaterThan(0);
    });

    it('should track memory growth', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: () => 'application/json',
        },
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'Test' } }],
          }),
      });

      const result = await benchmarkMemoryUsage({
        iterations: 5,
        concurrency: 1,
        warmupIterations: 1,
      });

      expect(result.stats.memoryGrowth).toBeGreaterThanOrEqual(0);
      expect(result.stats.averageHeapUsed).toBeGreaterThan(0);
    });
  });

  describe('benchmarkCpuUsage', () => {
    it('should measure CPU usage during load', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: () => 'application/json',
        },
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'Test' } }],
          }),
      });

      const result = await benchmarkCpuUsage({
        iterations: 10,
        concurrency: 2,
        warmupIterations: 2,
      });

      expect(result.name).toBe('CPU Usage Benchmark');
      expect(result.measurements.length).toBeGreaterThan(0);
      expect(result.stats.averageUsage).toBeGreaterThanOrEqual(0);
      expect(result.measurements[0].usage).toBeGreaterThanOrEqual(0);
    });

    it('should track user and system CPU time', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: () => 'application/json',
        },
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'Test' } }],
          }),
      });

      const result = await benchmarkCpuUsage({
        iterations: 5,
        concurrency: 1,
        warmupIterations: 1,
      });

      expect(result.measurements[0].userCpu).toBeGreaterThanOrEqual(0);
      expect(result.measurements[0].systemCpu).toBeGreaterThanOrEqual(0);
    });
  });
});
