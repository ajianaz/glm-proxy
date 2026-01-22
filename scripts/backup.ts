#!/usr/bin/env bun
/**
 * Backup CLI Script
 *
 * Creates database backups and lists available backups.
 * Supports both SQLite and PostgreSQL based on environment configuration.
 *
 * Usage:
 *   bun run backup                       # Create backup with default settings
 *   bun run backup --compress            # Create compressed backup
 *   bun run backup --output-dir <path>   # Custom output directory
 *   bun run backup --list                # List available backups
 *   bun run backup --retain <number>     # Number of backups to keep
 */

import path from 'node:path';
import { backupDatabase, listBackups, type BackupMetadata } from '../src/db/backup.js';
import { getDatabaseType } from '../src/db/connection.js';

// CLI arguments
const args = process.argv.slice(2);
let compress = false;
let listOnly = false;
let outputDir = './data/backups';
let retain = 10;
let showHelp = false;

// Parse CLI arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--compress' || arg === '-c') {
    compress = true;
  } else if (arg === '--list' || arg === '-l') {
    listOnly = true;
  } else if (arg === '--output-dir' || arg === '-o') {
    if (args[i + 1]) {
      outputDir = args[++i];
    }
  } else if (arg === '--retain' || arg === '-r') {
    if (args[i + 1]) {
      retain = parseInt(args[++i], 10);
      if (isNaN(retain) || retain < 0) {
        console.error('Error: --retain must be a non-negative number');
        process.exit(1);
      }
    }
  } else if (arg === '--help' || arg === '-h') {
    showHelp = true;
  }
}

/**
 * Show help message
 */
function showHelpMessage(): void {
  console.log(`
Backup CLI - Create and list database backups

Usage:
  bun run backup                       Create backup with default settings
  bun run backup --compress            Create compressed backup
  bun run backup --list                List available backups
  bun run backup --output-dir <path>   Custom output directory
  bun run backup --retain <number>     Number of backups to keep (0 = keep all)

Arguments:
  -c, --compress          Compress backup using gzip (default: false)
  -l, --list              List available backups instead of creating one
  -o, --output-dir <dir>  Output directory for backups (default: ./data/backups)
  -r, --retain <number>   Number of backups to retain (default: 10)
  -h, --help              Show this help message

Environment Variables:
  DATABASE_URL         PostgreSQL connection URL (optional)
  DATABASE_PATH        SQLite database path (default: ./data/sqlite.db)

Examples:
  bun run backup
  bun run backup --compress
  bun run backup --list
  bun run backup --output-dir ./my-backups --retain 5
  DATABASE_URL=postgres://localhost/mydb bun run backup

Backup Files:
  SQLite:   sqlite-backup-YYYY-MM-DDTHH-mm-ss-mmm.db or .db.gz
  PostgreSQL: pg-backup-YYYY-MM-DDTHH-mm-ss-mmm.sql or .sql.gz
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
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * List available backups
 */
async function listAvailableBackups(): Promise<void> {
  try {
    const backups = await listBackups(outputDir);

    if (backups.length === 0) {
      console.log(`\nNo backups found in: ${outputDir}`);
      console.log('To create a backup, run: bun run backup');
      return;
    }

    console.log(`\nAvailable backups in: ${outputDir}`);
    console.log('='.repeat(80));

    for (let i = 0; i < backups.length; i++) {
      const backup = backups[i];
      const isCompressed = backup.compressed ? ' [compressed]' : '';
      console.log(`\n${i + 1}. ${backup.filename}${isCompressed}`);
      console.log(`   Type:        ${backup.databaseType.toUpperCase()}`);
      console.log(`   Size:        ${formatFileSize(backup.size)}`);
      console.log(`   Created:     ${formatTimestamp(backup.timestamp)}`);
      console.log(`   Database:    ${backup.databasePath}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log(`Total: ${backups.length} backup(s)`);
    console.log('\nTo restore a backup, run:');
    console.log(`  bun run restore <backup-file>`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\n✗ Failed to list backups: ${errorMessage}`);
    process.exit(1);
  }
}

/**
 * Create a backup
 */
async function createBackup(): Promise<void> {
  try {
    const dbType = getDatabaseType();
    console.log('Database Backup Tool');
    console.log('='.repeat(60));
    console.log(`Database type: ${dbType.toUpperCase()}`);
    console.log(`Output directory: ${outputDir}`);
    console.log(`Compression: ${compress ? 'Enabled' : 'Disabled'}`);
    console.log(`Retention: ${retain === 0 ? 'Keep all' : `${retain} most recent`}`);
    console.log('='.repeat(60));

    const result = await backupDatabase({
      outputDir,
      compress,
      retain,
    });

    console.log(`\n✓ Backup created successfully!`);
    console.log(`  Path:   ${result.backupPath}`);
    console.log(`  Size:   ${formatFileSize(result.size)}`);
    console.log(`  Timestamp: ${result.timestamp}`);

    if (result.removedOldBackups > 0) {
      console.log(`  Cleaned up ${result.removedOldBackups} old backup(s)`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\n✗ Backup failed: ${errorMessage}`);
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

  if (listOnly) {
    await listAvailableBackups();
  } else {
    await createBackup();
  }
}

// Run main function
main();
