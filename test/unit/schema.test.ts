import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getDatabase, closeDatabase, resetDatabase, getDatabaseStats } from '../../src/models/database';
import { getConfig, resetConfig } from '../../src/config';

describe('Database Schema', () => {
  let testDbPath: string;

  beforeEach(() => {
    // Reset configuration
    resetConfig();

    // Set up test environment
    testDbPath = `./test-${Date.now()}.db`;
    process.env.ZAI_API_KEY = 'test-zai-key';
    process.env.ADMIN_API_KEY = 'test-admin-key';
    process.env.DATABASE_PATH = testDbPath;
    process.env.PORT = '3000';
    process.env.DEFAULT_MODEL = 'glm-4.7';
    process.env.ADMIN_API_ENABLED = 'true';
    process.env.DEFAULT_RATE_LIMIT = '60';
    process.env.CORS_ORIGINS = '*';

    // Close any existing database connection
    closeDatabase();
  });

  afterEach(() => {
    // Clean up test database
    closeDatabase();
    try {
      require('fs').unlinkSync(testDbPath);
      require('fs').unlinkSync(testDbPath + '-wal');
      require('fs').unlinkSync(testDbPath + '-shm');
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Database Initialization', () => {
    it('should create database file', () => {
      const db = getDatabase();
      expect(db).toBeDefined();

      const fs = require('fs');
      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    it('should create api_keys table', () => {
      const db = getDatabase();

      // Check if table exists
      const tables = db.query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'"
      ).all();

      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('api_keys');
    });

    it('should have correct table schema', () => {
      const db = getDatabase();

      // Get table schema
      const schema = db.query<{ sql: string }, []>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='api_keys'"
      ).get();

      expect(schema).toBeDefined();
      expect(schema?.sql).toContain('id INTEGER PRIMARY KEY AUTOINCREMENT');
      expect(schema?.sql).toContain('key_hash TEXT NOT NULL UNIQUE');
      expect(schema?.sql).toContain('name TEXT NOT NULL');
      expect(schema?.sql).toContain('description TEXT');
      expect(schema?.sql).toContain('scopes TEXT NOT NULL');
      expect(schema?.sql).toContain('rate_limit INTEGER NOT NULL');
      expect(schema?.sql).toContain('is_active INTEGER NOT NULL');
      expect(schema?.sql).toContain('created_at TEXT NOT NULL');
      expect(schema?.sql).toContain('updated_at TEXT NOT NULL');
    });
  });

  describe('Database Indexes', () => {
    it('should create all required indexes', () => {
      const db = getDatabase();

      const indexes = db.query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_api_keys_%'"
      ).all();

      const indexNames = indexes.map((idx) => idx.name);

      expect(indexNames).toContain('idx_api_keys_key_hash');
      expect(indexNames).toContain('idx_api_keys_is_active');
      expect(indexNames).toContain('idx_api_keys_name');
      expect(indexNames).toContain('idx_api_keys_active_name');
    });

    it('should have key_hash index for authentication', () => {
      const db = getDatabase();

      const index = db.query<{ sql: string }, []>(
        "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_api_keys_key_hash'"
      ).get();

      expect(index).toBeDefined();
      expect(index?.sql).toContain('key_hash');
    });
  });

  describe('Database Triggers', () => {
    it('should create update timestamp trigger', () => {
      const db = getDatabase();

      const triggers = db.query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name='update_api_keys_timestamp'"
      ).all();

      expect(triggers).toHaveLength(1);
      expect(triggers[0].name).toBe('update_api_keys_timestamp');
    });
  });

  describe('Database Operations', () => {
    it('should insert and retrieve API key record', () => {
      const db = getDatabase();

      // Insert a test record
      const insert = db.query(
        `INSERT INTO api_keys (key_hash, name, description, scopes, rate_limit, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`
      );

      const now = new Date().toISOString();
      insert.run('hash123', 'Test Key', 'Test Description', '["read","write"]', 60, 1);

      // Retrieve the record
      const select = db.query<{ key_hash: string; name: string }, [string]>(
        'SELECT key_hash, name FROM api_keys WHERE key_hash = ?'
      );

      const result = select.get('hash123');

      expect(result).toBeDefined();
      expect(result?.key_hash).toBe('hash123');
      expect(result?.name).toBe('Test Key');
    });

    it('should update updated_at timestamp on record update', () => {
      const db = getDatabase();

      // Insert a record
      const insert = db.query(
        `INSERT INTO api_keys (key_hash, name, scopes, rate_limit, is_active)
         VALUES (?, ?, ?, ?, ?)`
      );
      insert.run('hash456', 'Original Name', '[]', 60, 1);

      // Get the original created_at and updated_at
      const original = db.query<{ created_at: string; updated_at: string }, [string]>(
        'SELECT created_at, updated_at FROM api_keys WHERE key_hash = ?'
      ).get('hash456');

      expect(original?.updated_at).toBeDefined();

      // Wait to ensure timestamp difference (SQLite datetime('now') has second precision)
      const start = Date.now();
      while (Date.now() - start < 1100) {
        // Wait at least 1 second
      }

      // Update the record
      const update = db.query('UPDATE api_keys SET name = ? WHERE key_hash = ?');
      update.run('Updated Name', 'hash456');

      // Get the updated record
      const updated = db.query<{ created_at: string; updated_at: string }, [string]>(
        'SELECT created_at, updated_at FROM api_keys WHERE key_hash = ?'
      ).get('hash456');

      expect(updated?.created_at).toBe(original?.created_at);
      expect(updated?.updated_at).not.toBe(original?.updated_at);
    });

    it('should enforce unique constraint on key_hash', () => {
      const db = getDatabase();

      const insert = db.query(
        `INSERT INTO api_keys (key_hash, name, scopes, rate_limit, is_active)
         VALUES (?, ?, ?, ?, ?)`
      );

      // Insert first record
      insert.run('duplicate-hash', 'Key 1', '[]', 60, 1);

      // Try to insert duplicate key_hash
      expect(() => {
        insert.run('duplicate-hash', 'Key 2', '[]', 60, 1);
      }).toThrow();
    });
  });

  describe('Database Utilities', () => {
    it('should reset database', () => {
      const db = getDatabase();

      // Insert some data
      const insert = db.query(
        `INSERT INTO api_keys (key_hash, name, scopes, rate_limit, is_active)
         VALUES (?, ?, ?, ?, ?)`
      );
      insert.run('hash789', 'Test', '[]', 60, 1);

      // Verify data exists
      let count = db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM api_keys').get();
      expect(count?.count).toBe(1);

      // Reset database
      resetDatabase();

      // Verify data is gone
      count = db.query<{ count: number }, []>('SELECT COUNT(*) as count FROM api_keys').get();
      expect(count?.count).toBe(0);
    });

    it('should get database statistics', () => {
      getDatabase();

      const stats = getDatabaseStats();

      expect(stats).toBeDefined();
      expect(stats.apiKeyCount).toBe(0);
      expect(stats.databaseSize).toBeGreaterThanOrEqual(0);
    });

    it('should get correct statistics with data', () => {
      const db = getDatabase();

      const insert = db.query(
        `INSERT INTO api_keys (key_hash, name, scopes, rate_limit, is_active)
         VALUES (?, ?, ?, ?, ?)`
      );

      insert.run('hash1', 'Key 1', '[]', 60, 1);
      insert.run('hash2', 'Key 2', '[]', 60, 1);
      insert.run('hash3', 'Key 3', '[]', 60, 1);

      const stats = getDatabaseStats();

      expect(stats.apiKeyCount).toBe(3);
    });
  });

  describe('Database Connection Management', () => {
    it('should reuse existing database connection', () => {
      const db1 = getDatabase();
      const db2 = getDatabase();

      expect(db1).toBe(db2);
    });

    it('should close database connection', () => {
      const db = getDatabase();
      expect(db).toBeDefined();

      closeDatabase();

      // Should create new connection after close
      const db2 = getDatabase();
      expect(db2).toBeDefined();
      expect(db2).not.toBe(db);
    });
  });

  describe('Database Configuration', () => {
    it('should use correct database path from config', () => {
      const config = getConfig();
      expect(config.databasePath).toBe(testDbPath);

      const db = getDatabase();

      // Verify database exists at correct path
      const fs = require('fs');
      expect(fs.existsSync(testDbPath)).toBe(true);
    });
  });
});
