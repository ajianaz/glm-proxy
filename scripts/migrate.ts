#!/usr/bin/env bun
/**
 * Migration CLI Script
 *
 * Reads apikeys.json and inserts data into the database.
 * Supports both SQLite and PostgreSQL based on environment configuration.
 *
 * Usage:
 *   bun run migrate                    # Migrate from default path
 *   bun run migrate --file /path/to/apikeys.json
 *   bun run migrate --dry-run         # Validate without migrating
 *   bun run migrate --force           # Skip confirmation
 */

import path from 'node:path';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import type { ApiKey, ApiKeysData } from '../src/types.js';
import { createApiKey } from '../src/db/operations.js';
import { getDb } from '../src/db/connection.js';

// Configuration
const DEFAULT_DATA_FILE = path.join(process.cwd(), 'data/apikeys.json');
const DATA_FILE = process.env.DATA_FILE || DEFAULT_DATA_FILE;

// CLI arguments
const args = process.argv.slice(2);
let filePath = DATA_FILE;
let dryRun = false;
let skipConfirmation = false;

// Parse CLI arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--file' && args[i + 1]) {
    filePath = args[++i];
  } else if (arg === '--dry-run') {
    dryRun = true;
  } else if (arg === '--force') {
    skipConfirmation = true;
  } else if (arg === '--help' || arg === '-h') {
    showHelp();
    process.exit(0);
  }
}

/**
 * Show help message
 */
function showHelp(): void {
  console.log(`
Migration CLI - Migrate apikeys.json to database

Usage:
  bun run scripts/migrate.ts                    Migrate from default path (data/apikeys.json)
  bun run scripts/migrate.ts --file <path>      Migrate from specific file
  bun run scripts/migrate.ts --dry-run          Validate without migrating
  bun run scripts/migrate.ts --force            Skip confirmation prompt
  bun run scripts/migrate.ts --help             Show this help message

Environment Variables:
  DATA_FILE            Path to apikeys.json file (default: ./data/apikeys.json)
  DATABASE_URL         PostgreSQL connection URL (optional)
  DATABASE_PATH        SQLite database path (default: ./data/sqlite.db)

Features:
  - Automatic backup: Creates timestamped backup in <source-dir>/backups/ before migration
  - Validation: Validates JSON structure before migration
  - Progress tracking: Shows migration progress and success/failure counts

Examples:
  bun run scripts/migrate.ts
  bun run scripts/migrate.ts --file ./custom/apikeys.json
  DATA_FILE=./custom/path/apikeys.json bun run scripts/migrate.ts
  bun run scripts/migrate.ts --dry-run
  bun run scripts/migrate.ts --force

Backups:
  Backups are automatically created before migration and stored in:
  <source-file-directory>/backups/apikeys-<timestamp>.json
`);
}

/**
 * Validate the ApiKeysData structure
 */
