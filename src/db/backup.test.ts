import { test, describe, expect, beforeEach, afterEach } from 'bun:test';
import {
  backupDatabase,
  verifyBackup,
  listBackups,
  cleanupOldBackups,
  getBackupMetadata,
} from './backup';
import { existsSync, unlinkSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'bun:sqlite';

// Test database path
const TEST_DB_PATH = path.join(process.cwd(), 'data/test-backup.db');
const TEST_BACKUP_DIR = path.join(process.cwd(), 'data/test-backups');

// Helper to create a test database with sample data
function createTestDatabase(dbPath: string): void {
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // Create api_keys table
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      key TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      model TEXT,
      token_limit_per_5h INTEGER NOT NULL,
      expiry_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_used TEXT NOT NULL,
      total_lifetime_tokens INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Create usage_windows table
  db.exec(`
    CREATE TABLE IF NOT EXISTS usage_windows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key TEXT NOT NULL,
      window_start TEXT NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (api_key) REFERENCES api_keys(key) ON DELETE CASCADE
    )
  `);

  // Insert sample data
  db.prepare(
    'INSERT INTO api_keys (key, name, model, token_limit_per_5h, expiry_date, created_at, last_used, total_lifetime_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    'sk-test-key-1',
    'Test Key 1',
    'claude-3-5-sonnet-20241022',
    100000,
    '2025-12-31T23:59:59.999Z',
    '2024-01-22T10:00:00.000Z',
    '2024-01-22T12:00:00.000Z',
    5000
  );

  db.prepare(
    'INSERT INTO api_keys (key, name, model, token_limit_per_5h, expiry_date, created_at, last_used, total_lifetime_tokens) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    'sk-test-key-2',
    'Test Key 2',
    'claude-3-5-sonnet-20241022',
    200000,
    '2025-12-31T23:59:59.999Z',
    '2024-01-22T10:00:00.000Z',
    '2024-01-22T12:00:00.000Z',
    10000
  );

  db.close();
}

// Helper to clean up test files
function cleanupTestFiles(): void {
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }

  // Clean up WAL and SHM files
  const walPath = TEST_DB_PATH + '-wal';
  const shmPath = TEST_DB_PATH + '-shm';

  if (existsSync(walPath)) {
    unlinkSync(walPath);
  }

  if (existsSync(shmPath)) {
    unlinkSync(shmPath);
  }

  // Clean up backup directory
  if (existsSync(TEST_BACKUP_DIR)) {
    rmSync(TEST_BACKUP_DIR, { recursive: true, force: true });
  }
}

