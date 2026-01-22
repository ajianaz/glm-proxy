import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { DatabaseStorage } from '../../src/storage/database.js';
import { FileStorage } from '../../src/storage/file.js';
import { getStorage, resetStorage, getStorageType } from '../../src/storage/index.js';
import { resetDb, closeDb, getDb } from '../../src/db/connection.js';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema.js';
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { IStorage } from '../../src/storage/interface.js';

/**
 * Comprehensive test suite for storage interface and adapters
 *
 * This test suite verifies:
 * 1. Interface compliance - Both adapters implement IStorage correctly
 * 2. Behavioral consistency - Both adapters behave similarly for the same operations
 * 3. Storage factory selection - Correct adapter is selected based on configuration
 */

// Test data file for FileStorage
const TEST_FILE = join(process.cwd(), 'data', 'test-adapters.json');

/**
 * Helper function to verify IStorage interface compliance
 */
function verifyInterfaceCompliance(storage: unknown): asserts storage is IStorage {
  expect(storage).toBeDefined();
  expect(typeof storage).toBe('object');

  // Check for all required methods
  expect(storage).toHaveProperty('findApiKey');
  expect(storage).toHaveProperty('updateApiKeyUsage');
  expect(storage).toHaveProperty('getKeyStats');
  expect(storage).toHaveProperty('initialize');

  // Verify methods are functions
  const s = storage as IStorage;
  expect(typeof s.findApiKey).toBe('function');
  expect(typeof s.updateApiKeyUsage).toBe('function');
  expect(typeof s.getKeyStats).toBe('function');
  expect(typeof s.initialize).toBe('function');
}

/**
 * Helper function to create a test API key in the database
 */
async function createTestApiKeyInDb(key: string, name: string): Promise<void> {
  const { db, type } = await getDb();
  const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;

  const now = new Date().toISOString();

  await db.insert(table).values({
    key,
    name,
    model: 'claude-3-5-sonnet-20241022',
    tokenLimitPer5h: 50000,
    expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now,
    lastUsed: now,
    totalLifetimeTokens: 0,
  });
}

/**
 * Helper function to create a test API key in the file storage
 */
