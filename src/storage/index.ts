import { DatabaseStorage } from './database.js';
import { FileStorage } from './file.js';
import { FallbackManager, loadFallbackConfigFromEnv } from './fallback.js';
import type { IStorage } from './interface.js';

/**
 * Storage factory module
 *
 * Provides a factory function to create storage instances based on environment configuration.
 * Supports:
 * - Database storage (SQLite or PostgreSQL) via DATABASE_URL or DATABASE_PATH
 * - File-based storage as default or fallback
 * - Graceful fallback from database to file storage on errors
 * - Automatic periodic reconnection attempts to recover database functionality
 * - Singleton pattern for storage instance reuse
 *
 * @module storage/index
 */

/**
 * Storage type configuration
 *
 * Determines which storage backend to use:
 * - 'database': Use database storage (SQLite or PostgreSQL based on DATABASE_URL/DATABASE_PATH)
 * - 'file': Use file-based storage
 * - undefined: Auto-detect based on environment (defaults to file for backward compatibility)
 */
type StorageType = 'database' | 'file' | undefined;

/**
 * Global storage instance (singleton pattern)
 *
 * The storage instance is created once and reused across all calls to getStorage().
 * This ensures that:
 * - Initialization happens only once
 * - Database connections are reused
 * - File locks are managed consistently
 */
let storageInstance: IStorage | null = null;

/**
 * Global fallback manager instance
 *
 * Manages graceful degradation to file storage and periodic reconnection attempts.
 */
let fallbackManager: FallbackManager | null = null;

/**
 * Get or create the storage instance based on environment configuration
 *
 * This factory function:
 * 1. Checks for existing singleton instance and returns it if available
 * 2. Determines storage type based on environment:
 *    - If DATABASE_URL is set → DatabaseStorage (PostgreSQL) with fallback manager
 *    - If DATABASE_PATH is set → DatabaseStorage (SQLite) with fallback manager
 *    - If STORAGE_TYPE is 'database' → DatabaseStorage with fallback manager
 *    - Otherwise → FileStorage (default for backward compatibility)
 * 3. Creates and initializes the storage instance
 * 4. If using database storage, uses FallbackManager for graceful degradation:
 *    - Falls back to FileStorage if DatabaseStorage fails to initialize
 *    - Periodically attempts to reconnect to the database
 *    - Automatically switches back to database storage when it becomes available
 * 5. Returns the initialized storage instance
 *
 * @returns Promise<IStorage> - The initialized storage instance
 *
 * @throws Error if both database and file storage initialization fail
 *
 * @example
 * ```ts
 * import { getStorage } from './storage/index.js';
 *
 * // First call initializes storage
 * const storage1 = await getStorage();
 *
 * // Subsequent calls return the same instance
 * const storage2 = await getStorage();
 *
 * console.log(storage1 === storage2); // true (singleton)
 *
 * // Use the storage
 * const apiKey = await storage.findApiKey('sk-1234567890');
 * ```
 *
 * @example
 * ```ts
 * // Environment-based selection
 *
 * // Use PostgreSQL (set DATABASE_URL in .env)
 * // DATABASE_URL=postgres://user:password@localhost:5432/glm_proxy
 * const storage = await getStorage(); // → DatabaseStorage (PostgreSQL) with fallback
 *
 * // Use SQLite (set DATABASE_PATH in .env)
 * // DATABASE_PATH=./data/sqlite.db
 * const storage = await getStorage(); // → DatabaseStorage (SQLite) with fallback
 *
 * // Force database storage (set STORAGE_TYPE)
 * // STORAGE_TYPE=database
 * const storage = await getStorage(); // → DatabaseStorage with fallback
 *
 * // Force file storage
 * // STORAGE_TYPE=file
 * const storage = await getStorage(); // → FileStorage (no fallback)
 *
 * // Default (no env vars)
 * const storage = await getStorage(); // → FileStorage (backward compatible)
 * ```
 *
 * @example
 * ```ts
 * // Graceful fallback behavior with automatic reconnection
 *
 * // If DATABASE_URL is set but database connection fails:
 * // 1. FallbackManager attempts to initialize DatabaseStorage
 * // 2. Logs a warning about database connection failure
 * // 3. Falls back to FileStorage
 * // 4. Starts periodic reconnection attempts (default: every 60 seconds)
 * // 5. Application continues working with file storage
 * // 6. When database becomes available, automatically switches back
 *
 * const storage = await getStorage();
 * // storage is initially FileStorage instance (fallback)
 * // ... after database recovers ...
 * // storage automatically switches back to DatabaseStorage
 * ```
 */
