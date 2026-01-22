import { DatabaseStorage } from './database.js';
import { FileStorage } from './file.js';
import type { IStorage } from './interface.js';
import { isHealthy } from '../db/health.js';

/**
 * Fallback manager configuration
 *
 * Controls the behavior of automatic fallback to file storage
 * and periodic reconnection attempts to the database.
 */
export interface FallbackConfig {
  /** Enable automatic fallback to file storage on database failure (default: true) */
  enabled?: boolean;
  /** Interval between reconnection attempts in milliseconds (default: 60000 = 1 minute) */
  retryIntervalMs?: number;
  /** Maximum number of reconnection attempts (default: 0 = infinite retries) */
  maxRetries?: number;
  /** Enable detailed logging of fallback events (default: true) */
  verboseLogging?: boolean;
}

/**
 * Fallback manager state
 */
interface FallbackState {
  /** Whether we are currently in fallback mode (using file storage) */
  isInFallback: boolean;
  /** Number of reconnection attempts made */
  retryCount: number;
  /** Timestamp of last reconnection attempt */
  lastRetryAt?: Date;
  /** Timer ID for periodic reconnection attempts */
  retryTimer?: NodeJS.Timeout;
}

/**
 * Default fallback configuration
 */
const DEFAULT_CONFIG: Required<FallbackConfig> = {
  enabled: true,
  retryIntervalMs: 60000, // 1 minute
  maxRetries: 0, // Infinite retries
  verboseLogging: true,
};

/**
 * Fallback manager for graceful degradation
 *
 * Manages automatic fallback to file-based storage when database is unavailable,
 * and periodic reconnection attempts to recover database functionality.
 *
 * @example
 * ```ts
 * import { FallbackManager } from './storage/fallback.js';
 *
 * const manager = new FallbackManager();
 * await manager.initialize(async (storage) => {
 *   // Use the storage (database or file based on availability)
 *   const apiKey = await storage.findApiKey('sk-1234567890');
 * });
 * ```
 */
export class FallbackManager {
  private config: Required<FallbackConfig>;
  private state: FallbackState;
  private storageInstance: IStorage | null = null;
  private onStorageChangeCallback?: (storage: IStorage) => void;

