/**
 * Resource Usage Validation
 *
 * Validates memory and CPU usage under load to ensure resource efficiency
 */

import type {
  LoadTestConfig,
  LoadTestResult,
  LoadTestSnapshot,
  ResourceValidationResult,
  ResourceValidationReport,
  MemoryTrend,
  MemoryLeakDetection,
  CpuScaling,
  DegradationCheck,
  MemoryValidation,
  CpuValidation,
} from './types.js';
import { runLoadTest, runLoadTests } from './load-test.js';
import { getValidationTestScenarios } from './scenarios.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resource usage targets for validation
 */
export const RESOURCE_TARGETS = {
  BASE_MEMORY_MB: 100, // 100MB
  MEMORY_GROWTH_MB_PER_HOUR: 10, // 10MB/hour
  CPU_LINEARITY_THRESHOLD: 0.8, // 0.8 correlation for linearity
  DEGRADATION_FAILURE_RATE_THRESHOLD: 10, // 10% failure rate at high load
} as const;

/**
 * Calculate linear regression for trend analysis
 */
function calculateLinearRegression(data: { x: number; y: number }[]) {
  if (data.length < 2) {
    return { slope: 0, intercept: 0, rSquared: 0 };
  }

  const n = data.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  let sumYY = 0;

  for (const point of data) {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumXX += point.x * point.x;
    sumYY += point.y * point.y;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const meanY = sumY / n;
  let ssTotal = 0;
  let ssResidual = 0;

  for (const point of data) {
    const predicted = slope * point.x + intercept;
    ssTotal += (point.y - meanY) ** 2;
    ssResidual += (point.y - predicted) ** 2;
  }

  const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return { slope, intercept, rSquared };
}

/**
 * Analyze memory trend over time
 */
function analyzeMemoryTrend(snapshots: LoadTestSnapshot[]): MemoryTrend {
  if (snapshots.length < 2) {
    return {
      trend: 'stable',
      growthRate: 0,
      rSquared: 1,
      startMemory: snapshots[0]?.memoryUsage.rss || 0,
      endMemory: snapshots[0]?.memoryUsage.rss || 0,
      duration: 0,
    };
  }

  // Prepare data for linear regression
  const data = snapshots.map((s) => ({
    x: s.timestamp,
    y: s.memoryUsage.rss,
  }));

  const regression = calculateLinearRegression(data);

  // Calculate growth rate (bytes per second)
  const duration = (snapshots[snapshots.length - 1].timestamp - snapshots[0].timestamp) / 1000;
  const growthRate = duration > 0 ? regression.slope : 0;

  // Determine trend
  let trend: 'increasing' | 'decreasing' | 'stable';
  if (Math.abs(growthRate) < 10000) {
    // Less than 10KB/s is considered stable
    trend = 'stable';
  } else if (growthRate > 0) {
    trend = 'increasing';
  } else {
    trend = 'decreasing';
  }

  return {
    trend,
    growthRate,
    rSquared: regression.rSquared,
    startMemory: snapshots[0].memoryUsage.rss,
    endMemory: snapshots[snapshots.length - 1].memoryUsage.rss,
    duration,
  };
}

/**
 * Detect memory leaks in test result
 */
function detectMemoryLeaks(result: LoadTestResult): MemoryLeakDetection {
  const snapshots = result.snapshots;

  if (snapshots.length < 2) {
    return {
      hasLeak: false,
      confidence: 'low',
      trend: {
        trend: 'stable',
        growthRate: 0,
        rSquared: 1,
        startMemory: 0,
        endMemory: 0,
        duration: 0,
      },
      details: {
        baseMemory: 0,
        peakMemory: 0,
        memoryGrowth: 0,
        growthRateMBPerHour: 0,
      },
    };
  }

  const trend = analyzeMemoryTrend(snapshots);
  const baseMemory = Math.min(...snapshots.map((s) => s.memoryUsage.rss));
  const peakMemory = Math.max(...snapshots.map((s) => s.memoryUsage.rss));
  const memoryGrowth = peakMemory - baseMemory;

  // Convert growth rate to MB/hour
  const growthRateMBPerHour = (trend.growthRate * 3600) / (1024 * 1024);

  // Determine if there's a leak based on trend and confidence
  let hasLeak = false;
  let confidence: 'low' | 'medium' | 'high' = 'low';

  if (trend.trend === 'increasing' && trend.rSquared > 0.7) {
    hasLeak = true;
    if (trend.rSquared > 0.9 && growthRateMBPerHour > 20) {
      confidence = 'high';
    } else if (trend.rSquared > 0.8 && growthRateMBPerHour > 10) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
  }

  return {
    hasLeak,
    confidence,
    trend,
    details: {
      baseMemory,
      peakMemory,
      memoryGrowth,
      growthRateMBPerHour,
    },
  };
}

/**
 * Calculate correlation coefficient
 */
function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;

  const n = x.length;
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let sumSqX = 0;
  let sumSqY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    sumSqX += dx * dx;
    sumSqY += dy * dy;
  }

  const denominator = Math.sqrt(sumSqX * sumSqY);
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * Analyze CPU scaling with load
 */
