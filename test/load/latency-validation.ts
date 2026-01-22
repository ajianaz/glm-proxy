/**
 * Latency Target Validation
 *
 * Validates < 10ms overhead across all load testing scenarios
 */

import type {
  LoadTestConfig,
  LoadTestResult,
  LoadTestRequest,
  LatencyValidationResult,
  LatencySpike,
  StabilityCheck,
  ValidationReport,
} from './types.js';
import { runLoadTest, runLoadTests } from './load-test.js';
import { getValidationTestScenarios } from './scenarios.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Latency targets for validation
 */
export const LATENCY_TARGETS = {
  P50: 10, // 10ms
  P95: 15, // 15ms
  P99: 25, // 25ms
  MAX_SPIKE: 50, // 50ms
  STABILITY_THRESHOLD: 1.5, // 1.5x variance allowed
} as const;

/**
 * Calculate percentile from array of numbers
 */
function calculatePercentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

/**
 * Detect latency spikes in a single test result
 */
function detectLatencySpikes(
  result: LoadTestResult,
  maxSpikeThreshold: number
): LatencySpike[] {
  const spikes: LatencySpike[] = [];

  for (const phase of result.phases) {
    const latencies = phase.requests
      .filter((r) => r.success && r.latency !== undefined)
      .map((r) => r.latency!);

    const p95 = calculatePercentile(latencies, 95);

    // Find requests that exceed the spike threshold
    for (const request of phase.requests) {
      if (request.success && request.latency && request.latency > maxSpikeThreshold) {
        spikes.push({
          phaseName: phase.name,
          requestId: request.id,
          latency: request.latency,
          timestamp: request.startTime,
          threshold: maxSpikeThreshold,
          severity:
            request.latency > maxSpikeThreshold * 2
              ? 'critical'
              : request.latency > maxSpikeThreshold * 1.5
              ? 'high'
              : 'medium',
        });
      }
    }
  }

  return spikes;
}

/**
 * Check latency stability across phases
 */
function checkStability(result: LoadTestResult): StabilityCheck[] {
  const checks: StabilityCheck[] = [];

  if (result.phases.length < 2) {
    return checks;
  }

  // Compare consecutive phases
  for (let i = 1; i < result.phases.length; i++) {
    const prevPhase = result.phases[i - 1];
    const currPhase = result.phases[i];

    const p50Change = currPhase.stats.p50Latency - prevPhase.stats.p50Latency;
    const p95Change = currPhase.stats.p95Latency - prevPhase.stats.p95Latency;
    const p99Change = currPhase.stats.p99Latency - prevPhase.stats.p99Latency;

    const p50Ratio = prevPhase.stats.p50Latency > 0
      ? currPhase.stats.p50Latency / prevPhase.stats.p50Latency
      : 1;
    const p95Ratio = prevPhase.stats.p95Latency > 0
      ? currPhase.stats.p95Latency / prevPhase.stats.p95Latency
      : 1;
    const p99Ratio = prevPhase.stats.p99Latency > 0
      ? currPhase.stats.p99Latency / prevPhase.stats.p99Latency
      : 1;

    // Check if latency is stable (within threshold)
    const isStable =
      p50Ratio <= LATENCY_TARGETS.STABILITY_THRESHOLD &&
      p95Ratio <= LATENCY_TARGETS.STABILITY_THRESHOLD &&
      p99Ratio <= LATENCY_TARGETS.STABILITY_THRESHOLD;

    checks.push({
      fromPhase: prevPhase.name,
      toPhase: currPhase.name,
      p50Change,
      p95Change,
      p99Change,
      p50Ratio,
      p95Ratio,
      p99Ratio,
      isStable,
      degradation:
        p50Change > 0 || p95Change > 0 || p99Change > 0
          ? {
              p50Degradation: Math.max(0, p50Change),
              p95Degradation: Math.max(0, p95Change),
              p99Degradation: Math.max(0, p99Change),
            }
          : undefined,
    });
  }

  return checks;
}

/**
 * Validate a single load test result against latency targets
 */
