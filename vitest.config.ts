import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Only run unit tests with vitest (integration tests use Bun APIs)
    include: ['test/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      'data',
      'test/integration/**/*.test.ts', // Exclude integration tests (they require Bun runtime)
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      // Include source files for coverage
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'test/',
        'test/integration/**/*.test.ts',
        'test/**/*.test.ts',
        '*.config.ts',
        'dist/',
        'data/',
        'coverage/',
        'scripts/',
        'docs/',
        '.husky/',
      ],
      // Coverage thresholds (adjust based on requirements)
      // Set per-file thresholds instead of global to allow partial coverage
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
  },
});
