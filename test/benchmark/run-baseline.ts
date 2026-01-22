/**
 * Baseline Performance Measurement Script
 *
 * This script runs comprehensive benchmarks to establish the current performance baseline
 * for the GLM Proxy before optimization work begins.
 */

import { runBenchmarkSuite } from './index.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

interface BaselineReport {
  version: string;
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
  };
  benchmarks: {
    latency: {
      mean: number;
      median: number;
      p95: number;
      p99: number;
      min: number;
      max: number;
      target: number; // Target: < 10ms overhead
      status: 'pass' | 'fail' | 'warn';
    };
    throughput: Array<{
      concurrency: number;
      meanRps: number;
      maxRps: number;
      successRate: number;
      totalErrors: number;
    }>;
    memory: {
      baseMemory: number; // MB
      peakMemory: number; // MB
      memoryGrowth: number; // MB
      target: number; // Target: < 100MB
      status: 'pass' | 'fail' | 'warn';
    };
    cpu: {
      averageUsage: number; // seconds
      peakUsage: number; // seconds
    };
  };
  analysis: {
    bottlenecks: string[];
    strengths: string[];
    recommendations: string[];
  };
  rawResults: string; // Reference to raw benchmark file
}

/**
 * Analyze benchmark results to identify bottlenecks and recommendations
 */
function analyzeResults(report: any): {
  bottlenecks: string[];
  strengths: string[];
  recommendations: string[];
} {
  const bottlenecks: string[] = [];
  const strengths: string[] = [];
  const recommendations: string[] = [];

  // Analyze latency
  if (report.results.latency) {
    const { stats } = report.results.latency;
    const meanOverhead = stats.mean;

    if (meanOverhead > 10) {
      bottlenecks.push(
        `High latency overhead: ${meanOverhead.toFixed(2)}ms (target: < 10ms)`
      );
    }

    if (stats.p95 > stats.mean * 2) {
      bottlenecks.push(
        `High latency variance: P95 (${stats.p95.toFixed(2)}ms) is 2x+ mean (${stats.mean.toFixed(2)}ms)`
      );
      recommendations.push('Investigate request queuing and connection handling');
    }

    if (stats.p99 > stats.p95 * 1.5) {
      recommendations.push(
        'Investigate outlier requests causing high P99 latency (GC pauses, network issues)'
      );
    }
  }

  // Analyze throughput
  if (report.results.throughput && report.results.throughput.length > 0) {
    const throughputResults = report.results.throughput;

    for (const result of throughputResults) {
      const concurrency = result.metadata.config.concurrency as number;
      const { stats } = result;

      if (stats.totalErrors > 0) {
        bottlenecks.push(
          `Request errors at concurrency ${concurrency}: ${stats.totalErrors} errors (${stats.overallSuccessRate.toFixed(2)}% success rate)`
        );
        recommendations.push('Improve error handling and connection stability under load');
      }

      if (stats.overallSuccessRate < 99) {
        recommendations.push(
          `Investigate failure causes at concurrency level ${concurrency}`
        );
      }
    }

    // Check scaling behavior
    const rpsValues = throughputResults.map((t: any) => t.stats.meanRps);
    const scalingEfficiency = rpsValues[rpsValues.length - 1] / (rpsValues[0] * throughputResults.length);

    if (scalingEfficiency < 0.5) {
      bottlenecks.push(
        `Poor scaling efficiency: ${(scalingEfficiency * 100).toFixed(1)}% (target: > 70%)`
      );
      recommendations.push('Consider connection pooling and HTTP/2 multiplexing');
    }
  }

  // Analyze memory
  if (report.results.memory) {
    const { stats } = report.results.memory;
    const baseMemoryMB = stats.baseMemory / 1024 / 1024;
    const memoryGrowthMB = stats.memoryGrowth / 1024 / 1024;

    if (baseMemoryMB > 100) {
      bottlenecks.push(
        `High base memory usage: ${baseMemoryMB.toFixed(2)}MB (target: < 100MB)`
      );
      recommendations.push('Optimize initialization and reduce base footprint');
    }

    if (memoryGrowthMB > 10) {
      bottlenecks.push(
        `High memory growth during benchmark: ${memoryGrowthMB.toFixed(2)}MB`
      );
      recommendations.push('Investigate potential memory leaks or inefficient object allocation');
    }

    if (memoryGrowthMB < 5) {
      strengths.push('Good memory stability during load');
    }
  }

  // Analyze CPU
  if (report.results.cpu) {
    const { stats } = report.results.cpu;
    const avgCpuPerRequest = stats.averageUsage / 100; // Normalize per 100 iterations

    if (avgCpuPerRequest > 0.1) {
      bottlenecks.push(
        `High CPU usage per request: ${avgCpuPerRequest.toFixed(3)}s`
      );
      recommendations.push('Optimize JSON parsing and serialization');
      recommendations.push('Consider implementing request/response streaming');
    } else {
      strengths.push('Efficient CPU usage');
    }
  }

  // General recommendations based on overall analysis
  if (bottlenecks.length === 0) {
    strengths.push('All metrics within acceptable ranges');
  }

  if (recommendations.length === 0) {
    recommendations.push('Continue monitoring for performance regressions');
  }

  return { bottlenecks, strengths, recommendations };
}