function validateSingleResult(result: LoadTestResult): LatencyValidationResult {
  const stats = result.stats;

  // Check against targets
  const p50Pass = stats.p50Latency < LATENCY_TARGETS.P50;
  const p95Pass = stats.p95Latency < LATENCY_TARGETS.P95;
  const p99Pass = stats.p99Latency < LATENCY_TARGETS.P99;

  // Detect spikes
  const spikes = detectLatencySpikes(result, LATENCY_TARGETS.MAX_SPIKE);
  const hasCriticalSpikes = spikes.some((s) => s.severity === 'critical');
  const hasHighSpikes = spikes.some((s) => s.severity === 'high');

  // Check stability
  const stabilityChecks = checkStability(result);
  const isStable = stabilityChecks.length === 0 || stabilityChecks.every((c) => c.isStable);
  const hasDegradation = stabilityChecks.some((c) => c.degradation !== undefined);

  return {
    testName: result.testName,
    scenario: result.scenario,
    passed: p50Pass && p95Pass && p99Pass && !hasCriticalSpikes && isStable,
    metrics: {
      p50: {
        value: stats.p50Latency,
        target: LATENCY_TARGETS.P50,
        pass: p50Pass,
      },
      p95: {
        value: stats.p95Latency,
        target: LATENCY_TARGETS.P95,
        pass: p95Pass,
      },
      p99: {
        value: stats.p99Latency,
        target: LATENCY_TARGETS.P99,
        pass: p99Pass,
      },
    },
    spikes: {
      detected: spikes.length > 0,
      count: spikes.length,
      critical: spikes.filter((s) => s.severity === 'critical').length,
      high: spikes.filter((s) => s.severity === 'high').length,
      medium: spikes.filter((s) => s.severity === 'medium').length,
      details: spikes,
    },
    stability: {
      isStable,
      hasDegradation,
      checks: stabilityChecks,
    },
  };
}

/**
 * Run latency validation on a single test configuration
 */
export async function validateSingleTest(
  config: LoadTestConfig
): Promise<LatencyValidationResult> {
  try {
    const result = await runLoadTest(config);
    return validateSingleResult(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      testName: config.testName || 'Unknown Test',
      scenario: config.scenario,
      passed: false,
      metrics: {
        p50: { value: 0, target: LATENCY_TARGETS.P50, pass: false },
        p95: { value: 0, target: LATENCY_TARGETS.P95, pass: false },
        p99: { value: 0, target: LATENCY_TARGETS.P99, pass: false },
      },
      spikes: {
        detected: false,
        count: 0,
        critical: 0,
        high: 0,
        medium: 0,
        details: [],
      },
      stability: {
        isStable: false,
        hasDegradation: false,
        checks: [],
      },
      error: errorMessage,
    };
  }
}

/**
 * Run latency validation across multiple test scenarios
 */
