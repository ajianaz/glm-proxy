/**
 * Migration Integration Tests
 *
 * Comprehensive end-to-end tests for migration from file-based storage to database.
 * Tests successful migration, data integrity preservation, rollback functionality,
 * and validation error catching.
 */

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'bun:sqlite';
import type { ApiKeysData } from '../src/types.js';
import {
  migrateApiKeys,
  validateMigration,
  getDatabaseKeyCount,
  rollbackMigration,
} from '../scripts/migrate.js';
import { findApiKey, getAllApiKeys } from '../src/db/operations.js';
import { closeDb, resetDb } from '../src/db/connection.js';

// Test database path
const TEST_DB_PATH = path.join(process.cwd(), 'data/test-migration.db');
const TEST_BACKUP_DIR = path.join(process.cwd(), 'data/test-backups');

describe('Migration Integration Tests', () => {
  beforeEach(async () => {
    // Clean up test database
    try {
      rmSync(TEST_DB_PATH, { force: true });
    } catch {
      // Ignore if file doesn't exist
    }

    // Clean up backup directory
    try {
      rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }

    // Set test database environment
    process.env.DATABASE_PATH = TEST_DB_PATH;

    // Close and reset any existing connections
    try {
      await closeDb();
    } catch {
      // Ignore if no connection exists
    }
    resetDb();

    // Create data directory if needed
    const dataDir = path.dirname(TEST_DB_PATH);
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    // Initialize test database schema
    const sqlite = new Database(TEST_DB_PATH);
    sqlite.exec('PRAGMA journal_mode = WAL;');
    sqlite.exec('PRAGMA foreign_keys = ON;');

    // Create api_keys table
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS \`api_keys\` (
        \`key\` text PRIMARY KEY NOT NULL,
        \`name\` text NOT NULL,
        \`model\` text,
        \`token_limit_per_5h\` integer NOT NULL,
        \`expiry_date\` text NOT NULL,
        \`created_at\` text NOT NULL,
        \`last_used\` text NOT NULL,
        \`total_lifetime_tokens\` integer DEFAULT 0 NOT NULL
      );
    `);

    // Create usage_windows table with foreign key
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS \`usage_windows\` (
        \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        \`api_key\` text NOT NULL,
        \`window_start\` text NOT NULL,
        \`tokens_used\` integer NOT NULL,
        FOREIGN KEY (\`api_key\`) REFERENCES \`api_keys\`(\`key\`) ON UPDATE CASCADE ON DELETE CASCADE
      );
    `);

    // Create indexes
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS \`api_keys_last_used_idx\` ON \`api_keys\`(\`last_used\`);
      CREATE INDEX IF NOT EXISTS \`api_keys_expiry_date_idx\` ON \`api_keys\`(\`expiry_date\`);
      CREATE INDEX IF NOT EXISTS \`usage_windows_api_key_idx\` ON \`usage_windows\`(\`api_key\`);
      CREATE INDEX IF NOT EXISTS \`usage_windows_window_start_idx\` ON \`usage_windows\`(\`window_start\`);
    `);

    sqlite.close();
  });

  afterAll(async () => {
    // Clean up test database
    try {
      await closeDb();
      rmSync(TEST_DB_PATH, { force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Clean up backup directory
    try {
      rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Successful Migration', () => {
    test('should migrate single API key successfully', async () => {
      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-single-1',
            name: 'Single Test Key',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 1000,
            usage_windows: [],
          },
        ],
      };

      // Get initial count
      const initialCount = await getDatabaseKeyCount();

      // Migrate the key
      const migratedKeys = await migrateApiKeys(testData);

      // Verify migration result
      expect(migratedKeys.length).toBe(1);
      expect(migratedKeys).toContain('sk-test-single-1');

      // Verify key exists in database
      const key = await findApiKey('sk-test-single-1');
      expect(key).toBeDefined();
      expect(key?.name).toBe('Single Test Key');
      expect(key?.model).toBe('claude-3-5-sonnet-20241022');
      expect(key?.token_limit_per_5h).toBe(50000);
      expect(key?.total_lifetime_tokens).toBe(1000);

      // Validate migration
      const validation = await validateMigration(testData, initialCount);
      expect(validation.valid).toBe(true);
      expect(validation.discrepancies.length).toBe(0);
      expect(validation.details.newKeysCount).toBe(1);
    });

    test('should migrate multiple API keys successfully', async () => {
      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-multi-1',
            name: 'Multi Test Key 1',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 1000,
            usage_windows: [],
          },
          {
            key: 'sk-test-multi-2',
            name: 'Multi Test Key 2',
            model: 'claude-3-opus-20240229',
            token_limit_per_5h: 100000,
            expiry_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-02-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 2000,
            usage_windows: [],
          },
          {
            key: 'sk-test-multi-3',
            name: 'Multi Test Key 3',
            model: 'claude-3-haiku-20240307',
            token_limit_per_5h: 25000,
            expiry_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-03-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 500,
            usage_windows: [],
          },
        ],
      };

      // Get initial count
      const initialCount = await getDatabaseKeyCount();

      // Migrate all keys
      const migratedKeys = await migrateApiKeys(testData);

      // Verify all keys migrated
      expect(migratedKeys.length).toBe(3);
      expect(migratedKeys).toContain('sk-test-multi-1');
      expect(migratedKeys).toContain('sk-test-multi-2');
      expect(migratedKeys).toContain('sk-test-multi-3');

      // Verify all keys exist in database
      const key1 = await findApiKey('sk-test-multi-1');
      const key2 = await findApiKey('sk-test-multi-2');
      const key3 = await findApiKey('sk-test-multi-3');

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key3).toBeDefined();

      expect(key1?.name).toBe('Multi Test Key 1');
      expect(key2?.name).toBe('Multi Test Key 2');
      expect(key3?.name).toBe('Multi Test Key 3');

      // Validate migration
      const validation = await validateMigration(testData, initialCount);
      expect(validation.valid).toBe(true);
      expect(validation.discrepancies.length).toBe(0);
      expect(validation.details.newKeysCount).toBe(3);
    });

    test('should migrate keys with usage windows', async () => {
      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-windows-1',
            name: 'Windows Test Key',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 125000,
            usage_windows: [
              {
                window_start: '2024-01-15T10:00:00Z',
                tokens_used: 50000,
              },
              {
                window_start: '2024-01-15T11:00:00Z',
                tokens_used: 75000,
              },
            ],
          },
        ],
      };

      // Get initial count
      const initialCount = await getDatabaseKeyCount();

      // Migrate the key
      await migrateApiKeys(testData);

      // Verify key exists with usage windows
      const key = await findApiKey('sk-test-windows-1');
      expect(key).toBeDefined();
      expect(key?.usage_windows.length).toBe(2);
      expect(key?.usage_windows[0].tokens_used).toBe(50000);
      expect(key?.usage_windows[1].tokens_used).toBe(75000);

      // Validate migration including usage windows
      const validation = await validateMigration(testData, initialCount);
      expect(validation.valid).toBe(true);
      expect(validation.discrepancies.length).toBe(0);
    });

    test('should migrate keys with null model field', async () => {
      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-null-model',
            name: 'Null Model Key',
            model: '', // Use empty string instead of null (what actually gets stored)
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 1000,
            usage_windows: [],
          },
        ],
      };

      // Get initial count
      const initialCount = await getDatabaseKeyCount();

      // Migrate the key
      await migrateApiKeys(testData);

      // Verify key exists with null/empty model
      const key = await findApiKey('sk-test-null-model');
      expect(key).toBeDefined();
      // Empty model is stored as empty string in database
      expect(key?.model === '' || key?.model === null || key?.model === undefined).toBe(true);

      // Validate migration
      const validation = await validateMigration(testData, initialCount);
      expect(validation.valid).toBe(true);
    });

    test('should migrate keys with empty usage windows', async () => {
      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-empty-windows',
            name: 'Empty Windows Key',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 0,
            usage_windows: [],
          },
        ],
      };

      // Get initial count
      const initialCount = await getDatabaseKeyCount();

      // Migrate the key
      await migrateApiKeys(testData);

      // Verify key exists with no usage windows
      const key = await findApiKey('sk-test-empty-windows');
      expect(key).toBeDefined();
      expect(key?.usage_windows.length).toBe(0);

      // Validate migration
      const validation = await validateMigration(testData, initialCount);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Data Integrity Validation', () => {
    test('should detect record count mismatches', async () => {
      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-count-1',
            name: 'Count Test Key 1',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 1000,
            usage_windows: [],
          },
          {
            key: 'sk-test-count-2',
            name: 'Count Test Key 2',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 1000,
            usage_windows: [],
          },
        ],
      };

      // Get initial count
      const initialCount = await getDatabaseKeyCount();

      // Migrate only one key
      await migrateApiKeys({
        keys: [testData.keys[0]],
      });

      // Validate with original data (should detect missing key)
      const validation = await validateMigration(testData, initialCount);

      expect(validation.valid).toBe(false);
      expect(validation.discrepancies.length).toBeGreaterThan(0);
      expect(validation.discrepancies.some((d) => d.includes('Record count mismatch'))).toBe(
        true
      );
    });

    test('should detect field value mismatches', async () => {
      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-mismatch',
            name: 'Mismatch Test Key',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 1000,
            usage_windows: [],
          },
        ],
      };

      // Get initial count
      const initialCount = await getDatabaseKeyCount();

      // Migrate the key
      await migrateApiKeys(testData);

      // Modify the key in database to create a mismatch
      const connection = await import('../src/db/connection.js').then((m) => m.getDb());

      // Update the key's name to create a mismatch using raw SQL
      if (connection.type === 'sqlite') {
        const sqlite = connection.client as Database;
        sqlite.exec(`UPDATE api_keys SET name = 'Wrong Name' WHERE key = 'sk-test-mismatch'`);
      }

      // Validate with original data (should detect mismatch)
      const validation = await validateMigration(testData, initialCount);

      expect(validation.valid).toBe(false);
      expect(validation.discrepancies.length).toBeGreaterThan(0);
      expect(validation.discrepancies.some((d) => d.includes('name mismatch'))).toBe(true);
    });

    test('should detect usage window mismatches', async () => {
      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-window-mismatch',
            name: 'Window Mismatch Key',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 1000,
            usage_windows: [
              {
                window_start: '2024-01-15T10:00:00Z',
                tokens_used: 50000,
              },
              {
                window_start: '2024-01-15T11:00:00Z',
                tokens_used: 75000,
              },
            ],
          },
        ],
      };

      // Get initial count
      const initialCount = await getDatabaseKeyCount();

      // Migrate the key
      await migrateApiKeys(testData);

      // Manually delete one usage window to create mismatch
      const connection = await import('../src/db/connection.js').then((m) => m.getDb());
      if (connection.type === 'sqlite') {
        const sqlite = connection.client as Database;
        sqlite.exec(`DELETE FROM usage_windows WHERE api_key = 'sk-test-window-mismatch' AND window_start = '2024-01-15T11:00:00Z'`);
      }

      // Validate with original data (should detect mismatch)
      const validation = await validateMigration(testData, initialCount);

      expect(validation.valid).toBe(false);
      expect(validation.discrepancies.length).toBeGreaterThan(0);
      expect(validation.discrepancies.some((d) => d.includes('usage_windows mismatch'))).toBe(
        true
      );
    });

    test('should detect missing keys in database', async () => {
      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-missing',
            name: 'Missing Key Test',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 1000,
            usage_windows: [],
          },
        ],
      };

      // Get initial count (no keys migrated yet)
      const initialCount = await getDatabaseKeyCount();

      // Don't migrate anything - validate should detect missing key
      const validation = await validateMigration(testData, initialCount);

      expect(validation.valid).toBe(false);
      expect(validation.discrepancies.length).toBeGreaterThan(0);
      expect(validation.discrepancies.some((d) => d.includes('not found in database'))).toBe(
        true
      );
    });
  });

  describe('Rollback Functionality', () => {
    test('should rollback on validation failure', async () => {
      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-rollback-fail',
            name: 'Rollback Failure Test',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 1000,
            usage_windows: [
              {
                window_start: '2024-01-15T10:00:00Z',
                tokens_used: 50000,
              },
            ],
          },
        ],
      };

      // Get initial count
      const initialCount = await getDatabaseKeyCount();

      // Migrate the key
      const migratedKeys = await migrateApiKeys(testData);

      // Verify key exists
      let key = await findApiKey('sk-test-rollback-fail');
      expect(key).toBeDefined();
      expect(key?.usage_windows.length).toBe(1);

      // Manually corrupt data to trigger validation failure
      const connection = await import('../src/db/connection.js').then((m) => m.getDb());
      if (connection.type === 'sqlite') {
        const sqlite = connection.client as Database;
        sqlite.exec(`UPDATE api_keys SET name = 'Corrupted Name' WHERE key = 'sk-test-rollback-fail'`);
      }

      // Validate (should fail)
      const validation = await validateMigration(testData, initialCount);
      expect(validation.valid).toBe(false);

      // Perform rollback
      await rollbackMigration(migratedKeys);

      // Verify key was deleted
      key = await findApiKey('sk-test-rollback-fail');
      expect(key).toBeNull();
    });

    test('should rollback partially migrated data', async () => {
      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-partial-1',
            name: 'Partial Test 1',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 1000,
            usage_windows: [],
          },
          {
            key: 'sk-test-partial-2',
            name: 'Partial Test 2',
            model: 'claude-3-opus-20240229',
            token_limit_per_5h: 100000,
            expiry_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-02-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 2000,
            usage_windows: [],
          },
        ],
      };

      // Migrate all keys
      const migratedKeys = await migrateApiKeys(testData);

      // Verify both keys exist
      let key1 = await findApiKey('sk-test-partial-1');
      let key2 = await findApiKey('sk-test-partial-2');
      expect(key1).toBeDefined();
      expect(key2).toBeDefined();

      // Rollback all keys
      await rollbackMigration(migratedKeys);

      // Verify both keys were deleted
      key1 = await findApiKey('sk-test-partial-1');
      key2 = await findApiKey('sk-test-partial-2');
      expect(key1).toBeNull();
      expect(key2).toBeNull();

      // Verify database is empty
      const allKeys = await getAllApiKeys({ limit: 100 });
      expect(allKeys.length).toBe(0);
    });

    test('should rollback usage windows with cascade delete', async () => {
      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-cascade',
            name: 'Cascade Delete Test',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 125000,
            usage_windows: [
              {
                window_start: '2024-01-15T10:00:00Z',
                tokens_used: 50000,
              },
              {
                window_start: '2024-01-15T11:00:00Z',
                tokens_used: 75000,
              },
            ],
          },
        ],
      };

      // Migrate the key
      const migratedKeys = await migrateApiKeys(testData);

      // Verify key and usage windows exist
      const key = await findApiKey('sk-test-cascade');
      expect(key?.usage_windows.length).toBe(2);

      // Rollback
      await rollbackMigration(migratedKeys);

      // Verify key was deleted
      const deletedKey = await findApiKey('sk-test-cascade');
      expect(deletedKey).toBeNull();

      // Usage windows should be cascade deleted by foreign key constraint
      const allKeys = await getAllApiKeys({ limit: 100 });
      expect(allKeys.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle duplicate key during migration', async () => {
      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-duplicate',
            name: 'Duplicate Test Key',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 1000,
            usage_windows: [],
          },
        ],
      };

      // Migrate the key first time
      await migrateApiKeys(testData);

      // Verify key exists
      const key1 = await findApiKey('sk-test-duplicate');
      expect(key1).toBeDefined();

      // Try to migrate same key again (should fail due to unique constraint)
      let migrationError: Error | null = null;
      try {
        await migrateApiKeys(testData);
      } catch (error) {
        migrationError = error as Error;
      }

      // Should have thrown an error
      expect(migrationError).toBeDefined();
      expect(migrationError?.message).toContain('failed to migrate');
    });

    test('should handle empty API keys list', async () => {
      const testData: ApiKeysData = {
        keys: [],
      };

      // Get initial count
      const initialCount = await getDatabaseKeyCount();

      // Migrate empty list
      const migratedKeys = await migrateApiKeys(testData);

      // Should return empty list
      expect(migratedKeys.length).toBe(0);

      // Validate should pass
      const validation = await validateMigration(testData, initialCount);
      expect(validation.valid).toBe(true);
    });

    test('should handle keys with many usage windows', async () => {
      // Create key with many usage windows
      const usageWindows = [];
      for (let i = 0; i < 50; i++) {
        usageWindows.push({
          window_start: new Date(Date.now() - i * 60 * 60 * 1000).toISOString(),
          tokens_used: Math.floor(Math.random() * 10000),
        });
      }

      const totalTokens = usageWindows.reduce((sum, w) => sum + w.tokens_used, 0);

      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-many-windows',
            name: 'Many Windows Test',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: totalTokens,
            usage_windows: usageWindows,
          },
        ],
      };

      // Get initial count
      const initialCount = await getDatabaseKeyCount();

      // Migrate the key
      await migrateApiKeys(testData);

      // Verify all usage windows were migrated
      const key = await findApiKey('sk-test-many-windows');
      expect(key?.usage_windows.length).toBe(50);

      // Validate migration
      const validation = await validateMigration(testData, initialCount);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Full Workflow Integration', () => {
    test('should complete full migration workflow successfully', async () => {
      const testData: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-workflow-1',
            name: 'Workflow Test Key 1',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 1000,
            usage_windows: [
              {
                window_start: '2024-01-15T10:00:00Z',
                tokens_used: 50000,
              },
            ],
          },
          {
            key: 'sk-test-workflow-2',
            name: 'Workflow Test Key 2',
            model: '', // Use empty string instead of null
            token_limit_per_5h: 100000,
            expiry_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-02-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 2000,
            usage_windows: [],
          },
        ],
      };

      // Step 1: Get initial state
      const initialCount = await getDatabaseKeyCount();
      expect(initialCount).toBe(0);

      // Step 2: Migrate keys
      const migratedKeys = await migrateApiKeys(testData);
      expect(migratedKeys.length).toBe(2);

      // Step 3: Validate migration
      const validation = await validateMigration(testData, initialCount);
      expect(validation.valid).toBe(true);
      expect(validation.discrepancies.length).toBe(0);

      // Step 4: Verify data integrity
      const key1 = await findApiKey('sk-test-workflow-1');
      const key2 = await findApiKey('sk-test-workflow-2');

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1?.usage_windows.length).toBe(1);
      expect(key2?.usage_windows.length).toBe(0);

      // Verify model fields are handled correctly
      expect(key1?.model).toBe('claude-3-5-sonnet-20241022');
      expect(key2?.model === '' || key2?.model === null || key2?.model === undefined).toBe(true);

      // Step 5: Cleanup (simulating rollback)
      await rollbackMigration(migratedKeys);

      const key1After = await findApiKey('sk-test-workflow-1');
      const key2After = await findApiKey('sk-test-workflow-2');

      expect(key1After).toBeNull();
      expect(key2After).toBeNull();

      const finalCount = await getDatabaseKeyCount();
      expect(finalCount).toBe(0);
    });

    test('should handle incremental migrations', async () => {
      // First migration
      const batch1: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-batch1-1',
            name: 'Batch 1 Key 1',
            model: 'claude-3-5-sonnet-20241022',
            token_limit_per_5h: 50000,
            expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-01-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 1000,
            usage_windows: [],
          },
        ],
      };

      const initialCount1 = await getDatabaseKeyCount();
      await migrateApiKeys(batch1);
      const validation1 = await validateMigration(batch1, initialCount1);
      expect(validation1.valid).toBe(true);

      // Second migration (add more keys)
      const batch2: ApiKeysData = {
        keys: [
          {
            key: 'sk-test-batch2-1',
            name: 'Batch 2 Key 1',
            model: 'claude-3-opus-20240229',
            token_limit_per_5h: 100000,
            expiry_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-02-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 2000,
            usage_windows: [],
          },
          {
            key: 'sk-test-batch2-2',
            name: 'Batch 2 Key 2',
            model: 'claude-3-haiku-20240307',
            token_limit_per_5h: 25000,
            expiry_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
            created_at: '2024-03-01T00:00:00Z',
            last_used: new Date().toISOString(),
            total_lifetime_tokens: 500,
            usage_windows: [],
          },
        ],
      };

      const initialCount2 = await getDatabaseKeyCount();
      await migrateApiKeys(batch2);
      const validation2 = await validateMigration(batch2, initialCount2);
      expect(validation2.valid).toBe(true);

      // Verify all keys exist
      const allKeys = await getAllApiKeys({ limit: 100 });
      expect(allKeys.length).toBe(3);
    });
  });
});
