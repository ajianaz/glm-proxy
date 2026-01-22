import { describe, it, expect, beforeEach } from 'bun:test';
import { getConfig, resetConfig } from '../src/config';

describe('Configuration', () => {
  beforeEach(() => {
    // Reset cached configuration
    resetConfig();

    // Set required environment variables for testing
    process.env.ZAI_API_KEY = 'test-zai-key';
    process.env.ADMIN_API_KEY = 'test-admin-key';
    process.env.DATABASE_PATH = './test.db';
    process.env.PORT = '3000';
    process.env.DEFAULT_MODEL = 'glm-4.7';
    process.env.ADMIN_API_ENABLED = 'true';
    process.env.DEFAULT_RATE_LIMIT = '60';
    process.env.CORS_ORIGINS = '*';
  });

  it('should load configuration successfully', () => {
    const config = getConfig();

    expect(config).toBeDefined();
    expect(config.zaiApiKey).toBe('test-zai-key');
    expect(config.adminApiKey).toBe('test-admin-key');
    expect(config.databasePath).toBe('./test.db');
  });

  it('should parse port correctly', () => {
    resetConfig();
    process.env.PORT = '8080';
    const config = getConfig();

    expect(config.port).toBe(8080);
  });

  it('should use default port when not specified', () => {
    resetConfig();
    delete process.env.PORT;
    const config = getConfig();

    expect(config.port).toBe(3000);
  });

  it('should parse rate limit correctly', () => {
    resetConfig();
    process.env.DEFAULT_RATE_LIMIT = '120';
    const config = getConfig();

    expect(config.defaultRateLimit).toBe(120);
  });

  it('should parse CORS origins', () => {
    resetConfig();
    process.env.CORS_ORIGINS = 'http://localhost:3000,https://example.com';
    const config = getConfig();

    expect(config.corsOrigins).toEqual(['http://localhost:3000', 'https://example.com']);
  });

  it('should handle wildcard CORS origin', () => {
    resetConfig();
    process.env.CORS_ORIGINS = '*';
    const config = getConfig();

    expect(config.corsOrigins).toEqual(['*']);
  });

  it('should parse admin API enabled flag', () => {
    resetConfig();
    process.env.ADMIN_API_ENABLED = 'false';
    const config = getConfig();

    expect(config.adminApiEnabled).toBe(false);
  });

  it('should use default model when not specified', () => {
    resetConfig();
    delete process.env.DEFAULT_MODEL;
    const config = getConfig();

    expect(config.defaultModel).toBe('glm-4.7');
  });
});
