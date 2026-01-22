/**
 * Load testing framework
 *
 * Executes load test scenarios with concurrent request generation
 */

import type {
  LoadTestConfig,
  LoadTestRequest,
  LoadTestResult,
  LoadTestStatistics,
  LoadTestSnapshot,
  LoadTestPhase,
  PhaseStatistics,
} from './types.js';
import { LoadTestScenario } from './types.js';

/**
 * Calculate percentiles from an array of numbers
 */
function calculatePercentiles(values: number[]) {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;

  const getPercentile = (p: number) => {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  };

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    p50: getPercentile(50),
    p95: getPercentile(95),
    p99: getPercentile(99),
  };
}

/**
 * Create a test request
 */
function createRequest(id: string): LoadTestRequest {
  return {
    id,
    startTime: Date.now(),
    success: false,
  };
}

/**
 * Execute a single load test request
 */
async function executeRequest(
  config: LoadTestConfig,
  requestId: string
): Promise<LoadTestRequest> {
  const request = createRequest(requestId);
  const payload = {
    model: 'glm-4-plus',
    messages: [
      {
        role: 'user',
        content: 'Load test request',
      },
    ],
    max_tokens: 10,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    request.endTime = Date.now();
    request.duration = request.endTime - request.startTime;
    request.success = response.ok;
    request.statusCode = response.status;

    if (!response.ok) {
      request.errorMessage = `HTTP ${response.status}`;
    }

    // Calculate latency (proxy overhead)
    const upstreamTiming = response.headers.get('X-Upstream-Duration');
    if (upstreamTiming) {
      const upstreamDuration = parseFloat(upstreamTiming);
      request.latency = Math.max(0, request.duration - upstreamDuration);
    } else {
      request.latency = request.duration;
    }
  } catch (error: unknown) {
    request.endTime = Date.now();
    request.duration = request.endTime - request.startTime;
    request.success = false;
    request.errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
  }

  return request;
}

/**
 * Calculate phase statistics from completed requests
 */
function calculatePhaseStats(requests: LoadTestRequest[]): PhaseStatistics {
  const successful = requests.filter((r) => r.success);
  const failed = requests.filter((r) => !r.success);
  const latencies = successful
    .map((r) => r.latency ?? r.duration ?? 0)
    .filter((l) => l > 0);

  const percentiles = calculatePercentiles(latencies);
  const totalDuration =
    requests.length > 0
      ? Math.max(...requests.map((r) => r.duration ?? 0)) -
        Math.min(...requests.map((r) => r.startTime))
      : 0;

  return {
    totalRequests: requests.length,
    successfulRequests: successful.length,
    failedRequests: failed.length,
    requestsPerSecond: totalDuration > 0 ? (requests.length / totalDuration) * 1000 : 0,
    avgLatency: percentiles.mean,
    p50Latency: percentiles.p50,
    p95Latency: percentiles.p95,
    p99Latency: percentiles.p99,
    minLatency: percentiles.min,
    maxLatency: percentiles.max,
    errorRate: requests.length > 0 ? (failed.length / requests.length) * 100 : 0,
  };
}

/**
 * Capture system snapshot (memory, CPU, request counts)
 */
function captureSnapshot(
  config: LoadTestConfig,
  activeRequests: number,
  completedRequests: number,
  failedRequests: number,
  currentConcurrency: number
): LoadTestSnapshot {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  return {
    timestamp: Date.now(),
    activeRequests,
    completedRequests,
    failedRequests,
    currentConcurrency,
    memoryUsage: {
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
    },
    cpuUsage: {
      user: cpuUsage.user,
      system: cpuUsage.system,
    },
  };
}

/**
 * Run a constant load test
 */
