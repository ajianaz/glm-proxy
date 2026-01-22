import Database from 'bun:sqlite';
import { existsSync, mkdirSync, renameSync, unlinkSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseType } from './connection.js';

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
function getBackupFilename(customFilename?: string): string {
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

  return `sqlite-backup-${year}-${month}-${day}T${hours}-${minutes}-${seconds}-${millis}`;
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

  // Get database path
  const databasePath = getDatabasePath();

  // Verify database exists
  if (!existsSync(databasePath)) {
    throw new Error(`Database file not found: ${databasePath}`);
  }

  // Ensure backup directory exists
  ensureBackupDir(outputDir);

  // Generate backup filename
  const backupFilename = getBackupFilename(filename);
  const extension = compress ? '.db.gz' : '.db';
  const backupPath = path.join(outputDir, `${backupFilename}${extension}`);

  // Check if backup already exists
  if (existsSync(backupPath)) {
    throw new Error(`Backup file already exists: ${backupPath}`);
  }

  try {
    // Create temporary backup file
    const tempPath = path.join(outputDir, `.${backupFilename}.tmp`);

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
 *
 * @throws Error if backup is corrupted or invalid
 */
async function verifyBackupIntegrity(
  backupPath: string,
  compressed: boolean = false
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

    // Open database and verify structure
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
export async function verifyBackup(backupPath: string, compressed: boolean = false): Promise<void> {
  await verifyBackupIntegrity(backupPath, compressed);
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

    // Check if it's a backup file (.db or .db.gz)
    const isCompressed = file.endsWith('.db.gz');
    const isUncompressed = file.endsWith('.db') && !file.endsWith('.db.gz');

    if (!isCompressed && !isUncompressed) {
      continue;
    }

    // Extract timestamp from filename
    const match = file.match(/sqlite-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})/);
    const timestamp = match ? match[1] : stats.mtime.toISOString();

    backups.push({
      filename: file,
      timestamp,
      size: stats.size,
      compressed: isCompressed,
      databasePath: getDatabasePath(),
      databaseType: 'sqlite',
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
  const isCompressed = filename.endsWith('.db.gz');

  // Extract timestamp from filename
  const match = filename.match(/sqlite-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})/);
  const timestamp = match ? match[1] : stats.mtime.toISOString();

  return {
    filename,
    timestamp,
    size: stats.size,
    compressed: isCompressed,
    databasePath: getDatabasePath(),
    databaseType: 'sqlite',
  };
}
