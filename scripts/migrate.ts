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
import { createApiKey, deleteApiKey, getAllApiKeys, findApiKey } from '../src/db/operations.js';
import { getDb } from '../src/db/connection.js';
import * as schema from '../src/db/schema.js';

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
  - Pre-migration validation: Validates JSON structure before migration
  - Post-migration validation: Compares source data with migrated data for integrity
  - Automatic rollback: Removes migrated keys from database on migration or validation failure
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

Rollback:
  If migration or validation fails, the tool automatically rolls back by removing
  all successfully migrated keys from the database. Your original apikeys.json file
  remains untouched. You can then review the error messages and retry the migration.
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
 * Insert usage windows for an API key
 *
 * @param apiKey - The API key string
 * @param usageWindows - Array of usage windows to insert
 * @throws Error if insertion fails
 */
async function insertUsageWindows(
  apiKey: string,
  usageWindows: { window_start: string; tokens_used: number }[]
): Promise<void> {
  if (usageWindows.length === 0) {
    return;
  }

  try {
    const { db, type } = getDb();
    const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

    // Insert all usage windows for this key
    const values = usageWindows.map((window) => ({
      apiKey,
      windowStart: window.window_start,
      tokensUsed: window.tokens_used,
    }));

    await db.insert(usageTable).values(values);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to insert usage windows: ${errorMessage}`);
  }
}

/**
 * Get the current count of API keys in the database
 *
 * @returns The number of API keys in the database
 */
export async function getDatabaseKeyCount(): Promise<number> {
  try {
    const allKeys = await getAllApiKeys({ limit: 1000000 });
    return allKeys.length;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to count database keys: ${errorMessage}`);
  }
}

/**
 * Compare two usage window arrays for equality
 *
 * @param windows1 - First usage windows array
 * @param windows2 - Second usage windows array
 * @returns True if the arrays contain the same data
 */