function analyzeCpuScaling(result: LoadTestResult): CpuScaling {
  const snapshots = result.snapshots;

  if (snapshots.length < 2) {
    return {
      isLinear: false,
      correlation: 0,
      slope: 0,
      details: {
        avgCpuAtLowLoad: 0,
        avgCpuAtHighLoad: 0,
        expectedCpuAtMaxLoad: 0,
        actualCpuAtMaxLoad: 0,
        efficiency: 0,
      },
    };
  }

  // Prepare data: concurrency vs CPU usage
  const concurrencyData: number[] = [];
  const cpuData: number[] = [];

  for (const snapshot of snapshots) {
    concurrencyData.push(snapshot.currentConcurrency);
    // Total CPU usage as percentage
    const totalCpu = snapshot.cpuUsage.user + snapshot.cpuUsage.system;
    cpuData.push(totalCpu);
  }

  // Calculate correlation
  const correlation = calculateCorrelation(concurrencyData, cpuData);

  // Calculate regression for slope
  const data = snapshots.map((s) => ({
    x: s.currentConcurrency,
    y: s.cpuUsage.user + s.cpuUsage.system,
  }));
  const regression = calculateLinearRegression(data);

  // Calculate efficiency metrics
  const lowLoadSnapshots = snapshots.filter((s) => s.currentConcurrency <= result.config.minConcurrency + 5);
  const highLoadSnapshots = snapshots.filter((s) => s.currentConcurrency >= result.config.maxConcurrency - 5);

  const avgCpuAtLowLoad = lowLoadSnapshots.length > 0
    ? lowLoadSnapshots.reduce((sum, s) => sum + s.cpuUsage.user + s.cpuUsage.system, 0) / lowLoadSnapshots.length
    : 0;

  const avgCpuAtHighLoad = highLoadSnapshots.length > 0
    ? highLoadSnapshots.reduce((sum, s) => sum + s.cpuUsage.user + s.cpuUsage.system, 0) / highLoadSnapshots.length
    : 0;

  const maxConcurrency = Math.max(...snapshots.map((s) => s.currentConcurrency));
  const expectedCpuAtMaxLoad = avgCpuAtLowLoad + regression.slope * (maxConcurrency - result.config.minConcurrency);
  const actualCpuAtMaxLoad = avgCpuAtHighLoad;

  // Efficiency: how close actual is to expected
  const efficiency = expectedCpuAtMaxLoad > 0
    ? (1 - Math.abs(actualCpuAtMaxLoad - expectedCpuAtMaxLoad) / expectedCpuAtMaxLoad) * 100
    : 0;

  const isLinear = correlation >= RESOURCE_TARGETS.CPU_LINEARITY_THRESHOLD;

  return {
    isLinear,
    correlation,
    slope: regression.slope,
    details: {
      avgCpuAtLowLoad,
      avgCpuAtHighLoad,
      expectedCpuAtMaxLoad,
      actualCpuAtMaxLoad,
      efficiency: Math.max(0, Math.min(100, efficiency)),
    },
  };
}

/**
 * Check graceful degradation under load
 */
