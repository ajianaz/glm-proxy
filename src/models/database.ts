/**
 * Database Initialization and Connection Management
 *
 * Handles SQLite database initialization, schema creation, and connection management.
 * Uses Bun's built-in bun:sqlite module for optimal performance.
 */

import { Database } from 'bun:sqlite';
import { getConfig } from '../config.js';
import {
  API_KEYS_TABLE_SCHEMA,
  API_KEYS_INDEXES,
  API_KEYS_UPDATE_TRIGGER,
} from './schema.js';

/**
 * Database connection singleton
 */
let db: Database | null = null;

/**
 * Get or create the database connection
 * @returns SQLite Database instance
 */
export function getDatabase(): Database {
  if (!db) {
    const config = getConfig();
    const dbPath = config.databasePath;

    // Create database with WAL mode for better concurrency
    db = new Database(dbPath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');

    // Initialize schema
    initializeSchema(db);
  }

  return db;
}

/**
 * Close the database connection
 * Useful for testing or cleanup
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Initialize database schema
 * Creates tables, indexes, and triggers if they don't exist
 */
function initializeSchema(database: Database): void {
  // Create api_keys table
  database.exec(API_KEYS_TABLE_SCHEMA);

  // Create indexes for performance
  API_KEYS_INDEXES.forEach((indexSql) => {
    database.exec(indexSql);
  });

  // Create trigger for automatic timestamp updates
  database.exec(API_KEYS_UPDATE_TRIGGER);
}

/**
 * Reset database schema
 * Drops and recreates all tables (useful for testing)
 * @warning This will delete all data!
 */
export function resetDatabase(): void {
  const database = getDatabase();

  // Drop all tables
  database.exec('DROP TABLE IF EXISTS api_keys;');

  // Drop all indexes
  database.exec(`
    DROP INDEX IF EXISTS idx_api_keys_key_hash;
    DROP INDEX IF EXISTS idx_api_keys_is_active;
    DROP INDEX IF EXISTS idx_api_keys_name;
    DROP INDEX IF EXISTS idx_api_keys_active_name;
  `);

  // Drop trigger
  database.exec('DROP TRIGGER IF EXISTS update_api_keys_timestamp;');

  // Recreate schema
  initializeSchema(database);
}

/**
 * Get database statistics (useful for monitoring)
 */
export function getDatabaseStats(): {
  apiKeyCount: number;
  databaseSize: number;
} {
  const database = getDatabase();

  const apiKeyCount = database
    .query<{ count: number }, []>('SELECT COUNT(*) as count FROM api_keys')
    .get()?.count || 0;

  // Get database file size
  const config = getConfig();
  const stats = require('fs').statSync(config.databasePath);

  return {
    apiKeyCount,
    databaseSize: stats.size,
  };
}
