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
 * Retry options for database connection attempts
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds before first retry (default: 1000ms) */
  initialDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Maximum delay between retries in milliseconds (default: 10000ms) */
  maxDelayMs?: number;
  /** Whether to log retry attempts (default: true) */
  silent?: boolean;
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000,
  silent: false,
};

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
 * Calculate delay for exponential backoff retry
 *
 * @param attempt - The current attempt number (0-indexed)
 * @param options - Retry options
 * @returns Delay in milliseconds before next retry
 */
function calculateRetryDelay(attempt: number, options: Required<RetryOptions>): number {
  const exponentialDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  const clampedDelay = Math.min(exponentialDelay, options.maxDelayMs);
  return clampedDelay;
}

/**
 * Execute a function with exponential backoff retry logic
 *
 * This function wraps a potentially failing operation (like database connection)
 * with retry logic using exponential backoff. It will:
 * - Attempt the operation up to maxRetries times
 * - Use exponential backoff between attempts (e.g., 1s, 2s, 4s, 8s...)
 * - Log retry attempts unless silent mode is enabled
 * - Throw the last error if all attempts fail
 *
 * @param fn - Async function to execute
 * @param context - Description of the operation for error messages
 * @param options - Retry options
 * @returns Result of the function execution
 * @throws Error if all retry attempts fail
 *
 * @example
 * ```ts
 * const result = await withRetry(
 *   async () => connectToDatabase(),
 *   'database connection',
 *   { maxRetries: 5, initialDelayMs: 2000 }
 * );
 * ```
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  context: string,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If this is the last attempt, don't wait/delay
      if (attempt === opts.maxRetries) {
        break;
      }

      // Calculate delay for this attempt
      const delay = calculateRetryDelay(attempt, opts);

      // Log retry attempt
      if (!opts.silent) {
        console.warn(
          `Database ${context} failed (attempt ${attempt + 1}/${opts.maxRetries + 1}): ${lastError.message}. Retrying in ${delay}ms...`
        );
      }

      // Wait before next retry
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  throw new Error(
    `Failed to ${context} after ${opts.maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Load retry options from environment variables
 *
 * Environment variables:
 * - DB_RETRY_MAX: Maximum retry attempts (default: 3)
 * - DB_RETRY_DELAY_MS: Initial delay in milliseconds (default: 1000)
 * - DB_RETRY_BACKOFF: Backoff multiplier (default: 2)
 * - DB_RETRY_MAX_DELAY_MS: Maximum delay in milliseconds (default: 10000)
 * - DB_RETRY_SILENT: Silent mode (true/false, default: false)
 *
 * @returns Retry options from environment variables
 */
export function getRetryOptionsFromEnv(): RetryOptions {
  const options: RetryOptions = {};

  if (process.env.DB_RETRY_MAX) {
    const maxRetries = parseInt(process.env.DB_RETRY_MAX, 10);
    if (!isNaN(maxRetries) && maxRetries >= 0) {
      options.maxRetries = maxRetries;
    }
  }

  if (process.env.DB_RETRY_DELAY_MS) {
    const delayMs = parseInt(process.env.DB_RETRY_DELAY_MS, 10);
    if (!isNaN(delayMs) && delayMs >= 0) {
      options.initialDelayMs = delayMs;
    }
  }

  if (process.env.DB_RETRY_BACKOFF) {
    const multiplier = parseFloat(process.env.DB_RETRY_BACKOFF);
    if (!isNaN(multiplier) && multiplier > 0) {
      options.backoffMultiplier = multiplier;
    }
  }

  if (process.env.DB_RETRY_MAX_DELAY_MS) {
    const maxDelay = parseInt(process.env.DB_RETRY_MAX_DELAY_MS, 10);
    if (!isNaN(maxDelay) && maxDelay >= 0) {
      options.maxDelayMs = maxDelay;
    }
  }

  if (process.env.DB_RETRY_SILENT === 'true') {
    options.silent = true;
  }

  return options;
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
 * Uses exponential backoff retry logic if connection fails, with configurable
 * retry parameters via environment variables:
 * - DB_RETRY_MAX: Maximum retry attempts (default: 3)
 * - DB_RETRY_DELAY_MS: Initial delay in milliseconds (default: 1000)
 * - DB_RETRY_BACKOFF: Backoff multiplier (default: 2)
 * - DB_RETRY_MAX_DELAY_MS: Maximum delay in milliseconds (default: 10000)
 * - DB_RETRY_SILENT: Silent mode (true/false, default: false)
 *
 * @returns DatabaseConnection instance
 *
 * @throws Error if connection fails after all retry attempts
 *
 * @example
 * ```ts
 * import { getDb } from './db/connection.js';
 *
 * const { db, type } = getDb();
 * console.log(`Using ${type} database`);
 * ```
 */
export async function getDb(): Promise<DatabaseConnection> {
  if (dbInstance) {
    return dbInstance;
  }

  const dbType = getDatabaseType();
  const retryOptions = getRetryOptionsFromEnv();

  const connection = await withRetry(async () => {
    if (dbType === 'postgresql') {
      return createPostgreSQLConnection();
    } else {
      return createSQLiteConnection();
    }
  }, `create ${dbType} connection`, retryOptions);

  dbInstance = connection;
  return connection;
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
 * Reset database connection instance
 *
 * This function clears the singleton database connection, allowing getDb()
 * to create a new instance on the next call. This is primarily useful for:
 * - Testing (resetting connections between tests)
 * - Configuration changes (switching databases at runtime)
 *
 * Note: This does not close the existing connection. Use closeDb() first
 * if you need to properly clean up resources.
 *
 * @example
 * ```ts
 * import { resetDb, getDb } from './db/connection.js';
 *
 * // Get database connection
 * const db1 = await getDb();
 *
 * // Reset the instance
 * resetDb();
 *
 * // Get a new instance (with new configuration if env vars changed)
 * const db2 = await getDb();
 *
 * console.log(db1 === db2); // false (different instances)
 * ```
 */
export function resetDb(): void {
  dbInstance = null;
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
    const { client, type } = await getDb();

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
