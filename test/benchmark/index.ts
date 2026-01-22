/**
 * Benchmark suite runner
 *
 * Main entry point for running performance benchmarks
 */

import { runProxyBenchmarks } from './proxy-benchmark.js';
import { runMemoryBenchmarks } from './memory-benchmark.js';
import type {
  BenchmarkConfig,
  CompleteBenchmarkReport,
  BenchmarkSuite,
} from './types.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Run complete benchmark suite
 */
export async function runBenchmarkSuite(
  config: Partial<BenchmarkConfig> = {},
  outputDir: string = './test/benchmark/results'
): Promise<CompleteBenchmarkReport> {
  const startTime = Date.now();
  const suiteName = `GLM Proxy Benchmark ${new Date().toISOString()}`;

  let totalTestsRun = 0;
  let passed = 0;
  let failed = 0;

  const results: CompleteBenchmarkReport['results'] = {};

  try {
    // Run proxy benchmarks (latency and throughput)
    try {
      totalTestsRun++;
      const proxyResults = await runProxyBenchmarks(config);
      results.latency = proxyResults.latency;
      results.throughput = proxyResults.throughput;
      passed++;
    } catch (error: unknown) {
      failed++;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Proxy benchmarks failed: ${errorMessage}`);
    }

    // Run memory and CPU benchmarks
    try {
      totalTestsRun++;
      const memoryResults = await runMemoryBenchmarks(config);
      results.memory = memoryResults.memory;
      results.cpu = memoryResults.cpu;
      passed++;
    } catch (error: unknown) {
      failed++;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Memory benchmarks failed: ${errorMessage}`);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Create complete report
    const report: CompleteBenchmarkReport = {
      suiteName,
      timestamp: new Date().toISOString(),
      config: {
        iterations: config.iterations ?? 100,
        concurrency: config.concurrency ?? 10,
        warmupIterations: config.warmupIterations ?? 10,
        timeout: config.timeout ?? 30000,
        endpoint: config.endpoint ?? 'http://localhost:3000/v1/chat/completions',
        apiKey: config.apiKey ?? 'pk_test_benchmark_key',
      },
      results,
      summary: {
        totalTestsRun,
        passed,
        failed,
        duration,
      },
    };

    // Save report to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `benchmark-report-${timestamp}.json`;
    const filepath = join(outputDir, filename);

    try {
      writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');
    } catch (error: unknown) {
      // Non-critical error, just log and continue
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to save benchmark report: ${errorMessage}`);
    }

    return report;
  } catch (error: unknown) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Return partial report even on failure
    return {
      suiteName,
      timestamp: new Date().toISOString(),
      config: {
        iterations: config.iterations ?? 100,
        concurrency: config.concurrency ?? 10,
        warmupIterations: config.warmupIterations ?? 10,
        timeout: config.timeout ?? 30000,
        endpoint: config.endpoint ?? 'http://localhost:3000/v1/chat/completions',
        apiKey: config.apiKey ?? 'pk_test_benchmark_key',
      },
      results,
      summary: {
        totalTestsRun,
        passed,
        failed,
        duration,
      },
    };
  }
}

/**
 * Print benchmark summary to console
 */
export function printBenchmarkSummary(report: CompleteBenchmarkReport): void {
  const { summary, results } = report;

  const lines = [
    '',
    '='.repeat(80),
    `BENCHMARK SUMMARY: ${report.suiteName}`,
    '='.repeat(80),
    '',
    `Total Tests: ${summary.totalTestsRun}`,
    `Passed: ${summary.passed}`,
    `Failed: ${summary.failed}`,
    `Duration: ${(summary.duration / 1000).toFixed(2)}s`,
    '',
    '-' .repeat(80),
    'LATENCY RESULTS',
    '-' .repeat(80),
  ];

  if (results.latency) {
    const latency = results.latency;
    lines.push(
      `Mean Latency: ${latency.stats.mean.toFixed(2)}ms`,
      `Median Latency: ${latency.stats.median.toFixed(2)}ms`,
      `P95 Latency: ${latency.stats.p95.toFixed(2)}ms`,
      `P99 Latency: ${latency.stats.p99.toFixed(2)}ms`,
      `Min Latency: ${latency.stats.min.toFixed(2)}ms`,
      `Max Latency: ${latency.stats.max.toFixed(2)}ms`,
      `Measurements: ${latency.measurements.length}`,
      ''
    );
  }

  lines.push(
    '-' .repeat(80),
    'THROUGHPUT RESULTS',
    '-' .repeat(80)
  );

  if (results.throughput && results.throughput.length > 0) {
    results.throughput.forEach((throughput) => {
      const concurrency = throughput.metadata.config.concurrency as number;
      lines.push(
        `Concurrency ${concurrency}:`,
        `  Mean RPS: ${throughput.stats.meanRps.toFixed(2)}`,
        `  Max RPS: ${throughput.stats.maxRps.toFixed(2)}`,
        `  Success Rate: ${throughput.stats.overallSuccessRate.toFixed(2)}%`,
        `  Total Requests: ${throughput.stats.totalRequests}`,
        `  Errors: ${throughput.stats.totalErrors}`,
        ''
      );
    });
  }

  lines.push(
    '-' .repeat(80),
    'MEMORY RESULTS',
    '-' .repeat(80)
  );

  if (results.memory) {
    const memory = results.memory;
    lines.push(
      `Base Memory: ${(memory.stats.baseMemory / 1024 / 1024).toFixed(2)}MB`,
      `Peak Memory: ${(memory.stats.peakMemory / 1024 / 1024).toFixed(2)}MB`,
      `Memory Growth: ${(memory.stats.memoryGrowth / 1024 / 1024).toFixed(2)}MB`,
      `Avg Heap Used: ${(memory.stats.averageHeapUsed / 1024 / 1024).toFixed(2)}MB`,
      `Snapshots: ${memory.snapshots.length}`,
      ''
    );
  }

  lines.push(
    '-' .repeat(80),
    'CPU RESULTS',
    '-' .repeat(80)
  );

  if (results.cpu) {
    const cpu = results.cpu;
    lines.push(
      `Average CPU Usage: ${cpu.stats.averageUsage.toFixed(2)}s`,
      `Peak CPU Usage: ${cpu.stats.peakUsage.toFixed(2)}s`,
      `Measurements: ${cpu.measurements.length}`,
      ''
    );
  }

  lines.push('='.repeat(80), '');

  const output = lines.join('\n');
  console.log(output);
}

/**
 * Main entry point for running benchmarks from CLI
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Parse command line arguments
  const config: Partial<BenchmarkConfig> = {};
  let outputDir = './test/benchmark/results';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--iterations' && i + 1 < args.length) {
      config.iterations = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--concurrency' && i + 1 < args.length) {
      config.concurrency = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--warmup' && i + 1 < args.length) {
      config.warmupIterations = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--endpoint' && i + 1 < args.length) {
      config.endpoint = args[i + 1];
      i++;
    } else if (arg === '--api-key' && i + 1 < args.length) {
      config.apiKey = args[i + 1];
      i++;
    } else if (arg === '--output' && i + 1 < args.length) {
      outputDir = args[i + 1];
      i++;
    } else if (arg === '--help') {
      console.log(`
Usage: bun run test/benchmark/index.ts [options]

Options:
  --iterations <n>       Number of iterations per benchmark (default: 100)
  --concurrency <n>      Concurrency level for throughput tests (default: 10)
  --warmup <n>           Number of warmup iterations (default: 10)
  --endpoint <url>       API endpoint to benchmark (default: http://localhost:3000/v1/chat/completions)
  --api-key <key>        API key to use (default: pk_test_benchmark_key)
  --output <dir>         Output directory for results (default: ./test/benchmark/results)
  --help                 Show this help message

Examples:
  bun run test/benchmark/index.ts
  bun run test/benchmark/index.ts --iterations 500 --concurrency 50
  bun run test/benchmark/index.ts --endpoint http://localhost:3000/v1/chat/completions --output ./results
      `);
      process.exit(0);
    }
  }

  console.log('Starting benchmark suite...');
  console.log(`Configuration: ${JSON.stringify(config, null, 2)}`);
  console.log('');

  try {
    const report = await runBenchmarkSuite(config, outputDir);
    printBenchmarkSummary(report);

    if (report.summary.failed > 0) {
      process.exit(1);
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`Benchmark suite failed: ${errorMessage}`);
    process.exit(1);
  }
}

// Run benchmarks if this file is executed directly
if (import.meta.main) {
  main().catch((error: unknown) => {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`Fatal error: ${errorMessage}`);
    process.exit(1);
  });
}
