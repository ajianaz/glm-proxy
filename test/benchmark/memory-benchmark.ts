/**
 * Memory benchmark tests for monitoring memory usage
 */

import type {
  BenchmarkConfig,
  MemoryResult,
  MemorySnapshot,
  CpuResult,
  CpuMeasurement,
} from './types.js';

const DEFAULT_ENDPOINT = 'http://localhost:3000/v1/chat/completions';
const DEFAULT_API_KEY = 'pk_test_benchmark_key';

/**
 * Capture a memory snapshot
 */
function captureMemorySnapshot(): MemorySnapshot {
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
 * Capture CPU usage snapshot
 */
function captureCpuSnapshot(): CpuMeasurement {
  const usage = process.cpuUsage();

  return {
    timestamp: new Date().toISOString(),
    usage: (usage.user + usage.system) / 1000000, // Convert to seconds
    userCpu: usage.user / 1000000,
    systemCpu: usage.system / 1000000,
  };
}

/**
 * Benchmark memory usage over time
 */
export async function benchmarkMemoryUsage(
  config: Partial<BenchmarkConfig> = {}
): Promise<MemoryResult> {
  const fullConfig: BenchmarkConfig = {
    iterations: config.iterations ?? 100,
    concurrency: config.concurrency ?? 10,
    warmupIterations: config.warmupIterations ?? 10,
    timeout: config.timeout ?? 30000,
    endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
    apiKey: config.apiKey ?? DEFAULT_API_KEY,
  };

  const snapshots: MemorySnapshot[] = [];
  const testPayload = {
    model: 'glm-4-plus',
    messages: [
      {
        role: 'user',
        content: 'Hello, this is a memory benchmark test.',
      },
    ],
    max_tokens: 10,
  };

  const startTime = Date.now();

  try {
    // Capture baseline memory before any requests
    snapshots.push(captureMemorySnapshot());

    // Warmup phase
    const warmupPromises: Promise<void>[] = [];
    for (let i = 0; i < fullConfig.warmupIterations; i++) {
      const promise = (async () => {
        try {
          await fetch(fullConfig.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${fullConfig.apiKey}`,
            },
            body: JSON.stringify(testPayload),
          });
        } catch {
          // Ignore warmup errors
        }
      })();
      warmupPromises.push(promise);
    }
    await Promise.all(warmupPromises);

    // Capture memory after warmup
    snapshots.push(captureMemorySnapshot());

    // Measurement phase - run requests and capture memory at intervals
    const totalBatches = Math.ceil(fullConfig.iterations / fullConfig.concurrency);
    let completedRequests = 0;

    for (let batch = 0; batch < totalBatches; batch++) {
      const batchSize = Math.min(
        fullConfig.concurrency,
        fullConfig.iterations - completedRequests
      );

      const batchPromises = Array.from({ length: batchSize }, async () => {
        try {
          await fetch(fullConfig.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${fullConfig.apiKey}`,
            },
            body: JSON.stringify(testPayload),
          });
          completedRequests++;
        } catch {
          completedRequests++;
        }
      });

      await Promise.all(batchPromises);

      // Capture memory after each batch
      snapshots.push(captureMemorySnapshot());

      // Force garbage collection if available (requires --expose-gc flag)
      if (global.gc) {
        global.gc();
        snapshots.push({
          ...captureMemorySnapshot(),
          timestamp: `${captureMemorySnapshot().timestamp} (after GC)`,
        });
      }
    }

    // Final memory snapshot
    snapshots.push(captureMemorySnapshot());

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Calculate statistics
    const heapUsedValues = snapshots.map((s) => s.heapUsed);
    const baseMemory = snapshots[0].heapUsed;
    const peakMemory = Math.max(...heapUsedValues);
    const memoryGrowth = peakMemory - baseMemory;
    const averageHeapUsed =
      heapUsedValues.reduce((a, b) => a + b, 0) / heapUsedValues.length;

    const stats = {
      baseMemory,
      peakMemory,
      memoryGrowth,
      averageHeapUsed,
    };

    return {
      name: 'Memory Usage Benchmark',
      timestamp: new Date().toISOString(),
      duration,
      metadata: {
        config: fullConfig,
        totalSnapshots: snapshots.length,
        gcAvailable: !!global.gc,
      },
      snapshots,
      stats,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Memory benchmark failed: ${errorMessage}`);
  }
}

/**
 * Benchmark CPU usage during load
 */
export async function benchmarkCpuUsage(
  config: Partial<BenchmarkConfig> = {}
): Promise<CpuResult> {
  const fullConfig: BenchmarkConfig = {
    iterations: config.iterations ?? 100,
    concurrency: config.concurrency ?? 10,
    warmupIterations: config.warmupIterations ?? 10,
    timeout: config.timeout ?? 30000,
    endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
    apiKey: config.apiKey ?? DEFAULT_API_KEY,
  };

  const measurements: CpuMeasurement[] = [];
  const testPayload = {
    model: 'glm-4-plus',
    messages: [
      {
        role: 'user',
        content: 'Hello, this is a CPU benchmark test.',
      },
    ],
    max_tokens: 10,
  };

  const startTime = Date.now();
  let lastCpuUsage = process.cpuUsage();

  try {
    // Warmup phase
    const warmupPromises: Promise<void>[] = [];
    for (let i = 0; i < fullConfig.warmupIterations; i++) {
      const promise = (async () => {
        try {
          await fetch(fullConfig.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${fullConfig.apiKey}`,
            },
            body: JSON.stringify(testPayload),
          });
        } catch {
          // Ignore warmup errors
        }
      })();
      warmupPromises.push(promise);
    }
    await Promise.all(warmupPromises);

    // Reset CPU usage tracking
    lastCpuUsage = process.cpuUsage();

    // Measurement phase
    const totalBatches = Math.ceil(fullConfig.iterations / fullConfig.concurrency);
    let completedRequests = 0;

    for (let batch = 0; batch < totalBatches; batch++) {
      const batchStartTime = process.cpuUsage();

      const batchSize = Math.min(
        fullConfig.concurrency,
        fullConfig.iterations - completedRequests
      );

      const batchPromises = Array.from({ length: batchSize }, async () => {
        try {
          await fetch(fullConfig.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${fullConfig.apiKey}`,
            },
            body: JSON.stringify(testPayload),
          });
          completedRequests++;
        } catch {
          completedRequests++;
        }
      });

      await Promise.all(batchPromises);

      // Measure CPU usage for this batch
      const cpuDelta = process.cpuUsage(lastCpuUsage);
      const batchDuration = process.cpuUsage(batchStartTime);
      const totalCpuTime = (cpuDelta.user + cpuDelta.system) / 1000000;
      const batchTime = (batchDuration.user + batchDuration.system) / 1000000;

      measurements.push({
        timestamp: new Date().toISOString(),
        usage: totalCpuTime,
        userCpu: cpuDelta.user / 1000000,
        systemCpu: cpuDelta.system / 1000000,
      });

      lastCpuUsage = process.cpuUsage();
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Calculate statistics
    const usageValues = measurements.map((m) => m.usage);
    const averageUsage =
      usageValues.reduce((a, b) => a + b, 0) / usageValues.length;
    const peakUsage = Math.max(...usageValues);

    const stats = {
      averageUsage,
      peakUsage,
    };

    return {
      name: 'CPU Usage Benchmark',
      timestamp: new Date().toISOString(),
      duration,
      metadata: {
        config: fullConfig,
        totalMeasurements: measurements.length,
      },
      measurements,
      stats,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`CPU benchmark failed: ${errorMessage}`);
  }
}

/**
 * Run all memory and CPU benchmarks
 */
export async function runMemoryBenchmarks(
  config: Partial<BenchmarkConfig> = {}
): Promise<{
  memory: MemoryResult;
  cpu: CpuResult;
}> {
  const results = {
    memory: await benchmarkMemoryUsage(config),
    cpu: await benchmarkCpuUsage(config),
  };

  return results;
}
