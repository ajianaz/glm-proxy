/**
 * Proxy benchmark tests for measuring latency and throughput
 */

import type {
  BenchmarkConfig,
  LatencyResult,
  LatencyMeasurement,
  ThroughputResult,
  ThroughputMeasurement,
} from './types.js';

const DEFAULT_ENDPOINT = 'http://localhost:3000/v1/chat/completions';
const DEFAULT_API_KEY = 'pk_test_benchmark_key';

/**
 * Calculate statistics from an array of numbers
 */
function calculateStats(values: number[]) {
  if (values.length === 0) {
    return {
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;

  const getPercentile = (p: number) => {
    const index = Math.floor((p / 100) * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)];
  };

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median: sorted[Math.floor(sorted.length / 2)],
    p50: getPercentile(50),
    p95: getPercentile(95),
    p99: getPercentile(99),
  };
}

/**
 * Measure end-to-end latency for a single request
 */
async function measureSingleRequestLatency(
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>
): Promise<LatencyMeasurement> {
  const startTime = performance.now();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const endTime = performance.now();
    const totalDuration = endTime - startTime;

    // Extract timing information from response headers if available
    const upstreamTiming = response.headers.get('X-Upstream-Duration');
    const upstreamDuration = upstreamTiming
      ? parseFloat(upstreamTiming)
      : 0;

    // Calculate proxy overhead
    // If upstream timing is not available, proxy overhead equals total duration
    // Otherwise, calculate the difference
    let proxyOverhead: number;
    if (upstreamTiming && upstreamDuration > 0) {
      proxyOverhead = Math.max(0, totalDuration - upstreamDuration);
    } else {
      proxyOverhead = totalDuration; // No upstream timing, so all time is overhead
    }

    return {
      totalDuration,
      proxyOverhead,
      upstreamDuration,
      timestamp: new Date().toISOString(),
    };
  } catch (error: unknown) {
    const endTime = performance.now();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    throw new Error(`Request failed: ${errorMessage}`);
  }
}

/**
 * Benchmark request latency
 */
export async function benchmarkLatency(
  config: Partial<BenchmarkConfig> = {}
): Promise<LatencyResult> {
  const fullConfig: BenchmarkConfig = {
    iterations: config.iterations ?? 100,
    concurrency: 1,
    warmupIterations: config.warmupIterations ?? 10,
    timeout: config.timeout ?? 30000,
    endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
    apiKey: config.apiKey ?? DEFAULT_API_KEY,
  };

  const measurements: LatencyMeasurement[] = [];
  const testPayload = {
    model: 'glm-4-plus',
    messages: [
      {
        role: 'user',
        content: 'Hello, this is a benchmark test.',
      },
    ],
    max_tokens: 10,
  };

  const startTime = Date.now();

  try {
    // Warmup phase
    for (let i = 0; i < fullConfig.warmupIterations; i++) {
      try {
        await measureSingleRequestLatency(
          fullConfig.endpoint,
          fullConfig.apiKey,
          testPayload
        );
      } catch {
        // Ignore warmup errors
      }
    }

    // Measurement phase
    const promises: Promise<LatencyMeasurement>[] = [];

    for (let i = 0; i < fullConfig.iterations; i++) {
      const promise = measureSingleRequestLatency(
        fullConfig.endpoint,
        fullConfig.apiKey,
        testPayload
      );
      promises.push(promise);
    }

    const results = await Promise.all(promises);
    measurements.push(...results);

    const endTime = Date.now();
    const duration = endTime - startTime;

    const latencyValues = measurements.map((m) => m.totalDuration);
    const stats = calculateStats(latencyValues);

    return {
      name: 'Proxy Latency Benchmark',
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
    throw new Error(`Latency benchmark failed: ${errorMessage}`);
  }
}

/**
 * Benchmark throughput with concurrent requests
 */
export async function benchmarkThroughput(
  config: Partial<BenchmarkConfig> = {}
): Promise<ThroughputResult> {
  const fullConfig: BenchmarkConfig = {
    iterations: config.iterations ?? 100,
    concurrency: config.concurrency ?? 10,
    warmupIterations: config.warmupIterations ?? 10,
    timeout: config.timeout ?? 30000,
    endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
    apiKey: config.apiKey ?? DEFAULT_API_KEY,
  };

  const measurements: ThroughputMeasurement[] = [];
  const testPayload = {
    model: 'glm-4-plus',
    messages: [
      {
        role: 'user',
        content: 'Hello, this is a throughput benchmark test.',
      },
    ],
    max_tokens: 10,
  };

  const startTime = Date.now();

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

    // Measurement phase - run in batches based on concurrency
    let completedRequests = 0;
    let errorCount = 0;
    const batchStartTime = performance.now();

    while (completedRequests < fullConfig.iterations) {
      const batchSize = Math.min(
        fullConfig.concurrency,
        fullConfig.iterations - completedRequests
      );

      const batch = Array.from({ length: batchSize }, async () => {
        try {
          const response = await fetch(fullConfig.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${fullConfig.apiKey}`,
            },
            body: JSON.stringify(testPayload),
          });

          if (!response.ok) {
            errorCount++;
          }

          completedRequests++;
        } catch {
          errorCount++;
          completedRequests++;
        }
      });

      await Promise.all(batch);

      // Record measurement after each batch
      const currentTime = performance.now();
      const elapsed = currentTime - batchStartTime;

      measurements.push({
        requestCount: completedRequests,
        duration: elapsed,
        requestsPerSecond: (completedRequests / elapsed) * 1000,
        successRate: ((completedRequests - errorCount) / completedRequests) * 100,
        errorCount,
        timestamp: new Date().toISOString(),
      });
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    const rpsValues = measurements.map((m) => m.requestsPerSecond);
    const totalErrors = measurements.reduce((sum, m) => sum + m.errorCount, 0);

    const stats = {
      minRps: Math.min(...rpsValues),
      maxRps: Math.max(...rpsValues),
      meanRps: rpsValues.reduce((a, b) => a + b, 0) / rpsValues.length,
      totalRequests: completedRequests,
      totalErrors,
      overallSuccessRate:
        ((completedRequests - totalErrors) / completedRequests) * 100,
    };

    return {
      name: 'Proxy Throughput Benchmark',
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
    throw new Error(`Throughput benchmark failed: ${errorMessage}`);
  }
}

/**
 * Run all proxy benchmarks
 */
export async function runProxyBenchmarks(
  config: Partial<BenchmarkConfig> = {}
): Promise<{
  latency: LatencyResult;
  throughput: ThroughputResult[];
}> {
  const results = {
    latency: await benchmarkLatency(config),
    throughput: [] as ThroughputResult[],
  };

  // Test different concurrency levels
  const concurrencyLevels = [1, 10, 50, 100, 500];

  for (const concurrency of concurrencyLevels) {
    try {
      const result = await benchmarkThroughput({ ...config, concurrency });
      results.throughput.push(result);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Throughput benchmark failed for concurrency ${concurrency}: ${errorMessage}`
      );
    }
  }

  return results;
}
