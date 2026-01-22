/**
 * Test Fixtures and Utilities
 *
 * Centralized test setup, helper functions, and fixtures for all tests.
 * Reduces code duplication across test files and provides consistent test environment.
 */

import { closeDatabase, resetDatabase } from '../src/models/database';
import { resetConfig } from '../src/config';
import { resetAdminKeyCache } from '../src/utils/adminCredentials';

/**
 * Default test environment variables
 */
export const TEST_ENV = {
  ADMIN_API_KEY: 'test-admin-key-12345',
  ZAI_API_KEY: 'test-zai-key',
  ADMIN_API_ENABLED: 'true',
  DATABASE_PATH: ':memory:',
  PORT: '3000',
  DEFAULT_MODEL: 'glm-4.7',
  DEFAULT_RATE_LIMIT: '60',
  CORS_ORIGINS: '*',
} as const;

/**
 * Sets up a clean test environment before each test.
 *
 * This function:
 * - Resets configuration and caches
 * - Sets up environment variables for testing
 * - Closes and resets the database for a clean state
 *
 * Usage in tests:
 * ```ts
 * import { setupTestEnvironment } from '../fixtures';
 *
 * beforeEach(() => {
 *   setupTestEnvironment();
 * });
 * ```
 */
export function setupTestEnvironment(customEnv?: Partial<Record<string, string>>): void {
  // Reset config and caches
  resetConfig();
  resetAdminKeyCache();

  // Set up default environment variables
  Object.entries(TEST_ENV).forEach(([key, value]) => {
    process.env[key] = value;
  });

  // Apply custom environment variables if provided
  if (customEnv) {
    Object.entries(customEnv).forEach(([key, value]) => {
      process.env[key] = value;
    });
  }

  // Close and reset database for clean state
  closeDatabase();
  resetDatabase();
}

/**
 * Cleans up test database files
 *
 * Use this in afterEach to clean up any test database files created during tests.
 * Not needed when using :memory: database (default in setupTestEnvironment).
 *
 * @param dbPath - Path to the database file to clean up
 */
export function cleanupTestDatabase(dbPath: string): void {
  closeDatabase();
  const extensions = ['', '-wal', '-shm'];

  for (const ext of extensions) {
    try {
      const fs = require('fs');
      fs.unlinkSync(dbPath + ext);
    } catch {
      // Ignore cleanup errors (file may not exist)
    }
  }
}

/**
 * Creates a test API key with valid defaults
 *
 * @param overrides - Optional overrides for default test key properties
 * @returns A valid API key object for testing
 */
export function createTestApiKey(overrides?: Partial<{
  key: string;
  name: string;
  description: string | null;
  scopes: string[];
  rate_limit: number;
}>): {
  key: string;
  name: string;
  description: string | null;
  scopes: string[];
  rate_limit: number;
} {
  return {
    key: 'sk-test-key-1234567890abcdefghijkl',
    name: 'Test Key',
    description: 'A test API key',
    scopes: [],
    rate_limit: 60,
    ...overrides,
  };
}

/**
 * Creates a test Request object for admin API endpoints
 *
 * @param options - Request options
 * @returns A Request object configured for testing
 */
export function createTestRequest(options: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path?: string;
  body?: any;
  authToken?: string;
  headers?: Record<string, string>;
}): Request {
  const { method, path = '/', body, authToken, headers = {} } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (authToken) {
    requestHeaders['Authorization'] = `Bearer ${authToken}`;
  }

  const url = new URL(`http://localhost${path}`);

  return new Request(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Delays execution for a specified number of milliseconds
 *
 * Useful for testing time-based behavior (e.g., created_at ordering).
 *
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
