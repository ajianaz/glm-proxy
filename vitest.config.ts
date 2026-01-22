import { defineConfig } from 'vitest/config';

/**
 * Vitest Configuration for Admin API Tests
 *
 * This configures the test environment for all unit and integration tests.
 * Tests are run using Bun's test runner via `bun test` command.
 *
 * Note: While this file is named vitest.config.ts, we use Bun's built-in
 * test runner which is compatible with vitest APIs but optimized for Bun.
 */
export default defineConfig({
  test: {
    // Use 'bun:test' globals (describe, it, expect, etc.) without importing
    globals: true,

    // Test environment: Node.js environment for server-side code
    environment: 'node',

    // Test file patterns
    include: ['**/*.test.ts'],

    // Exclude non-test files
    exclude: ['**/node_modules/**', '**/dist/**'],

    // Test timeout (10 seconds to accommodate async operations)
    testTimeout: 10000,

    // Coverage configuration (optional)
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    },
  },
});
