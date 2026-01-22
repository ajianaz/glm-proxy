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
    include: ['test/**/*.test.ts', '**/*.test.ts'],

    // Exclude non-test files
    exclude: [
      'node_modules',
      'dist',
      'data',
      'test/integration/**/*.test.ts', // Exclude integration tests (they require Bun runtime)
    ],

    // Test timeout (10 seconds to accommodate async operations)
    testTimeout: 10000,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'test/',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        '*.config.ts',
        'dist/',
        'data/',
        'coverage/',
        'scripts/',
        'docs/',
        '.husky/',
      ],
      // Coverage thresholds (adjust based on requirements)
      thresholds: {
        lines: 30,
        functions: 20,
        branches: 30,
        statements: 30,
      },
      // All files are included by default, not just those touched by tests
      all: true,
      // Clean coverage output directory before running coverage
      clean: true,
    },
    setupFiles: ['./test/setup.ts'],
    fileParallelism: false, // Run test files sequentially to avoid state pollution
  },
});
