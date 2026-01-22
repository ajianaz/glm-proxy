import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { getDb, closeDb } from '../../src/db/connection.js';
import { createApiKey, deleteApiKey, findApiKey, updateApiKeyUsage } from '../../src/db/operations.js';
import type { ApiKey } from '../../src/types.js';

/**
 * Schema Verification Tests
 *
 * This test suite verifies:
 * 1. Tables created correctly
 * 2. Indexes work as expected
 * 3. Foreign key constraints enforced
 * 4. Unique constraints on key field
 */

// Test data - unique keys for each test suite
const fkTestKey: ApiKey = {
  key: 'schema-fk-test-key',
  name: 'Schema FK Test Key',
  model: 'claude-3-5-sonnet-20241022',
  token_limit_per_5h: 50000,
  expiry_date: '2027-12-31T23:59:59Z',
  created_at: new Date().toISOString(),
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 0,
  usage_windows: [],
};

const uniqueTestKey1: ApiKey = {
  key: 'schema-unique-test-key-1',
  name: 'Schema Unique Test Key 1',
  model: 'claude-3-5-sonnet-20241022',
  token_limit_per_5h: 50000,
  expiry_date: '2027-12-31T23:59:59Z',
  created_at: new Date().toISOString(),
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 0,
  usage_windows: [],
};

const uniqueTestKey2: ApiKey = {
  key: 'schema-unique-test-key-2',
  name: 'Schema Unique Test Key 2',
  model: 'claude-3-opus-20240229',
  token_limit_per_5h: 60000,
  expiry_date: '2027-12-31T23:59:59Z',
  created_at: new Date().toISOString(),
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 0,
  usage_windows: [],
};

