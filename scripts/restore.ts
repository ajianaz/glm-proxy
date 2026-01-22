#!/usr/bin/env bun
/**
 * Restore CLI Script
 *
 * Restores database from a backup file.
 * Supports both SQLite and PostgreSQL based on environment configuration.
 *
 * Usage:
 *   bun run restore <backup-file>                    # Restore from backup
 *   bun run restore <backup-file> --no-verify        # Skip backup verification
 *   bun run restore <backup-file> --no-backup        # Skip pre-restore backup
 *   bun run restore <backup-file> --force            # Force restore even if types mismatch
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { restoreDatabase, verifyBackup, getBackupMetadata } from '../src/db/backup.js';
import { getDatabaseType } from '../src/db/connection.js';

// CLI arguments
const args = process.argv.slice(2);

// Parse CLI arguments (check for help flag first)
let backupFileArg = '';
let skipVerify = false;
let skipBackup = false;
let force = false;
let showHelp = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    showHelp = true;
  } else if (arg === '--no-verify') {
    skipVerify = true;
  } else if (arg === '--no-backup') {
    skipBackup = true;
  } else if (arg === '--force' || arg === '-f') {
    force = true;
  } else if (!backupFileArg && !arg.startsWith('--')) {
    // First non-flag argument is the backup file
    backupFileArg = arg;
  }
}

// Check if backup file argument is provided (if not showing help)
if (!showHelp && !backupFileArg) {
  console.error('Error: Backup file path is required');
  console.error('\nUsage: bun run restore <backup-file> [options]');
  console.error('Run: bun run restore --help for more information');
  process.exit(1);
}

/**
 * Show help message
 */
function showHelpMessage(): void {
  console.log(`
Restore CLI - Restore database from backup file

Usage:
  bun run restore <backup-file>                    Restore from backup file
  bun run restore <backup-file> --no-verify        Skip backup verification
  bun run restore <backup-file> --no-backup        Skip pre-restore backup
  bun run restore <backup-file> --force            Force restore even if types mismatch

Arguments:
  <backup-file>                   Path to backup file (required)
  --no-verify                     Skip backup integrity verification (default: verify)
  --no-backup                     Skip creating pre-restore backup (default: create backup)
  -f, --force                     Force restore even if database types don't match
  -h, --help                      Show this help message

Environment Variables:
  DATABASE_URL         PostgreSQL connection URL (optional)
  DATABASE_PATH        SQLite database path (default: ./data/sqlite.db)

Safety Features:
  - Backup verification: Checks backup integrity before restoring
  - Pre-restore backup: Creates backup of current database before restoring
  - Type checking: Verifies backup type matches current database type

Examples:
  bun run restore ./data/backups/sqlite-backup-2024-01-22T12-00-00-000.db
  bun run restore ./data/backups/pg-backup-2024-01-22T12-00-00-000.sql.gz
  bun run restore ./data/backups/backup.db --no-verify
  bun run restore ./data/backups/backup.db --force

To list available backups:
  bun run backup --list
`);
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Restore database from backup
 */
async function restoreFromBackup(): Promise<void> {
  // Resolve backup file path
  const backupPath = path.resolve(backupFileArg);

  // Check if backup file exists
  if (!existsSync(backupPath)) {
    console.error(`\n✗ Backup file not found: ${backupPath}`);
    process.exit(1);
  }

  try {
    const dbType = getDatabaseType();
    const metadata = await getBackupMetadata(backupPath);

    if (!metadata) {
      console.error(`\n✗ Unable to determine backup type from filename`);
      console.error('Supported formats:');
      console.error('  SQLite:   sqlite-backup-*.db or .db.gz');
      console.error('  PostgreSQL: pg-backup-*.sql or .sql.gz');
      process.exit(1);
    }

    console.log('Database Restore Tool');
    console.log('='.repeat(60));
    console.log(`Backup file:       ${backupPath}`);
    console.log(`Backup type:       ${metadata.databaseType.toUpperCase()}`);
    console.log(`Backup compressed:  ${metadata.compressed ? 'Yes' : 'No'}`);
    console.log(`Backup size:       ${formatFileSize(metadata.size)}`);
    console.log(`Database type:     ${dbType.toUpperCase()}`);
    console.log(`Verify backup:     ${skipVerify ? 'No' : 'Yes'}`);
    console.log(`Pre-restore backup: ${skipBackup ? 'No' : 'Yes'}`);
    console.log('='.repeat(60));

    // Type mismatch warning
    if (metadata.databaseType !== dbType) {
      if (force) {
        console.log(`\n⚠ Warning: Backup type (${metadata.databaseType}) does not match current database type (${dbType})`);
        console.log('Proceeding with restore due to --force flag');
      } else {
        console.error(`\n✗ Error: Backup type (${metadata.databaseType}) does not match current database type (${dbType})`);
        console.error('Use --force to override this check');
        process.exit(1);
      }
    }

    console.log('\nStarting restore...');

    const result = await restoreDatabase(backupPath, {
      verifyBackup: !skipVerify,
      backupBeforeRestore: !skipBackup,
      force,
    });

    console.log(`\n✓ Restore completed successfully!`);
    console.log(`  Database:        ${result.databasePath}`);
    console.log(`  Keys restored:   ${result.keysRestored}`);
    console.log(`  Usage windows:   ${result.usageWindowsRestored}`);
    console.log(`  Timestamp:       ${result.timestamp}`);

    if (result.preRestoreBackup) {
      console.log(`  Pre-restore backup: ${result.preRestoreBackup}`);
      console.log(`\n💡 Tip: Your previous database state was backed up before restoring.`);
      console.log(`   You can restore it again if needed using: bun run restore ${result.preRestoreBackup}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\n✗ Restore failed: ${errorMessage}`);
    process.exit(1);
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  if (showHelp) {
    showHelpMessage();
    process.exit(0);
  }

  await restoreFromBackup();
}

// Run main function
main();
