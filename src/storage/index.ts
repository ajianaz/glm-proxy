import { DatabaseStorage } from './database.js';
import { FileStorage } from './file.js';
import type { IStorage } from './interface.js';

/**
 * Storage factory module
 *
 * Provides a factory function to create storage instances based on environment configuration.
 * Supports:
 * - Database storage (SQLite or PostgreSQL) via DATABASE_URL or DATABASE_PATH
 * - File-based storage as default or fallback
 * - Graceful fallback from database to file storage on errors
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
 * Get or create the storage instance based on environment configuration
 *
 * This factory function:
 * 1. Checks for existing singleton instance and returns it if available
 * 2. Determines storage type based on environment:
 *    - If DATABASE_URL is set → DatabaseStorage (PostgreSQL)
 *    - If DATABASE_PATH is set → DatabaseStorage (SQLite)
 *    - If STORAGE_TYPE is 'database' → DatabaseStorage
 *    - Otherwise → FileStorage (default for backward compatibility)
 * 3. Creates and initializes the storage instance
 * 4. Falls back to FileStorage if DatabaseStorage fails to initialize
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
 * const storage = await getStorage(); // → DatabaseStorage (PostgreSQL)
 *
 * // Use SQLite (set DATABASE_PATH in .env)
 * // DATABASE_PATH=./data/sqlite.db
 * const storage = await getStorage(); // → DatabaseStorage (SQLite)
 *
 * // Force database storage (set STORAGE_TYPE)
 * // STORAGE_TYPE=database
 * const storage = await getStorage(); // → DatabaseStorage
 *
 * // Force file storage
 * // STORAGE_TYPE=file
 * const storage = await getStorage(); // → FileStorage
 *
 * // Default (no env vars)
 * const storage = await getStorage(); // → FileStorage (backward compatible)
 * ```
 *
 * @example
 * ```ts
 * // Graceful fallback behavior
 *
 * // If DATABASE_URL is set but database connection fails:
 * // 1. Attempts to initialize DatabaseStorage
 * // 2. Logs a warning about database connection failure
 * // 3. Falls back to FileStorage
 * // 4. Application continues working with file storage
 *
 * const storage = await getStorage();
 * // storage is FileStorage instance (fallback)
 * ```
 */
export async function getStorage(): Promise<IStorage> {
  // Return existing instance if available (singleton pattern)
  if (storageInstance) {
    return storageInstance;
  }

  let storage: IStorage;
  let attemptedDatabase = false;

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
    // Explicitly configured to use file storage
    storage = new FileStorage();
  } else if (shouldUseDatabase) {
    // Attempt to use database storage
    attemptedDatabase = true;
    storage = new DatabaseStorage();
  } else {
    // Default to file storage for backward compatibility
    storage = new FileStorage();
  }

  // Initialize the storage instance
  try {
    await storage.initialize();
    storageInstance = storage;
    return storageInstance;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // If database initialization failed, fall back to file storage
    if (attemptedDatabase) {
      // Log warning about database failure (using console.warn as this is a configuration issue)
      console.warn(
        `Failed to initialize database storage: ${errorMessage}\n` +
        'Falling back to file-based storage. Check your DATABASE_URL or DATABASE_PATH configuration.'
      );

      // Attempt to initialize file storage as fallback
      try {
        const fallbackStorage = new FileStorage();
        await fallbackStorage.initialize();
        storageInstance = fallbackStorage;
        return storageInstance;
      } catch (fallbackError) {
        const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown error';
        throw new Error(
          `Failed to initialize both database and file storage.\n` +
          `Database error: ${errorMessage}\n` +
          `File storage error: ${fallbackErrorMessage}`
        );
      }
    }

    // File storage initialization failed (no fallback available)
    throw new Error(`Failed to initialize storage: ${errorMessage}`);
  }
}

/**
 * Reset the storage instance
 *
 * This function clears the singleton storage instance, allowing getStorage()
 * to create a new instance on the next call. This is primarily useful for:
 * - Testing (resetting storage between tests)
 * - Configuration changes (switching storage backends at runtime)
 *
 * Note: This does not close any open database connections or clean up resources.
 * The old storage instance will be garbage collected when no longer referenced.
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

// Re-export storage types and implementations for convenience
export type { IStorage } from './interface.js';
export { DatabaseStorage } from './database.js';
export { FileStorage } from './file.js';
