/**
 * Integration Test Setup
 *
 * Provides utilities for setting up and tearing down the test environment,
 * including temporary data directories, environment variables, and cleanup.
 */

import fs from 'fs';
import path from 'path';
import type { ApiKey } from '../../src/types';
import { TEST_API_KEYS } from './fixtures';

/**
 * Test environment configuration
 */
export interface TestEnvironment {
  testDataDir: string;
  testDataFile: string;
  originalEnv: NodeJS.ProcessEnv;
}

/**
 * Sets up the test environment before running tests
 *
 * Creates a temporary data directory, sets environment variables,
 * and initializes test API keys.
 *
 * @param customDir - Optional custom directory path
 * @returns Test environment configuration
 */
export function setupTestEnvironment(customDir?: string): TestEnvironment {
  // Store original environment variables
  const originalEnv = { ...process.env };

  // Create temporary test data directory
  const testDataDir = customDir || path.join(process.cwd(), 'data', 'test');
  const testDataFile = path.join(testDataDir, 'apikeys.json');

  // Create directory if it doesn't exist
  if (!fs.existsSync(testDataDir)) {
    fs.mkdirSync(testDataDir, { recursive: true });
  }

  // Set environment variables for testing
  process.env.DATA_FILE = testDataFile;
  process.env.ZAI_API_KEY = 'test_zai_api_key';
  process.env.DEFAULT_MODEL = 'glm-4';
  process.env.NODE_ENV = 'test';
  process.env.PORT = '0'; // Use random port

  // Initialize test API keys file
  writeTestApiKeys(testDataFile, TEST_API_KEYS);

  return {
    testDataDir,
    testDataFile,
    originalEnv,
  };
}

/**
 * Tears down the test environment after running tests
 *
 * Cleans up temporary files and restores environment variables.
 *
 * @param env - Test environment configuration
 * @param cleanupData - Whether to remove test data files (default: true)
 */
export function teardownTestEnvironment(env: TestEnvironment, cleanupData = true): void {
  const { testDataDir, testDataFile, originalEnv } = env;

  // Clean up test data files if requested
  if (cleanupData) {
    cleanupTestDataFiles(testDataFile);
  }

  // Clean up test data directory if empty
  try {
    const files = fs.readdirSync(testDataDir);
    if (files.length === 0) {
      fs.rmdirSync(testDataDir);
    }
  } catch (e) {
    // Directory might not exist or have permission issues
    // Ignore cleanup errors
  }

  // Restore original environment variables
  process.env = originalEnv;
}

/**
 * Writes test API keys to a file
 */
export function writeTestApiKeys(filePath: string, keys: ApiKey[]): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(
    filePath,
    JSON.stringify({ keys }, null, 2),
    'utf-8'
  );
}

/**
 * Cleans up test data files
 */
export function cleanupTestDataFiles(dataFile: string): void {
  // Remove main data file
  if (fs.existsSync(dataFile)) {
    fs.unlinkSync(dataFile);
  }

  // Remove lock file if it exists
  const lockFile = dataFile + '.lock';
  if (fs.existsSync(lockFile)) {
    try {
      fs.rmdirSync(lockFile);
    } catch (e) {
      // Lock directory might not be empty or accessible
      // Ignore cleanup errors
    }
  }

  // Remove temp file if it exists
  const tempFile = dataFile + '.tmp';
  if (fs.existsSync(tempFile)) {
    fs.unlinkSync(tempFile);
  }
}

/**
 * Sets up a test environment with custom API keys
 *
 * @param keys - Custom API keys to use for testing
 * @param customDir - Optional custom directory path
 * @returns Test environment configuration
 */
export function setupTestEnvironmentWithKeys(
  keys: ApiKey[],
  customDir?: string
): TestEnvironment {
  const env = setupTestEnvironment(customDir);
  writeTestApiKeys(env.testDataFile, keys);
  return env;
}

/**
 * Resets test API keys to initial state
 *
 * Useful for tests that modify API key data and need to reset.
 *
 * @param env - Test environment configuration
 */
export function resetTestApiKeys(env: TestEnvironment): void {
  writeTestApiKeys(env.testDataFile, TEST_API_KEYS);
}

/**
 * Creates a backup of the current API keys file
 *
 * Useful for tests that need to restore state after modifications.
 *
 * @param env - Test environment configuration
 * @returns Backup file path
 */
export function backupApiKeys(env: TestEnvironment): string {
  const backupPath = env.testDataFile + '.backup';
  if (fs.existsSync(env.testDataFile)) {
    fs.copyFileSync(env.testDataFile, backupPath);
  }
  return backupPath;
}

/**
 * Restores API keys from a backup
 *
 * @param env - Test environment configuration
 * @param backupPath - Backup file path
 */
export function restoreApiKeys(env: TestEnvironment, backupPath: string): void {
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, env.testDataFile);
    fs.unlinkSync(backupPath);
  }
}

/**
 * Test environment setup helper for Vitest
 *
 * Usage in beforeEach:
 * ```ts
 * let testEnv: TestEnvironment;
 * beforeEach(() => {
 *   testEnv = setupTestEnvironment();
 * });
 *
 * afterEach(() => {
 *   teardownTestEnvironment(testEnv);
 * });
 * ```
 */
export function createTestSetup() {
  let env: TestEnvironment | null = null;

  return {
    setup: () => {
      if (env) {
        throw new Error('Test environment already set up');
      }
      env = setupTestEnvironment();
      return env;
    },
    teardown: () => {
      if (!env) {
        throw new Error('Test environment not set up');
      }
      teardownTestEnvironment(env);
      env = null;
    },
    getEnv: () => {
      if (!env) {
        throw new Error('Test environment not set up');
      }
      return env;
    },
  };
}

/**
 * Sets up environment for a specific test scenario
 *
 * @param scenario - Scenario configuration
 * @returns Test environment configuration
 */
export interface TestScenario {
  keys?: ApiKey[];
  envVars?: Record<string, string>;
  customDir?: string;
}

export function setupTestScenario(scenario: TestScenario = {}): TestEnvironment {
  // Set up base environment
  const env = scenario.keys
    ? setupTestEnvironmentWithKeys(scenario.keys, scenario.customDir)
    : setupTestEnvironment(scenario.customDir);

  // Set custom environment variables
  if (scenario.envVars) {
    for (const [key, value] of Object.entries(scenario.envVars)) {
      process.env[key] = value;
    }
  }

  return env;
}

/**
 * Gets the current test data file path from environment
 */
export function getTestDataFilePath(): string {
  return process.env.DATA_FILE || path.join(process.cwd(), 'data', 'apikeys.json');
}

/**
 * Checks if running in test environment
 */
export function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Validates test environment setup
 *
 * Throws an error if the test environment is not properly configured.
 */
export function validateTestEnvironment(): void {
  if (!process.env.DATA_FILE) {
    throw new Error('DATA_FILE environment variable not set');
  }

  if (!process.env.ZAI_API_KEY) {
    throw new Error('ZAI_API_KEY environment variable not set');
  }

  const dataFile = getTestDataFilePath();
  const dataDir = path.dirname(dataFile);

  if (!fs.existsSync(dataDir)) {
    throw new Error(`Test data directory does not exist: ${dataDir}`);
  }
}