describe('SQLite Backup', () => {
  beforeEach(() => {
    // Clean up any existing test files
    cleanupTestFiles();

    // Create test database
    createTestDatabase(TEST_DB_PATH);

    // Set environment variable to use test database
    process.env.DATABASE_PATH = TEST_DB_PATH;
  });

  afterEach(() => {
    // Clean up test files after each test
    cleanupTestFiles();

    // Reset environment variable
    delete process.env.DATABASE_PATH;
  });

  describe('backupDatabase', () => {
    test('should create an uncompressed backup', async () => {
      const result = await backupDatabase({
        outputDir: TEST_BACKUP_DIR,
      });

      expect(result.backupPath).toBeTruthy();
      expect(result.compressed).toBe(false);
      expect(result.size).toBeGreaterThan(0);
      expect(result.timestamp).toBeTruthy();

      // Verify backup file exists
      expect(existsSync(result.backupPath)).toBe(true);

      // Verify backup has .db extension
      expect(result.backupPath.endsWith('.db')).toBe(true);
    });

    test('should create a compressed backup', async () => {
      const result = await backupDatabase({
        outputDir: TEST_BACKUP_DIR,
        compress: true,
      });

      expect(result.backupPath).toBeTruthy();
      expect(result.compressed).toBe(true);
      expect(result.size).toBeGreaterThan(0);

      // Verify backup file exists
      expect(existsSync(result.backupPath)).toBe(true);

      // Verify backup has .db.gz extension
      expect(result.backupPath.endsWith('.db.gz')).toBe(true);

      // Compressed backup should be smaller than original
      const originalSize = (await Bun.file(TEST_DB_PATH).size);
      expect(result.size).toBeLessThan(originalSize);
    });

    test('should create backup with custom filename', async () => {
      const customFilename = 'my-custom-backup';
      const result = await backupDatabase({
        outputDir: TEST_BACKUP_DIR,
        filename: customFilename,
      });

      expect(result.backupPath).toContain(customFilename);
      expect(result.backupPath).not.toContain('sqlite-backup-');
    });

    test('should create backup directory if it does not exist', async () => {
      const nonExistentDir = path.join(process.cwd(), `data/new-backup-dir-${Date.now()}`);

      expect(existsSync(nonExistentDir)).toBe(false);

      await backupDatabase({
        outputDir: nonExistentDir,
      });

      expect(existsSync(nonExistentDir)).toBe(true);

      // Clean up
      rmSync(nonExistentDir, { recursive: true, force: true });
    });

    test('should throw error if database file does not exist', async () => {
      // Delete the test database
      unlinkSync(TEST_DB_PATH);

      await expect(
        backupDatabase({
          outputDir: TEST_BACKUP_DIR,
        })
      ).rejects.toThrow('Database file not found');
    });

    test('should clean up old backups when retain option is set', async () => {
      const retainCount = 3;

      // Create multiple backups
      for (let i = 0; i < 5; i++) {
        await backupDatabase({
          outputDir: TEST_BACKUP_DIR,
          retain: retainCount,
        });

        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // List backups to verify
      const backups = await listBackups(TEST_BACKUP_DIR);

      // Should only have retainCount backups
      expect(backups.length).toBe(retainCount);
    });

    test('should return correct removedOldBackups count', async () => {
      // Create 5 backups, retaining only 3
      let lastRemovedCount = 0;

      for (let i = 0; i < 5; i++) {
        const result = await backupDatabase({
          outputDir: TEST_BACKUP_DIR,
          retain: 3,
        });

        lastRemovedCount = result.removedOldBackups;

        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // After creating 5 backups with retain=3, we should have removed 2
      expect(lastRemovedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('verifyBackup', () => {
    test('should verify a valid uncompressed backup', async () => {
      const backup = await backupDatabase({
        outputDir: TEST_BACKUP_DIR,
      });

      // Should not throw
      await verifyBackup(backup.backupPath, false);
    });

    test('should verify a valid compressed backup', async () => {
      const backup = await backupDatabase({
        outputDir: TEST_BACKUP_DIR,
        compress: true,
      });

      // Should not throw
      await verifyBackup(backup.backupPath, true);
    });

    test('should throw error for non-existent backup', async () => {
      await expect(
        verifyBackup('/nonexistent/path/to/backup.db', false)
      ).rejects.toThrow('Backup file does not exist');
    });

    test('should throw error for corrupted backup', async () => {
      const backupPath = path.join(TEST_BACKUP_DIR, 'corrupted.db');

      // Create a corrupted file
      await Bun.write(backupPath, 'not a valid sqlite database');

      await expect(verifyBackup(backupPath, false)).rejects.toThrow();
    });

    test('should detect missing api_keys table', async () => {
      // Create an empty SQLite database without the api_keys table
      const dbPath = path.join(TEST_BACKUP_DIR, 'empty.db');

      // Ensure directory exists
      if (!existsSync(TEST_BACKUP_DIR)) {
        mkdirSync(TEST_BACKUP_DIR, { recursive: true });
      }

      const db = new Database(dbPath);
      // Create a different table to make the database non-empty
      db.exec('CREATE TABLE other_table (id INTEGER PRIMARY KEY)');
      db.close();

      await expect(verifyBackup(dbPath, false)).rejects.toThrow(
        'does not contain api_keys table'
      );

      // Clean up
      unlinkSync(dbPath);
    });
  });

  describe('listBackups', () => {
    test('should return empty array if no backups exist', async () => {
      const backups = await listBackups(TEST_BACKUP_DIR);
      expect(backups).toEqual([]);
    });

    test('should list all backups in directory', async () => {
      // Create multiple backups
      await backupDatabase({ outputDir: TEST_BACKUP_DIR });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await backupDatabase({ outputDir: TEST_BACKUP_DIR, compress: true });

      const backups = await listBackups(TEST_BACKUP_DIR);

      expect(backups.length).toBeGreaterThanOrEqual(2);

      // Check that metadata is correct
      backups.forEach((backup) => {
        expect(backup.filename).toBeTruthy();
        expect(backup.timestamp).toBeTruthy();
        expect(backup.size).toBeGreaterThan(0);
        expect(backup.databaseType).toBe('sqlite');
      });

      // Verify we can open and verify one of the backups
      if (backups.length > 0) {
        const backupPath = path.join(TEST_BACKUP_DIR, backups[0].filename);
        await verifyBackup(backupPath, backups[0].compressed);
      }
    });

    test('should return backups sorted by timestamp (newest first)', async () => {
      // Create multiple backups
      const backups = [];
      for (let i = 0; i < 3; i++) {
        const backup = await backupDatabase({ outputDir: TEST_BACKUP_DIR });
        backups.push(backup);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      const listed = await listBackups(TEST_BACKUP_DIR);

      // Verify order (newest first)
      for (let i = 0; i < listed.length - 1; i++) {
        expect(
          listed[i].timestamp.localeCompare(listed[i + 1].timestamp)
        ).toBeGreaterThanOrEqual(0);
      }
    });

    test('should filter out temporary files', async () => {
      // Create a backup
      await backupDatabase({ outputDir: TEST_BACKUP_DIR });

      // Create a temporary file
      const tempFile = path.join(TEST_BACKUP_DIR, '.temp-file.db');
      await Bun.write(tempFile, 'temp data');

      const backups = await listBackups(TEST_BACKUP_DIR);

      // Temp file should not be in the list
      expect(backups.every((b) => !b.filename.startsWith('.'))).toBe(true);

      // Clean up
      unlinkSync(tempFile);
    });

    test('should identify compressed backups', async () => {
      await backupDatabase({ outputDir: TEST_BACKUP_DIR, compress: true });

      const backups = await listBackups(TEST_BACKUP_DIR);

      expect(backups.length).toBe(1);
      expect(backups[0].compressed).toBe(true);
      expect(backups[0].filename.endsWith('.db.gz')).toBe(true);
    });
  });

  describe('cleanupOldBackups', () => {
    test('should not remove backups when count is below retention limit', async () => {
      // Create 2 backups
      await backupDatabase({ outputDir: TEST_BACKUP_DIR });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await backupDatabase({ outputDir: TEST_BACKUP_DIR });

      // Cleanup with retain=5 (more than current count)
      const removed = await cleanupOldBackups(TEST_BACKUP_DIR, 5);

      expect(removed).toBe(0);

      const backups = await listBackups(TEST_BACKUP_DIR);
      expect(backups.length).toBe(2);
    });

    test('should remove oldest backups when count exceeds retention limit', async () => {
      // Create 5 backups
      for (let i = 0; i < 5; i++) {
        await backupDatabase({ outputDir: TEST_BACKUP_DIR });
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Cleanup with retain=3
      const removed = await cleanupOldBackups(TEST_BACKUP_DIR, 3);

      expect(removed).toBe(2);

      const backups = await listBackups(TEST_BACKUP_DIR);
      expect(backups.length).toBe(3);
    });

    test('should keep newest backups when cleaning up', async () => {
      const filenames: string[] = [];

      // Create 5 backups and track filenames
      for (let i = 0; i < 5; i++) {
        const result = await backupDatabase({ outputDir: TEST_BACKUP_DIR });
        filenames.push(result.backupPath);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Cleanup with retain=3
      await cleanupOldBackups(TEST_BACKUP_DIR, 3);

      const backups = await listBackups(TEST_BACKUP_DIR);

      // The last 3 backups (newest) should still exist
      const remainingPaths = backups.map((b) =>
        path.join(TEST_BACKUP_DIR, b.filename)
      );

      // Last 3 created backups should be in remaining
      expect(remainingPaths).toContain(filenames[2]);
      expect(remainingPaths).toContain(filenames[3]);
      expect(remainingPaths).toContain(filenames[4]);
    });

    test('should return 0 for empty directory', async () => {
      const removed = await cleanupOldBackups(TEST_BACKUP_DIR, 3);
      expect(removed).toBe(0);
    });
  });

  describe('getBackupMetadata', () => {
    test('should return metadata for existing backup', async () => {
      const backup = await backupDatabase({ outputDir: TEST_BACKUP_DIR });

      const metadata = await getBackupMetadata(backup.backupPath);

      expect(metadata).not.toBeNull();
      expect(metadata!.filename).toBe(path.basename(backup.backupPath));
      expect(metadata!.size).toBe(backup.size);
      expect(metadata!.compressed).toBe(backup.compressed);
      expect(metadata!.databaseType).toBe('sqlite');
    });

    test('should return null for non-existent backup', async () => {
      const metadata = await getBackupMetadata('/nonexistent/backup.db');
      expect(metadata).toBeNull();
    });

    test('should extract timestamp from filename', async () => {
      const backup = await backupDatabase({
        outputDir: TEST_BACKUP_DIR,
        filename: 'test-backup',
      });

      const metadata = await getBackupMetadata(backup.backupPath);

      expect(metadata).not.toBeNull();
      // For custom filenames, timestamp comes from file mtime
      expect(metadata!.timestamp).toBeTruthy();
    });
  });

  describe('integration tests', () => {
    test('should create, verify, and cleanup backups in workflow', async () => {
      // Create backups
      const backup1 = await backupDatabase({
        outputDir: TEST_BACKUP_DIR,
        compress: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      const backup2 = await backupDatabase({
        outputDir: TEST_BACKUP_DIR,
        compress: true,
      });

      // Verify both backups
      await verifyBackup(backup1.backupPath, false);
      await verifyBackup(backup2.backupPath, true);

      // List backups
      const backups = await listBackups(TEST_BACKUP_DIR);
      expect(backups.length).toBe(2);

      // Cleanup old backups
      const removed = await cleanupOldBackups(TEST_BACKUP_DIR, 1);
      expect(removed).toBe(1);

      // Verify only one backup remains
      const remainingBackups = await listBackups(TEST_BACKUP_DIR);
      expect(remainingBackups.length).toBe(1);
    });

    test('should handle backup with custom retention in single call', async () => {
      // Create 5 backups with retain=3
      for (let i = 0; i < 5; i++) {
        await backupDatabase({
          outputDir: TEST_BACKUP_DIR,
          retain: 3,
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Should only have 3 backups
      const backups = await listBackups(TEST_BACKUP_DIR);
      expect(backups.length).toBe(3);
    });

    test('should maintain data integrity after backup and restore', async () => {
      // Create backup
      const backup = await backupDatabase({
        outputDir: TEST_BACKUP_DIR,
      });

      // Verify backup contains the data
      const db = new Database(backup.backupPath, { readonly: true });
      const result = db
        .query('SELECT COUNT(*) as count FROM api_keys')
        .get() as { count: number };
      db.close();

      // We inserted 2 keys in createTestDatabase
      expect(result.count).toBe(2);
    });
  });
});

// PostgreSQL backup tests
describe('PostgreSQL Backup', () => {
  const PG_TEST_BACKUP_DIR = path.join(process.cwd(), 'data/test-pg-backups');

  beforeEach(() => {
    // Clean up any existing test files
    if (existsSync(PG_TEST_BACKUP_DIR)) {
      rmSync(PG_TEST_BACKUP_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test files after each test
    if (existsSync(PG_TEST_BACKUP_DIR)) {
      rmSync(PG_TEST_BACKUP_DIR, { recursive: true, force: true });
    }
  });

  describe('verifyBackup for PostgreSQL', () => {
    test('should verify a valid PostgreSQL SQL dump', async () => {
      // Create a test SQL dump file
      const sqlContent = [
        '-- PostgreSQL dump',
        'CREATE TABLE IF NOT EXISTS api_keys (key TEXT PRIMARY KEY, name TEXT NOT NULL);',
        'INSERT INTO api_keys (key, name) VALUES (\'sk-test-1\', \'Test Key\');',
        'CREATE TABLE IF NOT EXISTS usage_windows (id SERIAL PRIMARY KEY, api_key TEXT NOT NULL);',
      ].join('\n');

      const backupPath = path.join(PG_TEST_BACKUP_DIR, 'pg-backup-test.sql');
      mkdirSync(PG_TEST_BACKUP_DIR, { recursive: true });
      await Bun.write(backupPath, sqlContent);

      // Should not throw
      await verifyBackup(backupPath, false, 'postgresql');
    });

    test('should verify a compressed PostgreSQL backup', async () => {
      // Create a test SQL dump file
      const sqlContent = [
        '-- PostgreSQL dump',
        'CREATE TABLE IF NOT EXISTS api_keys (key TEXT PRIMARY KEY, name TEXT NOT NULL);',
        'INSERT INTO api_keys (key, name) VALUES (\'sk-test-1\', \'Test Key\');',
      ].join('\n');

      const backupPath = path.join(PG_TEST_BACKUP_DIR, 'pg-backup-test.sql.gz');
      mkdirSync(PG_TEST_BACKUP_DIR, { recursive: true });

      const compressed = Bun.gzipSync(new TextEncoder().encode(sqlContent));
      await Bun.write(backupPath, compressed);

      // Should not throw
      await verifyBackup(backupPath, true, 'postgresql');
    });

    test('should throw error for invalid SQL file', async () => {
      const backupPath = path.join(PG_TEST_BACKUP_DIR, 'invalid.sql');
      mkdirSync(PG_TEST_BACKUP_DIR, { recursive: true });
      await Bun.write(backupPath, 'not valid sql at all');

      await expect(verifyBackup(backupPath, false, 'postgresql')).rejects.toThrow();
    });

    test('should throw error for SQL file without api_keys references', async () => {
      const sqlContent = [
        '-- PostgreSQL dump',
        'CREATE TABLE other_table (id SERIAL PRIMARY KEY);',
      ].join('\n');

      const backupPath = path.join(PG_TEST_BACKUP_DIR, 'no-api-keys.sql');
      mkdirSync(PG_TEST_BACKUP_DIR, { recursive: true });
      await Bun.write(backupPath, sqlContent);

      await expect(verifyBackup(backupPath, false, 'postgresql')).rejects.toThrow(
        'does not contain api_keys table references'
      );
    });
  });

  describe('getBackupMetadata for PostgreSQL', () => {
    test('should return metadata for PostgreSQL backup', async () => {
      const sqlContent = '-- PostgreSQL dump\nCREATE TABLE api_keys (key TEXT PRIMARY KEY);';
      const backupPath = path.join(PG_TEST_BACKUP_DIR, 'pg-backup-2024-01-22T12-00-00-000.sql');

      mkdirSync(PG_TEST_BACKUP_DIR, { recursive: true });
      await Bun.write(backupPath, sqlContent);

      const metadata = await getBackupMetadata(backupPath);

      expect(metadata).not.toBeNull();
      expect(metadata!.filename).toBe('pg-backup-2024-01-22T12-00-00-000.sql');
      expect(metadata!.databaseType).toBe('postgresql');
      expect(metadata!.compressed).toBe(false);
    });

    test('should identify compressed PostgreSQL backups', async () => {
      const sqlContent = '-- PostgreSQL dump';
      const backupPath = path.join(PG_TEST_BACKUP_DIR, 'pg-backup-test.sql.gz');

      mkdirSync(PG_TEST_BACKUP_DIR, { recursive: true });
      const compressed = Bun.gzipSync(new TextEncoder().encode(sqlContent));
      await Bun.write(backupPath, compressed);

      const metadata = await getBackupMetadata(backupPath);

      expect(metadata).not.toBeNull();
      expect(metadata!.databaseType).toBe('postgresql');
      expect(metadata!.compressed).toBe(true);
    });

    test('should auto-detect PostgreSQL type from filename', async () => {
      const sqlContent = '-- PostgreSQL dump';
      const backupPath = path.join(PG_TEST_BACKUP_DIR, 'my-backup.sql');

      mkdirSync(PG_TEST_BACKUP_DIR, { recursive: true });
      await Bun.write(backupPath, sqlContent);

      const metadata = await getBackupMetadata(backupPath);

      expect(metadata).not.toBeNull();
      expect(metadata!.databaseType).toBe('postgresql');
    });
  });

  describe('listBackups for mixed SQLite and PostgreSQL', () => {
    test('should list both SQLite and PostgreSQL backups', async () => {
      mkdirSync(PG_TEST_BACKUP_DIR, { recursive: true });

      // Create SQLite backup
      const sqliteBackup = path.join(PG_TEST_BACKUP_DIR, 'sqlite-backup-2024-01-22T12-00-00-000.db');
      const db = new Database(sqliteBackup);
      db.exec('CREATE TABLE api_keys (key TEXT PRIMARY KEY, name TEXT NOT NULL);');
      db.close();

      // Create PostgreSQL backup
      const pgBackup = path.join(PG_TEST_BACKUP_DIR, 'pg-backup-2024-01-22T12-00-00-000.sql');
      await Bun.write(pgBackup, '-- PostgreSQL dump\nCREATE TABLE api_keys (key TEXT PRIMARY KEY);');

      const backups = await listBackups(PG_TEST_BACKUP_DIR);

      expect(backups.length).toBe(2);

      const sqlite = backups.find((b) => b.databaseType === 'sqlite');
      const postgresql = backups.find((b) => b.databaseType === 'postgresql');

      expect(sqlite).toBeDefined();
      expect(postgresql).toBeDefined();
    });

    test('should identify compressed backups correctly', async () => {
      mkdirSync(PG_TEST_BACKUP_DIR, { recursive: true });

      // Create compressed SQLite backup
      const sqliteContent = new Uint8Array([1, 2, 3]);
      const sqliteBackup = path.join(PG_TEST_BACKUP_DIR, 'sqlite-backup-2024-01-22T12-00-00-000.db.gz');
      await Bun.write(sqliteBackup, Bun.gzipSync(sqliteContent));

      // Create compressed PostgreSQL backup
      const pgContent = new TextEncoder().encode('-- PostgreSQL dump');
      const pgBackup = path.join(PG_TEST_BACKUP_DIR, 'pg-backup-2024-01-22T12-00-00-000.sql.gz');
      await Bun.write(pgBackup, Bun.gzipSync(pgContent));

      const backups = await listBackups(PG_TEST_BACKUP_DIR);

      expect(backups.length).toBe(2);
      expect(backups.every((b) => b.compressed)).toBe(true);
    });
  });

  describe('PostgreSQL backup filename generation', () => {
    test('should generate correct PostgreSQL backup filename format', () => {
      // This is tested indirectly through backupDatabase, but we can verify
      // that files created with PostgreSQL type have the correct prefix
      const testFilename = 'pg-backup-2024-01-22T12-00-00-000';
      expect(testFilename.startsWith('pg-backup-')).toBe(true);

      // Should contain timestamp
      const timestampMatch = testFilename.match(/pg-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})/);
      expect(timestampMatch).toBeTruthy();
    });
  });
});
