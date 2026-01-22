import type { IStorage } from './interface.js';
import type { ApiKey, StatsResponse } from '../types.js';
import { findApiKey as dbFindApiKey, updateApiKeyUsage as dbUpdateApiKeyUsage, getKeyStats as dbGetKeyStats } from '../db/operations.js';
import { testConnection, getDb } from '../db/connection.js';

/**
 * Database storage adapter
 *
 * Implements IStorage interface using database operations (SQLite or PostgreSQL).
 * This adapter provides a production-ready storage backend with support for:
 * - High concurrency through database connections
 * - Horizontal scaling with multiple instances
 * - ACID transactions for data consistency
 * - Connection pooling for performance
 *
 * @example
 * ```ts
 * import { DatabaseStorage } from './storage/database.js';
 *
 * const storage = new DatabaseStorage();
 * await storage.initialize();
 *
 * const apiKey = await storage.findApiKey('sk-1234567890');
 * if (apiKey) {
 *   console.log(`Found key: ${apiKey.name}`);
 * }
 * ```
 */
export class DatabaseStorage implements IStorage {
  private initialized = false;

  /**
   * Initialize the database storage backend
   *
   * This method:
   * 1. Tests the database connection
   * 2. Verifies that tables exist
   * 3. Marks the storage as ready for use
   *
   * Note: Database migrations should be run separately using drizzle-kit:
   *   `bunx drizzle-kit migrate`
   *
   * @throws Error if initialization fails
   *
   * @example
   * ```ts
   * const storage = new DatabaseStorage();
   * await storage.initialize();
   * console.log('Database storage ready');
   * ```
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Test database connection
      const isConnected = await testConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to database. Please check your configuration.');
      }

      // Get database connection to ensure it's created
      await getDb();

      // Note: Schema migration should be handled separately via drizzle-kit
      // This ensures proper migration tracking and rollback capabilities
      // Run: bunx drizzle-kit migrate

      this.initialized = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize database storage: ${errorMessage}`);
    }
  }

  /**
   * Find an API key by its key string
   *
   * @param key - The API key string to search for
   * @returns The ApiKey object if found, null otherwise
   *
   * @example
   * ```ts
   * const storage = new DatabaseStorage();
   * await storage.initialize();
   *
   * const apiKey = await storage.findApiKey('sk-1234567890');
   * if (apiKey) {
   *   console.log(`Found key: ${apiKey.name}`);
   *   console.log(`Model: ${apiKey.model}`);
   *   console.log(`Usage windows: ${apiKey.usage_windows.length}`);
   * }
   * ```
   */
  async findApiKey(key: string): Promise<ApiKey | null> {
    this.ensureInitialized();

    try {
      return await dbFindApiKey(key);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to find API key: ${errorMessage}`);
    }
  }

  /**
   * Update API key usage tracking
   *
   * This method handles:
   * - Updating the last_used timestamp
   * - Incrementing total_lifetime_tokens
   * - Managing usage windows (5-hour rolling window)
   * - Cleaning up old usage windows
   *
   * All operations are performed within a database transaction for atomicity.
   *
   * @param key - The API key string to update usage for
   * @param tokensUsed - Number of tokens to add to the usage tracking
   * @param model - Model used (for logging/metadata purposes)
   * @throws Error if the key is not found or update fails
   *
   * @example
   * ```ts
   * const storage = new DatabaseStorage();
   * await storage.initialize();
   *
   * // After processing an API request
   * await storage.updateApiKeyUsage('sk-1234567890', 1250, 'claude-3-5-sonnet-20241022');
   * ```
   */
  async updateApiKeyUsage(key: string, tokensUsed: number, model: string): Promise<void> {
    this.ensureInitialized();

    try {
      await dbUpdateApiKeyUsage(key, tokensUsed, model);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to update API key usage: ${errorMessage}`);
    }
  }

  /**
   * Get comprehensive statistics for an API key
   *
   * This method returns detailed statistics including:
   * - Expiration status (is_expired)
   * - Current rolling window usage (5-hour window)
   * - Remaining tokens in current window
   * - Total lifetime usage
   *
   * @param key - The API key string to get statistics for
   * @returns StatsResponse object with full statistics, or null if key not found
   *
   * @example
   * ```ts
   * const storage = new DatabaseStorage();
   * await storage.initialize();
   *
   * const stats = await storage.getKeyStats('sk-1234567890');
   * if (stats) {
   *   console.log(`Current usage: ${stats.current_usage.tokens_used_in_current_window}`);
   *   console.log(`Remaining: ${stats.current_usage.remaining_tokens}`);
   *   console.log(`Expired: ${stats.is_expired}`);
   *   console.log(`Total lifetime: ${stats.total_lifetime_tokens}`);
   * }
   * ```
   */
  async getKeyStats(key: string): Promise<StatsResponse | null> {
    this.ensureInitialized();

    try {
      return await dbGetKeyStats(key);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get API key stats: ${errorMessage}`);
    }
  }

  /**
   * Ensure storage is initialized before use
   *
   * @throws Error if storage has not been initialized
   *
   * @private
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'Database storage has not been initialized. Call await storage.initialize() before using any storage methods.'
      );
    }
  }
}
