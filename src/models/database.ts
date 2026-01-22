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
 *
 * DESIGN DECISION - Singleton Pattern:
 * We use a singleton to ensure only one database connection exists.
 * This is safe for SQLite because:
 * - SQLite handles multiple concurrent reads efficiently
 * - WAL mode allows readers to proceed without blocking writers
 * - Single connection avoids connection overhead
 *
 * PRAGMA SETTINGS EXPLANATION:
 * - journal_mode = WAL: Write-Ahead Logging for better concurrency
 *   * Readers don't block writers and writers don't block readers
 *   * Better performance for concurrent read operations
 *   * Slightly more disk space usage (trade-off for performance)
 *
 * - foreign_keys = ON: Enable foreign key constraints
 *   * Ensures referential integrity across tables
 *   * Currently only one table but useful for future schema changes
 *
 * - busy_timeout = 5000: Wait up to 5 seconds if database is locked
 *   * Prevents immediate failure when database is temporarily locked
 *   * 5000ms is reasonable for most admin operations (not too long, not too short)
 *
 * @returns SQLite Database instance
 */
export function getDatabase(): Database {
  if (!db) {
    const config = getConfig();
    const dbPath = config.databasePath;

    // Create database with optimized settings for concurrency
    db = new Database(dbPath);

    // WAL mode significantly improves concurrency by separating reads and writes
    db.exec('PRAGMA journal_mode = WAL;');

    // Enable foreign key constraints for data integrity
    db.exec('PRAGMA foreign_keys = ON;');

    // Wait up to 5 seconds if database is locked (handles concurrent access)
    db.exec('PRAGMA busy_timeout = 5000;');

    // Initialize schema (tables, indexes, triggers)
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