  constructor(config: FallbackConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      isInFallback: false,
      retryCount: 0,
    };
  }

  /**
   * Initialize the fallback manager
   *
   * Attempts to initialize database storage with automatic fallback to file storage.
   * Starts periodic reconnection attempts if fallback occurs.
   *
   * @param onStorageChange - Optional callback called when storage backend changes
   * @returns Promise<IStorage> - The initialized storage instance
   *
   * @throws Error if both database and file storage initialization fail
   */
  async initialize(onStorageChange?: (storage: IStorage) => void): Promise<IStorage> {
    this.onStorageChangeCallback = onStorageChange;

    // Attempt to initialize database storage first
    const databaseStorage = new DatabaseStorage();

    try {
      await databaseStorage.initialize();
      this.storageInstance = databaseStorage;
      this.state.isInFallback = false;

      if (this.config.verboseLogging) {
        console.log('Storage: Database storage initialized successfully');
      }

      return this.storageInstance;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (!this.config.enabled) {
        // Fallback is disabled, throw the error
        throw new Error(`Database initialization failed and fallback is disabled: ${errorMessage}`);
      }

      // Fallback to file storage
      console.warn(
        `Storage: Database initialization failed (${errorMessage})\n` +
        'Falling back to file-based storage. Starting periodic reconnection attempts...'
      );

      const fileStorage = new FileStorage();

      try {
        await fileStorage.initialize();
        this.storageInstance = fileStorage;
        this.state.isInFallback = true;

        if (this.onStorageChangeCallback) {
          this.onStorageChangeCallback(this.storageInstance);
        }

        // Start periodic reconnection attempts
        this.startReconnectionAttempts();

        return this.storageInstance;
      } catch (fallbackError) {
        const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown error';
        throw new Error(
          `Failed to initialize both database and file storage.\n` +
          `Database error: ${errorMessage}\n` +
          `File storage error: ${fallbackErrorMessage}`
        );
      }
    }
  }

  /**
   * Start periodic reconnection attempts
   *
   * @private
   */
  private startReconnectionAttempts(): void {
    if (this.state.retryTimer) {
      // Timer already running
      return;
    }

    if (this.config.verboseLogging) {
      console.log(
        `Storage: Starting periodic reconnection attempts every ${this.config.retryIntervalMs}ms ` +
        `(max retries: ${this.config.maxRetries === 0 ? 'unlimited' : this.config.maxRetries})`
      );
    }

    this.state.retryTimer = setInterval(
      async () => {
        await this.attemptReconnection();
      },
      this.config.retryIntervalMs
    );
  }

  /**
   * Stop periodic reconnection attempts
   */
  stopReconnectionAttempts(): void {
    if (this.state.retryTimer) {
      clearInterval(this.state.retryTimer);
      this.state.retryTimer = undefined;

      if (this.config.verboseLogging) {
        console.log('Storage: Stopped periodic reconnection attempts');
      }
    }
  }

  /**
   * Attempt to reconnect to the database
   *
   * @private
   */
  private async attemptReconnection(): Promise<void> {
    // Check if we've exceeded max retries
    if (this.config.maxRetries > 0 && this.state.retryCount >= this.config.maxRetries) {
      this.stopReconnectionAttempts();
      console.warn(
        `Storage: Maximum reconnection attempts (${this.config.maxRetries}) reached. ` +
        'Stopping periodic retries. Use resetStorage() to retry.'
      );
      return;
    }

    this.state.retryCount++;
    this.state.lastRetryAt = new Date();

    if (this.config.verboseLogging) {
      console.log(`Storage: Reconnection attempt ${this.state.retryCount}...`);
    }

    try {
      // Check if database is healthy
      const healthy = await isHealthy();

      if (healthy) {
        // Database is back online, switch to database storage
        await this.switchToDatabaseStorage();
      } else {
        if (this.config.verboseLogging) {
          console.log('Storage: Database still unavailable, will retry later');
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (this.config.verboseLogging) {
        console.warn(`Storage: Reconnection attempt failed: ${errorMessage}`);
      }
    }
  }

  /**
   * Switch to database storage
   *
   * @private
   */
  private async switchToDatabaseStorage(): Promise<void> {
    try {
      const databaseStorage = new DatabaseStorage();
      await databaseStorage.initialize();

      // Stop reconnection attempts
      this.stopReconnectionAttempts();

      // Update storage instance
      this.storageInstance = databaseStorage;
      this.state.isInFallback = false;
      this.state.retryCount = 0;

      console.log(
        'Storage: Database reconnected successfully! ' +
        'Switched back to database storage.'
      );

      // Notify callback if registered
      if (this.onStorageChangeCallback) {
        this.onStorageChangeCallback(this.storageInstance);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Storage: Failed to switch to database storage: ${errorMessage}`);
    }
  }

  /**
   * Get the current storage instance
   *
   * @returns The current storage instance (database or file based on availability)
   */
  getStorage(): IStorage {
    if (!this.storageInstance) {
      throw new Error('Storage not initialized. Call await initialize() first.');
    }
    return this.storageInstance;
  }

  /**
   * Get the current fallback state
   *
   * @returns The current fallback state
   */
  getState(): Readonly<FallbackState> {
    return { ...this.state };
  }

  /**
   * Reset the fallback manager
   *
   * Stops reconnection attempts and clears the storage instance.
   * Useful for testing or configuration changes.
   */
  reset(): void {
    this.stopReconnectionAttempts();
    this.storageInstance = null;
    this.state = {
      isInFallback: false,
      retryCount: 0,
    };
  }

  /**
   * Check if currently in fallback mode
   *
   * @returns true if using file storage due to database failure
   */
  isInFallback(): boolean {
    return this.state.isInFallback;
  }
}

/**
 * Load fallback configuration from environment variables
 *
 * Environment variables:
 * - STORAGE_FALLBACK_ENABLED: Enable/disable automatic fallback (default: true)
 * - STORAGE_FALLBACK_RETRY_INTERVAL_MS: Reconnection attempt interval in milliseconds (default: 60000)
 * - STORAGE_FALLBACK_MAX_RETRIES: Maximum number of reconnection attempts (default: 0 = unlimited)
 * - STORAGE_FALLBACK_VERBOSE_LOGGING: Enable detailed logging (default: true)
 *
 * @returns Fallback configuration from environment variables
 *
 * @example
 * ```ts
 * import { loadFallbackConfigFromEnv } from './storage/fallback.js';
 *
 * const config = loadFallbackConfigFromEnv();
 * const manager = new FallbackManager(config);
 * ```
 */
export function loadFallbackConfigFromEnv(): FallbackConfig {
  return {
    enabled: process.env.STORAGE_FALLBACK_ENABLED !== 'false',
    retryIntervalMs: parseInt(process.env.STORAGE_FALLBACK_RETRY_INTERVAL_MS || '60000', 10),
    maxRetries: parseInt(process.env.STORAGE_FALLBACK_MAX_RETRIES || '0', 10),
    verboseLogging: process.env.STORAGE_FALLBACK_VERBOSE_LOGGING !== 'false',
  };
}
