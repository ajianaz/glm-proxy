import fs from 'fs';
import path from 'path';
import type { IStorage } from './interface.js';
import type { ApiKey, ApiKeysData, StatsResponse } from '../types.js';

/**
 * File-based storage adapter
 *
 * Implements IStorage interface using JSON file storage. This adapter provides:
 * - Simple deployment (no external dependencies)
 * - Easy inspection and debugging
 * - Backward compatibility with existing file-based storage
 * - Suitable for single-instance deployments
 *
 * @example
 * ```ts
 * import { FileStorage } from './storage/file.js';
 *
 * const storage = new FileStorage();
 * await storage.initialize();
 *
 * const apiKey = await storage.findApiKey('sk-1234567890');
 * if (apiKey) {
 *   console.log(`Found key: ${apiKey.name}`);
 * }
 * ```
 */
export class FileStorage implements IStorage {
  private dataFile: string;
  private lockFile: string;
  private initialized = false;

  /**
   * Create a new FileStorage instance
   *
   * @param dataFile - Optional path to the data file. Defaults to DATA_FILE env var or ./data/apikeys.json
   *
   * @example
   * ```ts
   * // Use default location
   * const storage = new FileStorage();
   *
   * // Use custom location
   * const customStorage = new FileStorage('./custom/keys.json');
   * ```
   */
  constructor(dataFile?: string) {
    this.dataFile = dataFile || process.env.DATA_FILE || path.join(process.cwd(), 'data/apikeys.json');
    this.lockFile = this.dataFile + '.lock';
  }

  /**
   * Initialize the file-based storage backend
   *
   * This method:
   * 1. Creates the data directory if it doesn't exist
   * 2. Creates the data file if it doesn't exist (with empty keys array)
   * 3. Marks the storage as ready for use
   *
   * @throws Error if initialization fails (e.g., permission issues)
   *
   * @example
   * ```ts
   * const storage = new FileStorage();
   * await storage.initialize();
   * console.log('File storage ready');
   * ```
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dataFile);
      if (!fs.existsSync(dataDir)) {
        await fs.promises.mkdir(dataDir, { recursive: true });
      }

      // Create data file if it doesn't exist
      if (!fs.existsSync(this.dataFile)) {
        const initialData: ApiKeysData = { keys: [] };
        await fs.promises.writeFile(this.dataFile, JSON.stringify(initialData, null, 2), 'utf-8');
      }

      this.initialized = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to initialize file storage: ${errorMessage}`);
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
   * const storage = new FileStorage();
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
      return await this.withLock(async () => {
        const data = await this.readApiKeys();
        return data.keys.find(k => k.key === key) || null;
      });
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
   * All operations are performed within a file lock to prevent race conditions.
   *
   * @param key - The API key string to update usage for
   * @param tokensUsed - Number of tokens to add to the usage tracking
   * @param model - Model used (currently not stored but kept for interface compatibility)
   * @throws Error if the key is not found or update fails
   *
   * @example
   * ```ts
   * const storage = new FileStorage();
   * await storage.initialize();
   *
   * // After processing an API request
   * await storage.updateApiKeyUsage('sk-1234567890', 1250, 'claude-3-5-sonnet-20241022');
   * ```
   */
  async updateApiKeyUsage(key: string, tokensUsed: number, _model: string): Promise<void> {
    this.ensureInitialized();

    try {
      await this.withLock(async () => {
        const data = await this.readApiKeys();
        const keyIndex = data.keys.findIndex(k => k.key === key);

        if (keyIndex === -1) {
          throw new Error(`API key not found: ${key}`);
        }

        const apiKey = data.keys[keyIndex];
        const now = new Date().toISOString();

        // Update last_used and total tokens
        apiKey.last_used = now;
        apiKey.total_lifetime_tokens += tokensUsed;

        // Find or create current window
        const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
        let currentWindow = apiKey.usage_windows.find(
          w => w.window_start >= fiveHoursAgo
        );

        if (!currentWindow) {
          currentWindow = { window_start: now, tokens_used: 0 };
          apiKey.usage_windows.push(currentWindow);
        }

        currentWindow.tokens_used += tokensUsed;

        // Clean up old windows
        apiKey.usage_windows = apiKey.usage_windows.filter(
          w => w.window_start >= fiveHoursAgo
        );

        await this.writeApiKeys(data);
      });
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
   * const storage = new FileStorage();
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
      const apiKey = await this.findApiKey(key);

      if (!apiKey) {
        return null;
      }

      // Calculate if key is expired
      const now = new Date();
      const expiryDate = new Date(apiKey.expiry_date);
      const isExpired = expiryDate < now;

      // Get current window (most recent window within 5 hours)
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
      const currentWindow = apiKey.usage_windows.find(w => {
        const windowStart = new Date(w.window_start);
        return windowStart >= new Date(fiveHoursAgo);
      });

      // Calculate current window usage
      const tokensUsedInCurrentWindow = currentWindow?.tokens_used ?? 0;
      const windowStartedAt = currentWindow?.window_start ?? apiKey.last_used;
      const windowEndsAt = currentWindow
        ? new Date(new Date(currentWindow.window_start).getTime() + 5 * 60 * 60 * 1000).toISOString()
        : new Date(new Date(apiKey.last_used).getTime() + 5 * 60 * 60 * 1000).toISOString();

      const remainingTokens = Math.max(0, apiKey.token_limit_per_5h - tokensUsedInCurrentWindow);

      // Map to StatsResponse interface
      return {
        key: apiKey.key,
        name: apiKey.name,
        model: apiKey.model || '',
        token_limit_per_5h: apiKey.token_limit_per_5h,
        expiry_date: apiKey.expiry_date,
        created_at: apiKey.created_at,
        last_used: apiKey.last_used,
        is_expired: isExpired,
        current_usage: {
          tokens_used_in_current_window: tokensUsedInCurrentWindow,
          window_started_at: windowStartedAt,
          window_ends_at: windowEndsAt,
          remaining_tokens: remainingTokens,
        },
        total_lifetime_tokens: apiKey.total_lifetime_tokens,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to get API key stats: ${errorMessage}`);
    }
  }

  /**
   * Execute a function with file locking to prevent concurrent access
   *
   * Uses a simple file lock mechanism with mkdir (atomic on Unix).
   * Retries up to 10 times with 50ms delay between retries.
   *
   * @param fn - Async function to execute while holding the lock
   * @returns The result of the function
   *
   * @private
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const maxRetries = 10;
    const retryDelay = 50;

    for (let i = 0; i < maxRetries; i++) {
      try {
        fs.mkdirSync(this.lockFile, { mode: 0o755 });
        break;
      } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || i === maxRetries - 1) throw e;
        await new Promise(r => setTimeout(r, retryDelay));
      }
    }

    try {
      return await fn();
    } finally {
      fs.rmdirSync(this.lockFile);
    }
  }

  /**
   * Read API keys from the data file
   *
   * @returns Parsed API keys data
   *
   * @private
   */
  private async readApiKeys(): Promise<ApiKeysData> {
    try {
      const content = await fs.promises.readFile(this.dataFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return { keys: [] };
    }
  }

  /**
   * Write API keys to the data file
   *
   * Uses atomic write (write to temp file, then rename) to prevent corruption.
   *
   * @param data - API keys data to write
   *
   * @private
   */
  private async writeApiKeys(data: ApiKeysData): Promise<void> {
    const tempFile = this.dataFile + '.tmp';
    await fs.promises.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    await fs.promises.rename(tempFile, this.dataFile);
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
        'File storage has not been initialized. Call await storage.initialize() before using any storage methods.'
      );
    }
  }
}
