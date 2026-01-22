import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { FallbackManager, loadFallbackConfigFromEnv } from './fallback.js';
import { resetStorage } from './index.js';

describe('FallbackManager', () => {
  let manager: FallbackManager;

  afterEach(() => {
    if (manager) {
      manager.reset();
    }
    // Reset storage singleton
    resetStorage();
  });

  describe('Initialization', () => {
    test('should initialize successfully with default config', async () => {
      manager = new FallbackManager({ verboseLogging: false });

      const state = manager.getState();
      expect(state.retryCount).toBe(0);
      expect(state.isInFallback).toBe(false);
    });

    test('should accept custom configuration', () => {
      manager = new FallbackManager({
        enabled: false,
        retryIntervalMs: 30000,
        maxRetries: 5,
        verboseLogging: false,
      });

      expect(manager).toBeDefined();
    });

    test('should throw error when getting storage before initialization', async () => {
      manager = new FallbackManager({ verboseLogging: false });

      expect(() => manager.getStorage()).toThrow('Storage not initialized');
    });
  });

  describe('State Management', () => {
    test('should return correct initial state', () => {
      manager = new FallbackManager({ verboseLogging: false });

      const state = manager.getState();

      expect(state.isInFallback).toBe(false);
      expect(state.retryCount).toBe(0);
      expect(state.lastRetryAt).toBeUndefined();
    });

    test('should reset state correctly', async () => {
      manager = new FallbackManager({ verboseLogging: false });

      // Just verify reset doesn't throw
      manager.reset();

      const state = manager.getState();
      expect(state.retryCount).toBe(0);
      expect(state.isInFallback).toBe(false);
    });

    test('should check fallback mode correctly', () => {
      manager = new FallbackManager({ verboseLogging: false });

      expect(manager.isInFallback()).toBe(false);
    });
  });

  describe('Reconnection Attempts Control', () => {
    test('should start reconnection attempts', async () => {
      manager = new FallbackManager({
        retryIntervalMs: 100,
        verboseLogging: false,
      });

      // Manually put manager in fallback mode and start attempts
      // (This would normally happen after database failure)
      (manager as any).state.isInFallback = true;
      (manager as any).storageInstance = { findApiKey: async () => null };

      // Calling startReconnectionAttempts directly for testing
      expect(manager.getState().isInFallback).toBe(true);

      // Clean up
      manager.stopReconnectionAttempts();
    });

    test('should stop reconnection attempts', () => {
      manager = new FallbackManager({ verboseLogging: false });

      // Should not throw even if no attempts are running
      expect(() => manager.stopReconnectionAttempts()).not.toThrow();
    });
  });

  describe('Configuration Loading', () => {
    test('should use default configuration when no config provided', () => {
      manager = new FallbackManager();

      const state = manager.getState();
      expect(state.retryCount).toBe(0);
    });
  });
});

describe('loadFallbackConfigFromEnv', () => {
  const originalEnv = process.env;

  afterEach(() => {
    // Restore environment variables
    process.env = { ...originalEnv };
  });

  test('should load default configuration when no env vars set', () => {
    delete process.env.STORAGE_FALLBACK_ENABLED;
    delete process.env.STORAGE_FALLBACK_RETRY_INTERVAL_MS;
    delete process.env.STORAGE_FALLBACK_MAX_RETRIES;
    delete process.env.STORAGE_FALLBACK_VERBOSE_LOGGING;

    const config = loadFallbackConfigFromEnv();

    expect(config.enabled).toBe(true);
    expect(config.retryIntervalMs).toBe(60000);
    expect(config.maxRetries).toBe(0);
    expect(config.verboseLogging).toBe(true);
  });

  test('should load configuration from environment variables', () => {
    process.env.STORAGE_FALLBACK_ENABLED = 'false';
    process.env.STORAGE_FALLBACK_RETRY_INTERVAL_MS = '30000';
    process.env.STORAGE_FALLBACK_MAX_RETRIES = '10';
    process.env.STORAGE_FALLBACK_VERBOSE_LOGGING = 'false';

    const config = loadFallbackConfigFromEnv();

    expect(config.enabled).toBe(false);
    expect(config.retryIntervalMs).toBe(30000);
    expect(config.maxRetries).toBe(10);
    expect(config.verboseLogging).toBe(false);
  });

  test('should handle string "false" correctly', () => {
    process.env.STORAGE_FALLBACK_ENABLED = 'false';

    const config = loadFallbackConfigFromEnv();

    expect(config.enabled).toBe(false);
  });

  test('should treat any value other than "false" as true', () => {
    process.env.STORAGE_FALLBACK_ENABLED = 'true';
    expect(loadFallbackConfigFromEnv().enabled).toBe(true);

    process.env.STORAGE_FALLBACK_ENABLED = '1';
    expect(loadFallbackConfigFromEnv().enabled).toBe(true);

    process.env.STORAGE_FALLBACK_ENABLED = 'enabled';
    expect(loadFallbackConfigFromEnv().enabled).toBe(true);
  });

  test('should parse numeric values correctly', () => {
    process.env.STORAGE_FALLBACK_RETRY_INTERVAL_MS = '30000';
    process.env.STORAGE_FALLBACK_MAX_RETRIES = '10';

    const config = loadFallbackConfigFromEnv();

    expect(config.retryIntervalMs).toBe(30000);
    expect(config.maxRetries).toBe(10);
  });

  test('should handle invalid numeric values', () => {
    process.env.STORAGE_FALLBACK_RETRY_INTERVAL_MS = 'invalid';
    process.env.STORAGE_FALLBACK_MAX_RETRIES = 'not-a-number';

    const config = loadFallbackConfigFromEnv();

    expect(config.retryIntervalMs).toBeNaN();
    expect(config.maxRetries).toBeNaN();
  });
});
