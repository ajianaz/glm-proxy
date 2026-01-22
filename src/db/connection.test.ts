import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getDb, closeDb, getDatabaseType, testConnection, getRetryOptionsFromEnv } from './connection';

describe('Database Connection', () => {
  afterEach(async () => {
    await closeDb();
  });

  it('should create SQLite connection by default', async () => {
    const db = await getDb();

    expect(db.type).toBe('sqlite');
    expect(db.db).toBeDefined();
    expect(db.client).toBeDefined();
  });

  it('should return correct database type', () => {
    // Default should be sqlite when DATABASE_URL is not set
    const type = getDatabaseType();
    expect(type).toBe('sqlite');
  });

  it('should support connection testing', async () => {
    const isHealthy = await testConnection();
    expect(isHealthy).toBe(true);
  });

  it('should close connection successfully', async () => {
    const db1 = await getDb();
    expect(db1).toBeDefined();

    await closeDb();

    // Should create new connection after close
    const db2 = await getDb();
    expect(db2).toBeDefined();
  });
});

describe('Retry Options', () => {
  const originalEnv = process.env;

  afterEach(() => {
    // Reset environment variables after each test
    process.env = { ...originalEnv };
  });

  it('should load default retry options when no env vars are set', () => {
    const options = getRetryOptionsFromEnv();

    expect(options).toEqual({});
  });

  it('should load retry max attempts from env', () => {
    process.env.DB_RETRY_MAX = '5';
    const options = getRetryOptionsFromEnv();

    expect(options.maxRetries).toBe(5);
  });

  it('should load retry delay from env', () => {
    process.env.DB_RETRY_DELAY_MS = '2000';
    const options = getRetryOptionsFromEnv();

    expect(options.initialDelayMs).toBe(2000);
  });

  it('should load retry backoff multiplier from env', () => {
    process.env.DB_RETRY_BACKOFF = '3';
    const options = getRetryOptionsFromEnv();

    expect(options.backoffMultiplier).toBe(3);
  });

  it('should load retry max delay from env', () => {
    process.env.DB_RETRY_MAX_DELAY_MS = '30000';
    const options = getRetryOptionsFromEnv();

    expect(options.maxDelayMs).toBe(30000);
  });

  it('should load silent mode from env', () => {
    process.env.DB_RETRY_SILENT = 'true';
    const options = getRetryOptionsFromEnv();

    expect(options.silent).toBe(true);
  });

  it('should load multiple retry options from env', () => {
    process.env.DB_RETRY_MAX = '7';
    process.env.DB_RETRY_DELAY_MS = '1500';
    process.env.DB_RETRY_BACKOFF = '2.5';
    process.env.DB_RETRY_MAX_DELAY_MS = '20000';
    process.env.DB_RETRY_SILENT = 'true';

    const options = getRetryOptionsFromEnv();

    expect(options.maxRetries).toBe(7);
    expect(options.initialDelayMs).toBe(1500);
    expect(options.backoffMultiplier).toBe(2.5);
    expect(options.maxDelayMs).toBe(20000);
    expect(options.silent).toBe(true);
  });

  it('should ignore invalid env values', () => {
    process.env.DB_RETRY_MAX = 'invalid';
    process.env.DB_RETRY_DELAY_MS = 'abc';
    process.env.DB_RETRY_BACKOFF = 'not-a-number';

    const options = getRetryOptionsFromEnv();

    expect(options.maxRetries).toBeUndefined();
    expect(options.initialDelayMs).toBeUndefined();
    expect(options.backoffMultiplier).toBeUndefined();
  });

  it('should treat DB_RETRY_SILENT=false as undefined', () => {
    process.env.DB_RETRY_SILENT = 'false';
    const options = getRetryOptionsFromEnv();

    expect(options.silent).toBeUndefined();
  });
});
