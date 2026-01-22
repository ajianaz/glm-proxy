import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { FileStorage } from './file.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

// Test data file
const TEST_FILE = join(process.cwd(), 'data', 'test-file-storage.json');

describe('FileStorage', () => {
  let storage: FileStorage;

  beforeEach(() => {
    // Create new storage instance with test file
    storage = new FileStorage(TEST_FILE);

    // Clean up test file before each test
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }

    // Clean up lock file if it exists
    const lockFile = TEST_FILE + '.lock';
    if (existsSync(lockFile)) {
      unlinkSync(lockFile);
    }
  });

  afterAll(() => {
    // Clean up test file
    if (existsSync(TEST_FILE)) {
      unlinkSync(TEST_FILE);
    }

    const lockFile = TEST_FILE + '.lock';
    if (existsSync(lockFile)) {
      unlinkSync(lockFile);
    }
  });

  describe('initialize', () => {
    it('should create data directory and file if they do not exist', async () => {
      await storage.initialize();

      expect(existsSync(TEST_FILE)).toBe(true);
    });

    it('should be idempotent - can be called multiple times', async () => {
      await storage.initialize();
      await storage.initialize();
      await storage.initialize();

      expect(existsSync(TEST_FILE)).toBe(true);
    });

    it('should create empty keys array in new file', async () => {
      await storage.initialize();

      const keys = await storage.findApiKey('non-existent');
      expect(keys).toBeNull();
    });
  });

  describe('findApiKey', () => {
    it('should return null for non-existent key', async () => {
      await storage.initialize();

      const result = await storage.findApiKey('sk-nonexistent');
      expect(result).toBeNull();
    });

    it('should throw error if not initialized', async () => {
      const uninitializedStorage = new FileStorage(TEST_FILE);

      await expect(uninitializedStorage.findApiKey('sk-test')).rejects.toThrow(
        'File storage has not been initialized'
      );
    });
  });

  describe('updateApiKeyUsage', () => {
    it('should throw error for non-existent key', async () => {
      await storage.initialize();

      await expect(
        storage.updateApiKeyUsage('sk-nonexistent', 100, 'model')
      ).rejects.toThrow('API key not found');
    });

    it('should throw error if not initialized', async () => {
      const uninitializedStorage = new FileStorage(TEST_FILE);

      await expect(
        uninitializedStorage.updateApiKeyUsage('sk-test', 100, 'model')
      ).rejects.toThrow('File storage has not been initialized');
    });
  });

  describe('getKeyStats', () => {
    it('should return null for non-existent key', async () => {
      await storage.initialize();

      const stats = await storage.getKeyStats('sk-nonexistent');
      expect(stats).toBeNull();
    });

    it('should throw error if not initialized', async () => {
      const uninitializedStorage = new FileStorage(TEST_FILE);

      await expect(uninitializedStorage.getKeyStats('sk-test')).rejects.toThrow(
        'File storage has not been initialized'
      );
    });
  });

  describe('integration tests', () => {
    it('should handle complete workflow: initialize -> find -> update -> stats', async () => {
      await storage.initialize();

      // Note: In the current file-based implementation, we can't create keys
      // through the storage interface. Keys are managed externally.
      // For now, we test that the methods work correctly.

      const key = await storage.findApiKey('sk-test');
      expect(key).toBeNull();

      await expect(
        storage.updateApiKeyUsage('sk-test', 100, 'model')
      ).rejects.toThrow('API key not found');

      const stats = await storage.getKeyStats('sk-test');
      expect(stats).toBeNull();
    });
  });

  describe('file locking', () => {
    it('should handle concurrent access gracefully', async () => {
      await storage.initialize();

      // Multiple operations should not conflict
      const promises = [
        storage.findApiKey('sk-test1'),
        storage.findApiKey('sk-test2'),
        storage.findApiKey('sk-test3'),
      ];

      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      expect(results.every(r => r === null)).toBe(true);
    });
  });
});
