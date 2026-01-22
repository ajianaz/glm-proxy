import Database from 'bun:sqlite';
import { existsSync, mkdirSync, renameSync, unlinkSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseType, DatabaseConnection } from './connection.js';
import { getDb, getDatabaseType } from './connection.js';

/**
 * Backup options interface
 */
export interface BackupOptions {
  /**
   * Output directory for backup files
   * @default './data/backups'
   */
  outputDir?: string;

  /**
   * Compress backup using gzip
   * @default false
   */
  compress?: boolean;

  /**
   * Number of backups to retain (0 = keep all)
   * @default 10
   */
  retain?: number;

  /**
   * Custom backup filename (without extension)
   * If not provided, uses timestamp format: sqlite-backup-YYYY-MM-DDTHH-mm-ss
   */
  filename?: string;
}

/**
 * Backup result interface
 */
export interface BackupResult {
  /**
   * Full path to the backup file
   */
  backupPath: string;

  /**
   * Size of the backup file in bytes
   */
  size: number;

  /**
   * Whether the backup was compressed
   */
  compressed: boolean;

  /**
   * Timestamp when backup was created
   */
  timestamp: string;

  /**
   * Number of old backups removed (if retain option was set)
   */
  removedOldBackups: number;
}

/**
 * Backup metadata interface
 */
export interface BackupMetadata {
  filename: string;
  timestamp: string;
  size: number;
  compressed: boolean;
  databasePath: string;
  databaseType: DatabaseType;
}

/**
 * Get default database path for SQLite
 */
function getDatabasePath(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), 'data/sqlite.db');
}

/**
 * Create timestamped backup filename
 */
