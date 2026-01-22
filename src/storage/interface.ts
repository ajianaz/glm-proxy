import type { ApiKey, StatsResponse } from '../types.js';

/**
 * Storage interface for API key management
 *
 * This interface defines the contract for storage implementations, allowing
 * the application to switch between different storage backends (file-based,
 * SQLite, PostgreSQL) without changing the consuming code.
 *
 * @example
 * ```ts
 * import { getStorage } from './storage/index.js';
 *
 * const storage = await getStorage();
 * const apiKey = await storage.findApiKey('sk-1234567890');
 * ```
 */
export interface IStorage {
  /**
   * Find an API key by its key string
   *
   * @param key - The API key string to search for
   * @returns The ApiKey object if found, null otherwise
   *
   * @example
   * ```ts
   * const apiKey = await storage.findApiKey('sk-1234567890');
   * if (apiKey) {
   *   console.log(`Found key: ${apiKey.name}`);
   * }
   * ```
   */
  findApiKey(key: string): Promise<ApiKey | null>;

  /**
   * Update API key usage tracking
   *
   * This method handles:
   * - Updating the last_used timestamp
   * - Incrementing total_lifetime_tokens
   * - Managing usage windows (5-hour rolling window)
   * - Cleaning up old usage windows
   *
   * @param key - The API key string to update usage for
   * @param tokensUsed - Number of tokens to add to the usage tracking
   * @param model - Model used (for logging/metadata purposes)
   * @throws Error if the key is not found or update fails
   *
   * @example
   * ```ts
   * // After processing an API request
   * await storage.updateApiKeyUsage('sk-1234567890', 1250, 'claude-3-5-sonnet-20241022');
   * ```
   */
  updateApiKeyUsage(key: string, tokensUsed: number, model: string): Promise<void>;

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
   * const stats = await storage.getKeyStats('sk-1234567890');
   * if (stats) {
   *   console.log(`Current usage: ${stats.current_usage.tokens_used_in_current_window}`);
   *   console.log(`Remaining: ${stats.current_usage.remaining_tokens}`);
   *   console.log(`Expired: ${stats.is_expired}`);
   * }
   * ```
   */
  getKeyStats(key: string): Promise<StatsResponse | null>;

  /**
   * Initialize the storage backend
   *
   * This method should be called before using any other storage methods.
   * It prepares the storage backend for operations:
   *
   * - For file-based storage: Creates data directory and initial file if needed
   * - For database storage: Creates tables, runs migrations, establishes connections
   *
   * @throws Error if initialization fails
   *
   * @example
   * ```ts
   * const storage = getStorage();
   * await storage.initialize();
   * // Storage is now ready to use
   * ```
   */
  initialize(): Promise<void>;
}
