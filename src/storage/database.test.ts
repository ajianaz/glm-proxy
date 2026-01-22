import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { DatabaseStorage } from './database.js';
import { getDb, closeDb } from '../db/connection.js';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';

/**
 * Test suite for DatabaseStorage class
 *
 * Tests the IStorage interface implementation using database operations.
 */

describe('DatabaseStorage', () => {
  let storage: DatabaseStorage;

  beforeEach(async () => {
    // Create a new storage instance for each test
    storage = new DatabaseStorage();
    await storage.initialize();

    // Clean up any existing test data
    const { db, type } = await getDb();
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;

    // Delete all test keys
    await db.delete(table).where(eq(table.key, 'sk-test-database-storage'));
  });

  afterEach(async () => {
    // Clean up after tests
    const { db, type } = await getDb();
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;

    await db.delete(table).where(eq(table.key, 'sk-test-database-storage'));
  });

  test('initialize() should mark storage as initialized', async () => {
    const newStorage = new DatabaseStorage();
    expect(newStorage instanceof DatabaseStorage).toBe(true);

    // Should not throw
    await newStorage.initialize();

    // Should be idempotent
    await newStorage.initialize();
  });

  test('findApiKey() should return null for non-existent key', async () => {
    const result = await storage.findApiKey('sk-non-existent-key');
    expect(result).toBeNull();
  });

  test('findApiKey() should return ApiKey for existing key', async () => {
    // First, insert a test key directly into the database
    const { db, type } = await getDb();
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;

    const testKey = 'sk-test-database-storage';
    const now = new Date().toISOString();

    await db.insert(table).values({
      key: testKey,
      name: 'Test Database Storage Key',
      model: 'claude-3-5-sonnet-20241022',
      tokenLimitPer5h: 50000,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
      lastUsed: now,
      totalLifetimeTokens: 0,
    });

    // Now test findApiKey
    const result = await storage.findApiKey(testKey);

    expect(result).not.toBeNull();
    expect(result?.key).toBe(testKey);
    expect(result?.name).toBe('Test Database Storage Key');
    expect(result?.model).toBe('claude-3-5-sonnet-20241022');
    expect(result?.token_limit_per_5h).toBe(50000);
    expect(result?.usage_windows).toEqual([]);
  });

  test('updateApiKeyUsage() should track token usage', async () => {
    // Insert a test key
    const { db, type } = await getDb();
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;

    const testKey = 'sk-test-database-storage';
    const now = new Date().toISOString();

    await db.insert(table).values({
      key: testKey,
      name: 'Test Database Storage Key',
      model: 'claude-3-5-sonnet-20241022',
      tokenLimitPer5h: 50000,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
      lastUsed: now,
      totalLifetimeTokens: 0,
    });

    // Update usage
    await storage.updateApiKeyUsage(testKey, 1000, 'claude-3-5-sonnet-20241022');

    // Verify the update
    const result = await storage.findApiKey(testKey);
    expect(result).not.toBeNull();
    expect(result?.total_lifetime_tokens).toBe(1000);
    expect(result?.usage_windows.length).toBe(1);
    expect(result?.usage_windows[0].tokens_used).toBe(1000);
  });

  test('updateApiKeyUsage() should accumulate usage in same window', async () => {
    // Insert a test key
    const { db, type } = await getDb();
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;

    const testKey = 'sk-test-database-storage';
    const now = new Date().toISOString();

    await db.insert(table).values({
      key: testKey,
      name: 'Test Database Storage Key',
      model: 'claude-3-5-sonnet-20241022',
      tokenLimitPer5h: 50000,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
      lastUsed: now,
      totalLifetimeTokens: 0,
    });

    // Update usage twice
    await storage.updateApiKeyUsage(testKey, 1000, 'claude-3-5-sonnet-20241022');
    await storage.updateApiKeyUsage(testKey, 2000, 'claude-3-5-sonnet-20241022');

    // Verify the accumulation
    const result = await storage.findApiKey(testKey);
    expect(result).not.toBeNull();
    expect(result?.total_lifetime_tokens).toBe(3000);
    expect(result?.usage_windows.length).toBe(1);
    expect(result?.usage_windows[0].tokens_used).toBe(3000);
  });

  test('updateApiKeyUsage() should throw error for non-existent key', async () => {
    await expect(async () => {
      await storage.updateApiKeyUsage('sk-non-existent-key', 1000, 'claude-3-5-sonnet-20241022');
    }).toThrow('Failed to update API key usage');
  });

  test('getKeyStats() should return null for non-existent key', async () => {
    const result = await storage.getKeyStats('sk-non-existent-key');
    expect(result).toBeNull();
  });

  test('getKeyStats() should return stats for existing key', async () => {
    // Insert a test key
    const { db, type } = await getDb();
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;

    const testKey = 'sk-test-database-storage';
    const now = new Date().toISOString();

    await db.insert(table).values({
      key: testKey,
      name: 'Test Database Storage Key',
      model: 'claude-3-5-sonnet-20241022',
      tokenLimitPer5h: 50000,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
      lastUsed: now,
      totalLifetimeTokens: 0,
    });

    // Get stats
    const stats = await storage.getKeyStats(testKey);

    expect(stats).not.toBeNull();
    expect(stats?.key).toBe(testKey);
    expect(stats?.name).toBe('Test Database Storage Key');
    expect(stats?.model).toBe('claude-3-5-sonnet-20241022');
    expect(stats?.token_limit_per_5h).toBe(50000);
    expect(stats?.is_expired).toBe(false);
    expect(stats?.current_usage.tokens_used_in_current_window).toBe(0);
    expect(stats?.current_usage.remaining_tokens).toBe(50000);
    expect(stats?.total_lifetime_tokens).toBe(0);
  });

  test('getKeyStats() should reflect usage updates', async () => {
    // Insert a test key
    const { db, type } = await getDb();
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;

    const testKey = 'sk-test-database-storage';
    const now = new Date().toISOString();

    await db.insert(table).values({
      key: testKey,
      name: 'Test Database Storage Key',
      model: 'claude-3-5-sonnet-20241022',
      tokenLimitPer5h: 50000,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
      lastUsed: now,
      totalLifetimeTokens: 0,
    });

    // Update usage
    await storage.updateApiKeyUsage(testKey, 5000, 'claude-3-5-sonnet-20241022');

    // Get stats
    const stats = await storage.getKeyStats(testKey);

    expect(stats).not.toBeNull();
    expect(stats?.total_lifetime_tokens).toBe(5000);
    expect(stats?.current_usage.tokens_used_in_current_window).toBe(5000);
    expect(stats?.current_usage.remaining_tokens).toBe(45000);
  });

  test('getKeyStats() should calculate expired status correctly', async () => {
    // Insert an expired test key
    const { db, type } = await getDb();
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;

    const testKey = 'sk-test-database-storage';
    const now = new Date().toISOString();
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await db.insert(table).values({
      key: testKey,
      name: 'Test Database Storage Key',
      model: 'claude-3-5-sonnet-20241022',
      tokenLimitPer5h: 50000,
      expiryDate: pastDate, // Expired yesterday
      createdAt: pastDate,
      lastUsed: pastDate,
      totalLifetimeTokens: 0,
    });

    // Get stats
    const stats = await storage.getKeyStats(testKey);

    expect(stats).not.toBeNull();
    expect(stats?.is_expired).toBe(true);
  });

  test('findApiKey() and updateApiKeyUsage() should work together', async () => {
    // Insert a test key
    const { db, type } = await getDb();
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;

    const testKey = 'sk-test-database-storage';
    const now = new Date().toISOString();

    await db.insert(table).values({
      key: testKey,
      name: 'Test Database Storage Key',
      model: 'claude-3-5-sonnet-20241022',
      tokenLimitPer5h: 50000,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
      lastUsed: now,
      totalLifetimeTokens: 0,
    });

    // Find key
    const foundKey = await storage.findApiKey(testKey);
    expect(foundKey).not.toBeNull();
    expect(foundKey?.total_lifetime_tokens).toBe(0);

    // Update usage
    await storage.updateApiKeyUsage(testKey, 2500, 'claude-3-5-sonnet-20241022');

    // Find key again
    const updatedKey = await storage.findApiKey(testKey);
    expect(updatedKey).not.toBeNull();
    expect(updatedKey?.total_lifetime_tokens).toBe(2500);

    // Get stats
    const stats = await storage.getKeyStats(testKey);
    expect(stats).not.toBeNull();
    expect(stats?.total_lifetime_tokens).toBe(2500);
    expect(stats?.current_usage.tokens_used_in_current_window).toBe(2500);
  });

  test('should throw error when using methods before initialization', async () => {
    const uninitializedStorage = new DatabaseStorage();

    await expect(async () => {
      await uninitializedStorage.findApiKey('sk-test');
    }).toThrow('has not been initialized');

    await expect(async () => {
      await uninitializedStorage.updateApiKeyUsage('sk-test', 1000, 'model');
    }).toThrow('has not been initialized');

    await expect(async () => {
      await uninitializedStorage.getKeyStats('sk-test');
    }).toThrow('has not been initialized');
  });
});
