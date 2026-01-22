/**
 * Benchmark result interfaces and types
 */

export interface BenchmarkResult {
  name: string;
  timestamp: string;
  duration: number;
  metadata: Record<string, unknown>;
}

export interface LatencyMeasurement {
  totalDuration: number;
  proxyOverhead: number;
  upstreamDuration: number;
  timestamp: string;
}

export interface LatencyResult extends BenchmarkResult {
  measurements: LatencyMeasurement[];
  stats: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
    p50: number;
  };
}

export interface ThroughputMeasurement {
  requestCount: number;
  duration: number;
  requestsPerSecond: number;
  successRate: number;
  errorCount: number;
  timestamp: string;
}

export interface ThroughputResult extends BenchmarkResult {
  measurements: ThroughputMeasurement[];
  stats: {
    minRps: number;
    maxRps: number;
    meanRps: number;
    totalRequests: number;
    totalErrors: number;
    overallSuccessRate: number;
  };
}

export interface MemorySnapshot {
  timestamp: string;
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
}

export interface MemoryResult extends BenchmarkResult {
  snapshots: MemorySnapshot[];
  stats: {
    baseMemory: number;
    peakMemory: number;
    memoryGrowth: number;
    averageHeapUsed: number;
  };
}

export interface CpuMeasurement {
  timestamp: string;
  usage: number;
  userCpu: number;
  systemCpu: number;
}

export interface CpuResult extends BenchmarkResult {
  measurements: CpuMeasurement[];
  stats: {
    averageUsage: number;
    peakUsage: number;
  };
}

export interface BenchmarkConfig {
  iterations: number;
  concurrency: number;
  warmupIterations: number;
  timeout: number;
  endpoint: string;
  apiKey: string;
}

export interface BenchmarkSuite {
  name: string;
  config: BenchmarkConfig;
  results: {
    latency?: LatencyResult;
    throughput?: ThroughputResult;
    memory?: MemoryResult;
    cpu?: CpuResult;
  };
}

export interface CompleteBenchmarkReport {
  suiteName: string;
  timestamp: string;
  config: BenchmarkConfig;
  results: {
    latency?: LatencyResult;
    throughput?: ThroughputResult;
    memory?: MemoryResult;
    cpu?: CpuResult;
  };
  summary: {
    totalTestsRun: number;
    passed: number;
    failed: number;
    duration: number;
  };
}
