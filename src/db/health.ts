import { getDb, getDatabaseType } from './connection.js';

/**
 * Health check status
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Database health check result
 *
 * Provides comprehensive information about database health including
 * connection status, response time, and any errors encountered.
 */
export interface HealthCheckResult {
  /** Overall health status */
  status: HealthStatus;
  /** Database type (sqlite or postgresql) */
  databaseType: string;
  /** Whether the database connection is working */
  connected: boolean;
  /** Query response time in milliseconds */
  responseTimeMs: number;
  /** Number of API keys in the database (if query succeeded) */
  keyCount?: number;
  /** Error message if health check failed */
  error?: string;
  /** Additional details for debugging */
  details?: string;
}

/**
 * Health check options
 */
export interface HealthCheckOptions {
  /** Response time threshold in milliseconds for warnings (default: 1000ms) */
  slowQueryThreshold?: number;
  /** Whether to count API keys (adds an extra query, default: false) */
  includeKeyCount?: boolean;
}

/**
 * Default health check options
 */
const DEFAULT_OPTIONS: Required<HealthCheckOptions> = {
  slowQueryThreshold: 1000,
  includeKeyCount: false,
};

/**
 * Perform a comprehensive database health check
 *
 * This function tests database connectivity and responsiveness by:
 * 1. Testing the database connection with a simple query
 * 2. Measuring query response time
 * 3. Optionally counting API keys to verify full database functionality
 * 4. Logging warnings for slow queries
 *
 * @param options - Health check options
 * @returns HealthCheckResult with detailed health information
 *
 * @example
 * ```ts
 * import { checkHealth } from './db/health.js';
 *
 * // Basic health check
 * const health = await checkHealth();
 * if (health.status === 'healthy') {
 *   console.log('Database is healthy');
 * }
 *
 * // Health check with key count and custom threshold
 * const detailedHealth = await checkHealth({
 *   includeKeyCount: true,
 *   slowQueryThreshold: 500,
 * });
 * console.log(`Database has ${detailedHealth.keyCount} keys`);
 * ```
 */
export async function checkHealth(
  options: HealthCheckOptions = {}
): Promise<HealthCheckResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const databaseType = getDatabaseType();

  const startTime = performance.now();

  try {
    const { client, type, db } = await getDb();

    // Test connection with a simple query
    if (type === 'sqlite') {
      // SQLite: Run a simple query through the native client
      const sqliteClient = client as import('bun:sqlite').Database;
      sqliteClient.exec('SELECT 1');
    } else {
      // PostgreSQL: Run a simple query through the postgres client
      const pgClient = client as import('postgres').Sql<Record<string, unknown>>;
      await pgClient`SELECT 1`;
    }

    const responseTime = performance.now() - startTime;

    // Check for slow query warning
    if (responseTime > opts.slowQueryThreshold) {
      console.warn(
        `Database health check: Slow query detected (${responseTime.toFixed(2)}ms > ${opts.slowQueryThreshold}ms threshold)`
      );
    }

    // Optionally count API keys for additional verification
    let keyCount: number | undefined;
    if (opts.includeKeyCount) {
      try {
        // Import schema dynamically to avoid type issues
        const schemaModule = await import('./schema.js');
        const table = type === 'sqlite' ? schemaModule.sqliteApiKeys : schemaModule.pgApiKeys;

        // Use the same pattern as operations.ts
        const result = await db.select().from(table);
        keyCount = result.length;
      } catch (error) {
        // If key count query fails, we still consider the database healthy
        // as long as the basic connection test passed
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.warn(`Database health check: Failed to count API keys: ${errorMessage}`);
      }
    }

    // Determine health status based on response time
    let status: HealthStatus = 'healthy';
    if (responseTime > opts.slowQueryThreshold * 2) {
      status = 'unhealthy';
    } else if (responseTime > opts.slowQueryThreshold) {
      status = 'degraded';
    }

    return {
      status,
      databaseType,
      connected: true,
      responseTimeMs: Math.round(responseTime * 100) / 100,
      keyCount,
    };
  } catch (error) {
    const responseTime = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      status: 'unhealthy',
      databaseType,
      connected: false,
      responseTimeMs: Math.round(responseTime * 100) / 100,
      error: errorMessage,
      details: `Failed to execute health check query`,
    };
  }
}

/**
 * Quick health check that returns only the status
 *
 * This is a simplified version of checkHealth() for use cases where
 * you only need to know if the database is healthy or not.
 *
 * @returns true if database is healthy, false otherwise
 *
 * @example
 * ```ts
 * import { isHealthy } from './db/health.js';
 *
 * if (await isHealthy()) {
 *   console.log('Database is ready');
 * }
 * ```
 */
export async function isHealthy(): Promise<boolean> {
  const result = await checkHealth();
  return result.connected && result.status !== 'unhealthy';
}
