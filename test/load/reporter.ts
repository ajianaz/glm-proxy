/**
 * Load test reporter
 *
 * Generates reports from load test results
 */

import type {
  LoadTestResult,
  LoadTestStatistics,
  LoadTestReport,
  LoadTestSummary,
} from './types.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Format milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes.toFixed(0)}B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)}KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
  } else {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)}GB`;
  }
}

/**
 * Print single test result to console
 */
export function printTestResult(result: LoadTestResult): void {
  const lines = [
    '',
    '='.repeat(80),
    `LOAD TEST: ${result.testName}`,
    '='.repeat(80),
    '',
    `Scenario: ${result.scenario}`,
    `Duration: ${formatDuration(result.duration)}`,
    `Start Time: ${result.startTime}`,
    `End Time: ${result.endTime}`,
    '',
    '-'.repeat(80),
    'REQUEST STATISTICS',
    '-'.repeat(80),
    `Total Requests: ${result.stats.totalRequests}`,
    `Successful: ${result.stats.successfulRequests}`,
    `Failed: ${result.stats.failedRequests}`,
    `Success Rate: ${((result.stats.successfulRequests / result.stats.totalRequests) * 100).toFixed(2)}%`,
    `Overall RPS: ${result.stats.overallRequestsPerSecond.toFixed(2)}`,
    '',
    '-'.repeat(80),
    'LATENCY STATISTICS',
    '-'.repeat(80),
    `Average Latency: ${result.stats.avgLatency.toFixed(2)}ms`,
    `P50 Latency: ${result.stats.p50Latency.toFixed(2)}ms`,
    `P95 Latency: ${result.stats.p95Latency.toFixed(2)}ms`,
    `P99 Latency: ${result.stats.p99Latency.toFixed(2)}ms`,
    `Min Latency: ${result.stats.minLatency.toFixed(2)}ms`,
    `Max Latency: ${result.stats.maxLatency.toFixed(2)}ms`,
    '',
    '-'.repeat(80),
    'RESOURCE USAGE',
    '-'.repeat(80),
    `Peak Memory: ${formatBytes(result.stats.peakMemory)}`,
    `Average Memory: ${formatBytes(result.stats.avgMemory)}`,
    `Peak CPU: ${(result.stats.peakCpu / 1000000).toFixed(2)}s`,
    `Average CPU: ${(result.stats.avgCpu / 1000000).toFixed(2)}s`,
    '',
    '-'.repeat(80),
    'PERFORMANCE TARGETS',
    '-'.repeat(80),
  ];

  // Check against targets
  const targetLatency = 10; // 10ms
  const targetP95 = 15; // 15ms
  const targetP99 = 25; // 25ms
  const targetMemory = 100 * 1024 * 1024; // 100MB

  lines.push(
    `P50 Latency < ${targetLatency}ms: ${result.stats.p50Latency < targetLatency ? '✅ PASS' : '❌ FAIL'} (${result.stats.p50Latency.toFixed(2)}ms)`,
    `P95 Latency < ${targetP95}ms: ${result.stats.p95Latency < targetP95 ? '✅ PASS' : '❌ FAIL'} (${result.stats.p95Latency.toFixed(2)}ms)`,
    `P99 Latency < ${targetP99}ms: ${result.stats.p99Latency < targetP99 ? '✅ PASS' : '❌ FAIL'} (${result.stats.p99Latency.toFixed(2)}ms)`,
    `Memory < ${formatBytes(targetMemory)}: ${result.stats.peakMemory < targetMemory ? '✅ PASS' : '❌ FAIL'} (${formatBytes(result.stats.peakMemory)})`,
    `Error Rate < 5%: ${result.stats.errorRate < 5 ? '✅ PASS' : '❌ FAIL'} (${result.stats.errorRate.toFixed(2)}%)`,
    '',
    '='.repeat(80),
    ''
  );

  console.log(lines.join('\n'));
}

/**
 * Generate recommendations based on test results
 */
function generateRecommendations(results: LoadTestResult[]): string[] {
  const recommendations: string[] = [];

  const avgP50 = results.reduce((sum, r) => sum + r.stats.p50Latency, 0) / results.length;
  const avgP95 = results.reduce((sum, r) => sum + r.stats.p95Latency, 0) / results.length;
  const avgP99 = results.reduce((sum, r) => sum + r.stats.p99Latency, 0) / results.length;
  const avgErrorRate = results.reduce((sum, r) => sum + r.stats.errorRate, 0) / results.length;
  const maxMemory = Math.max(...results.map((r) => r.stats.peakMemory));

  // Latency recommendations
  if (avgP50 > 10) {
    recommendations.push(
      `⚠️  High P50 latency (${avgP50.toFixed(2)}ms). Consider enabling connection pooling.`
    );
  }
  if (avgP95 > 15) {
    recommendations.push(
      `⚠️  High P95 latency (${avgP95.toFixed(2)}ms). Consider optimizing middleware pipeline.`
    );
  }
  if (avgP99 > 25) {
    recommendations.push(
      `⚠️  High P99 latency (${avgP99.toFixed(2)}ms). Check for GC pauses and optimize memory usage.`
    );
  }

  // Error rate recommendations
  if (avgErrorRate > 5) {
    recommendations.push(
      `⚠️  High error rate (${avgErrorRate.toFixed(2)}%). Check rate limits and API key validation.`
    );
  }

  // Memory recommendations
  if (maxMemory > 100 * 1024 * 1024) {
    recommendations.push(
      `⚠️  High memory usage (${formatBytes(maxMemory)}). Consider enabling object pooling.`
    );
  }

  // Scaling recommendations
  const highConcurrencyResults = results.filter((r) => r.config.maxConcurrency >= 100);
  if (highConcurrencyResults.length > 0) {
    const avgHighConcurrencyLatency =
      highConcurrencyResults.reduce((sum, r) => sum + r.stats.p95Latency, 0) /
      highConcurrencyResults.length;
    if (avgHighConcurrencyLatency > avgP95 * 2) {
      recommendations.push(
        `⚠️  Poor scaling under high load. Consider enabling request batching.`
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ All performance targets met!');
  }

  return recommendations;
}

/**
 * Print summary of multiple test results
 */
export function printSummary(results: LoadTestResult[]): void {
  const lines = [
    '',
    '='.repeat(80),
    'LOAD TEST SUMMARY',
    '='.repeat(80),
    '',
    `Total Tests: ${results.length}`,
    `Passed: ${results.filter((r) => r.stats.errorRate < 5 && r.stats.p50Latency < 10).length}`,
    `Failed: ${results.filter((r) => r.stats.errorRate >= 5 || r.stats.p50Latency >= 10).length}`,
    '',
    '-'.repeat(80),
    'AVERAGES ACROSS ALL TESTS',
    '-'.repeat(80),
  ];

  if (results.length > 0) {
    const avgP50 = results.reduce((sum, r) => sum + r.stats.p50Latency, 0) / results.length;
    const avgP95 = results.reduce((sum, r) => sum + r.stats.p95Latency, 0) / results.length;
    const avgP99 = results.reduce((sum, r) => sum + r.stats.p99Latency, 0) / results.length;
    const avgRPS =
      results.reduce((sum, r) => sum + r.stats.overallRequestsPerSecond, 0) / results.length;
    const avgErrorRate = results.reduce((sum, r) => sum + r.stats.errorRate, 0) / results.length;
    const maxMemory = Math.max(...results.map((r) => r.stats.peakMemory));

    lines.push(
      `Average P50 Latency: ${avgP50.toFixed(2)}ms`,
      `Average P95 Latency: ${avgP95.toFixed(2)}ms`,
      `Average P99 Latency: ${avgP99.toFixed(2)}ms`,
      `Average RPS: ${avgRPS.toFixed(2)}`,
      `Average Error Rate: ${avgErrorRate.toFixed(2)}%`,
      `Peak Memory: ${formatBytes(maxMemory)}`,
      ''
    );
  }

  lines.push('-'.repeat(80), 'RECOMMENDATIONS', '-'.repeat(80));

  const recommendations = generateRecommendations(results);
  lines.push(...recommendations);

  lines.push('', '='.repeat(80), '');

  console.log(lines.join('\n'));
}

/**
 * Save test results to JSON file
 */
export function saveResults(results: LoadTestResult[], outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `load-test-results-${timestamp}.json`;
  const filepath = join(outputDir, filename);

  const report: LoadTestReport = {
    timestamp: new Date().toISOString(),
    results,
    summary: {
      totalTests: results.length,
      passed: results.filter((r) => r.stats.errorRate < 5 && r.stats.p50Latency < 10).length,
      failed: results.filter((r) => r.stats.errorRate >= 5 || r.stats.p50Latency >= 10).length,
      totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
      overallSuccessRate:
        results.length > 0
          ? (results.reduce((sum, r) => sum + r.stats.successfulRequests, 0) /
              results.reduce((sum, r) => sum + r.stats.totalRequests, 0)) * 100
          : 0,
      recommendations: generateRecommendations(results),
    },
  };

  writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Results saved to: ${filepath}`);
}