export function usageWindowsEqual(
  windows1: { window_start: string; tokens_used: number }[],
  windows2: { window_start: string; tokens_used: number }[]
): boolean {
  if (windows1.length !== windows2.length) {
    return false;
  }

  // Sort both arrays by window_start for comparison
  const sorted1 = [...windows1].sort((a, b) =>
    a.window_start.localeCompare(b.window_start)
  );
  const sorted2 = [...windows2].sort((a, b) =>
    a.window_start.localeCompare(b.window_start)
  );

  for (let i = 0; i < sorted1.length; i++) {
    if (
      sorted1[i].window_start !== sorted2[i].window_start ||
      sorted1[i].tokens_used !== sorted2[i].tokens_used
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Validate that all data was migrated correctly
 *
 * @param sourceData - The original ApiKeysData from the file
 * @param keysBeforeMigration - The count of keys before migration
 * @returns Object with validation result and discrepancies
 */
export async function validateMigration(
  sourceData: ApiKeysData,
  keysBeforeMigration: number
): Promise<{
  valid: boolean;
  discrepancies: string[];
  details: {
    sourceCount: number;
    databaseCount: number;
    newKeysCount: number;
  };
}> {
  const discrepancies: string[] = [];
  const sourceCount = sourceData.keys.length;

  try {
    // Get all keys from database
    const databaseKeys = await getAllApiKeys({ limit: 1000000 });
    const databaseCount = databaseKeys.length;
    const newKeysCount = databaseCount - keysBeforeMigration;

    // Validate count matches
    if (newKeysCount !== sourceCount) {
      discrepancies.push(
        `Record count mismatch: expected ${sourceCount} new keys, found ${newKeysCount} in database`
      );
    }

    // Validate each source key exists in database and data matches
    for (const sourceKey of sourceData.keys) {
      const dbKey = await findApiKey(sourceKey.key);

      if (!dbKey) {
        discrepancies.push(
          `Key '${sourceKey.key}' (${sourceKey.name}) not found in database`
        );
        continue;
      }

      // Compare fields
      if (dbKey.name !== sourceKey.name) {
        discrepancies.push(
          `Key '${sourceKey.key}': name mismatch - source: '${sourceKey.name}', db: '${dbKey.name}'`
        );
      }

      if (dbKey.model !== sourceKey.model) {
        discrepancies.push(
          `Key '${sourceKey.key}': model mismatch - source: '${sourceKey.model || 'undefined'}', db: '${dbKey.model || 'undefined'}'`
        );
      }

      if (dbKey.token_limit_per_5h !== sourceKey.token_limit_per_5h) {
        discrepancies.push(
          `Key '${sourceKey.key}': token_limit_per_5h mismatch - source: ${sourceKey.token_limit_per_5h}, db: ${dbKey.token_limit_per_5h}`
        );
      }

      // Compare expiry_date (normalize by converting to Date objects)
      const sourceExpiry = new Date(sourceKey.expiry_date).getTime();
      const dbExpiry = new Date(dbKey.expiry_date).getTime();
      if (sourceExpiry !== dbExpiry) {
        discrepancies.push(
          `Key '${sourceKey.key}': expiry_date mismatch - source: '${sourceKey.expiry_date}', db: '${dbKey.expiry_date}'`
        );
      }

      // Compare created_at timestamps
      const sourceCreated = new Date(sourceKey.created_at).getTime();
      const dbCreated = new Date(dbKey.created_at).getTime();
      if (sourceCreated !== dbCreated) {
        discrepancies.push(
          `Key '${sourceKey.key}': created_at mismatch - source: '${sourceKey.created_at}', db: '${dbKey.created_at}'`
        );
      }

      // Compare last_used timestamps
      const sourceLastUsed = new Date(sourceKey.last_used).getTime();
      const dbLastUsed = new Date(dbKey.last_used).getTime();
      if (sourceLastUsed !== dbLastUsed) {
        discrepancies.push(
          `Key '${sourceKey.key}': last_used mismatch - source: '${sourceKey.last_used}', db: '${dbKey.last_used}'`
        );
      }

      if (dbKey.total_lifetime_tokens !== sourceKey.total_lifetime_tokens) {
        discrepancies.push(
          `Key '${sourceKey.key}': total_lifetime_tokens mismatch - source: ${sourceKey.total_lifetime_tokens}, db: ${dbKey.total_lifetime_tokens}`
        );
      }

      // Compare usage windows
      if (!usageWindowsEqual(sourceKey.usage_windows, dbKey.usage_windows)) {
        discrepancies.push(
          `Key '${sourceKey.key}': usage_windows mismatch - source: ${sourceKey.usage_windows.length} windows, db: ${dbKey.usage_windows.length} windows`
        );
      }
    }

    return {
      valid: discrepancies.length === 0,
      discrepancies,
      details: {
        sourceCount,
        databaseCount,
        newKeysCount,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Validation failed: ${errorMessage}`);
  }
}

/**
 * Migrate API keys to database
 *
 * @param apiKeysData - The API keys data to migrate
 * @returns Array of successfully migrated API key strings (for rollback)
 * @throws Error if any keys fail to migrate
 */
export async function migrateApiKeys(apiKeysData: ApiKeysData): Promise<string[]> {
  const { keys } = apiKeysData;
  const total = keys.length;
  let success = 0;
  let failed = 0;
  const migratedKeys: string[] = [];

  console.log(`\nMigrating ${total} API key(s)...`);

  for (let i = 0; i < total; i++) {
    const apiKey = keys[i];
    const progress = `[${i + 1}/${total}]`;

    try {
      // Create the API key
      await createApiKey(apiKey);

      // Insert usage windows if present
      if (apiKey.usage_windows && apiKey.usage_windows.length > 0) {
        await insertUsageWindows(apiKey.key, apiKey.usage_windows);
      }

      // Track successfully migrated key for rollback
      migratedKeys.push(apiKey.key);
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

  return migratedKeys;
}

/**
 * Rollback migration by deleting keys that were successfully migrated
 *
 * This function removes all API keys that were successfully migrated during
 * the current migration attempt. It's called automatically on migration failure
 * to restore the database to its previous state.
 *
 * @param migratedKeys - Array of API key strings to delete from database
 * @returns Object with rollback results (deleted count and failures)
 */
export async function rollbackMigration(migratedKeys: string[]): Promise<{
  deleted: number;
  failed: number;
  errors: string[];
}> {
  const total = migratedKeys.length;
  let deleted = 0;
  let failed = 0;
  const errors: string[] = [];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Rolling back migration...`);
  console.log(`Removing ${total} migrated key(s) from database`);
  console.log(`${'='.repeat(60)}`);

  for (let i = 0; i < total; i++) {
    const key = migratedKeys[i];
    const progress = `[${i + 1}/${total}]`;

    try {
      const wasDeleted = await deleteApiKey(key);
      if (wasDeleted) {
        deleted++;
        process.stdout.write(`\r${progress} ✓ Rolled back: ${key}\n`);
      } else {
        failed++;
        process.stdout.write(`\r${progress} ⚠ Not found in database: ${key}\n`);
      }
    } catch (error) {
      failed++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      process.stdout.write(`\r${progress} ✗ Failed to rollback: ${key} - ${errorMessage}\n`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Rollback complete!`);
  console.log(`  Total keys to rollback:  ${total}`);
  console.log(`  Successfully deleted:    ${deleted}`);
  console.log(`  Failed:                 ${failed}`);
  console.log(`${'='.repeat(60)}`);

  return { deleted, failed, errors };
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log('Database Migration Tool');
  console.log('='.repeat(60));

  let migratedKeys: string[] = [];
  let backupPath = '';

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
    backupPath = createBackup(filePath);
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

    // Get count before migration
    const keysBeforeMigration = await getDatabaseKeyCount();
    console.log(`\nKeys in database before migration: ${keysBeforeMigration}`);

    // Perform migration and track successfully migrated keys
    migratedKeys = await migrateApiKeys(apiKeysData);

    // Validate migration
    console.log('\nValidating migration...');
    const validation = await validateMigration(apiKeysData, keysBeforeMigration);

    console.log(`\nValidation Results:`);
    console.log(`  Source keys:     ${validation.details.sourceCount}`);
    console.log(`  Database keys:   ${validation.details.databaseCount}`);
    console.log(`  New keys added:  ${validation.details.newKeysCount}`);

    if (validation.valid) {
      console.log('\n✓ Validation PASSED - All data migrated correctly!');
      console.log(`Backup saved at: ${backupPath}`);
    } else {
      // Validation failed - rollback
      console.error('\n✗ Validation FAILED - Data discrepancies detected:');
      validation.discrepancies.forEach((discrepancy) => {
        console.error(`  • ${discrepancy}`);
      });
      console.error(`\nRolling back migration...`);

      await rollbackMigration(migratedKeys);

      console.error(`\nBackup preserved at: ${backupPath}`);
      console.error('Please review the discrepancies and retry the migration.');
      process.exit(1);
    }
  } catch (error) {
    // Migration failed - rollback
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\n✗ Migration failed: ${errorMessage}`);

    if (migratedKeys.length > 0) {
      console.error(`\nAttempting automatic rollback...`);
      const rollbackResult = await rollbackMigration(migratedKeys);

      if (rollbackResult.failed > 0) {
        console.error(`\n⚠ Warning: ${rollbackResult.failed} key(s) could not be rolled back.`);
        console.error(`Error details:`);
        rollbackResult.errors.forEach((err) => console.error(`  • ${err}`));
      }

      console.error(`\nBackup preserved at: ${backupPath}`);
      console.error('Please review the error and retry the migration.');
    }

    process.exit(1);
  }
}

// Run main function
main();