export async function validateLatencyTargets(
  configs?: LoadTestConfig[]
): Promise<ValidationReport> {
  console.log('='.repeat(80));
  console.log('LATENCY TARGET VALIDATION');
  console.log('='.repeat(80));
  console.log('');
  console.log(`P50 Target: < ${LATENCY_TARGETS.P50}ms`);
  console.log(`P95 Target: < ${LATENCY_TARGETS.P95}ms`);
  console.log(`P99 Target: < ${LATENCY_TARGETS.P99}ms`);
  console.log(`Max Spike: < ${LATENCY_TARGETS.MAX_SPIKE}ms`);
  console.log('');

  const testConfigs = configs || getValidationTestScenarios();
  const results: LatencyValidationResult[] = [];

  for (const config of testConfigs) {
    console.log(`Running: ${config.testName || 'Unnamed Test'}...`);
    const validation = await validateSingleTest(config);
    results.push(validation);

    const status = validation.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - P50: ${validation.metrics.p50.value.toFixed(2)}ms, P95: ${validation.metrics.p95.value.toFixed(2)}ms, P99: ${validation.metrics.p99.value.toFixed(2)}ms`);

    if (validation.spikes.detected) {
      console.log(`  ⚠️  Detected ${validation.spikes.count} latency spikes`);
    }

    if (!validation.stability.isStable) {
      console.log(`  ⚠️  Latency degradation detected`);
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
  const allP50 = results.map((r) => r.metrics.p50.value);
  const allP95 = results.map((r) => r.metrics.p95.value);
  const allP99 = results.map((r) => r.metrics.p99.value);

  const avgP50 = allP50.reduce((a, b) => a + b, 0) / allP50.length;
  const avgP95 = allP95.reduce((a, b) => a + b, 0) / allP95.length;
  const avgP99 = allP99.reduce((a, b) => a + b, 0) / allP99.length;

  console.log('Aggregate Metrics:');
  console.log(`  Average P50: ${avgP50.toFixed(2)}ms`);
  console.log(`  Average P95: ${avgP95.toFixed(2)}ms`);
  console.log(`  Average P99: ${avgP99.toFixed(2)}ms`);
  console.log('');

  // Count spikes
  const totalSpikes = results.reduce((sum, r) => sum + r.spikes.count, 0);
  const criticalSpikes = results.reduce((sum, r) => sum + r.spikes.critical, 0);
  const highSpikes = results.reduce((sum, r) => sum + r.spikes.high, 0);

  if (totalSpikes > 0) {
    console.log(`⚠️  Total Latency Spikes: ${totalSpikes}`);
    console.log(`   Critical: ${criticalSpikes}`);
    console.log(`   High: ${highSpikes}`);
    console.log('');
  }

  // Check stability
  const stableTests = results.filter((r) => r.stability.isStable).length;
  const degradedTests = results.filter((r) => r.stability.hasDegradation).length;

  console.log(`Stability: ${stableTests}/${results.length} tests stable`);
  if (degradedTests > 0) {
    console.log(`⚠️  ${degradedTests} tests show latency degradation`);
  }
  console.log('');

  // Overall pass/fail
  const overallPass = failed === 0 && totalSpikes === 0 && degradedTests === 0;
  console.log('='.repeat(80));
  console.log(`OVERALL: ${overallPass ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  console.log('='.repeat(80));

  return {
    timestamp: new Date().toISOString(),
    targets: LATENCY_TARGETS,
    results,
    summary: {
      total: results.length,
      passed,
      failed,
      overallPass,
      aggregateMetrics: {
        avgP50,
        avgP95,
        avgP99,
      },
      spikes: {
        total: totalSpikes,
        critical: criticalSpikes,
        high: highSpikes,
      },
      stability: {
        stable: stableTests,
        degraded: degradedTests,
      },
    },
  };
}

/**
 * Save validation report to file
 */
export function saveValidationReport(
  report: ValidationReport,
  outputDir: string
): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `latency-validation-${timestamp}.json`;
  const filepath = join(outputDir, filename);

  writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Validation report saved to: ${filepath}`);
}

/**
 * Generate markdown validation report
 */
export function generateValidationReport(
  report: ValidationReport,
  outputDir: string
): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `latency-validation-report-${timestamp}.md`;
  const filepath = join(outputDir, filename);

  const lines = [
    '# Latency Target Validation Report',
    '',
    `**Generated:** ${report.timestamp}`,
    '',
    '## Targets',
    '',
    '| Metric | Target |',
    '|--------|--------|',
    `| P50 Latency | < ${report.targets.P50}ms |`,
    `| P95 Latency | < ${report.targets.P95}ms |`,
    `| P99 Latency | < ${report.targets.P99}ms |`,
    `| Max Spike | < ${report.targets.MAX_SPIKE}ms |`,
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
    `| Average P50 | ${report.summary.aggregateMetrics.avgP50.toFixed(2)}ms |`,
    `| Average P95 | ${report.summary.aggregateMetrics.avgP95.toFixed(2)}ms |`,
    `| Average P99 | ${report.summary.aggregateMetrics.avgP99.toFixed(2)}ms |`,
    `| Latency Spikes | ${report.summary.spikes.total} |`,
    `| Stable Tests | ${report.summary.stability.stable}/${report.summary.total} |`,
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

    lines.push(
      '| Metric | Value | Target | Status |',
      '|--------|-------|--------|--------|',
      `| P50 Latency | ${result.metrics.p50.value.toFixed(2)}ms | < ${result.metrics.p50.target}ms | ${result.metrics.p50.pass ? '✅' : '❌'} |`,
      `| P95 Latency | ${result.metrics.p95.value.toFixed(2)}ms | < ${result.metrics.p95.target}ms | ${result.metrics.p95.pass ? '✅' : '❌'} |`,
      `| P99 Latency | ${result.metrics.p99.value.toFixed(2)}ms | < ${result.metrics.p99.target}ms | ${result.metrics.p99.pass ? '✅' : '❌'} |`,
      ''
    );

    if (result.spikes.detected) {
      lines.push(`**Latency Spikes:** ${result.spikes.count}`, '');
      lines.push(
        '| Severity | Count |',
        '|----------|-------|',
        `| Critical | ${result.spikes.critical} |`,
        `| High | ${result.spikes.high} |`,
        `| Medium | ${result.spikes.medium} |`,
        ''
      );
    }

    if (!result.stability.isStable) {
      lines.push('**Stability:** ⚠️ Latency degradation detected', '');
      for (const check of result.stability.checks) {
        if (!check.isStable) {
          lines.push(
            `- ${check.fromPhase} → ${check.toPhase}: P50 ratio ${check.p50Ratio.toFixed(2)}x, P95 ratio ${check.p95Ratio.toFixed(2)}x`
          );
        }
      }
      lines.push('');
    }
  }

  writeFileSync(filepath, lines.join('\n'), 'utf-8');
  console.log(`Markdown report saved to: ${filepath}`);
}

/**
 * Run quick validation smoke test
 */
export async function runValidationSmokeTest(): Promise<boolean> {
  console.log('Running latency validation smoke test...');

  const report = await validateLatencyTargets();

  // Save reports
  const outputDir = './test/load/results';
  saveValidationReport(report, outputDir);
  generateValidationReport(report, outputDir);

  return report.summary.overallPass;
}