async function runConstantLoadTest(
  config: LoadTestConfig,
  onProgress?: (snapshot: LoadTestSnapshot) => void
): Promise<LoadTestResult> {
  const testName = config.testName || `Constant Load ${config.maxConcurrency}`;
  const startTime = Date.now();
  const requests: LoadTestRequest[] = [];
  const snapshots: LoadTestSnapshot[] = [];
  const endTime = startTime + config.duration;

  let completedRequests = 0;
  let failedRequests = 0;
  let requestCounter = 0;

  // Start concurrent workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < config.maxConcurrency; i++) {
    workers.push(
      (async () => {
        while (Date.now() < endTime) {
          const requestId = `req-${requestCounter++}`;
          const request = await executeRequest(config, requestId);
          requests.push(request);

          completedRequests++;
          if (!request.success) {
            failedRequests++;
          }

          // Capture snapshot periodically
          if (completedRequests % 100 === 0) {
            const snapshot = captureSnapshot(
              config,
              config.maxConcurrency,
              completedRequests,
              failedRequests,
              config.maxConcurrency
            );
            snapshots.push(snapshot);
            onProgress?.(snapshot);
          }

          // Small delay to prevent overwhelming the system
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      })()
    );
  }

  await Promise.all(workers);

  // Final snapshot
  snapshots.push(
    captureSnapshot(
      config,
      0,
      completedRequests,
      failedRequests,
      config.maxConcurrency
    )
  );

  const actualEndTime = Date.now();
  const duration = actualEndTime - startTime;

  // Calculate overall statistics
  const stats = calculateOverallStats(requests, snapshots, duration);

  return {
    testName,
    scenario: config.scenario,
    startTime: new Date(startTime).toISOString(),
    endTime: new Date(actualEndTime).toISOString(),
    duration,
    config,
    phases: [
      {
        name: 'Constant Load',
        startTime,
        endTime: actualEndTime,
        concurrency: config.maxConcurrency,
        requests,
        stats: calculatePhaseStats(requests),
      },
    ],
    snapshots,
    stats,
  };
}

/**
 * Run a ramp-up load test
 */