export async function getStorage(): Promise<IStorage> {
  // Return existing instance if available (singleton pattern)
  if (storageInstance) {
    return storageInstance;
  }

  // Determine storage type based on environment configuration
  const hasDatabaseUrl = process.env.DATABASE_URL;
  const hasDatabasePath = process.env.DATABASE_PATH;
  const storageType = process.env.STORAGE_TYPE as StorageType;

  // Use database storage if:
  // 1. DATABASE_URL is set (PostgreSQL)
  // 2. DATABASE_PATH is set (SQLite)
  // 3. STORAGE_TYPE is explicitly set to 'database'
  const shouldUseDatabase = hasDatabaseUrl || hasDatabasePath || storageType === 'database';

  // Force file storage if STORAGE_TYPE is explicitly set to 'file'
  const shouldUseFile = storageType === 'file';

  if (shouldUseFile) {
    // Explicitly configured to use file storage (no fallback manager)
    const storage = new FileStorage();
    await storage.initialize();
    storageInstance = storage;
    return storageInstance;
  }

  if (shouldUseDatabase) {
    // Use database storage with fallback manager
    const config = loadFallbackConfigFromEnv();

    if (!config.enabled) {
      // Fallback is disabled, use database storage directly
      const storage = new DatabaseStorage();
      await storage.initialize();
      storageInstance = storage;
      return storageInstance;
    }

    // Fallback is enabled, use FallbackManager
    fallbackManager = new FallbackManager(config);

    storageInstance = await fallbackManager.initialize((newStorage) => {
      // Update the singleton reference when storage changes
      // This ensures that all future getStorage() calls get the new instance
      storageInstance = newStorage;
    });

    return storageInstance;
  }

  // Default to file storage for backward compatibility
  const storage = new FileStorage();
  await storage.initialize();
  storageInstance = storage;
  return storageInstance;
}

/**
 * Reset the storage instance
 *
 * This function clears the singleton storage instance and fallback manager,
 * allowing getStorage() to create a new instance on the next call. This is primarily useful for:
 * - Testing (resetting storage between tests)
 * - Configuration changes (switching storage backends at runtime)
 *
 * Note: This does not close any open database connections or clean up resources.
 * The old storage instance will be garbage collected when no longer referenced.
 * This also stops any periodic reconnection attempts from the fallback manager.
 *
 * @example
 * ```ts
 * import { getStorage, resetStorage } from './storage/index.js';
 *
 * // Get storage instance
 * const storage1 = await getStorage();
 *
 * // Reset the instance
 * resetStorage();
 *
 * // Get a new instance (with new configuration if env vars changed)
 * const storage2 = await getStorage();
 *
 * console.log(storage1 === storage2); // false (different instances)
 * ```
 */
export function resetStorage(): void {
  // Stop fallback manager if running
  if (fallbackManager) {
    fallbackManager.reset();
    fallbackManager = null;
  }

  storageInstance = null;
}

/**
 * Get the current storage type without creating an instance
 *
 * This function examines the environment configuration and returns which storage
 * type would be used by getStorage() without actually initializing it.
 *
 * Useful for:
 * - Health checks (determining which backend is configured)
 * - Documentation (showing current configuration)
 * - Debugging (verifying environment setup)
 *
 * @returns 'database' | 'file' - The storage type that would be used
 *
 * @example
 * ```ts
 * import { getStorageType } from './storage/index.js';
 *
 * const type = getStorageType();
 * console.log(`Configured storage: ${type}`);
 * // Output: "Configured storage: database" or "Configured storage: file"
 * ```
 */
export function getStorageType(): 'database' | 'file' {
  const hasDatabaseUrl = process.env.DATABASE_URL;
  const hasDatabasePath = process.env.DATABASE_PATH;
  const storageType = process.env.STORAGE_TYPE as StorageType;

  if (storageType === 'file') {
    return 'file';
  }

  if (hasDatabaseUrl || hasDatabasePath || storageType === 'database') {
    return 'database';
  }

  return 'file';
}

/**
 * Check if the storage is currently in fallback mode (using file storage due to database failure)
 *
 * This function returns the fallback state without creating a storage instance.
 * Returns false if:
 * - Storage hasn't been initialized yet
 * - Storage is configured to use file storage explicitly
 * - Storage is using database storage successfully
 *
 * @returns true if currently in fallback mode (using file storage due to database failure)
 *
 * @example
 * ```ts
 * import { getStorage, isInFallbackMode } from './storage/index.js';
 *
 * await getStorage(); // Initialize storage
 *
 * if (isInFallbackMode()) {
 *   console.log('Warning: Using file storage due to database failure');
 *   console.log('Periodic reconnection attempts are active');
 * }
 * ```
 */
export function isInFallbackMode(): boolean {
  return fallbackManager?.isInFallback() ?? false;
}

/**
 * Get the current fallback state details
 *
 * This function returns detailed information about the fallback manager state
 * without creating a storage instance. Returns undefined if fallback manager
 * is not active (e.g., file storage is configured explicitly).
 *
 * @returns Fallback state details or undefined if not applicable
 *
 * @example
 * ```ts
 * import { getStorage, getFallbackState } from './storage/index.js';
 *
 * await getStorage(); // Initialize storage
 *
 * const state = getFallbackState();
 * if (state) {
 *   console.log(`In fallback mode: ${state.isInFallback}`);
 *   console.log(`Reconnection attempts: ${state.retryCount}`);
 *   console.log(`Last retry: ${state.lastRetryAt}`);
 * }
 * ```
 */
export function getFallbackState() {
  if (!fallbackManager) {
    return undefined;
  }
  return fallbackManager.getState();
}

// Re-export storage types and implementations for convenience
export type { IStorage } from './interface.js';
export { DatabaseStorage } from './database.js';
export { FileStorage } from './file.js';
export { FallbackManager, loadFallbackConfigFromEnv } from './fallback.js';
export type { FallbackConfig } from './fallback.js';
