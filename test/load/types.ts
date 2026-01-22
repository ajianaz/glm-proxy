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

/**
 * Memory trend analysis result
 */
export interface MemoryTrend {
  trend: 'increasing' | 'decreasing' | 'stable';
  growthRate: number; // bytes per second
  rSquared: number; // confidence score 0-1
  startMemory: number; // bytes
  endMemory: number; // bytes
  duration: number; // seconds
}

/**
 * Memory leak detection result
 */
export interface MemoryLeakDetection {
  hasLeak: boolean;
  confidence: 'low' | 'medium' | 'high';
  trend: MemoryTrend;
  details: {
    baseMemory: number; // bytes
    peakMemory: number; // bytes
    memoryGrowth: number; // bytes
    growthRateMBPerHour: number; // MB per hour
  };
}

/**
 * CPU scaling analysis result
 */
export interface CpuScaling {
  isLinear: boolean;
  correlation: number; // 0-1, how well CPU scales with load
  slope: number; // CPU usage increase per concurrent request
  details: {
    avgCpuAtLowLoad: number;
    avgCpuAtHighLoad: number;
    expectedCpuAtMaxLoad: number;
    actualCpuAtMaxLoad: number;
    efficiency: number; // percentage
  };
}

/**
 * Graceful degradation check result
 */
export interface DegradationCheck {
  degradesGracefully: boolean;
  failureRateAtHighLoad: number;
  latencyAtHighLoad: number;
  details: {
    errorRateIncrease: number; // percentage points
    latencyIncrease: number; // percentage
    recoveryTime: number; // milliseconds (0 if no recovery)
  };
}

/**
 * Memory validation result
 */
export interface MemoryValidation {
  baseMemory: number; // bytes
  baseMemoryTarget: number; // bytes
  baseMemoryPass: boolean;
  memoryGrowthMBPerHour: number;
  memoryGrowthTarget: number; // MB per hour
  memoryGrowthPass: boolean;
  leakDetection: MemoryLeakDetection;
}

/**
 * CPU validation result
 */
export interface CpuValidation {
  avgCpuUsage: number; // percentage
  peakCpuUsage: number; // percentage
  scaling: CpuScaling;
  degradation: DegradationCheck;
}

/**
 * Resource validation result for a single test
 */
export interface ResourceValidationResult {
  testName: string;
  scenario: LoadTestScenario;
  passed: boolean;
  memory: MemoryValidation;
  cpu: CpuValidation;
  error?: string;
}

/**
 * Resource validation summary
 */
export interface ResourceValidationSummary {
  total: number;
  passed: number;
  failed: number;
  overallPass: boolean;
  memory: {
    avgBaseMemory: number; // MB
    avgMemoryGrowth: number; // MB/hour
    leaksDetected: number;
  };
  cpu: {
    avgCpuUsage: number; // percentage
    avgScalingEfficiency: number; // percentage
    gracefulDegradation: number; // count
  };
}

/**
 * Complete resource validation report
 */
export interface ResourceValidationReport {
  timestamp: string;
  targets: {
    BASE_MEMORY_MB: number;
    MEMORY_GROWTH_MB_PER_HOUR: number;
    CPU_LINEARITY_THRESHOLD: number;
    DEGRADATION_FAILURE_RATE_THRESHOLD: number;
  };
  results: ResourceValidationResult[];
  summary: ResourceValidationSummary;
}