function getBackupFilename(customFilename?: string, dbType: DatabaseType = 'sqlite'): string {
  if (customFilename) {
    return customFilename;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const millis = String(now.getMilliseconds()).padStart(3, '0');

  const prefix = dbType === 'postgresql' ? 'pg-backup' : 'sqlite-backup';
  return `${prefix}-${year}-${month}-${day}T${hours}-${minutes}-${seconds}-${millis}`;
}

/**
 * Ensure backup directory exists
 */
function ensureBackupDir(outputDir: string): void {
  if (!existsSync(outputDir)) {
    try {
      mkdirSync(outputDir, { recursive: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to create backup directory: ${errorMessage}`);
    }
  }
}

/**
 * Check if pg_dump is available on the system
 */
async function checkPgDumpAvailable(): Promise<boolean> {
  try {
    const proc = Bun.spawn(['which', 'pg_dump'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Create PostgreSQL backup using pg_dump command
 *
 * @param connectionString - PostgreSQL connection string
 * @param outputPath - Path where backup should be saved
 * @returns Promise that resolves when backup is complete
 *
 * @throws Error if pg_dump fails
 */
async function backupWithPgDump(connectionString: string, outputPath: string): Promise<void> {
  // Parse connection string to extract components for pg_dump
  // DATABASE_URL format: postgresql://user:password@host:port/database
  const url = new URL(connectionString);

  const pgDumpArgs = [
    'pg_dump',
    '-h', url.hostname,
    '-p', url.port || '5432',
    '-U', url.username,
    '-d', url.pathname.substring(1), // Remove leading slash
    '--no-owner',
    '--no-acl',
    '--clean',
    '--if-exists',
  ];

  // Set password environment variable
  const env = {
    ...process.env,
    PGPASSWORD: url.password,
  };

  const proc = Bun.spawn(pgDumpArgs, {
    stdout: 'pipe',
    stderr: 'pipe',
    env,
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`pg_dump failed (exit code ${exitCode}): ${stderr}`);
  }

  // Write output to file
  await Bun.write(outputPath, stdout);
}

/**
 * Create PostgreSQL backup using Drizzle (fallback method)
 *
 * @param db - Database connection
 * @param outputPath - Path where backup should be saved
 * @returns Promise that resolves when backup is complete
 *
 * @throws Error if backup fails
 */
async function backupWithDrizzle(db: DatabaseConnection, outputPath: string): Promise<void> {
  if (db.type !== 'postgresql') {
    throw new Error('Drizzle backup only supports PostgreSQL databases');
  }

  const sqlStatements: string[] = [];

  // Add header
  sqlStatements.push('-- PostgreSQL Backup generated by Drizzle ORM');
  sqlStatements.push(`-- Generated at: ${new Date().toISOString()}`);
  sqlStatements.push('--');
  sqlStatements.push('');

  // Use raw SQL queries to avoid Drizzle ORM type issues
  // We know this is a postgres.Sql instance when dbType is 'postgresql'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = db.client as any;

  // Get all data from api_keys table
  const apiKeysResult = await client`SELECT key, name, model, token_limit_per_5h, expiry_date, created_at, last_used, total_lifetime_tokens FROM api_keys`;

  // Get all data from usage_windows table
  const usageWindowsResult = await client`SELECT id, api_key, window_start, tokens_used FROM usage_windows`;

  // Generate INSERT statements for api_keys
  sqlStatements.push('-- Data for api_keys table');
  for (const row of apiKeysResult) {
    const escapedKey = escapeSqlLiteral(row.key);
    const escapedName = escapeSqlLiteral(row.name);
    const escapedModel = escapeSqlLiteral(row.model || '');
    const escapedExpiryDate = escapeSqlLiteral(row.expiry_date);
    const escapedCreatedAt = escapeSqlLiteral(row.created_at);
    const escapedLastUsed = escapeSqlLiteral(row.last_used);

    sqlStatements.push(
      `INSERT INTO api_keys (key, name, model, token_limit_per_5h, expiry_date, created_at, last_used, total_lifetime_tokens) VALUES (${escapedKey}, ${escapedName}, ${escapedModel}, ${row.token_limit_per_5h}, ${escapedExpiryDate}, ${escapedCreatedAt}, ${escapedLastUsed}, ${row.total_lifetime_tokens}) ON CONFLICT (key) DO NOTHING;`
    );
  }
  sqlStatements.push('');

  // Generate INSERT statements for usage_windows
  sqlStatements.push('-- Data for usage_windows table');
  for (const row of usageWindowsResult) {
    const escapedApiKey = escapeSqlLiteral(row.api_key);
    const escapedWindowStart = escapeSqlLiteral(row.window_start);

    sqlStatements.push(
      `INSERT INTO usage_windows (id, api_key, window_start, tokens_used) VALUES (${row.id}, ${escapedApiKey}, ${escapedWindowStart}, ${row.tokens_used}) ON CONFLICT (id) DO NOTHING;`
    );
  }

  // Write all statements to file
  const content = sqlStatements.join('\n');
  await Bun.write(outputPath, content);
}

/**
 * Escape SQL literal string
 */
function escapeSqlLiteral(str: string): string {
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Create backup of SQLite database using file copy
 *
 * This method is safe for databases in WAL mode (which is the default).
 * The file copy is performed atomically using a temporary file.
 *
 * @param options - Backup options
 * @returns Backup result with file path and metadata
 *
 * @throws Error if database file doesn't exist, copy fails, or verification fails
 *
 * @example
 * ```ts
 * import { backupDatabase } from './db/backup.js';
 *
 * // Simple backup
 * const result = await backupDatabase();
 * console.log(`Backup created: ${result.backupPath}`);
 *
 * // Compressed backup with custom retention
 * const compressed = await backupDatabase({
 *   compress: true,
 *   retain: 5
 * });
 * ```
 */
export async function backupDatabase(options: BackupOptions = {}): Promise<BackupResult> {
  const {
    outputDir = './data/backups',
    compress = false,
    retain = 10,
    filename,
  } = options;

  // Detect database type
  const dbType = getDatabaseType();

  // Ensure backup directory exists
  ensureBackupDir(outputDir);

  // Generate backup filename
  const backupFilename = getBackupFilename(filename, dbType);
  const extension = dbType === 'postgresql' ? (compress ? '.sql.gz' : '.sql') : (compress ? '.db.gz' : '.db');
  const backupPath = path.join(outputDir, `${backupFilename}${extension}`);

  // Check if backup already exists
  if (existsSync(backupPath)) {
    throw new Error(`Backup file already exists: ${backupPath}`);
  }

  try {
    // Create temporary backup file
    const tempPath = path.join(outputDir, `.${backupFilename}.tmp`);

    if (dbType === 'postgresql') {
      // PostgreSQL backup
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is required for PostgreSQL backup');
      }

      const pgDumpAvailable = await checkPgDumpAvailable();

      if (pgDumpAvailable) {
        // Use pg_dump for more reliable backup
        await backupWithPgDump(connectionString, tempPath);
      } else {
        // Fall back to Drizzle-based backup
        const db = getDb();
        await backupWithDrizzle(db, tempPath);
      }

      // Compress if requested
      if (compress) {
        const fileData = await Bun.file(tempPath).arrayBuffer();
        const compressedData = Bun.gzipSync(new Uint8Array(fileData));
        await Bun.write(tempPath + '.gz', compressedData);
        unlinkSync(tempPath);
        renameSync(tempPath + '.gz', backupPath);
      } else {
        renameSync(tempPath, backupPath);
      }
    } else {
      // SQLite backup
      const databasePath = getDatabasePath();

      // Verify database exists
      if (!existsSync(databasePath)) {
        throw new Error(`Database file not found: ${databasePath}`);
      }

      // Use SQLite's VACUUM INTO to create a clean backup
      // This is safer than file copy, especially for WAL mode databases
      const sourceDb = new Database(databasePath, { readonly: true });

      try {
        // VACUUM INTO creates a complete, clean backup at the specified path
        sourceDb.exec(`VACUUM INTO '${tempPath.replace(/\\/g, '/')}'`);
      } finally {
        sourceDb.close();
      }

      // Verify temp backup was created
      if (!existsSync(tempPath)) {
        throw new Error('Failed to create backup file using VACUUM INTO');
      }

      // Compress if requested
      if (compress) {
        // Read the file as ArrayBuffer and compress it
        const fileData = await Bun.file(tempPath).arrayBuffer();
        const compressedData = Bun.gzipSync(new Uint8Array(fileData));
        await Bun.write(tempPath + '.gz', compressedData);
        unlinkSync(tempPath);
        renameSync(tempPath + '.gz', backupPath);
      } else {
        // Move temp file to final location
        renameSync(tempPath, backupPath);
      }
    }

    // Get backup size and verify it exists
    const stats = statSync(backupPath);

    // Basic validation: ensure file has content
    if (stats.size === 0) {
      throw new Error('Backup file is empty');
    }

    // Clean up old backups if retention is set
    let removedCount = 0;
    if (retain > 0) {
      removedCount = await cleanupOldBackups(outputDir, retain);
    }

    return {
      backupPath,
      size: stats.size,
      compressed: compress,
      timestamp: new Date().toISOString(),
      removedOldBackups: removedCount,
    };
  } catch (error) {
    // Clean up temporary files if they exist
    const tempPath = path.join(outputDir, `.${backupFilename}.tmp`);
    const tempCompressedPath = tempPath + '.gz';

    if (existsSync(tempPath)) {
      try {
        unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    if (existsSync(tempCompressedPath)) {
      try {
        unlinkSync(tempCompressedPath);
      } catch {
        // Ignore cleanup errors
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to create backup: ${errorMessage}`);
  }
}

/**
 * Verify backup integrity by opening and querying the database (internal function)
 *
 * @param backupPath - Path to backup file
 * @param compressed - Whether the backup is compressed
 * @param dbType - Type of database (sqlite or postgresql)
 *
 * @throws Error if backup is corrupted or invalid
 */
async function verifyBackupIntegrity(
  backupPath: string,
  compressed: boolean = false,
  dbType: DatabaseType = 'sqlite'
): Promise<void> {
  let tempDecompressedPath = '';

  try {
    let dbPath = backupPath;

    // Decompress if needed
    if (compressed) {
      tempDecompressedPath = path.join(
        path.dirname(backupPath),
        `.${path.basename(backupPath, '.gz')}.decompressed`
      );

      const compressedFile = Bun.file(backupPath);
      const decompressedData = Bun.gunzipSync(await compressedFile.arrayBuffer());
      await Bun.write(tempDecompressedPath, decompressedData);
      dbPath = tempDecompressedPath;
    }

    // Verify file exists and is not empty
    if (!existsSync(dbPath)) {
      throw new Error(`Backup file does not exist: ${dbPath}`);
    }

    const stats = statSync(dbPath);
    if (stats.size === 0) {
      throw new Error(`Backup file is empty: ${dbPath}`);
    }

    if (dbType === 'postgresql') {
      // For PostgreSQL SQL dumps, verify the file contains expected SQL content
      const content = await Bun.file(dbPath).text();

      // Check for key SQL statements
      if (!content.includes('CREATE TABLE') && !content.includes('INSERT INTO')) {
        throw new Error('Backup file does not contain valid SQL statements');
      }

      // Check for api_keys table references
      if (!content.includes('api_keys')) {
        throw new Error('Backup does not contain api_keys table references');
      }
    } else {
      // For SQLite, open database and verify structure
      const db = new Database(dbPath, { readonly: true });

      try {
        // Check if api_keys table exists
        const tableCheck = db
          .query(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='api_keys'"
          )
          .get() as { name: string } | null;

        if (!tableCheck) {
          throw new Error('Backup does not contain api_keys table');
        }

        // Run a simple query to verify database integrity
        const result = db.query('SELECT COUNT(*) as count FROM api_keys').get() as {
          count: number;
        };

        // Verify result is valid
        if (typeof result.count !== 'number') {
          throw new Error('Backup query returned invalid result');
        }
      } finally {
        db.close();
      }
    }
  } finally {
    // Clean up temporary decompressed file
    if (tempDecompressedPath && existsSync(tempDecompressedPath)) {
      try {
        unlinkSync(tempDecompressedPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Verify backup integrity by opening and querying the database
 *
 * @param backupPath - Path to backup file
 * @param compressed - Whether the backup is compressed
 * @param dbType - Type of database (auto-detected from filename if not provided)
 *
 * @throws Error if backup is corrupted or invalid
 *
 * @example
 * ```ts
 * import { verifyBackup } from './db/backup.js';
 *
 * try {
 *   await verifyBackup('./data/backups/sqlite-backup.db');
 *   console.log('Backup is valid');
 * } catch (error) {
 *   console.error('Backup is corrupted:', error);
 * }
 * ```
 */
export async function verifyBackup(backupPath: string, compressed: boolean = false, dbType?: DatabaseType): Promise<void> {
  // Auto-detect database type from filename if not provided
  if (!dbType) {
    const filename = path.basename(backupPath);
    if (filename.startsWith('pg-backup') || filename.endsWith('.sql') || filename.endsWith('.sql.gz')) {
      dbType = 'postgresql';
    } else {
      dbType = 'sqlite';
    }
  }

  await verifyBackupIntegrity(backupPath, compressed, dbType);
}

/**
 * List all backups in a directory
 *
 * @param outputDir - Directory containing backups
 * @returns Array of backup metadata
 *
 * @example
 * ```ts
 * import { listBackups } from './db/backup.js';
 *
 * const backups = await listBackups('./data/backups');
 * console.log(`Found ${backups.length} backups`);
 *
 * for (const backup of backups) {
 *   console.log(`- ${backup.filename} (${backup.size} bytes)`);
 * }
 * ```
 */
export async function listBackups(outputDir: string = './data/backups'): Promise<BackupMetadata[]> {
  if (!existsSync(outputDir)) {
    return [];
  }

  const files = readdirSync(outputDir);
  const backups: BackupMetadata[] = [];

  for (const file of files) {
    // Skip temporary files
    if (file.startsWith('.')) {
      continue;
    }

    const filePath = path.join(outputDir, file);
    const stats = statSync(filePath);

    // Only process regular files
    if (!stats.isFile()) {
      continue;
    }

    // Check if it's a backup file (.db, .db.gz, .sql, .sql.gz)
    const isPgCompressed = file.endsWith('.sql.gz');
    const isPgUncompressed = file.endsWith('.sql') && !file.endsWith('.sql.gz');
    const isSqliteCompressed = file.endsWith('.db.gz');
    const isSqliteUncompressed = file.endsWith('.db') && !file.endsWith('.db.gz');

    let dbType: DatabaseType | null = null;
    let compressed = false;

    if (isPgCompressed) {
      dbType = 'postgresql';
      compressed = true;
    } else if (isPgUncompressed) {
      dbType = 'postgresql';
      compressed = false;
    } else if (isSqliteCompressed) {
      dbType = 'sqlite';
      compressed = true;
    } else if (isSqliteUncompressed) {
      dbType = 'sqlite';
      compressed = false;
    }

    if (!dbType) {
      continue;
    }

    // Extract timestamp from filename
    const pgMatch = file.match(/pg-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})/);
    const sqliteMatch = file.match(/sqlite-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})/);
    const timestamp = (pgMatch || sqliteMatch)?.[1] || stats.mtime.toISOString();

    backups.push({
      filename: file,
      timestamp,
      size: stats.size,
      compressed,
      databasePath: dbType === 'sqlite' ? getDatabasePath() : process.env.DATABASE_URL || '',
      databaseType: dbType,
    });
  }

  // Sort by timestamp (newest first)
  backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return backups;
}

/**
 * Remove old backups, keeping only the most recent ones
 *
 * @param outputDir - Directory containing backups
 * @param retain - Number of backups to keep
 * @returns Number of backups removed
 *
 * @example
 * ```ts
 * import { cleanupOldBackups } from './db/backup.js';
 *
 * // Keep only the 5 most recent backups
 * const removed = await cleanupOldBackups('./data/backups', 5);
 * console.log(`Removed ${removed} old backups`);
 * ```
 */
export async function cleanupOldBackups(
  outputDir: string = './data/backups',
  retain: number = 10
): Promise<number> {
  const backups = await listBackups(outputDir);

  if (backups.length <= retain) {
    return 0;
  }

  // Remove oldest backups
  const toRemove = backups.slice(retain);
  let removedCount = 0;

  for (const backup of toRemove) {
    const backupPath = path.join(outputDir, backup.filename);
    try {
      unlinkSync(backupPath);
      removedCount++;
    } catch {
      // Ignore errors and continue with other files
      // Don't throw here as we want to clean up as much as possible
    }
  }

  return removedCount;
}

/**
 * Get backup metadata from filename
 *
 * @param backupPath - Full path to backup file
 * @returns Backup metadata or null if invalid
 *
 * @example
 * ```ts
 * import { getBackupMetadata } from './db/backup.js';
 *
 * const metadata = await getBackupMetadata('./data/backups/sqlite-backup-2024-01-22T12-00-00.db');
 * if (metadata) {
 *   console.log(`Backup from ${metadata.timestamp}, size: ${metadata.size} bytes`);
 * }
 * ```
 */
export async function getBackupMetadata(
  backupPath: string
): Promise<BackupMetadata | null> {
  if (!existsSync(backupPath)) {
    return null;
  }

  const stats = statSync(backupPath);
  const filename = path.basename(backupPath);

  // Determine database type and compression
  let dbType: DatabaseType;
  let compressed: boolean;

  if (filename.startsWith('pg-backup') || filename.endsWith('.sql') || filename.endsWith('.sql.gz')) {
    dbType = 'postgresql';
    compressed = filename.endsWith('.gz');
  } else {
    dbType = 'sqlite';
    compressed = filename.endsWith('.db.gz');
  }

  // Extract timestamp from filename
  const pgMatch = filename.match(/pg-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})/);
  const sqliteMatch = filename.match(/sqlite-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})/);
  const timestamp = (pgMatch || sqliteMatch)?.[1] || stats.mtime.toISOString();

  return {
    filename,
    timestamp,
    size: stats.size,
    compressed,
    databasePath: dbType === 'sqlite' ? getDatabasePath() : process.env.DATABASE_URL || '',
    databaseType: dbType,
  };
}
