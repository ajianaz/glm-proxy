/**
 * Load testing framework main entry point
 *
 * Provides CLI interface for running load tests
 */

import { runLoadTest, runLoadTests } from './load-test.js';
import {
  printTestResult,
  printSummary,
  saveResults,
  generateMarkdownReport,
} from './reporter.js';
import {
  getSmokeTestScenarios,
  getValidationTestScenarios,
  getAllScenarios,
} from './scenarios.js';
import type { LoadTestConfig } from './types.js';
import { LoadTestScenario } from './types.js';

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
Usage: bun run test/load/index.ts [options]

Options:
  --scenario <type>      Test scenario to run:
                         - smoke (quick smoke tests)
                         - validation (comprehensive validation)
                         - all (all test scenarios)
                         - constant (constant load tests)
                         - ramp (ramp-up tests)
                         - sustained (sustained load tests)
                         - spike (spike tests)
                         - stress (stress tests)
                         - failure (failure tests)
  --duration <ms>        Test duration in milliseconds (default: 300000 = 5 min)
  --concurrency <n>      Maximum concurrent users (default: 100)
  --endpoint <url>       API endpoint to test (default: http://localhost:3000/v1/chat/completions)
  --api-key <key>        API key to use (default: pk_test_benchmark_key)
  --timeout <ms>         Request timeout in milliseconds (default: 30000)
  --output <dir>         Output directory for results (default: ./test/load/results)
  --verbose              Enable verbose output
  --help                 Show this help message

Examples:
  # Run quick smoke tests
  bun run test/load/index.ts --scenario smoke

  # Run comprehensive validation tests
  bun run test/load/index.ts --scenario validation

  # Run custom test with specific parameters
  bun run test/load/index.ts --scenario constant --duration 60000 --concurrency 50

  # Run all test scenarios
  bun run test/load/index.ts --scenario all
`);
}

/**
 * Parse command line arguments
 */
function parseArgs(): Partial<LoadTestConfig> & { scenario: string; outputDir: string } {
  const args = process.argv.slice(2);
  const config: Partial<LoadTestConfig> & { scenario: string; outputDir: string } = {
    scenario: 'smoke',
    outputDir: './test/load/results',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--scenario':
        if (i + 1 < args.length) {
          config.scenario = args[i + 1];
          i++;
        }
        break;

      case '--duration':
        if (i + 1 < args.length) {
          config.duration = parseInt(args[i + 1], 10);
          i++;
        }
        break;

      case '--concurrency':
        if (i + 1 < args.length) {
          config.maxConcurrency = parseInt(args[i + 1], 10);
          config.minConcurrency = parseInt(args[i + 1], 10);
          i++;
        }
        break;

      case '--endpoint':
        if (i + 1 < args.length) {
          config.endpoint = args[i + 1];
          i++;
        }
        break;

      case '--api-key':
        if (i + 1 < args.length) {
          config.apiKey = args[i + 1];
          i++;
        }
        break;

      case '--timeout':
        if (i + 1 < args.length) {
          config.timeout = parseInt(args[i + 1], 10);
          i++;
        }
        break;

      case '--output':
        if (i + 1 < args.length) {
          config.outputDir = args[i + 1];
          i++;
        }
        break;

      case '--verbose':
        config.verbose = true;
        break;

      case '--help':
        printUsage();
        process.exit(0);
        break;

      default:
        console.error(`Unknown option: ${arg}`);
        console.error('Run --help for usage information');
        process.exit(1);
    }
  }

  return config;
}

/**
 * Get scenarios based on type
 */
function getScenariosByType(
  type: string,
  customConfig?: Partial<LoadTestConfig>
): LoadTestConfig[] {
  let scenarios: LoadTestConfig[] = [];

  switch (type) {
    case 'smoke':
      scenarios = getSmokeTestScenarios();
      break;

    case 'validation':
      scenarios = getValidationTestScenarios();
      break;

    case 'all':
      scenarios = getAllScenarios();
      break;

    case 'constant':
      scenarios = getSmokeTestScenarios().filter(
        (s) => s.scenario === LoadTestScenario.CONSTANT_LOAD
      );
      break;

    case 'ramp':
      scenarios = getAllScenarios().filter(
        (s) => s.scenario === LoadTestScenario.RAMP_UP
      );
      break;

    case 'sustained':
      scenarios = getAllScenarios().filter(
        (s) => s.scenario === LoadTestScenario.SUSTAINED
      );
      break;

    case 'spike':
      scenarios = getAllScenarios().filter(
        (s) => s.scenario === LoadTestScenario.SPIKE
      );
      break;

    case 'stress':
      scenarios = getAllScenarios().filter(
        (s) => s.scenario === LoadTestScenario.STRESS
      );
      break;

    case 'failure':
      scenarios = getAllScenarios().filter(
        (s) => s.scenario === LoadTestScenario.FAILURE
      );
      break;

    default:
      console.error(`Unknown scenario type: ${type}`);
      console.error('Valid types: smoke, validation, all, constant, ramp, sustained, spike, stress, failure');
      process.exit(1);
  }

  // Apply custom config overrides
  if (customConfig) {
    scenarios = scenarios.map((s) => ({
      ...s,
      ...customConfig,
      // Preserve test name
      testName: s.testName,
    }));
  }

  return scenarios;
}

/**
 * Main entry point
 */
export async function main(): Promise<void> {
  console.log('='.repeat(80));
  console.log('GLM Proxy Load Testing Framework');
  console.log('='.repeat(80));
  console.log('');

  // Parse command line arguments
  const args = parseArgs();

  // Get scenarios
  let scenarios = getScenariosByType(
    args.scenario,
    args
  );

  // Apply output directory to all scenarios
  scenarios = scenarios.map((s) => ({
    ...s,
    outputDir: args.outputDir,
  }));

  console.log(`Scenario: ${args.scenario}`);
  console.log(`Tests to run: ${scenarios.length}`);
  console.log(`Output directory: ${args.outputDir}`);
  console.log('');

  // Run tests
  const results = await runLoadTests(scenarios, (testName, snapshot) => {
    if (args.verbose) {
      console.log(
        `[${testName}] Active: ${snapshot.activeRequests}, ` +
        `Completed: ${snapshot.completedRequests}, ` +
        `Failed: ${snapshot.failedRequests}, ` +
        `Memory: ${(snapshot.memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`
      );
    }
  });

  // Print results
  for (const result of results) {
    printTestResult(result);
  }

  // Print summary
  printSummary(results);

  // Save results
  saveResults(results, args.outputDir);
  generateMarkdownReport(results, args.outputDir);

  // Exit with appropriate code
  const failedCount = results.filter(
    (r) => r.stats.errorRate >= 5 || r.stats.p50Latency >= 10
  ).length;

  if (failedCount > 0) {
    console.error(`\n❌ ${failedCount} test(s) failed performance targets`);
    process.exit(1);
  } else {
    console.log(`\n✅ All tests passed performance targets`);
    process.exit(0);
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

// Export for programmatic use
export { runLoadTest, runLoadTests } from './load-test.js';
export { printTestResult, printSummary, saveResults, generateMarkdownReport } from './reporter.js';
export {
  getSmokeTestScenarios,
  getValidationTestScenarios,
  getAllScenarios,
} from './scenarios.js';
export {
  validateLatencyTargets,
  validateSingleTest,
  saveValidationReport,
  generateValidationReport,
  runValidationSmokeTest,
  LATENCY_TARGETS,
} from './latency-validation.js';
export { LoadTestScenario } from './types.js';
export type {
  LoadTestConfig,
  LoadTestResult,
  LoadTestSnapshot,
  LatencyValidationResult,
  ValidationReport,
  LatencySpike,
  StabilityCheck,
} from './types.js';