function checkGracefulDegradation(result: LoadTestResult): DegradationCheck {
  const phases = result.phases;

  if (phases.length < 2) {
    return {
      degradesGracefully: true,
      failureRateAtHighLoad: 0,
      latencyAtHighLoad: 0,
      details: {
        errorRateIncrease: 0,
        latencyIncrease: 0,
        recoveryTime: 0,
      },
    };
  }

  // Find low and high load phases
  const lowLoadPhase = phases.reduce((prev, curr) =>
    curr.concurrency < prev.concurrency ? curr : prev
  );
  const highLoadPhase = phases.reduce((prev, curr) =>
    curr.concurrency > prev.concurrency ? curr : prev
  );

  const errorRateAtLowLoad = lowLoadPhase.stats.errorRate;
  const errorRateAtHighLoad = highLoadPhase.stats.errorRate;
  const latencyAtLowLoad = lowLoadPhase.stats.p95Latency;
  const latencyAtHighLoad = highLoadPhase.stats.p95Latency;

  const errorRateIncrease = errorRateAtHighLoad - errorRateAtLowLoad;
  const latencyIncrease = latencyAtLowLoad > 0
    ? ((latencyAtHighLoad - latencyAtLowLoad) / latencyAtLowLoad) * 100
    : 0;

  // Check if degradation is graceful (error rate doesn't explode)
  const degradesGracefully = errorRateAtHighLoad < RESOURCE_TARGETS.DEGRADATION_FAILURE_RATE_THRESHOLD;

  // Check for recovery in later phases (if any)
  const highLoadPhaseIndex = phases.indexOf(highLoadPhase);
  let recoveryTime = 0;

  if (highLoadPhaseIndex < phases.length - 1) {
    const nextPhase = phases[highLoadPhaseIndex + 1];
    if (nextPhase.stats.errorRate < errorRateAtHighLoad * 0.8) {
      // Recovery detected
      recoveryTime = nextPhase.endTime - highLoadPhase.endTime;
    }
  }

  return {
    degradesGracefully,
    failureRateAtHighLoad: errorRateAtHighLoad,
    latencyAtHighLoad: latencyAtHighLoad,
    details: {
      errorRateIncrease,
      latencyIncrease,
      recoveryTime,
    },
  };
}

/**
 * Validate memory usage for a single test result
 */
function validateMemory(result: LoadTestResult): MemoryValidation {
  const stats = result.stats;
  const leakDetection = detectMemoryLeaks(result);

  // Base memory check (use peak memory as conservative estimate)
  const baseMemory = stats.peakMemory;
  const baseMemoryTarget = RESOURCE_TARGETS.BASE_MEMORY_MB * 1024 * 1024;
  const baseMemoryPass = baseMemory < baseMemoryTarget;

  // Memory growth check
  const memoryGrowthMBPerHour = leakDetection.details.growthRateMBPerHour;
  const memoryGrowthTarget = RESOURCE_TARGETS.MEMORY_GROWTH_MB_PER_HOUR;
  const memoryGrowthPass = memoryGrowthMBPerHour < memoryGrowthTarget;

  return {
    baseMemory,
    baseMemoryTarget,
    baseMemoryPass,
    memoryGrowthMBPerHour,
    memoryGrowthTarget,
    memoryGrowthPass,
    leakDetection,
  };
}

/**
 * Validate CPU usage for a single test result
 */
function validateCpu(result: LoadTestResult): CpuValidation {
  const scaling = analyzeCpuScaling(result);
  const degradation = checkGracefulDegradation(result);

  const avgCpuUsage = result.stats.avgCpu;
  const peakCpuUsage = result.stats.peakCpu;

  return {
    avgCpuUsage,
    peakCpuUsage,
    scaling,
    degradation,
  };
}

/**
 * Validate a single load test result against resource targets
 */
function validateSingleResult(result: LoadTestResult): ResourceValidationResult {
  const memory = validateMemory(result);
  const cpu = validateCpu(result);

  // Overall pass: all checks must pass
  const passed =
    memory.baseMemoryPass &&
    memory.memoryGrowthPass &&
    !memory.leakDetection.hasLeak &&
    cpu.scaling.isLinear &&
    cpu.degradation.degradesGracefully;

  return {
    testName: result.testName,
    scenario: result.scenario,
    passed,
    memory,
    cpu,
  };
}

/**
 * Run resource validation on a single test configuration
 */
