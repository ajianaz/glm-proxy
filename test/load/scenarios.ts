/**
 * Load testing scenarios
 *
 * Defines various load test scenarios for comprehensive testing
 */

import type { LoadTestConfig } from './types.js';
import { LoadTestScenario } from './types.js';

const DEFAULT_ENDPOINT = 'http://localhost:3000/v1/chat/completions';
const DEFAULT_API_KEY = 'pk_test_benchmark_key';

/**
 * Standard concurrency levels for testing
 */
export const CONCURRENCY_LEVELS = [1, 10, 50, 100, 500, 1000] as const;

/**
 * Standard test durations
 */
export const TEST_DURATIONS = {
  SHORT: 30 * 1000, // 30 seconds
  MEDIUM: 5 * 60 * 1000, // 5 minutes
  LONG: 15 * 60 * 1000, // 15 minutes
  EXTENDED: 60 * 60 * 1000, // 1 hour
} as const;

/**
 * Create a base configuration with defaults
 */
function createBaseConfig(partial?: Partial<LoadTestConfig>): LoadTestConfig {
  return {
    duration: TEST_DURATIONS.MEDIUM,
    minConcurrency: 1,
    maxConcurrency: 100,
    concurrencyStep: 10,
    endpoint: DEFAULT_ENDPOINT,
    apiKey: DEFAULT_API_KEY,
    timeout: 30000,
    scenario: LoadTestScenario.CONSTANT_LOAD,
    outputDir: './test/load/results',
    verbose: false,
    ...partial,
  };
}

/**
 * Constant load test scenarios
 * Maintains steady concurrency throughout the test
 */
export function createConstantLoadScenarios(): LoadTestConfig[] {
  return CONCURRENCY_LEVELS.map((concurrency) =>
    createBaseConfig({
      testName: `Constant Load - ${concurrency} Concurrent Users`,
      duration: TEST_DURATIONS.MEDIUM,
      minConcurrency: concurrency,
      maxConcurrency: concurrency,
      concurrencyStep: 0,
      scenario: LoadTestScenario.CONSTANT_LOAD,
    })
  );
}

/**
 * Ramp-up test scenarios
 * Gradually increases concurrency from min to max
 */
export function createRampUpScenarios(): LoadTestConfig[] {
  return [
    createBaseConfig({
      testName: 'Ramp Up - 1 to 100 Concurrent Users',
      duration: TEST_DURATIONS.MEDIUM,
      minConcurrency: 1,
      maxConcurrency: 100,
      concurrencyStep: 10,
      rampUpTime: TEST_DURATIONS.MEDIUM,
      scenario: LoadTestScenario.RAMP_UP,
    }),
    createBaseConfig({
      testName: 'Ramp Up - 1 to 500 Concurrent Users',
      duration: TEST_DURATIONS.LONG,
      minConcurrency: 1,
      maxConcurrency: 500,
      concurrencyStep: 50,
      rampUpTime: TEST_DURATIONS.LONG,
      scenario: LoadTestScenario.RAMP_UP,
    }),
    createBaseConfig({
      testName: 'Ramp Up - 1 to 1000 Concurrent Users',
      duration: TEST_DURATIONS.EXTENDED,
      minConcurrency: 1,
      maxConcurrency: 1000,
      concurrencyStep: 100,
      rampUpTime: TEST_DURATIONS.EXTENDED,
      scenario: LoadTestScenario.RAMP_UP,
    }),
  ];
}

/**
 * Ramp-down test scenarios
 * Starts at high concurrency and gradually decreases
 */
export function createRampDownScenarios(): LoadTestConfig[] {
  return [
    createBaseConfig({
      testName: 'Ramp Down - 100 to 1 Concurrent Users',
      duration: TEST_DURATIONS.MEDIUM,
      minConcurrency: 1,
      maxConcurrency: 100,
      concurrencyStep: -10,
      rampDownTime: TEST_DURATIONS.MEDIUM,
      scenario: LoadTestScenario.RAMP_DOWN,
    }),
    createBaseConfig({
      testName: 'Ramp Down - 500 to 1 Concurrent Users',
      duration: TEST_DURATIONS.LONG,
      minConcurrency: 1,
      maxConcurrency: 500,
      concurrencyStep: -50,
      rampDownTime: TEST_DURATIONS.LONG,
      scenario: LoadTestScenario.RAMP_DOWN,
    }),
  ];
}

/**
 * Spike test scenarios
 * Simulates sudden traffic spikes
 */
export function createSpikeScenarios(): LoadTestConfig[] {
  return [
    createBaseConfig({
      testName: 'Spike Test - Sudden jump to 500 users',
      duration: TEST_DURATIONS.MEDIUM,
      minConcurrency: 10,
      maxConcurrency: 500,
      concurrencyStep: 490, // Sudden jump
      scenario: LoadTestScenario.SPIKE,
    }),
    createBaseConfig({
      testName: 'Spike Test - Sudden jump to 1000 users',
      duration: TEST_DURATIONS.LONG,
      minConcurrency: 10,
      maxConcurrency: 1000,
      concurrencyStep: 990, // Sudden jump
      scenario: LoadTestScenario.SPIKE,
    }),
  ];
}

