#!/usr/bin/env bun
/**
 * Manual Verification Script for Migration Validation
 *
 * This script creates test data and runs the full migration with validation.
 */

import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'bun:sqlite';

const TEST_DB_PATH = path.join(process.cwd(), 'data/test-validation.db');
const TEST_FILE_PATH = path.join(process.cwd(), 'data/test-apikeys.json');

// Test data with multiple keys and usage windows
const testData = {
  keys: [
    {
      key: 'sk-test-validation-1',
      name: 'Validation Test Key 1',
      model: 'claude-3-5-sonnet-20241022',
      token_limit_per_5h: 50000,
      expiry_date: '2025-12-31T23:59:59Z',
      created_at: '2024-01-01T00:00:00Z',
      last_used: '2024-01-15T12:30:00Z',
      total_lifetime_tokens: 125000,
      usage_windows: [
        {
          window_start: '2024-01-15T10:00:00Z',
          tokens_used: 50000,
        },
        {
          window_start: '2024-01-15T11:00:00Z',
          tokens_used: 75000,
        },
      ],
    },
    {
      key: 'sk-test-validation-2',
      name: 'Validation Test Key 2',
      model: 'claude-3-opus-20240229',
      token_limit_per_5h: 100000,
      expiry_date: '2026-06-30T23:59:59Z',
      created_at: '2024-02-01T00:00:00Z',
      last_used: '2024-02-20T15:45:00Z',
      total_lifetime_tokens: 250000,
      usage_windows: [
        {
          window_start: '2024-02-20T14:00:00Z',
          tokens_used: 100000,
        },
      ],
    },
  ],
};

async function setup(): Promise<void> {
  console.log('Setting up test environment...');

  // Create data directory if needed
  const dataDir = path.dirname(TEST_DB_PATH);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Clean up any existing test database
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }

  // Clean up any existing test file
  if (existsSync(TEST_FILE_PATH)) {
    unlinkSync(TEST_FILE_PATH);
  }

  // Set test database path
  process.env.DATABASE_PATH = TEST_DB_PATH;

  // Initialize database schema
  const sqlite = new Database(TEST_DB_PATH);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  // Create tables
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

  sqlite.exec(`
CREATE TABLE IF NOT EXISTS \`usage_windows\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`api_key\` text NOT NULL,
	\`window_start\` text NOT NULL,
	\`tokens_used\` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (\`api_key\`) REFERENCES \`api_keys\`(\`key\`) ON UPDATE no action ON DELETE cascade
);
`);

  sqlite.close();
  console.log(`✓ Initialized test database: ${TEST_DB_PATH}`);

  // Write test data file
  writeFileSync(TEST_FILE_PATH, JSON.stringify(testData, null, 2));
  console.log(`✓ Created test data file: ${TEST_FILE_PATH}`);
}

async function cleanup(): Promise<void> {
  console.log('\nCleaning up...');

  // Close database connections
  const { closeDb } = await import('../src/db/connection.js');
  await closeDb();

  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
    console.log('✓ Removed test database');
  }

  if (existsSync(TEST_FILE_PATH)) {
    unlinkSync(TEST_FILE_PATH);
    console.log('✓ Removed test data file');
  }
}

async function main(): Promise<void> {
  try {
    await setup();

    console.log('\n' + '='.repeat(60));
    console.log('Testing Migration with Validation');
    console.log('='.repeat(60));

    // Import validation and migration functions
    const { getDatabaseKeyCount: getKeyCount, validateMigration } = await import(
      '../scripts/migrate.ts'
    );

    // Get initial count
    const initialCount = await getKeyCount();
    console.log(`\nDatabase key count before migration: ${initialCount}`);

    // Perform migration using the migrate script's internal logic
    const { migrateApiKeys } = await import('../scripts/migrate.ts');
    await migrateApiKeys(testData);

    // Get final count
    const finalCount = await getKeyCount();
    console.log(`\nDatabase key count after migration: ${finalCount}`);

    // Validate the migration
    console.log('\n' + '='.repeat(60));
    console.log('Running Validation...');
    console.log('='.repeat(60));
    const validation = await validateMigration(testData, initialCount);

    console.log(`\nValidation Results:`);
    console.log(`  Source keys:        ${validation.details.sourceCount}`);
    console.log(`  Database keys:      ${validation.details.databaseCount}`);
    console.log(`  New keys added:     ${validation.details.newKeysCount}`);
    console.log(`  Discrepancies:      ${validation.discrepancies.length}`);

    if (validation.valid) {
      console.log('\n' + '='.repeat(60));
      console.log('✓ ALL VALIDATIONS PASSED');
      console.log('='.repeat(60));
      console.log('\nMigration Summary:');
      console.log(`  - ${testData.keys.length} keys migrated successfully`);
      console.log(`  - All field values verified`);
      console.log(`  - Usage windows integrity confirmed`);
      console.log(`  - Record counts match`);
      console.log('\nThe migration validation feature is working correctly!');
    } else {
      console.error('\n' + '='.repeat(60));
      console.error('✗ VALIDATION FAILED');
      console.error('='.repeat(60));
      console.error('\nDiscrepancies found:');
      validation.discrepancies.forEach((d, i) => {
        console.error(`  ${i + 1}. ${d}`);
      });
      process.exit(1);
    }
  } catch (error) {
    console.error('\n✗ Test failed:', error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

main();
