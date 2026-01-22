/**
 * Migration Rollback Tests
 *
 * Tests the automatic rollback functionality when migration fails
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { rmSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'bun:sqlite';
import {
  migrateApiKeys,
  rollbackMigration,
  type ApiKeysData,
} from '../scripts/migrate.ts';
import { getAllApiKeys, findApiKey } from '../src/db/operations.js';
import { closeDb } from '../src/db/connection.js';

// Test database path
const TEST_DB_PATH = path.join(process.cwd(), 'data/test-rollback.db');

describe('Migration Rollback', () => {
  beforeEach(async () => {
    // Clean up test database
    try {
      rmSync(TEST_DB_PATH, { force: true });
    } catch {
      // Ignore if file doesn't exist
    }

    // Set test database environment
    process.env.DATABASE_PATH = TEST_DB_PATH;

    // Close any existing connections to force reconnection with test database
    try {
      await closeDb();
    } catch {
      // Ignore if no connection exists
    }

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

  test('rollbackMigration should delete successfully migrated keys', async () => {
    // Create test data with 3 keys
    const testKeys: ApiKeysData = {
      keys: [
        {
          key: 'sk-test-rollback-1',
          name: 'Test Key 1',
          model: 'claude-3-5-sonnet-20241022',
          token_limit_per_5h: 50000,
          expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          last_used: new Date().toISOString(),
          total_lifetime_tokens: 1000,
          usage_windows: [
            {
              window_start: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
              tokens_used: 1000,
            },
          ],
        },
        {
          key: 'sk-test-rollback-2',
          name: 'Test Key 2',
          model: 'claude-3-5-sonnet-20241022',
          token_limit_per_5h: 50000,
          expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          last_used: new Date().toISOString(),
          total_lifetime_tokens: 2000,
          usage_windows: [],
        },
        {
          key: 'sk-test-rollback-3',
          name: 'Test Key 3',
          model: 'claude-3-5-sonnet-20241022',
          token_limit_per_5h: 50000,
          expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          last_used: new Date().toISOString(),
          total_lifetime_tokens: 3000,
          usage_windows: [
            {
              window_start: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
              tokens_used: 500,
            },
            {
              window_start: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
              tokens_used: 2500,
            },
          ],
        },
      ],
    };

    // Migrate all keys
    const migratedKeys = await migrateApiKeys(testKeys);

    // Verify all keys are in database
    const allKeys = await getAllApiKeys({ limit: 10 });
    expect(allKeys.length).toBe(3);

    // Verify specific keys exist
    const key1 = await findApiKey('sk-test-rollback-1');
    expect(key1).toBeDefined();
    expect(key1?.usage_windows.length).toBe(1);

    const key2 = await findApiKey('sk-test-rollback-2');
    expect(key2).toBeDefined();

    const key3 = await findApiKey('sk-test-rollback-3');
    expect(key3).toBeDefined();
    expect(key3?.usage_windows.length).toBe(2);

    // Perform rollback
    const rollbackResult = await rollbackMigration(migratedKeys);

    // Verify rollback result
    expect(rollbackResult.deleted).toBe(3);
    expect(rollbackResult.failed).toBe(0);
    expect(rollbackResult.errors.length).toBe(0);

    // Verify all keys are removed from database
    const allKeysAfterRollback = await getAllApiKeys({ limit: 10 });
    expect(allKeysAfterRollback.length).toBe(0);

    // Verify specific keys don't exist
    const key1After = await findApiKey('sk-test-rollback-1');
    expect(key1After).toBeNull();

    const key2After = await findApiKey('sk-test-rollback-2');
    expect(key2After).toBeNull();

    const key3After = await findApiKey('sk-test-rollback-3');
    expect(key3After).toBeNull();
  });

  test('rollbackMigration should handle empty key list', async () => {
    // Rollback with no keys
    const rollbackResult = await rollbackMigration([]);

    // Should succeed but with no deletions
    expect(rollbackResult.deleted).toBe(0);
    expect(rollbackResult.failed).toBe(0);
    expect(rollbackResult.errors.length).toBe(0);
  });

  test('rollbackMigration should handle non-existent keys gracefully', async () => {
    // Try to rollback keys that don't exist
    const nonExistentKeys = [
      'sk-does-not-exist-1',
      'sk-does-not-exist-2',
    ];

    const rollbackResult = await rollbackMigration(nonExistentKeys);

    // Should mark as failed but not throw
    expect(rollbackResult.deleted).toBe(0);
    expect(rollbackResult.failed).toBe(2);
  });

  test('migrateApiKeys returns list of successfully migrated keys', async () => {
    // Create test data with 2 keys
    const testKeys: ApiKeysData = {
      keys: [
        {
          key: 'sk-test-migrate-1',
          name: 'Test Migrate Key 1',
          model: 'claude-3-5-sonnet-20241022',
          token_limit_per_5h: 50000,
          expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          last_used: new Date().toISOString(),
          total_lifetime_tokens: 1000,
          usage_windows: [],
        },
        {
          key: 'sk-test-migrate-2',
          name: 'Test Migrate Key 2',
          model: 'claude-3-5-sonnet-20241022',
          token_limit_per_5h: 50000,
          expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          last_used: new Date().toISOString(),
          total_lifetime_tokens: 2000,
          usage_windows: [],
        },
      ],
    };

    // Migrate keys and capture returned list
    const migratedKeys = await migrateApiKeys(testKeys);

    // Verify returned list contains the keys
    expect(migratedKeys.length).toBe(2);
    expect(migratedKeys).toContain('sk-test-migrate-1');
    expect(migratedKeys).toContain('sk-test-migrate-2');

    // Verify keys are in database
    const key1 = await findApiKey('sk-test-migrate-1');
    expect(key1).toBeDefined();

    const key2 = await findApiKey('sk-test-migrate-2');
    expect(key2).toBeDefined();
  });

  test('rollbackMigration should handle partial failures', async () => {
    // Create and migrate one key
    const testKeys: ApiKeysData = {
      keys: [
        {
          key: 'sk-test-partial-1',
          name: 'Test Partial Key',
          model: 'claude-3-5-sonnet-20241022',
          token_limit_per_5h: 50000,
          expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
          last_used: new Date().toISOString(),
          total_lifetime_tokens: 1000,
          usage_windows: [],
        },
      ],
    };

    await migrateApiKeys(testKeys);

    // Try to rollback mix of existing and non-existing keys
    const mixedKeys = [
      'sk-test-partial-1', // exists
      'sk-does-not-exist', // doesn't exist
    ];

    const rollbackResult = await rollbackMigration(mixedKeys);

    // Should delete one and fail one
    expect(rollbackResult.deleted).toBe(1);
    expect(rollbackResult.failed).toBe(1);

    // Verify the existing key was actually deleted
    const key = await findApiKey('sk-test-partial-1');
    expect(key).toBeNull();
  });
});