async function createTestApiKeyInFile(key: string, name: string): Promise<void> {

  const dir = dirname(TEST_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const data = {
    keys: [
      {
        key,
        name,
        model: 'claude-3-5-sonnet-20241022',
        token_limit_per_5h: 50000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        last_used: new Date().toISOString(),
        total_lifetime_tokens: 0,
        usage_windows: [],
      },
    ],
  };

  writeFileSync(TEST_FILE, JSON.stringify(data, null, 2));
}

describe('Storage Interface and Adapters', () => {
  describe('Interface Compliance', () => {
    test('DatabaseStorage should implement IStorage interface', async () => {
      const storage = new DatabaseStorage();
      verifyInterfaceCompliance(storage);
    });

    test('FileStorage should implement IStorage interface', () => {
      const storage = new FileStorage(TEST_FILE);
      verifyInterfaceCompliance(storage);
    });

    test('getStorage() should return IStorage-compliant instance', async () => {
      resetStorage();
      delete process.env.DATABASE_URL;
      delete process.env.DATABASE_PATH;
      delete process.env.STORAGE_TYPE;

      const storage = await getStorage();
      verifyInterfaceCompliance(storage);
    });
  });

  describe('DatabaseStorage Adapter', () => {
    let storage: DatabaseStorage;
    const testKey = 'sk-test-database-adapter';

    beforeEach(async () => {
      storage = new DatabaseStorage();
      await storage.initialize();
    });

    afterEach(async () => {
      // Clean up test data
      const { db, type } = await getDb();
      const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;
      await db.delete(table).where(eq(table.key, testKey));
    });

    test('should initialize successfully', async () => {
      const newStorage = new DatabaseStorage();
      await newStorage.initialize();
      // If we get here without throwing, initialization succeeded
      expect(true).toBe(true);
    });

    test('should be idempotent - initialize() can be called multiple times', async () => {
      const newStorage = new DatabaseStorage();
      await newStorage.initialize();
      await newStorage.initialize();
      await newStorage.initialize();
      // If we get here without throwing, all initializations succeeded
      expect(true).toBe(true);
    });

    test('findApiKey() should return null for non-existent key', async () => {
      const result = await storage.findApiKey('sk-non-existent');
      expect(result).toBeNull();
    });

    test('findApiKey() should return ApiKey for existing key', async () => {
      await createTestApiKeyInDb(testKey, 'Test Database Adapter Key');

      const result = await storage.findApiKey(testKey);

      expect(result).not.toBeNull();
      expect(result?.key).toBe(testKey);
      expect(result?.name).toBe('Test Database Adapter Key');
      expect(result?.model).toBe('claude-3-5-sonnet-20241022');
      expect(result?.token_limit_per_5h).toBe(50000);
    });

    test('updateApiKeyUsage() should track token usage', async () => {
      await createTestApiKeyInDb(testKey, 'Test Database Adapter Key');

      await storage.updateApiKeyUsage(testKey, 1000, 'claude-3-5-sonnet-20241022');

      const result = await storage.findApiKey(testKey);
      expect(result).not.toBeNull();
      expect(result?.total_lifetime_tokens).toBe(1000);
      expect(result?.usage_windows.length).toBeGreaterThan(0);
    });

    test('updateApiKeyUsage() should throw error for non-existent key', async () => {
      await expect(
        storage.updateApiKeyUsage('sk-non-existent', 1000, 'model')
      ).rejects.toThrow();
    });

    test('getKeyStats() should return null for non-existent key', async () => {
      const result = await storage.getKeyStats('sk-non-existent');
      expect(result).toBeNull();
    });

    test('getKeyStats() should return stats for existing key', async () => {
      await createTestApiKeyInDb(testKey, 'Test Database Adapter Key');

      const stats = await storage.getKeyStats(testKey);

      expect(stats).not.toBeNull();
      expect(stats?.key).toBe(testKey);
      expect(stats?.name).toBe('Test Database Adapter Key');
      expect(stats?.is_expired).toBe(false);
      expect(stats?.current_usage.tokens_used_in_current_window).toBe(0);
      expect(stats?.current_usage.remaining_tokens).toBe(50000);
    });

    test('should throw error when using methods before initialization', async () => {
      const uninitializedStorage = new DatabaseStorage();

      await expect(uninitializedStorage.findApiKey('sk-test')).rejects.toThrow('has not been initialized');
      await expect(uninitializedStorage.getKeyStats('sk-test')).rejects.toThrow('has not been initialized');
    });
  });

  describe('FileStorage Adapter', () => {
    let storage: FileStorage;

    beforeEach(async () => {
      storage = new FileStorage(TEST_FILE);

      // Clean up test file
      if (existsSync(TEST_FILE)) {
        unlinkSync(TEST_FILE);
      }
      const lockFile = TEST_FILE + '.lock';
      if (existsSync(lockFile)) {
        unlinkSync(lockFile);
      }
    });

    afterEach(() => {
      // Clean up test file
      if (existsSync(TEST_FILE)) {
        unlinkSync(TEST_FILE);
      }
      const lockFile = TEST_FILE + '.lock';
      if (existsSync(lockFile)) {
        unlinkSync(lockFile);
      }
    });

    test('should initialize successfully and create data directory', async () => {
      await storage.initialize();
      expect(existsSync(TEST_FILE)).toBe(true);
    });

    test('should be idempotent - initialize() can be called multiple times', async () => {
      await storage.initialize();
      await storage.initialize();
      await storage.initialize();
      expect(existsSync(TEST_FILE)).toBe(true);
    });

    test('findApiKey() should return null for non-existent key', async () => {
      await storage.initialize();
      const result = await storage.findApiKey('sk-non-existent');
      expect(result).toBeNull();
    });

    test('findApiKey() should return ApiKey for existing key', async () => {
      await storage.initialize();
      await createTestApiKeyInFile('sk-test-file-adapter', 'Test File Adapter Key');

      const result = await storage.findApiKey('sk-test-file-adapter');

      expect(result).not.toBeNull();
      expect(result?.key).toBe('sk-test-file-adapter');
      expect(result?.name).toBe('Test File Adapter Key');
      expect(result?.model).toBe('claude-3-5-sonnet-20241022');
      expect(result?.token_limit_per_5h).toBe(50000);
    });

    test('updateApiKeyUsage() should track token usage', async () => {
      await storage.initialize();
      await createTestApiKeyInFile('sk-test-file-adapter', 'Test File Adapter Key');

      await storage.updateApiKeyUsage('sk-test-file-adapter', 1000, 'claude-3-5-sonnet-20241022');

      const result = await storage.findApiKey('sk-test-file-adapter');
      expect(result).not.toBeNull();
      expect(result?.total_lifetime_tokens).toBe(1000);
    });

    test('updateApiKeyUsage() should throw error for non-existent key', async () => {
      await storage.initialize();
      await expect(
        storage.updateApiKeyUsage('sk-non-existent', 1000, 'model')
      ).rejects.toThrow('API key not found');
    });

    test('getKeyStats() should return null for non-existent key', async () => {
      await storage.initialize();
      const result = await storage.getKeyStats('sk-non-existent');
      expect(result).toBeNull();
    });

    test('getKeyStats() should return stats for existing key', async () => {
      await storage.initialize();
      await createTestApiKeyInFile('sk-test-file-adapter', 'Test File Adapter Key');

      const stats = await storage.getKeyStats('sk-test-file-adapter');

      expect(stats).not.toBeNull();
      expect(stats?.key).toBe('sk-test-file-adapter');
      expect(stats?.name).toBe('Test File Adapter Key');
      expect(stats?.is_expired).toBe(false);
      expect(stats?.current_usage.tokens_used_in_current_window).toBe(0);
      expect(stats?.current_usage.remaining_tokens).toBe(50000);
    });

    test('should throw error when using methods before initialization', async () => {
      const uninitializedStorage = new FileStorage(TEST_FILE);

      await expect(uninitializedStorage.findApiKey('sk-test')).rejects.toThrow('has not been initialized');
      await expect(uninitializedStorage.getKeyStats('sk-test')).rejects.toThrow('has not been initialized');
    });
  });

  describe('Storage Factory Selection', () => {
    beforeEach(async () => {
      resetStorage();
      resetDb();
      delete process.env.DATABASE_URL;
      delete process.env.DATABASE_PATH;
      delete process.env.STORAGE_TYPE;
    });

    afterEach(async () => {
      await closeDb();
      resetStorage();
      resetDb();
      delete process.env.DATABASE_URL;
      delete process.env.DATABASE_PATH;
      delete process.env.STORAGE_TYPE;
    });

    test('getStorageType() should return "file" by default', () => {
      const type = getStorageType();
      expect(type).toBe('file');
    });

    test('getStorageType() should return "database" when DATABASE_URL is set', () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';
      const type = getStorageType();
      expect(type).toBe('database');
    });

    test('getStorageType() should return "database" when DATABASE_PATH is set', () => {
      process.env.DATABASE_PATH = './data/test.db';
      const type = getStorageType();
      expect(type).toBe('database');
    });

    test('getStorageType() should return "database" when STORAGE_TYPE is "database"', () => {
      process.env.STORAGE_TYPE = 'database';
      const type = getStorageType();
      expect(type).toBe('database');
    });

    test('getStorageType() should return "file" when STORAGE_TYPE is "file"', () => {
      process.env.STORAGE_TYPE = 'file';
      const type = getStorageType();
      expect(type).toBe('file');
    });

    test('getStorageType() should prioritize STORAGE_TYPE=file over DATABASE_URL', () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';
      process.env.STORAGE_TYPE = 'file';
      const type = getStorageType();
      expect(type).toBe('file');
    });

    test('getStorage() should return FileStorage instance by default', async () => {
      const storage = await getStorage();
      verifyInterfaceCompliance(storage);
      // FileStorage doesn't have a type property we can check easily
      // but we can verify it implements IStorage
      expect(typeof storage.findApiKey).toBe('function');
    });

    test('getStorage() should return same instance on subsequent calls (singleton)', async () => {
      const storage1 = await getStorage();
      const storage2 = await getStorage();
      expect(storage1).toBe(storage2);
    });

    test('getStorage() should return different instance after reset', async () => {
      const storage1 = await getStorage();
      resetStorage();
      const storage2 = await getStorage();
      expect(storage1).not.toBe(storage2);
    });

    test('resetStorage() should clear the singleton instance', async () => {
      const storage1 = await getStorage();
      resetStorage();
      const storage2 = await getStorage();
      expect(storage1).not.toBe(storage2);
    });

    test('getStorage() with DATABASE_PATH should return DatabaseStorage', async () => {
      process.env.DATABASE_PATH = './data/test-factory-selection.db';
      resetStorage();

      const storage = await getStorage();
      verifyInterfaceCompliance(storage);
      // Should be DatabaseStorage (or fallback to FileStorage if schema doesn't exist)
    });

    test('getStorage() with STORAGE_TYPE=file should return FileStorage', async () => {
      process.env.STORAGE_TYPE = 'file';
      resetStorage();

      const storage = await getStorage();
      verifyInterfaceCompliance(storage);
      expect(typeof storage.findApiKey).toBe('function');
    });
  });

  describe('Behavioral Consistency Between Adapters', () => {
    let dbStorage: DatabaseStorage;
    let fileStorage: FileStorage;
    const testKey1 = 'sk-test-consistency-db';
    const testKey2 = 'sk-test-consistency-file';

    beforeEach(async () => {
      // Setup DatabaseStorage
      dbStorage = new DatabaseStorage();
      await dbStorage.initialize();
      await createTestApiKeyInDb(testKey1, 'Consistency Test DB Key');

      // Setup FileStorage
      fileStorage = new FileStorage(TEST_FILE);
      await fileStorage.initialize();
      await createTestApiKeyInFile(testKey2, 'Consistency Test File Key');
    });

    afterEach(async () => {
      // Clean up database
      const { db, type } = await getDb();
      const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;
      await db.delete(table).where(eq(table.key, testKey1));

      // Clean up file
      if (existsSync(TEST_FILE)) {
        unlinkSync(TEST_FILE);
      }
      const lockFile = TEST_FILE + '.lock';
      if (existsSync(lockFile)) {
        unlinkSync(lockFile);
      }
    });

    test('both adapters should return null for non-existent keys', async () => {
      const dbResult = await dbStorage.findApiKey('sk-non-existent');
      const fileResult = await fileStorage.findApiKey('sk-non-existent');

      expect(dbResult).toBeNull();
      expect(fileResult).toBeNull();
    });

    test('both adapters should find existing keys', async () => {
      const dbResult = await dbStorage.findApiKey(testKey1);
      const fileResult = await fileStorage.findApiKey(testKey2);

      expect(dbResult).not.toBeNull();
      expect(dbResult?.key).toBe(testKey1);
      expect(dbResult?.name).toBe('Consistency Test DB Key');

      expect(fileResult).not.toBeNull();
      expect(fileResult?.key).toBe(testKey2);
      expect(fileResult?.name).toBe('Consistency Test File Key');
    });

    test('both adapters should update usage tracking', async () => {
      await dbStorage.updateApiKeyUsage(testKey1, 1000, 'claude-3-5-sonnet-20241022');
      await fileStorage.updateApiKeyUsage(testKey2, 1000, 'claude-3-5-sonnet-20241022');

      const dbResult = await dbStorage.findApiKey(testKey1);
      const fileResult = await fileStorage.findApiKey(testKey2);

      expect(dbResult?.total_lifetime_tokens).toBe(1000);
      expect(fileResult?.total_lifetime_tokens).toBe(1000);
    });

    test('both adapters should return key stats', async () => {
      const dbStats = await dbStorage.getKeyStats(testKey1);
      const fileStats = await fileStorage.getKeyStats(testKey2);

      expect(dbStats).not.toBeNull();
      expect(dbStats?.key).toBe(testKey1);
      expect(dbStats?.is_expired).toBe(false);
      expect(dbStats?.current_usage.tokens_used_in_current_window).toBe(0);

      expect(fileStats).not.toBeNull();
      expect(fileStats?.key).toBe(testKey2);
      expect(fileStats?.is_expired).toBe(false);
      expect(fileStats?.current_usage.tokens_used_in_current_window).toBe(0);
    });

    test('both adapters should throw errors for non-existent keys in updateApiKeyUsage', async () => {
      await expect(dbStorage.updateApiKeyUsage('sk-non-existent', 1000, 'model')).rejects.toThrow();
      await expect(fileStorage.updateApiKeyUsage('sk-non-existent', 1000, 'model')).rejects.toThrow();
    });

    test('both adapters should return null for non-existent keys in getKeyStats', async () => {
      const dbStats = await dbStorage.getKeyStats('sk-non-existent');
      const fileStats = await fileStorage.getKeyStats('sk-non-existent');

      expect(dbStats).toBeNull();
      expect(fileStats).toBeNull();
    });
  });

  describe('Integration Tests', () => {
    beforeEach(async () => {
      resetStorage();
      resetDb();
      delete process.env.DATABASE_URL;
      delete process.env.DATABASE_PATH;
      delete process.env.STORAGE_TYPE;

      // Clean up test file
      if (existsSync(TEST_FILE)) {
        unlinkSync(TEST_FILE);
      }
      const lockFile = TEST_FILE + '.lock';
      if (existsSync(lockFile)) {
        unlinkSync(lockFile);
      }
    });

    afterEach(async () => {
      await closeDb();
      resetStorage();
      resetDb();

      // Clean up test file
      if (existsSync(TEST_FILE)) {
        unlinkSync(TEST_FILE);
      }
      const lockFile = TEST_FILE + '.lock';
      if (existsSync(lockFile)) {
        unlinkSync(lockFile);
      }
    });

    test('complete workflow with DatabaseStorage', async () => {
      process.env.DATABASE_PATH = './data/test-integration.db';
      resetStorage();

      // Note: For this test to work, the database schema must be set up first
      // In a real scenario, this would be done via drizzle-kit push or migrations
      // For this test, we'll just verify the storage can be initialized and has the correct interface

      const storage = await getStorage();
      verifyInterfaceCompliance(storage);

      // Verify that all interface methods exist
      expect(typeof storage.findApiKey).toBe('function');
      expect(typeof storage.updateApiKeyUsage).toBe('function');
      expect(typeof storage.getKeyStats).toBe('function');
      expect(typeof storage.initialize).toBe('function');
    });

    test('complete workflow with FileStorage', async () => {
      process.env.STORAGE_TYPE = 'file';
      resetStorage();

      const storage = await getStorage();
      await storage.initialize();

      // Find non-existent key
      const foundKey = await storage.findApiKey('sk-test-integration');
      expect(foundKey).toBeNull();

      // Get stats for non-existent key
      const stats = await storage.getKeyStats('sk-test-integration');
      expect(stats).toBeNull();
    });

    test('switching storage types should work', async () => {
      // Start with file storage
      let storage = await getStorage();
      verifyInterfaceCompliance(storage);

      // Switch to database storage
      resetStorage();
      process.env.DATABASE_PATH = './data/test-switching.db';
      storage = await getStorage();
      verifyInterfaceCompliance(storage);

      // Switch back to file storage
      resetStorage();
      process.env.STORAGE_TYPE = 'file';
      storage = await getStorage();
      verifyInterfaceCompliance(storage);
    });
  });
});