function validateApiKeysData(data: unknown): {
  valid: boolean;
  errors: string[];
  apiKeysData?: ApiKeysData;
} {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Data is not an object'] };
  }

  const apiKeysData = data as ApiKeysData;

  if (!Array.isArray(apiKeysData.keys)) {
    return { valid: false, errors: ['keys field is missing or not an array'] };
  }

  // Validate each API key
  apiKeysData.keys.forEach((key, index) => {
    if (!key.key || typeof key.key !== 'string') {
      errors.push(`Key at index ${index}: missing or invalid 'key' field`);
    }
    if (!key.name || typeof key.name !== 'string') {
      errors.push(`Key at index ${index}: missing or invalid 'name' field`);
    }
    if (typeof key.token_limit_per_5h !== 'number' || key.token_limit_per_5h <= 0) {
      errors.push(`Key at index ${index}: missing or invalid 'token_limit_per_5h' field`);
    }
    if (!key.expiry_date || typeof key.expiry_date !== 'string') {
      errors.push(`Key at index ${index}: missing or invalid 'expiry_date' field`);
    }
    if (!key.created_at || typeof key.created_at !== 'string') {
      errors.push(`Key at index ${index}: missing or invalid 'created_at' field`);
    }
    if (!key.last_used || typeof key.last_used !== 'string') {
      errors.push(`Key at index ${index}: missing or invalid 'last_used' field`);
    }
    if (typeof key.total_lifetime_tokens !== 'number') {
      errors.push(`Key at index ${index}: missing or invalid 'total_lifetime_tokens' field`);
    }
    if (!Array.isArray(key.usage_windows)) {
      errors.push(`Key at index ${index}: missing or invalid 'usage_windows' field`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    apiKeysData: errors.length === 0 ? apiKeysData : undefined,
  };
}

/**
 * Read and parse apikeys.json file
 */
async function readApiKeysFile(filePath: string): Promise<ApiKeysData> {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = await Bun.file(filePath).text();
  let data: unknown;

  try {
    data = JSON.parse(content);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Invalid JSON: ${errorMessage}`);
  }

  const validation = validateApiKeysData(data);

  if (!validation.valid) {
    throw new Error(`Validation failed:\n${validation.errors.map((e) => `  - ${e}`).join('\n')}`);
  }

  return validation.apiKeysData!;
}

/**
 * Create a timestamped backup of the apikeys.json file
 *
 * @param sourcePath - Path to the source apikeys.json file
 * @returns Path to the created backup file
 * @throws Error if backup creation fails
 */
function createBackup(sourcePath: string): string {
  const sourceDir = path.dirname(sourcePath);
  const sourceName = path.basename(sourcePath, '.json');

  // Create backups directory in the same directory as the source file
  const backupsDir = path.join(sourceDir, 'backups');

  // Ensure backups directory exists
  if (!existsSync(backupsDir)) {
    mkdirSync(backupsDir, { recursive: true });
  }

  // Generate timestamp for backup filename
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupFileName = `${sourceName}-${timestamp}.json`;
  const backupPath = path.join(backupsDir, backupFileName);

  // Copy the file
  try {
    copyFileSync(sourcePath, backupPath);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to create backup: ${errorMessage}`);
  }

  // Verify backup was created
  if (!existsSync(backupPath)) {
    throw new Error('Backup verification failed: backup file was not created');
  }

  // Verify backup has content
  try {
    const backupContent = Bun.file(backupPath).text();
    if (!backupContent || backupContent.length === 0) {
      throw new Error('Backup verification failed: backup file is empty');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Backup verification failed: ${errorMessage}`);
  }

  return backupPath;
}

/**
 * Migrate API keys to database
 */
async function migrateApiKeys(apiKeysData: ApiKeysData): Promise<void> {
  const { keys } = apiKeysData;
  const total = keys.length;
  let success = 0;
  let failed = 0;

  console.log(`\nMigrating ${total} API key(s)...`);

  for (let i = 0; i < total; i++) {
    const apiKey = keys[i];
    const progress = `[${i + 1}/${total}]`;

    try {
      await createApiKey(apiKey);
      success++;
      process.stdout.write(`\r${progress} ✓ Migrated: ${apiKey.name} (${apiKey.key})\n`);
    } catch (error) {
      failed++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      process.stdout.write(`\r${progress} ✗ Failed: ${apiKey.name} - ${errorMessage}\n`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Migration complete!`);
  console.log(`  Total:     ${total}`);
  console.log(`  Success:   ${success}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`${'='.repeat(60)}`);

  if (failed > 0) {
    throw new Error(`${failed} API key(s) failed to migrate`);
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log('Database Migration Tool');
  console.log('='.repeat(60));

  try {
    // Test database connection
    const { type } = getDb();
    console.log(`Database type: ${type.toUpperCase()}`);

    // Read and validate API keys file
    console.log(`Reading from: ${filePath}`);
    const apiKeysData = await readApiKeysFile(filePath);

    console.log(`Found ${apiKeysData.keys.length} API key(s)`);
    console.log(`Validation: PASSED`);

    if (dryRun) {
      console.log('\n[DRY RUN] No data will be migrated.');
      console.log('To perform migration, run without --dry-run flag.');
      process.exit(0);
    }

    // Create backup before migration
    console.log('\nCreating backup...');
    const backupPath = createBackup(filePath);
    console.log(`✓ Backup created: ${backupPath}`);

    // Show preview
    console.log('\nAPI Keys to migrate:');
    apiKeysData.keys.forEach((key, index) => {
      console.log(
        `  ${index + 1}. ${key.name} (${key.key}) - ${key.model || 'default model'}`
      );
    });

    // Confirmation prompt
    if (!skipConfirmation) {
      console.log('\nProceed with migration? (yes/no)');
      process.stdout.write('> ');

      const answer = await new Promise<string>((resolve) => {
        process.stdin.once('data', (data) => {
          resolve(data.toString().trim().toLowerCase());
        });
      });

      if (answer !== 'yes' && answer !== 'y') {
        console.log('Migration cancelled.');
        console.log(`Backup preserved at: ${backupPath}`);
        process.exit(0);
      }
    }

    // Perform migration
    await migrateApiKeys(apiKeysData);

    console.log('\n✓ Migration successful!');
    console.log(`Backup saved at: ${backupPath}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\n✗ Migration failed: ${errorMessage}`);
    process.exit(1);
  }
}

// Run main function
main();