/**
 * Generate markdown report from test results
 */
export function generateMarkdownReport(results: LoadTestResult[], outputDir: string): void {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `load-test-report-${timestamp}.md`;
  const filepath = join(outputDir, filename);

  const lines = [
    '# Load Test Report',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Total Tests:** ${results.length}`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| Total Tests | ${results.length} |`,
    `| Passed | ${results.filter((r) => r.stats.errorRate < 5 && r.stats.p50Latency < 10).length} |`,
    `| Failed | ${results.filter((r) => r.stats.errorRate >= 5 || r.stats.p50Latency >= 10).length} |`,
    '',
    '## Test Results',
    '',
  ];

  for (const result of results) {
    lines.push(`### ${result.testName}`, '');
    lines.push('-'.repeat(80), '');
    lines.push(
      '| Metric | Value |',
      '|--------|-------|',
      `| Duration | ${formatDuration(result.duration)} |`,
      `| Total Requests | ${result.stats.totalRequests} |`,
      `| Success Rate | ${((result.stats.successfulRequests / result.stats.totalRequests) * 100).toFixed(2)}% |`,
      `| P50 Latency | ${result.stats.p50Latency.toFixed(2)}ms |`,
      `| P95 Latency | ${result.stats.p95Latency.toFixed(2)}ms |`,
      `| P99 Latency | ${result.stats.p99Latency.toFixed(2)}ms |`,
      `| Peak Memory | ${formatBytes(result.stats.peakMemory)} |`,
      `| Error Rate | ${result.stats.errorRate.toFixed(2)}% |`,
      ''
    );
  }

  lines.push('## Recommendations', '');
  const recommendations = generateRecommendations(results);
  for (const rec of recommendations) {
    lines.push(`- ${rec}`);
  }

  writeFileSync(filepath, lines.join('\n'), 'utf-8');
  console.log(`Markdown report saved to: ${filepath}`);
}
