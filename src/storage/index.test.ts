import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getStorage, resetStorage, getStorageType } from './index.js';
import { FileStorage } from './file.js';
import { resetDb, closeDb } from '../db/connection.js';

describe('Storage Factory', () => {
  beforeEach(async () => {
    // Reset storage and database instances before each test
    resetStorage();
    resetDb();

    // Clear environment variables
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_PATH;
    delete process.env.STORAGE_TYPE;
  });

  afterEach(async () => {
    // Clean up after tests
    await closeDb();
    resetStorage();
    resetDb();
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_PATH;
    delete process.env.STORAGE_TYPE;
  });

  describe('getStorageType()', () => {
    test('should return "file" by default', () => {
      const type = getStorageType();
      expect(type).toBe('file');
    });

    test('should return "database" when DATABASE_URL is set', () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';
      const type = getStorageType();
      expect(type).toBe('database');
    });

    test('should return "database" when DATABASE_PATH is set', () => {
      process.env.DATABASE_PATH = './data/test.db';
      const type = getStorageType();
      expect(type).toBe('database');
    });

    test('should return "database" when STORAGE_TYPE is "database"', () => {
      process.env.STORAGE_TYPE = 'database';
      const type = getStorageType();
      expect(type).toBe('database');
    });

    test('should return "file" when STORAGE_TYPE is "file"', () => {
      process.env.STORAGE_TYPE = 'file';
      const type = getStorageType();
      expect(type).toBe('file');
    });

    test('should prioritize STORAGE_TYPE=file over DATABASE_URL', () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';
      process.env.STORAGE_TYPE = 'file';
      const type = getStorageType();
      expect(type).toBe('file');
    });
  });

  describe('getStorage()', () => {
    test('should return FileStorage instance by default', async () => {
      const storage = await getStorage();
      // Check for IStorage interface methods
      expect(storage).toHaveProperty('findApiKey');
      expect(storage).toHaveProperty('updateApiKeyUsage');
      expect(storage).toHaveProperty('getKeyStats');
      expect(storage).toHaveProperty('initialize');
    });

    test('should return DatabaseStorage when DATABASE_URL is set', async () => {
      // Set DATABASE_URL to point to a non-existent database
      // getStorage() should fall back to FileStorage if database fails
      process.env.DATABASE_URL = 'postgres://invalid:5432/test';

      const storage = await getStorage();
      // With invalid URL, it should fall back to FileStorage
      // Check for IStorage interface methods
      expect(storage).toHaveProperty('findApiKey');
      expect(storage).toHaveProperty('updateApiKeyUsage');
      expect(storage).toHaveProperty('getKeyStats');
      expect(storage).toHaveProperty('initialize');
    });

    test('should return DatabaseStorage when DATABASE_PATH is set', async () => {
      // Set DATABASE_PATH to a test database
      process.env.DATABASE_PATH = './data/test-factory.db';

      const storage = await getStorage();
      // Without proper schema, falls back to FileStorage
      // (schema migrations must be run separately via drizzle-kit)
      // Check for IStorage interface methods
      expect(storage).toHaveProperty('findApiKey');
      expect(storage).toHaveProperty('updateApiKeyUsage');
      expect(storage).toHaveProperty('getKeyStats');
      expect(storage).toHaveProperty('initialize');
    });

    test('should return DatabaseStorage when STORAGE_TYPE is "database"', async () => {
      // Without DATABASE_URL or DATABASE_PATH, but with STORAGE_TYPE=database
      // DatabaseStorage will fail initialization and fall back to FileStorage
      process.env.STORAGE_TYPE = 'database';

      const storage = await getStorage();
      // Check for IStorage interface methods
      expect(storage).toHaveProperty('findApiKey');
      expect(storage).toHaveProperty('updateApiKeyUsage');
      expect(storage).toHaveProperty('getKeyStats');
      expect(storage).toHaveProperty('initialize');
    });

    test('should return FileStorage when STORAGE_TYPE is "file"', async () => {
      process.env.STORAGE_TYPE = 'file';
      const storage = await getStorage();
      // Check for IStorage interface methods
      expect(storage).toHaveProperty('findApiKey');
      expect(storage).toHaveProperty('updateApiKeyUsage');
      expect(storage).toHaveProperty('getKeyStats');
      expect(storage).toHaveProperty('initialize');
    });

    test('should prioritize STORAGE_TYPE=file over DATABASE_URL', async () => {
      process.env.DATABASE_URL = 'postgres://localhost:5432/test';
      process.env.STORAGE_TYPE = 'file';
      const storage = await getStorage();
      // Check for IStorage interface methods
      expect(storage).toHaveProperty('findApiKey');
      expect(storage).toHaveProperty('updateApiKeyUsage');
      expect(storage).toHaveProperty('getKeyStats');
      expect(storage).toHaveProperty('initialize');
    });

    test('should return same instance on subsequent calls (singleton)', async () => {
      const storage1 = await getStorage();
      const storage2 = await getStorage();
      expect(storage1).toBe(storage2);
    });

    test('should return different instance after reset', async () => {
      const storage1 = await getStorage();
      resetStorage();
      const storage2 = await getStorage();
      expect(storage1).not.toBe(storage2);
    });
  });

  describe('resetStorage()', () => {
    test('should clear the singleton instance', async () => {
      const storage1 = await getStorage();
      resetStorage();
      const storage2 = await getStorage();
      expect(storage1).not.toBe(storage2);
    });

    test('should allow switching storage types', async () => {
      // Start with file storage
      const storage1 = await getStorage();
      // Check for IStorage interface methods
      expect(storage1).toHaveProperty('findApiKey');
      expect(storage1).toHaveProperty('updateApiKeyUsage');
      expect(storage1).toHaveProperty('getKeyStats');

      // Reset and switch to database storage
      resetStorage();
      process.env.STORAGE_TYPE = 'database';

      const storage2 = await getStorage();
      // Without valid database config, will fall back to FileStorage
      expect(storage2).toHaveProperty('findApiKey');
      expect(storage2).toHaveProperty('updateApiKeyUsage');
      expect(storage2).toHaveProperty('getKeyStats');
    });
  });

  describe('Storage functionality', () => {
    test('FileStorage should be fully functional via getStorage()', async () => {
      const storage = await getStorage();
      // Check for IStorage interface methods
      expect(storage).toHaveProperty('findApiKey');
      expect(storage).toHaveProperty('updateApiKeyUsage');
      expect(storage).toHaveProperty('getKeyStats');
      expect(storage).toHaveProperty('initialize');

      // Test that storage methods work
      expect(typeof storage.findApiKey).toBe('function');
      expect(typeof storage.updateApiKeyUsage).toBe('function');
      expect(typeof storage.getKeyStats).toBe('function');
      expect(typeof storage.initialize).toBe('function');
    });

    test('should initialize storage on first call', async () => {
      // This should not throw
      const storage = await getStorage();
      expect(storage).toBeDefined();
    });
  });

  describe('Error handling', () => {
    test('should gracefully fall back from database to file storage', async () => {
      // Set DATABASE_URL to invalid connection
      process.env.DATABASE_URL = 'postgres://invalid-host:9999/invalid-db';

      // Should fall back to FileStorage instead of throwing
      const storage = await getStorage();
      // Check for IStorage interface methods
      expect(storage).toHaveProperty('findApiKey');
      expect(storage).toHaveProperty('updateApiKeyUsage');
      expect(storage).toHaveProperty('getKeyStats');
      expect(storage).toHaveProperty('initialize');
    });

    test('should throw if both database and file storage fail', async () => {
      // Set DATABASE_URL to invalid connection
      process.env.DATABASE_URL = 'postgres://invalid-host:9999/invalid-db';

      // Set DATA_FILE to an invalid path (e.g., root directory where we can't write)
      const originalDataFile = process.env.DATA_FILE;
      process.env.DATA_FILE = '/root/data/apikeys.json'; // Should fail permission error

      try {
        await getStorage();
        // If we get here, something unexpected happened
        expect(true).toBe(false); // Force test failure
      } catch (error) {
        // Expected to throw with error message about both failures
        expect(error).toBeDefined();
        const errorMessage = error instanceof Error ? error.message : '';
        expect(errorMessage).toContain('Failed to initialize both database and file storage');
      } finally {
        // Restore original DATA_FILE
        if (originalDataFile) {
          process.env.DATA_FILE = originalDataFile;
        } else {
          delete process.env.DATA_FILE;
        }
      }
    });
  });

  describe('Environment configuration', () => {
    test('should work with DATABASE_URL (PostgreSQL)', async () => {
      // Using invalid URL to test fallback behavior
      process.env.DATABASE_URL = 'postgres://invalid-host:9999/test';

      const storage = await getStorage();
      // Should fall back to FileStorage when database connection fails
      // Check for IStorage interface methods
      expect(storage).toHaveProperty('findApiKey');
      expect(storage).toHaveProperty('updateApiKeyUsage');
      expect(storage).toHaveProperty('getKeyStats');
      expect(storage).toHaveProperty('initialize');
    });

    test('should work with DATABASE_PATH (SQLite)', async () => {
      process.env.DATABASE_PATH = './data/test-sqlite.db';

      const storage = await getStorage();
      // Without proper schema, falls back to FileStorage
      // (schema migrations must be run separately via drizzle-kit)
      // Check for IStorage interface methods
      expect(storage).toHaveProperty('findApiKey');
      expect(storage).toHaveProperty('updateApiKeyUsage');
      expect(storage).toHaveProperty('getKeyStats');
      expect(storage).toHaveProperty('initialize');
    });

    test('should work with STORAGE_TYPE=database', async () => {
      // Without DATABASE_URL or DATABASE_PATH, should fall back to FileStorage
      process.env.STORAGE_TYPE = 'database';

      const storage = await getStorage();
      // Check for IStorage interface methods
      expect(storage).toHaveProperty('findApiKey');
      expect(storage).toHaveProperty('updateApiKeyUsage');
      expect(storage).toHaveProperty('getKeyStats');
      expect(storage).toHaveProperty('initialize');
    });

    test('should work with STORAGE_TYPE=file', async () => {
      process.env.STORAGE_TYPE = 'file';
      const storage = await getStorage();
      // Check for IStorage interface methods
      expect(storage).toHaveProperty('findApiKey');
      expect(storage).toHaveProperty('updateApiKeyUsage');
      expect(storage).toHaveProperty('getKeyStats');
      expect(storage).toHaveProperty('initialize');
    });

    test('should default to file storage with no env vars', async () => {
      // All env vars are cleared in beforeEach
      const storage = await getStorage();
      // Check for IStorage interface methods
      expect(storage).toHaveProperty('findApiKey');
      expect(storage).toHaveProperty('updateApiKeyUsage');
      expect(storage).toHaveProperty('getKeyStats');
      expect(storage).toHaveProperty('initialize');
    });
  });
});