/**
 * Main baseline measurement function
 */
export async function runBaselineMeasurement(
  outputDir: string = './test/benchmark/results'
): Promise<BaselineReport> {
  console.log('='.repeat(80));
  console.log('BASELINE PERFORMANCE MEASUREMENT');
  console.log('='.repeat(80));
  console.log('');
  console.log('This will establish the current performance baseline before optimization.');
  console.log('');

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Capture environment info
  const environment = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };

  console.log('Environment:');
  console.log(`  Node Version: ${environment.nodeVersion}`);
  console.log(`  Platform: ${environment.platform}`);
  console.log(`  Architecture: ${environment.arch}`);
  console.log('');

  // Run comprehensive benchmark suite with increased iterations for accuracy
  console.log('Running benchmark suite...');
  console.log('This may take several minutes...');
  console.log('');

  const benchmarkReport = await runBenchmarkSuite({
    iterations: 200, // More iterations for accurate baseline
    concurrency: 10,
    warmupIterations: 20,
    timeout: 60000,
    endpoint: 'http://localhost:3000/v1/chat/completions',
    apiKey: 'pk_test_benchmark_key',
  }, outputDir);

  // Save raw results with baseline suffix
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rawResultsFile = `baseline-raw-${timestamp}.json`;
  const rawResultsPath = join(outputDir, rawResultsFile);

  writeFileSync(rawResultsPath, JSON.stringify(benchmarkReport, null, 2), 'utf-8');
  console.log(`Raw results saved to: ${rawResultsPath}`);
  console.log('');

  // Analyze results
  const analysis = analyzeResults(benchmarkReport);

  // Build baseline report
  const baselineReport: BaselineReport = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment,
    benchmarks: {
      latency: {
        mean: benchmarkReport.results.latency?.stats.mean ?? 0,
        median: benchmarkReport.results.latency?.stats.median ?? 0,
        p95: benchmarkReport.results.latency?.stats.p95 ?? 0,
        p99: benchmarkReport.results.latency?.stats.p99 ?? 0,
        min: benchmarkReport.results.latency?.stats.min ?? 0,
        max: benchmarkReport.results.latency?.stats.max ?? 0,
        target: 10, // < 10ms target
        status:
          (benchmarkReport.results.latency?.stats.mean ?? 0) < 10
            ? 'pass'
            : (benchmarkReport.results.latency?.stats.mean ?? 0) < 15
              ? 'warn'
              : 'fail',
      },
      throughput:
        benchmarkReport.results.throughput?.map((t: any) => ({
          concurrency: t.metadata.config.concurrency,
          meanRps: t.stats.meanRps,
          maxRps: t.stats.maxRps,
          successRate: t.stats.overallSuccessRate,
          totalErrors: t.stats.totalErrors,
        })) ?? [],
      memory: {
        baseMemory: (benchmarkReport.results.memory?.stats.baseMemory ?? 0) / 1024 / 1024,
        peakMemory: (benchmarkReport.results.memory?.stats.peakMemory ?? 0) / 1024 / 1024,
        memoryGrowth: (benchmarkReport.results.memory?.stats.memoryGrowth ?? 0) / 1024 / 1024,
        target: 100, // < 100MB target
        status:
          (benchmarkReport.results.memory?.stats.baseMemory ?? 0) / 1024 / 1024 < 100
            ? 'pass'
            : (benchmarkReport.results.memory?.stats.baseMemory ?? 0) / 1024 / 1024 < 150
              ? 'warn'
              : 'fail',
      },
      cpu: {
        averageUsage: benchmarkReport.results.cpu?.stats.averageUsage ?? 0,
        peakUsage: benchmarkReport.results.cpu?.stats.peakUsage ?? 0,
      },
    },
    analysis,
    rawResults: rawResultsFile,
  };

  // Save baseline report
  const baselineFile = 'baseline-results.json';
  const baselinePath = join(outputDir, baselineFile);

  writeFileSync(baselinePath, JSON.stringify(baselineReport, null, 2), 'utf-8');
  console.log(`Baseline report saved to: ${baselinePath}`);
  console.log('');

  // Print summary
  console.log('='.repeat(80));
  console.log('BASELINE RESULTS SUMMARY');
  console.log('='.repeat(80));
  console.log('');

  console.log('LATENCY:');
  const { latency } = baselineReport.benchmarks;
  console.log(`  Mean: ${latency.mean.toFixed(2)}ms (target: < ${latency.target}ms) [${latency.status.toUpperCase()}]`);
  console.log(`  Median: ${latency.median.toFixed(2)}ms`);
  console.log(`  P95: ${latency.p95.toFixed(2)}ms`);
  console.log(`  P99: ${latency.p99.toFixed(2)}ms`);
  console.log(`  Range: ${latency.min.toFixed(2)}ms - ${latency.max.toFixed(2)}ms`);
  console.log('');

  console.log('THROUGHPUT:');
  baselineReport.benchmarks.throughput.forEach((t) => {
    console.log(`  Concurrency ${t.concurrency}:`);
    console.log(`    Mean RPS: ${t.meanRps.toFixed(2)}`);
    console.log(`    Max RPS: ${t.maxRps.toFixed(2)}`);
    console.log(`    Success Rate: ${t.successRate.toFixed(2)}%`);
    console.log(`    Errors: ${t.totalErrors}`);
  });
  console.log('');

  console.log('MEMORY:');
  const { memory } = baselineReport.benchmarks;
  console.log(`  Base Memory: ${memory.baseMemory.toFixed(2)}MB (target: < ${memory.target}MB) [${memory.status.toUpperCase()}]`);
  console.log(`  Peak Memory: ${memory.peakMemory.toFixed(2)}MB`);
  console.log(`  Memory Growth: ${memory.memoryGrowth.toFixed(2)}MB`);
  console.log('');

  console.log('CPU:');
  const { cpu } = baselineReport.benchmarks;
  console.log(`  Average Usage: ${cpu.averageUsage.toFixed(3)}s`);
  console.log(`  Peak Usage: ${cpu.peakUsage.toFixed(3)}s`);
  console.log('');

  console.log('ANALYSIS:');
  console.log('  Bottlenecks:');
  if (analysis.bottlenecks.length === 0) {
    console.log('    ✓ None detected');
  } else {
    analysis.bottlenecks.forEach((b) => console.log(`    ✗ ${b}`));
  }
  console.log('  Strengths:');
  if (analysis.strengths.length === 0) {
    console.log('    - None identified');
  } else {
    analysis.strengths.forEach((s) => console.log(`    ✓ ${s}`));
  }
  console.log('  Recommendations:');
  analysis.recommendations.forEach((r) => console.log(`    → ${r}`));
  console.log('');

  console.log('='.repeat(80));
  console.log('');

  return baselineReport;
}

/**
 * Main entry point
 */
export async function main(): Promise<void> {
  try {
    const baselineReport = await runBaselineMeasurement();
    console.log('✓ Baseline measurement completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Review the baseline report at ./test/benchmark/results/baseline-results.json');
    console.log('2. Use this baseline to compare against future optimizations');
    console.log('3. Begin optimization work based on identified bottlenecks');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`✗ Baseline measurement failed: ${errorMessage}`);
    console.error('');
    console.error('Troubleshooting:');
    console.error('1. Ensure the proxy server is running on port 3000');
    console.error('2. Run with: bun run start');
    console.error('3. Then run: bun run test/benchmark/run-baseline.ts');
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main().catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Fatal error: ${errorMessage}`);
    process.exit(1);
  });
}
