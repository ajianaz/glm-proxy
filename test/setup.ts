/**
 * Vitest setup file
 * Sets environment variables before any test modules are imported
 */

// Enable cache for all tests by default
process.env.CACHE_ENABLED = 'true';

// Disable cache logging during tests
process.env.CACHE_LOG_LEVEL = 'none';