describe('Database Schema - Table Creation', () => {
  beforeAll(async () => {
    // Ensure database is initialized
    await getDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  test('api_keys table should exist', async () => {
    const { client, type } = await getDb();

    if (type === 'sqlite') {
      // SQLite: Check if table exists
      const result = (client as any)
        .query(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'`
        )
        .all();

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('api_keys');
    } else {
      // PostgreSQL: Check if table exists
      const result = await (client as any)`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'api_keys'
      `;

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].table_name).toBe('api_keys');
    }
  });

  test('usage_windows table should exist', async () => {
    const { client, type } = await getDb();

    if (type === 'sqlite') {
      // SQLite: Check if table exists
      const result = (client as any)
        .query(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='usage_windows'`
        )
        .all();

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('usage_windows');
    } else {
      // PostgreSQL: Check if table exists
      const result = await (client as any)`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'usage_windows'
      `;

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].table_name).toBe('usage_windows');
    }
  });

  test('api_keys table should have correct columns', async () => {
    const { client, type } = await getDb();

    if (type === 'sqlite') {
      // SQLite: Get table info
      const result = (client as any)
        .query(`PRAGMA table_info(api_keys)`)
        .all();

      const columnNames = result.map((row: any) => row.name);

      // Verify all expected columns exist
      expect(columnNames).toContain('key');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('model');
      expect(columnNames).toContain('token_limit_per_5h');
      expect(columnNames).toContain('expiry_date');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('last_used');
      expect(columnNames).toContain('total_lifetime_tokens');
    } else {
      // PostgreSQL: Get column information
      const result = await (client as any)`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'api_keys'
      `;

      const columnNames = result.map((row: any) => row.column_name);

      // Verify all expected columns exist
      expect(columnNames).toContain('key');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('model');
      expect(columnNames).toContain('token_limit_per_5h');
      expect(columnNames).toContain('expiry_date');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('last_used');
      expect(columnNames).toContain('total_lifetime_tokens');
    }
  });

  test('usage_windows table should have correct columns', async () => {
    const { client, type } = await getDb();

    if (type === 'sqlite') {
      // SQLite: Get table info
      const result = (client as any)
        .query(`PRAGMA table_info(usage_windows)`)
        .all();

      const columnNames = result.map((row: any) => row.name);

      // Verify all expected columns exist
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('api_key');
      expect(columnNames).toContain('window_start');
      expect(columnNames).toContain('tokens_used');
    } else {
      // PostgreSQL: Get column information
      const result = await (client as any)`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'usage_windows'
      `;

      const columnNames = result.map((row: any) => row.column_name);

      // Verify all expected columns exist
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('api_key');
      expect(columnNames).toContain('window_start');
      expect(columnNames).toContain('tokens_used');
    }
  });

  test('api_keys.key should be primary key', async () => {
    const { client, type } = await getDb();

    if (type === 'sqlite') {
      // SQLite: Check primary key
      const result = (client as any)
        .query(`PRAGMA table_info(api_keys)`)
        .all();

      const keyColumn = result.find((row: any) => row.name === 'key');
      expect(keyColumn).toBeDefined();
      expect(keyColumn.pk).toBe(1); // pk = 1 means primary key
    } else {
      // PostgreSQL: Check primary key constraint
      const result = await (client as any)`
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'api_keys'::regclass AND i.indisprimary
      `;

      const primaryKeyColumns = result.map((row: any) => row.attname);
      expect(primaryKeyColumns).toContain('key');
    }
  });
});

describe('Database Schema - Indexes', () => {
  beforeAll(async () => {
    await getDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  test('api_keys should have index on last_used', async () => {
    const { client, type } = await getDb();

    if (type === 'sqlite') {
      // SQLite: Check index exists
      const result = (client as any)
        .query(
          `SELECT name FROM sqlite_master WHERE type='index' AND name='api_keys_last_used_idx'`
        )
        .all();

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('api_keys_last_used_idx');
    } else {
      // PostgreSQL: Check index exists
      const result = await (client as any)`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'api_keys_last_used_idx'
      `;

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].indexname).toBe('api_keys_last_used_idx');
    }
  });

  test('api_keys should have index on expiry_date', async () => {
    const { client, type } = await getDb();

    if (type === 'sqlite') {
      // SQLite: Check index exists
      const result = (client as any)
        .query(
          `SELECT name FROM sqlite_master WHERE type='index' AND name='api_keys_expiry_date_idx'`
        )
        .all();

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('api_keys_expiry_date_idx');
    } else {
      // PostgreSQL: Check index exists
      const result = await (client as any)`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'api_keys_expiry_date_idx'
      `;

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].indexname).toBe('api_keys_expiry_date_idx');
    }
  });

  test('usage_windows should have index on api_key', async () => {
    const { client, type } = await getDb();

    if (type === 'sqlite') {
      // SQLite: Check index exists
      const result = (client as any)
        .query(
          `SELECT name FROM sqlite_master WHERE type='index' AND name='usage_windows_api_key_idx'`
        )
        .all();

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('usage_windows_api_key_idx');
    } else {
      // PostgreSQL: Check index exists
      const result = await (client as any)`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'usage_windows_api_key_idx'
      `;

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].indexname).toBe('usage_windows_api_key_idx');
    }
  });

  test('usage_windows should have index on window_start', async () => {
    const { client, type } = await getDb();

    if (type === 'sqlite') {
      // SQLite: Check index exists
      const result = (client as any)
        .query(
          `SELECT name FROM sqlite_master WHERE type='index' AND name='usage_windows_window_start_idx'`
        )
        .all();

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('usage_windows_window_start_idx');
    } else {
      // PostgreSQL: Check index exists
      const result = await (client as any)`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'usage_windows_window_start_idx'
      `;

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].indexname).toBe('usage_windows_window_start_idx');
    }
  });

  test('usage_windows should have composite index on (api_key, window_start)', async () => {
    const { client, type } = await getDb();

    if (type === 'sqlite') {
      // SQLite: Check index exists
      const result = (client as any)
        .query(
          `SELECT name FROM sqlite_master WHERE type='index' AND name='usage_windows_api_key_window_start_idx'`
        )
        .all();

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].name).toBe('usage_windows_api_key_window_start_idx');
    } else {
      // PostgreSQL: Check index exists
      const result = await (client as any)`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'usage_windows_api_key_window_start_idx'
      `;

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].indexname).toBe('usage_windows_api_key_window_start_idx');
    }
  });
});

describe('Database Schema - Foreign Key Constraints', () => {
  beforeAll(async () => {
    await getDb();
    // Create test key
    await createApiKey(fkTestKey);
  });

  afterAll(async () => {
    // Cleanup
    try {
      await deleteApiKey(fkTestKey.key);
    } catch {
      // Ignore if not exists
    }
    await closeDb();
  });

  test('usage_windows.api_key should reference api_keys.key', async () => {
    const { client, type } = await getDb();

    if (type === 'sqlite') {
      // SQLite: Check foreign key
      const result = (client as any)
        .query(`PRAGMA foreign_key_list(usage_windows)`)
        .all();

      expect(result.length).toBeGreaterThan(0);
      const fk = result[0];
      expect(fk.table).toBe('api_keys');
      expect(fk.from).toBe('api_key');
      expect(fk.to).toBe('key');
    } else {
      // PostgreSQL: Check foreign key constraint
      const result = await (client as any)`
        SELECT
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'usage_windows'
      `;

      expect(result.length).toBeGreaterThan(0);
      const fk = result[0];
      expect(fk.column_name).toBe('api_key');
      expect(fk.foreign_table_name).toBe('api_keys');
      expect(fk.foreign_column_name).toBe('key');
    }
  });

  test('foreign key should cascade delete on api_key deletion', async () => {
    // Add usage windows using the updateApiKeyUsage function
    await updateApiKeyUsage(fkTestKey.key, 1000, 'claude-3-5-sonnet-20241022');
    await updateApiKeyUsage(fkTestKey.key, 2000, 'claude-3-5-sonnet-20241022');

    // Verify usage window exists
    const keyBeforeDelete = await findApiKey(fkTestKey.key);
    expect(keyBeforeDelete?.usage_windows.length).toBeGreaterThan(0);

    // Delete the API key (should cascade delete usage windows)
    const deleted = await deleteApiKey(fkTestKey.key);
    expect(deleted).toBe(true);

    // Verify the key is deleted
    const keyAfterDelete = await findApiKey(fkTestKey.key);
    expect(keyAfterDelete).toBeNull();

    // Verify usage windows are also deleted (cascade)
    const { client, type } = await getDb();
    if (type === 'sqlite') {
      const result = (client as any)
        .query(`SELECT COUNT(*) as count FROM usage_windows WHERE api_key = ?`)
        .all(fkTestKey.key);

      expect(result[0].count).toBe(0);
    } else {
      const result = await (client as any)`
        SELECT COUNT(*) as count FROM usage_windows WHERE api_key = ${fkTestKey.key}
      `;

      expect(result[0].count).toBe('0');
    }
  });
});

describe('Database Schema - Unique Constraints', () => {
  beforeAll(async () => {
    await getDb();
  });

  afterAll(async () => {
    // Cleanup
    try {
      await deleteApiKey(uniqueTestKey1.key);
    } catch {
      // Ignore if not exists
    }
    try {
      await deleteApiKey(uniqueTestKey2.key);
    } catch {
      // Ignore if not exists
    }
    await closeDb();
  });

  test('api_keys.key should have unique constraint (primary key)', async () => {
    // Create first key
    await createApiKey(uniqueTestKey1);

    // Try to create duplicate key (should fail)
    let errorThrown = false;
    try {
      await createApiKey(uniqueTestKey1);
    } catch (error) {
      errorThrown = true;
      expect(error).toBeDefined();
      expect((error as Error).message).toMatch(/already exists|UNIQUE|duplicate/);
    }

    expect(errorThrown).toBe(true);
  });

  test('primary key should prevent duplicate key values', async () => {
    // Create second key with different key
    await createApiKey(uniqueTestKey2);

    // Verify both keys exist with different keys
    const key1 = await findApiKey(uniqueTestKey1.key);
    const key2 = await findApiKey(uniqueTestKey2.key);

    expect(key1).toBeDefined();
    expect(key2).toBeDefined();
    expect(key1?.key).not.toBe(key2?.key);
  });
});

describe('Database Schema - Data Types and Constraints', () => {
  beforeAll(async () => {
    await getDb();
  });

  afterAll(async () => {
    await closeDb();
  });

  test('api_keys should enforce NOT NULL constraints', async () => {
    const { client, type } = await getDb();

    if (type === 'sqlite') {
      // SQLite: Check NOT NULL constraints
      const result = (client as any)
        .query(`PRAGMA table_info(api_keys)`)
        .all();

      // Check that required columns have notnull = 1
      const nameColumn = result.find((row: any) => row.name === 'name');
      expect(nameColumn.notnull).toBe(1);

      const tokenLimitColumn = result.find((row: any) => row.name === 'token_limit_per_5h');
      expect(tokenLimitColumn.notnull).toBe(1);
    } else {
      // PostgreSQL: Check NOT NULL constraints
      const result = await (client as any)`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'api_keys'
      `;

      const nameColumn = result.find((row: any) => row.column_name === 'name');
      expect(nameColumn.is_nullable).toBe('NO');

      const tokenLimitColumn = result.find((row: any) => row.column_name === 'token_limit_per_5h');
      expect(tokenLimitColumn.is_nullable).toBe('NO');
    }
  });

  test('api_keys.total_lifetime_tokens should have default value 0', async () => {
    const { client, type } = await getDb();

    if (type === 'sqlite') {
      // SQLite: Check default value
      const result = (client as any)
        .query(`PRAGMA table_info(api_keys)`)
        .all();

      const column = result.find((row: any) => row.name === 'total_lifetime_tokens');
      expect(column).toBeDefined();
      expect(column.dflt_value).toBe('0');
    } else {
      // PostgreSQL: Check default value
      const result = await (client as any)`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'api_keys'
          AND column_name = 'total_lifetime_tokens'
      `;

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].column_default).toBe('0');
    }
  });

  test('usage_windows.tokens_used should have default value 0', async () => {
    const { client, type } = await getDb();

    if (type === 'sqlite') {
      // SQLite: Check default value
      const result = (client as any)
        .query(`PRAGMA table_info(usage_windows)`)
        .all();

      const column = result.find((row: any) => row.name === 'tokens_used');
      expect(column).toBeDefined();
      expect(column.dflt_value).toBe('0');
    } else {
      // PostgreSQL: Check default value
      const result = await (client as any)`
        SELECT column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'usage_windows'
          AND column_name = 'tokens_used'
      `;

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].column_default).toBe('0');
    }
  });
});