export async function validateSingleResourceTest(
  config: LoadTestConfig
): Promise<ResourceValidationResult> {
  try {
    const result = await runLoadTest(config);
    return validateSingleResult(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      testName: config.testName || 'Unknown Test',
      scenario: config.scenario,
      passed: false,
      memory: {
        baseMemory: 0,
        baseMemoryTarget: RESOURCE_TARGETS.BASE_MEMORY_MB * 1024 * 1024,
        baseMemoryPass: false,
        memoryGrowthMBPerHour: 0,
        memoryGrowthTarget: RESOURCE_TARGETS.MEMORY_GROWTH_MB_PER_HOUR,
        memoryGrowthPass: false,
        leakDetection: {
          hasLeak: false,
          confidence: 'low',
          trend: {
            trend: 'stable',
            growthRate: 0,
            rSquared: 1,
            startMemory: 0,
            endMemory: 0,
            duration: 0,
          },
          details: {
            baseMemory: 0,
            peakMemory: 0,
            memoryGrowth: 0,
            growthRateMBPerHour: 0,
          },
        },
      },
      cpu: {
        avgCpuUsage: 0,
        peakCpuUsage: 0,
        scaling: {
          isLinear: false,
          correlation: 0,
          slope: 0,
          details: {
            avgCpuAtLowLoad: 0,
            avgCpuAtHighLoad: 0,
            expectedCpuAtMaxLoad: 0,
            actualCpuAtMaxLoad: 0,
            efficiency: 0,
          },
        },
        degradation: {
          degradesGracefully: false,
          failureRateAtHighLoad: 0,
          latencyAtHighLoad: 0,
          details: {
            errorRateIncrease: 0,
            latencyIncrease: 0,
            recoveryTime: 0,
          },
        },
      },
      error: errorMessage,
    };
  }
}

/**
 * Run resource validation across multiple test scenarios
 */
