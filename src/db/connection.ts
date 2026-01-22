import Database from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { existsSync, mkdirSync } from 'node:fs';
import * as schema from './schema.js';

/**
 * Database connection types
 */
export type DatabaseType = 'sqlite' | 'postgresql';

/**
 * Database connection interface
 */
export interface DatabaseConnection {
  type: DatabaseType;
  db: ReturnType<typeof drizzle> | ReturnType<typeof drizzlePg>;
  client: Database | postgres.Sql<Record<string, unknown>>;
  close: () => Promise<void>;
}

/**
 * Singleton database instance
 */
let dbInstance: DatabaseConnection | null = null;

/**
 * Get database type from environment variables
 *
 * Priority:
 * 1. DATABASE_URL (PostgreSQL)
 * 2. DATABASE_PATH (SQLite, defaults to ./data/sqlite.db)
 */
export function getDatabaseType(): DatabaseType {
  if (process.env.DATABASE_URL) {
    return 'postgresql';
  }
  return 'sqlite';
}

/**
 * Create SQLite database connection
 *
 * Uses Bun's built-in SQLite support (bun:sqlite)
 */
function createSQLiteConnection(): DatabaseConnection {
  const databasePath = process.env.DATABASE_PATH || './data/sqlite.db';

  // Ensure database directory exists
  const databaseDir = databasePath.substring(0, databasePath.lastIndexOf('/'));
  if (databaseDir && !existsSync(databaseDir)) {
    try {
      mkdirSync(databaseDir, { recursive: true });
    } catch {
      throw new Error(`Failed to create database directory: ${databaseDir}`);
    }
  }

  // Create SQLite database instance
  const sqlite = new Database(databasePath);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  // Create Drizzle instance
  const db = drizzle({ client: sqlite, schema });

  return {
    type: 'sqlite',
    db,
    client: sqlite,
    close: async () => {
      sqlite.close();
    },
  };
}

/**
 * Create PostgreSQL database connection
 *
 * Uses postgres driver with connection pooling
 */
function createPostgreSQLConnection(): DatabaseConnection {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for PostgreSQL connection');
  }

  // Create postgres client with connection pooling
  const client = postgres(connectionString, {
    max: 10, // Maximum connection pool size
    idle_timeout: 20,
    connect_timeout: 10,
  });

  // Create Drizzle instance
  const db = drizzlePg(client, { schema });

  return {
    type: 'postgresql',
    db,
    client,
    close: async () => {
      await client.end();
    },
  };
}

/**
 * Get or create database connection (singleton pattern)
 *
 * Automatically selects database type based on environment variables.
 * Creates and caches the connection on first call.
 *
 * @returns DatabaseConnection instance
 *
 * @throws Error if connection fails
 *
 * @example
 * ```ts
 * import { getDb } from './db/connection.js';
 *
 * const { db, type } = getDb();
 * console.log(`Using ${type} database`);
 * ```
 */
export function getDb(): DatabaseConnection {
  if (dbInstance) {
    return dbInstance;
  }

  const dbType = getDatabaseType();

  try {
    if (dbType === 'postgresql') {
      dbInstance = createPostgreSQLConnection();
    } else {
      dbInstance = createSQLiteConnection();
    }

    return dbInstance;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to create database connection: ${errorMessage}`);
  }
}

/**
 * Close database connection
 *
 * Should be called on application shutdown to clean up resources.
 *
 * @example
 * ```ts
 * import { closeDb } from './db/connection.js';
 *
 * process.on('SIGTERM', async () => {
 *   await closeDb();
 *   process.exit(0);
 * });
 * ```
 */
export async function closeDb(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Test database connection
 *
 * Executes a simple query to verify the connection is working.
 *
 * @returns true if connection is healthy, false otherwise
 *
 * @example
 * ```ts
 * import { testConnection } from './db/connection.js';
 *
 * const isHealthy = await testConnection();
 * if (!isHealthy) {
 *   console.error('Database connection failed');
 * }
 * ```
 */
export async function testConnection(): Promise<boolean> {
  try {
    const { client, type } = getDb();

    if (type === 'sqlite') {
      // SQLite: Run a simple query through the native client
      (client as Database).exec('SELECT 1');
    } else {
      // PostgreSQL: Run a simple query through the postgres client
      await (client as postgres.Sql<Record<string, unknown>>)`SELECT 1`;
    }

    return true;
  } catch {
    return false;
  }
}