/**
 * Sustained load test scenarios
 * Maintains high load over extended periods
 */
export function createSustainedLoadScenarios(): LoadTestConfig[] {
  return [
    createBaseConfig({
      testName: `Sustained Load - 100 users for 5 minutes`,
      duration: TEST_DURATIONS.MEDIUM,
      minConcurrency: 100,
      maxConcurrency: 100,
      concurrencyStep: 0,
      scenario: LoadTestScenario.SUSTAINED,
    }),
    createBaseConfig({
      testName: `Sustained Load - 100 users for 15 minutes`,
      duration: TEST_DURATIONS.LONG,
      minConcurrency: 100,
      maxConcurrency: 100,
      concurrencyStep: 0,
      scenario: LoadTestScenario.SUSTAINED,
    }),
    createBaseConfig({
      testName: `Sustained Load - 100 users for 1 hour`,
      duration: TEST_DURATIONS.EXTENDED,
      minConcurrency: 100,
      maxConcurrency: 100,
      concurrencyStep: 0,
      scenario: LoadTestScenario.SUSTAINED,
    }),
  ];
}

/**
 * Stress test scenarios
 * Pushes system to breaking point
 */
export function createStressScenarios(): LoadTestConfig[] {
  return [
    createBaseConfig({
      testName: 'Stress Test - Progressive load to 2000 users',
      duration: TEST_DURATIONS.LONG,
      minConcurrency: 100,
      maxConcurrency: 2000,
      concurrencyStep: 100,
      rampUpTime: TEST_DURATIONS.LONG,
      scenario: LoadTestScenario.STRESS,
    }),
  ];
}

/**
 * Failure test scenarios
 * Tests behavior under failures and timeouts
 */
export function createFailureScenarios(): LoadTestConfig[] {
  return [
    createBaseConfig({
      testName: 'Failure Test - Invalid API keys',
      duration: TEST_DURATIONS.SHORT,
      minConcurrency: 50,
      maxConcurrency: 50,
      concurrencyStep: 0,
      apiKey: 'pk_invalid_key',
      scenario: LoadTestScenario.FAILURE,
    }),
    createBaseConfig({
      testName: 'Failure Test - Request timeouts',
      duration: TEST_DURATIONS.SHORT,
      minConcurrency: 50,
      maxConcurrency: 50,
      concurrencyStep: 0,
      timeout: 1, // 1ms timeout to force failures
      scenario: LoadTestScenario.FAILURE,
    }),
    createBaseConfig({
      testName: 'Failure Test - Invalid endpoint',
      duration: TEST_DURATIONS.SHORT,
      minConcurrency: 50,
      maxConcurrency: 50,
      concurrencyStep: 0,
      endpoint: 'http://localhost:9999/invalid',
      scenario: LoadTestScenario.FAILURE,
    }),
  ];
}

/**
 * Get all standard load test scenarios
 */
export function getAllScenarios(): LoadTestConfig[] {
  return [
    ...createConstantLoadScenarios(),
    ...createRampUpScenarios(),
    ...createRampDownScenarios(),
    ...createSpikeScenarios(),
    ...createSustainedLoadScenarios(),
    ...createStressScenarios(),
    ...createFailureScenarios(),
  ];
}

/**
 * Get quick smoke test scenarios (subset of all tests)
 */
export function getSmokeTestScenarios(): LoadTestConfig[] {
  return [
    createBaseConfig({
      testName: 'Smoke Test - 10 Concurrent Users',
      duration: TEST_DURATIONS.SHORT,
      minConcurrency: 10,
      maxConcurrency: 10,
      concurrencyStep: 0,
      scenario: LoadTestScenario.CONSTANT_LOAD,
    }),
    createBaseConfig({
      testName: 'Smoke Test - Ramp to 50 users',
      duration: TEST_DURATIONS.SHORT,
      minConcurrency: 1,
      maxConcurrency: 50,
      concurrencyStep: 10,
      rampUpTime: TEST_DURATIONS.SHORT,
      scenario: LoadTestScenario.RAMP_UP,
    }),
  ];
}

/**
 * Get full validation test scenarios (comprehensive)
 */
export function getValidationTestScenarios(): LoadTestConfig[] {
  return [
    ...createConstantLoadScenarios().slice(0, 4), // 1, 10, 50, 100 users
    ...createRampUpScenarios().slice(0, 1), // One ramp-up test
    ...createSustainedLoadScenarios().slice(0, 1), // One sustained test (5 min)
    ...createFailureScenarios(), // All failure tests
  ];
}