export async function validateResourceUsage(
  configs?: LoadTestConfig[]
): Promise<ResourceValidationReport> {
  console.log('='.repeat(80));
  console.log('RESOURCE USAGE VALIDATION');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Base Memory Target: < ${RESOURCE_TARGETS.BASE_MEMORY_MB}MB`);
  console.log(`Memory Growth Target: < ${RESOURCE_TARGETS.MEMORY_GROWTH_MB_PER_HOUR}MB/hour`);
  console.log(`CPU Linearity Threshold: >= ${RESOURCE_TARGETS.CPU_LINEARITY_THRESHOLD}`);
  console.log(`Failure Rate Threshold: < ${RESOURCE_TARGETS.DEGRADATION_FAILURE_RATE_THRESHOLD}%`);
  console.log('');

  const testConfigs = configs || getValidationTestScenarios();
  const results: ResourceValidationResult[] = [];

  for (const config of testConfigs) {
    console.log(`Running: ${config.testName || 'Unnamed Test'}...`);
    const validation = await validateSingleResourceTest(config);
    results.push(validation);

    const status = validation.passed ? '✅ PASS' : '❌ FAIL';
    const baseMemoryMB = validation.memory.baseMemory / (1024 * 1024);
    const growthRate = validation.memory.memoryGrowthMBPerHour.toFixed(2);
    const cpuCorr = validation.cpu.scaling.correlation.toFixed(2);

    console.log(
      `${status} - Memory: ${baseMemoryMB.toFixed(2)}MB, Growth: ${growthRate}MB/h, CPU Correlation: ${cpuCorr}`
    );

    if (validation.memory.leakDetection.hasLeak) {
      console.log(
        `  ⚠️  Memory leak detected (${validation.memory.leakDetection.confidence} confidence)`
      );
    }

    if (!validation.cpu.degradation.degradesGracefully) {
      console.log(`  ⚠️  Poor degradation at high load`);
    }
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(80));
  console.log('');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('');

  // Calculate aggregate metrics
  const allBaseMemory = results.map((r) => r.memory.baseMemory / (1024 * 1024));
  const allMemoryGrowth = results.map((r) => r.memory.memoryGrowthMBPerHour);
  const allCpuUsage = results.map((r) => r.cpu.avgCpuUsage);
  const allScalingEfficiency = results.map((r) => r.cpu.scaling.details.efficiency);

  const avgBaseMemory = allBaseMemory.reduce((a, b) => a + b, 0) / allBaseMemory.length;
  const avgMemoryGrowth = allMemoryGrowth.reduce((a, b) => a + b, 0) / allMemoryGrowth.length;
  const avgCpuUsage = allCpuUsage.reduce((a, b) => a + b, 0) / allCpuUsage.length;
  const avgScalingEfficiency = allScalingEfficiency.reduce((a, b) => a + b, 0) / allScalingEfficiency.length;

  console.log('Memory Metrics:');
  console.log(`  Average Base Memory: ${avgBaseMemory.toFixed(2)}MB`);
  console.log(`  Average Memory Growth: ${avgMemoryGrowth.toFixed(2)}MB/hour`);

  const leaksDetected = results.filter((r) => r.memory.leakDetection.hasLeak).length;
  if (leaksDetected > 0) {
    console.log(`  ⚠️  Memory Leaks Detected: ${leaksDetected}`);
  } else {
    console.log(`  ✅ No Memory Leaks Detected`);
  }
  console.log('');

  console.log('CPU Metrics:');
  console.log(`  Average CPU Usage: ${avgCpuUsage.toFixed(2)}%`);
  console.log(`  Average Scaling Efficiency: ${avgScalingEfficiency.toFixed(2)}%`);

  const gracefulDegradationCount = results.filter((r) => r.cpu.degradation.degradesGracefully).length;
  console.log(`  Graceful Degradation: ${gracefulDegradationCount}/${results.length}`);
  console.log('');

  // Overall pass/fail
  const overallPass = failed === 0;
  console.log('='.repeat(80));
  console.log(`OVERALL: ${overallPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log('='.repeat(80));

  return {
    timestamp: new Date().toISOString(),
    targets: RESOURCE_TARGETS,
    results,
    summary: {
      total: results.length,
      passed,
      failed,
      overallPass,
      memory: {
        avgBaseMemory,
        avgMemoryGrowth,
        leaksDetected,
      },
      cpu: {
        avgCpuUsage,
        avgScalingEfficiency,
        gracefulDegradation: gracefulDegradationCount,
      },
    },
  };
}

/**
 * Save resource validation report to file
 */
export function saveResourceValidationReport(
  report: ResourceValidationReport,
  outputDir: string
): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `resource-validation-${timestamp}.json`;
  const filepath = join(outputDir, filename);

  writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Resource validation report saved to: ${filepath}`);
}

/**
 * Generate markdown resource validation report
 */
export function generateResourceValidationReport(
  report: ResourceValidationReport,
  outputDir: string
): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `resource-validation-report-${timestamp}.md`;
  const filepath = join(outputDir, filename);

  const lines = [
    '# Resource Usage Validation Report',
    '',
    `**Generated:** ${report.timestamp}`,
    '',
    '## Targets',
    '',
    '| Metric | Target |',
    '|--------|--------|',
    `| Base Memory | < ${report.targets.BASE_MEMORY_MB}MB |`,
    `| Memory Growth | < ${report.targets.MEMORY_GROWTH_MB_PER_HOUR}MB/hour |`,
    `| CPU Linearity | >= ${report.targets.CPU_LINEARITY_THRESHOLD} correlation |`,
    `| Failure Rate Threshold | < ${report.targets.DEGRADATION_FAILURE_RATE_THRESHOLD}% |`,
    '',
    '## Summary',
    '',
    `**Overall Result:** ${report.summary.overallPass ? '✅ PASSED' : '❌ FAILED'}`,
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Total Tests | ${report.summary.total} |`,
    `| Passed | ${report.summary.passed} |`,
    `| Failed | ${report.summary.failed} |`,
    `| Average Base Memory | ${report.summary.memory.avgBaseMemory.toFixed(2)}MB |`,
    `| Average Memory Growth | ${report.summary.memory.avgMemoryGrowth.toFixed(2)}MB/hour |`,
    `| Memory Leaks Detected | ${report.summary.memory.leaksDetected} |`,
    `| Average CPU Usage | ${report.summary.cpu.avgCpuUsage.toFixed(2)}% |`,
    `| Average Scaling Efficiency | ${report.summary.cpu.avgScalingEfficiency.toFixed(2)}% |`,
    `| Graceful Degradation | ${report.summary.cpu.gracefulDegradation}/${report.summary.total} |`,
    '',
    '## Test Results',
    '',
  ];

  for (const result of report.results) {
    lines.push(`### ${result.testName}`, '');
    lines.push(`**Status:** ${result.passed ? '✅ PASSED' : '❌ FAILED'}`, '');

    if (result.error) {
      lines.push(`**Error:** ${result.error}`, '');
      continue;
    }

    // Memory section
    lines.push('**Memory Validation:**', '');
    lines.push(
      '| Metric | Value | Target | Status |',
      '|--------|-------|--------|--------|',
      `| Base Memory | ${(result.memory.baseMemory / 1024 / 1024).toFixed(2)}MB | < ${RESOURCE_TARGETS.BASE_MEMORY_MB}MB | ${result.memory.baseMemoryPass ? '✅' : '❌'} |`,
      `| Memory Growth | ${result.memory.memoryGrowthMBPerHour.toFixed(2)}MB/h | < ${RESOURCE_TARGETS.MEMORY_GROWTH_MB_PER_HOUR}MB/h | ${result.memory.memoryGrowthPass ? '✅' : '❌'} |`,
      ''
    );

    if (result.memory.leakDetection.hasLeak) {
      lines.push(`**Memory Leak:** ⚠️ Detected (${result.memory.leakDetection.confidence} confidence)`, '');
      lines.push(
        `- Trend: ${result.memory.leakDetection.trend.trend}`,
        `- Growth Rate: ${result.memory.leakDetection.details.growthRateMBPerHour.toFixed(2)}MB/hour`,
        `- Confidence (R²): ${result.memory.leakDetection.trend.rSquared.toFixed(3)}`,
        ''
      );
    } else {
      lines.push(`**Memory Leak:** ✅ No leak detected`, '');
    }

    // CPU section
    lines.push('**CPU Validation:**', '');
    lines.push(
      '| Metric | Value |',
      '|--------|-------|',
      `| Average CPU Usage | ${result.cpu.avgCpuUsage.toFixed(2)}% |`,
      `| Peak CPU Usage | ${result.cpu.peakCpuUsage.toFixed(2)}% |`,
      `| Scaling Correlation | ${result.cpu.scaling.correlation.toFixed(3)} |`,
      `| Linear Scaling | ${result.cpu.scaling.isLinear ? '✅ Yes' : '❌ No'} |`,
      `| Scaling Efficiency | ${result.cpu.scaling.details.efficiency.toFixed(2)}% |`,
      ''
    );

    lines.push(
      '| Concurrency | Expected CPU | Actual CPU |',
      '|-------------|--------------|------------|',
      `| Low Load | ${result.cpu.scaling.details.avgCpuAtLowLoad.toFixed(2)}% | ${result.cpu.scaling.details.avgCpuAtLowLoad.toFixed(2)}% |`,
      `| High Load | ${result.cpu.scaling.details.expectedCpuAtMaxLoad.toFixed(2)}% | ${result.cpu.scaling.details.actualCpuAtMaxLoad.toFixed(2)}% |`,
      ''
    );

    // Degradation section
    lines.push('**Graceful Degradation:**', '');
    if (result.cpu.degradation.degradesGracefully) {
      lines.push(`✅ Degrades gracefully`, '');
    } else {
      lines.push(`❌ Poor degradation at high load`, '');
    }

    lines.push(
      '| Metric | Value |',
      '|--------|-------|',
      `| Failure Rate at High Load | ${result.cpu.degradation.failureRateAtHighLoad.toFixed(2)}% |`,
      `| Latency at High Load | ${result.cpu.degradation.latencyAtHighLoad.toFixed(2)}ms |`,
      `| Error Rate Increase | ${result.cpu.degradation.details.errorRateIncrease.toFixed(2)}pp |`,
      `| Latency Increase | ${result.cpu.degradation.details.latencyIncrease.toFixed(2)}% |`,
      ''
    );

    if (result.cpu.degradation.details.recoveryTime > 0) {
      lines.push(`**Recovery:** ⚠️ Detected (${result.cpu.degradation.details.recoveryTime}ms)`, '');
    } else {
      lines.push(`**Recovery:** N/A`, '');
    }
  }

  writeFileSync(filepath, lines.join('\n'), 'utf-8');
  console.log(`Markdown report saved to: ${filepath}`);
}

/**
 * Run quick resource validation smoke test
 */
export async function runResourceValidationSmokeTest(): Promise<boolean> {
  console.log('Running resource validation smoke test...\n');

  const report = await validateResourceUsage();

  // Save reports
  const outputDir = './test/load/results';
  saveResourceValidationReport(report, outputDir);
  generateResourceValidationReport(report, outputDir);

  return report.summary.overallPass;
}
