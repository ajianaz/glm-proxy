/**
 * Load testing types and interfaces
 */

export interface LoadTestConfig {
  // Test duration
  duration: number; // Duration in milliseconds
  // Concurrency settings
  minConcurrency: number;
  maxConcurrency: number;
  concurrencyStep: number;
  // Ramp settings
  rampUpTime?: number; // Time to reach max concurrency (ms)
  rampDownTime?: number; // Time to ramp down from max to min (ms)
  // Request settings
  endpoint: string;
  apiKey: string;
  requestRate?: number; // Target requests per second (optional)
  timeout: number; // Request timeout in milliseconds
  // Test scenarios
  scenario: LoadTestScenario;
  // Output settings
  outputDir: string;
  verbose?: boolean;
}

export enum LoadTestScenario {
  /** Constant load test - maintains steady concurrency */
  CONSTANT_LOAD = 'constant_load',
  /** Ramp-up test - gradually increases concurrency */
  RAMP_UP = 'ramp_up',
  /** Ramp-down test - gradually decreases concurrency */
  RAMP_DOWN = 'ramp_down',
  /** Spike test - sudden increase in load */
  SPIKE = 'spike',
  /** Sustained load test - maintains high load over extended period */
  SUSTAINED = 'sustained',
  /** Stress test - pushes system to breaking point */
  STRESS = 'stress',
  /** Failure test - tests behavior under failures/timeouts */
  FAILURE = 'failure',
}

export interface LoadTestRequest {
  id: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  statusCode?: number;
  errorMessage?: string;
  latency?: number;
}

export interface LoadTestPhase {
  name: string;
  startTime: number;
  endTime: number;
  concurrency: number;
  requests: LoadTestRequest[];
  stats: PhaseStatistics;
}

export interface PhaseStatistics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  requestsPerSecond: number;
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  minLatency: number;
  maxLatency: number;
  errorRate: number;
}

export interface LoadTestSnapshot {
  timestamp: number;
  activeRequests: number;
  completedRequests: number;
  failedRequests: number;
  currentConcurrency: number;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpuUsage: {
    user: number;
    system: number;
  };
}

export interface LoadTestResult {
  testName: string;
  scenario: LoadTestScenario;
  startTime: string;
  endTime: string;
  duration: number;
  config: LoadTestConfig;
  phases: LoadTestPhase[];
  snapshots: LoadTestSnapshot[];
  stats: LoadTestStatistics;
}

export interface LoadTestStatistics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  overallRequestsPerSecond: number;
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  minLatency: number;
  maxLatency: number;
  errorRate: number;
  peakMemory: number;
  avgMemory: number;
  peakCpu: number;
  avgCpu: number;
}

export interface LoadTestReport {
  timestamp: string;
  results: LoadTestResult[];
  summary: LoadTestSummary;
}

export interface LoadTestSummary {
  totalTests: number;
  passed: number;
  failed: number;
  totalDuration: number;
  overallSuccessRate: number;
  recommendations: string[];
}

/**
 * Latency spike information
 */
export interface LatencySpike {
  phaseName: string;
  requestId: string;
  latency: number;
  timestamp: number;
  threshold: number;
  severity: 'critical' | 'high' | 'medium';
}

/**
 * Latency degradation information
 */
export interface LatencyDegradation {
  p50Degradation: number;
  p95Degradation: number;
  p99Degradation: number;
}

/**
 * Stability check between phases
 */
export interface StabilityCheck {
  fromPhase: string;
  toPhase: string;
  p50Change: number;
  p95Change: number;
  p99Change: number;
  p50Ratio: number;
  p95Ratio: number;
  p99Ratio: number;
  isStable: boolean;
  degradation?: LatencyDegradation;
}

/**
 * Metric validation result
 */
export interface MetricValidation {
  value: number;
  target: number;
  pass: boolean;
}

/**
 * Spike analysis result
 */
export interface SpikeAnalysis {
  detected: boolean;
  count: number;
  critical: number;
  high: number;
  medium: number;
  details: LatencySpike[];
}

/**
 * Stability analysis result
 */
export interface StabilityAnalysis {
  isStable: boolean;
  hasDegradation: boolean;
  checks: StabilityCheck[];
}

/**
 * Latency validation result for a single test
 */
export interface LatencyValidationResult {
  testName: string;
  scenario: LoadTestScenario;
  passed: boolean;
  metrics: {
    p50: MetricValidation;
    p95: MetricValidation;
    p99: MetricValidation;
  };
  spikes: SpikeAnalysis;
  stability: StabilityAnalysis;
  error?: string;
}

/**
 * Aggregate metrics summary
 */
export interface AggregateMetrics {
  avgP50: number;
  avgP95: number;
  avgP99: number;
}

/**
 * Spike summary
 */
export interface SpikeSummary {
  total: number;
  critical: number;
  high: number;
}

/**
 * Stability summary
 */
export interface StabilitySummary {
  stable: number;
  degraded: number;
}

/**
 * Validation summary
 */
export interface ValidationSummary {
  total: number;
  passed: number;
  failed: number;
  overallPass: boolean;
  aggregateMetrics: AggregateMetrics;
  spikes: SpikeSummary;
  stability: StabilitySummary;
}

/**
 * Complete validation report
 */
export interface ValidationReport {
  timestamp: string;
  targets: {
    P50: number;
    P95: number;
    P99: number;
    MAX_SPIKE: number;
    STABILITY_THRESHOLD: number;
  };
  results: LatencyValidationResult[];
  summary: ValidationSummary;
}