async function runRampUpTest(
  config: LoadTestConfig,
  onProgress?: (snapshot: LoadTestSnapshot) => void
): Promise<LoadTestResult> {
  const testName = config.testName || 'Ramp Up Test';
  const startTime = Date.now();
  const allRequests: LoadTestRequest[] = [];
  const snapshots: LoadTestSnapshot[] = [];
  const endTime = startTime + config.duration;

  let completedRequests = 0;
  let failedRequests = 0;
  let requestCounter = 0;
  let currentConcurrency = config.minConcurrency;

  const rampUpSteps = Math.ceil(
    (config.maxConcurrency - config.minConcurrency) / Math.abs(config.concurrencyStep)
  );

  const stepDuration = config.duration / rampUpSteps;

  for (let step = 0; step < rampUpSteps; step++) {
    const stepStartTime = Date.now();
    const stepEndTime = Math.min(stepStartTime + stepDuration, endTime);
    const targetConcurrency = Math.min(
      config.minConcurrency + (step + 1) * Math.abs(config.concurrencyStep),
      config.maxConcurrency
    );

    currentConcurrency = targetConcurrency;

    // Run requests at this concurrency level
    const workers: Promise<void>[] = [];
    for (let i = 0; i < targetConcurrency; i++) {
      workers.push(
        (async () => {
          while (Date.now() < stepEndTime) {
            const requestId = `req-${requestCounter++}`;
            const request = await executeRequest(config, requestId);
            allRequests.push(request);

            completedRequests++;
            if (!request.success) {
              failedRequests++;
            }

            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        })()
      );
    }

    await Promise.all(workers);

    // Capture snapshot after each step
    const snapshot = captureSnapshot(
      config,
      targetConcurrency,
      completedRequests,
      failedRequests,
      currentConcurrency
    );
    snapshots.push(snapshot);
    onProgress?.(snapshot);
  }

  const actualEndTime = Date.now();
  const duration = actualEndTime - startTime;
  const stats = calculateOverallStats(allRequests, snapshots, duration);

  // Create phases from ramp-up steps
  const phases: LoadTestPhase[] = snapshots.map((snapshot, index) => {
    const phaseRequests = allRequests.filter(
      (r) => r.startTime >= startTime && r.startTime <= snapshot.timestamp
    );
    return {
      name: `Phase ${index + 1}`,
      startTime,
      endTime: snapshot.timestamp,
      concurrency: snapshot.currentConcurrency,
      requests: phaseRequests,
      stats: calculatePhaseStats(phaseRequests),
    };
  });

  return {
    testName,
    scenario: config.scenario,
    startTime: new Date(startTime).toISOString(),
    endTime: new Date(actualEndTime).toISOString(),
    duration,
    config,
    phases,
    snapshots,
    stats,
  };
}

/**
 * Run a spike test
 */
async function runSpikeTest(
  config: LoadTestConfig,
  onProgress?: (snapshot: LoadTestSnapshot) => void
): Promise<LoadTestResult> {
  const testName = config.testName || 'Spike Test';
  const startTime = Date.now();
  const allRequests: LoadTestRequest[] = [];
  const snapshots: LoadTestSnapshot[] = [];
  const endTime = startTime + config.duration;

  let completedRequests = 0;
  let failedRequests = 0;
  let requestCounter = 0;

  // Phase 1: Baseline (30% of duration)
  const baselineEnd = startTime + config.duration * 0.3;
  let currentConcurrency = config.minConcurrency;

  while (Date.now() < baselineEnd) {
    const workers: Promise<void>[] = [];
    for (let i = 0; i < config.minConcurrency; i++) {
      workers.push(
        (async () => {
          const requestId = `req-${requestCounter++}`;
          const request = await executeRequest(config, requestId);
          allRequests.push(request);

          completedRequests++;
          if (!request.success) {
            failedRequests++;
          }
        })()
      );
    }
    await Promise.all(workers);
  }

  // Capture snapshot after baseline
  snapshots.push(
    captureSnapshot(
      config,
      config.minConcurrency,
      completedRequests,
      failedRequests,
      currentConcurrency
    )
  );
  onProgress?.(snapshots[snapshots.length - 1]);

  // Phase 2: Spike (40% of duration)
  const spikeEnd = baselineEnd + config.duration * 0.4;
  currentConcurrency = config.maxConcurrency;

  while (Date.now() < spikeEnd) {
    const workers: Promise<void>[] = [];
    for (let i = 0; i < config.maxConcurrency; i++) {
      workers.push(
        (async () => {
          while (Date.now() < spikeEnd) {
            const requestId = `req-${requestCounter++}`;
            const request = await executeRequest(config, requestId);
            allRequests.push(request);

            completedRequests++;
            if (!request.success) {
              failedRequests++;
            }

            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        })()
      );
    }
    await Promise.all(workers);
  }

  // Capture snapshot after spike
  snapshots.push(
    captureSnapshot(
      config,
      config.maxConcurrency,
      completedRequests,
      failedRequests,
      currentConcurrency
    )
  );
  onProgress?.(snapshots[snapshots.length - 1]);

  // Phase 3: Recovery (30% of duration)
  currentConcurrency = config.minConcurrency;

  while (Date.now() < endTime) {
    const workers: Promise<void>[] = [];
    for (let i = 0; i < config.minConcurrency; i++) {
      workers.push(
        (async () => {
          const requestId = `req-${requestCounter++}`;
          const request = await executeRequest(config, requestId);
          allRequests.push(request);

          completedRequests++;
          if (!request.success) {
            failedRequests++;
          }
        })()
      );
    }
    await Promise.all(workers);
  }

  const actualEndTime = Date.now();
  const duration = actualEndTime - startTime;
  const stats = calculateOverallStats(allRequests, snapshots, duration);

  // Create phases for spike test (baseline, spike, recovery)
  const phases: LoadTestPhase[] = [
    {
      name: 'Baseline',
      startTime,
      endTime: baselineEnd,
      concurrency: config.minConcurrency,
      requests: allRequests.filter((r) => r.startTime >= startTime && r.startTime < baselineEnd),
      stats: calculatePhaseStats(allRequests.filter((r) => r.startTime >= startTime && r.startTime < baselineEnd)),
    },
    {
      name: 'Spike',
      startTime: baselineEnd,
      endTime: spikeEnd,
      concurrency: config.maxConcurrency,
      requests: allRequests.filter((r) => r.startTime >= baselineEnd && r.startTime < spikeEnd),
      stats: calculatePhaseStats(allRequests.filter((r) => r.startTime >= baselineEnd && r.startTime < spikeEnd)),
    },
    {
      name: 'Recovery',
      startTime: spikeEnd,
      endTime: actualEndTime,
      concurrency: config.minConcurrency,
      requests: allRequests.filter((r) => r.startTime >= spikeEnd && r.startTime <= actualEndTime),
      stats: calculatePhaseStats(allRequests.filter((r) => r.startTime >= spikeEnd && r.startTime <= actualEndTime)),
    },
  ];

  return {
    testName,
    scenario: config.scenario,
    startTime: new Date(startTime).toISOString(),
    endTime: new Date(actualEndTime).toISOString(),
    duration,
    config,
    phases,
    snapshots,
    stats,
  };
}

/**
 * Calculate overall statistics from requests and snapshots
 */
function calculateOverallStats(
  requests: LoadTestRequest[],
  snapshots: LoadTestSnapshot[],
  duration: number
): LoadTestStatistics {
  const successful = requests.filter((r) => r.success);
  const failed = requests.filter((r) => !r.success);
  const latencies = successful
    .map((r) => r.latency ?? r.duration ?? 0)
    .filter((l) => l > 0);

  const percentiles = calculatePercentiles(latencies);

  const peakMemory = Math.max(...snapshots.map((s) => s.memoryUsage.rss));
  const avgMemory =
    snapshots.reduce((sum, s) => sum + s.memoryUsage.rss, 0) / snapshots.length;

  const peakCpu = Math.max(
    ...snapshots.map((s) => s.cpuUsage.user + s.cpuUsage.system)
  );
  const avgCpu =
    snapshots.reduce(
      (sum, s) => sum + s.cpuUsage.user + s.cpuUsage.system,
      0
    ) / snapshots.length;

  return {
    totalRequests: requests.length,
    successfulRequests: successful.length,
    failedRequests: failed.length,
    overallRequestsPerSecond: (requests.length / duration) * 1000,
    avgLatency: percentiles.mean,
    p50Latency: percentiles.p50,
    p95Latency: percentiles.p95,
    p99Latency: percentiles.p99,
    minLatency: percentiles.min,
    maxLatency: percentiles.max,
    errorRate: requests.length > 0 ? (failed.length / requests.length) * 100 : 0,
    peakMemory,
    avgMemory,
    peakCpu,
    avgCpu,
  };
}

/**
 * Run a single load test based on scenario
 */
export async function runLoadTest(
  config: LoadTestConfig,
  onProgress?: (snapshot: LoadTestSnapshot) => void
): Promise<LoadTestResult> {
  console.log(`Starting load test: ${config.testName || 'Unnamed Test'}`);
  console.log(`Scenario: ${config.scenario}`);
  console.log(`Duration: ${(config.duration / 1000).toFixed(0)}s`);
  console.log(`Concurrency: ${config.minConcurrency} -> ${config.maxConcurrency}`);
  console.log('');

  try {
    switch (config.scenario) {
      case LoadTestScenario.CONSTANT_LOAD:
      case LoadTestScenario.SUSTAINED:
      case LoadTestScenario.STRESS:
      case LoadTestScenario.FAILURE:
        return await runConstantLoadTest(config, onProgress);

      case LoadTestScenario.RAMP_UP:
      case LoadTestScenario.RAMP_DOWN:
        return await runRampUpTest(config, onProgress);

      case LoadTestScenario.SPIKE:
        return await runSpikeTest(config, onProgress);

      default:
        throw new Error(`Unsupported scenario: ${config.scenario}`);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Load test failed: ${errorMessage}`);
  }
}

/**
 * Run multiple load tests
 */
export async function runLoadTests(
  configs: LoadTestConfig[],
  onProgress?: (testName: string, snapshot: LoadTestSnapshot) => void
): Promise<LoadTestResult[]> {
  const results: LoadTestResult[] = [];

  for (const config of configs) {
    try {
      const result = await runLoadTest(config, (snapshot) => {
        onProgress?.(config.testName || 'Unnamed Test', snapshot);
      });
      results.push(result);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(`Test failed: ${errorMessage}`);
      // Continue with other tests
    }
  }

  return results;
}
