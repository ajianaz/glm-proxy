import { eq, and, gte, lt, desc } from 'drizzle-orm';
import type { ApiKey, StatsResponse } from '../types.js';
import { getDb } from './connection.js';
import * as schema from './schema.js';

/**
 * Find an API key by its key string
 *
 * @param key - The API key string to search for
 * @returns The ApiKey object if found, null otherwise
 *
 * @example
 * ```ts
 * import { findApiKey } from './db/operations.js';
 *
 * const apiKey = await findApiKey('sk-1234567890');
 * if (apiKey) {
 *   console.log(`Found key: ${apiKey.name}`);
 * }
 * ```
 */
export async function findApiKey(key: string): Promise<ApiKey | null> {
  try {
    const { db, type } = await getDb();

    // Select the appropriate table based on database type
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;
    const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

    // Query the API key
    const result = await db.select().from(table).where(eq(table.key, key)).limit(1);

    if (result.length === 0) {
      return null;
    }

    const apiKeyRow = result[0];

    // Query usage windows for this key
    const usageWindows = await db
      .select()
      .from(usageTable)
      .where(eq(usageTable.apiKey, key));

    // Map database rows to ApiKey interface
    return {
      key: apiKeyRow.key,
      name: apiKeyRow.name,
      model: apiKeyRow.model ?? undefined,
      token_limit_per_5h: apiKeyRow.tokenLimitPer5h,
      expiry_date: apiKeyRow.expiryDate,
      created_at: apiKeyRow.createdAt,
      last_used: apiKeyRow.lastUsed,
      total_lifetime_tokens: apiKeyRow.totalLifetimeTokens,
      usage_windows: usageWindows.map(w => ({
        window_start: w.windowStart,
        tokens_used: w.tokensUsed,
      })),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to find API key: ${errorMessage}`);
  }
}

/**
 * Create a new API key with validation
 *
 * @param apiKey - The ApiKey object to create (excluding usage_windows which are managed separately)
 * @returns The created ApiKey object
 * @throws Error if validation fails or creation fails
 *
 * @example
 * ```ts
 * import { createApiKey } from './db/operations.js';
 *
 * const newKey = await createApiKey({
 *   key: 'sk-1234567890',
 *   name: 'My API Key',
 *   model: 'claude-3-5-sonnet-20241022',
 *   token_limit_per_5h: 50000,
 *   expiry_date: '2025-12-31T23:59:59Z',
 *   created_at: new Date().toISOString(),
 *   last_used: new Date().toISOString(),
 *   total_lifetime_tokens: 0,
 *   usage_windows: [],
 * });
 * ```
 */
export async function createApiKey(apiKey: ApiKey): Promise<ApiKey> {
  // Validate required fields
  if (!apiKey.key || !apiKey.key.trim()) {
    throw new Error('API key is required and cannot be empty');
  }

  if (!apiKey.name || !apiKey.name.trim()) {
    throw new Error('API key name is required and cannot be empty');
  }

  if (apiKey.token_limit_per_5h <= 0) {
    throw new Error('Token limit must be greater than 0');
  }

  if (!apiKey.expiry_date) {
    throw new Error('Expiry date is required');
  }

  try {
    const { db, type } = await getDb();

    // Select the appropriate table based on database type
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;

    // Check if key already exists
    const existing = await db.select().from(table).where(eq(table.key, apiKey.key)).limit(1);
    if (existing.length > 0) {
      throw new Error(`API key '${apiKey.key}' already exists`);
    }

    // Insert the new API key
    await db.insert(table).values({
      key: apiKey.key,
      name: apiKey.name,
      model: apiKey.model ?? null,
      tokenLimitPer5h: apiKey.token_limit_per_5h,
      expiryDate: apiKey.expiry_date,
      createdAt: apiKey.created_at,
      lastUsed: apiKey.last_used,
      totalLifetimeTokens: apiKey.total_lifetime_tokens,
    });

    // Return the created key (usage_windows start empty)
    return {
      ...apiKey,
      usage_windows: [],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to create API key: ${errorMessage}`);
  }
}

/**
 * Update API key metadata (name, model, token_limit_per_5h, expiry_date)
 *
 * Note: This function only updates metadata fields. Usage tracking should be done
 * through the updateApiKeyUsage function to ensure proper transaction handling.
 *
 * @param key - The API key string to update
 * @param updates - Partial ApiKey object with fields to update
 * @returns The updated ApiKey object, or null if key not found
 *
 * @example
 * ```ts
 * import { updateApiKey } from './db/operations.js';
 *
 * const updated = await updateApiKey('sk-1234567890', {
 *   name: 'Updated Name',
 *   token_limit_per_5h: 100000,
 * });
 * ```
 */
export async function updateApiKey(
  key: string,
  updates: Partial<Pick<ApiKey, 'name' | 'model' | 'token_limit_per_5h' | 'expiry_date'>>
): Promise<ApiKey | null> {
  try {
    const { db, type } = await getDb();

    // Select the appropriate table based on database type
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;
    const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

    // Check if key exists
    const existing = await db.select().from(table).where(eq(table.key, key)).limit(1);
    if (existing.length === 0) {
      return null;
    }

    // Build update object with only provided fields
    const updateValues: Record<string, unknown> = {};
    if (updates.name !== undefined) {
      if (!updates.name.trim()) {
        throw new Error('API key name cannot be empty');
      }
      updateValues.name = updates.name;
    }
    if (updates.model !== undefined) {
      updateValues.model = updates.model ?? null;
    }
    if (updates.token_limit_per_5h !== undefined) {
      if (updates.token_limit_per_5h <= 0) {
        throw new Error('Token limit must be greater than 0');
      }
      updateValues.tokenLimitPer5h = updates.token_limit_per_5h;
    }
    if (updates.expiry_date !== undefined) {
      if (!updates.expiry_date) {
        throw new Error('Expiry date cannot be empty');
      }
      updateValues.expiryDate = updates.expiry_date;
    }

    // Perform update if there are fields to update
    if (Object.keys(updateValues).length > 0) {
      await db.update(table).set(updateValues).where(eq(table.key, key));
    }

    // Query usage windows
    const usageWindows = await db.select().from(usageTable).where(eq(usageTable.apiKey, key));

    // Get the updated record
    const updated = await db.select().from(table).where(eq(table.key, key)).limit(1);

    // Map database rows to ApiKey interface
    return {
      key: updated[0].key,
      name: updated[0].name,
      model: updated[0].model ?? undefined,
      token_limit_per_5h: updated[0].tokenLimitPer5h,
      expiry_date: updated[0].expiryDate,
      created_at: updated[0].createdAt,
      last_used: updated[0].lastUsed,
      total_lifetime_tokens: updated[0].totalLifetimeTokens,
      usage_windows: usageWindows.map(w => ({
        window_start: w.windowStart,
        tokens_used: w.tokensUsed,
      })),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to update API key: ${errorMessage}`);
  }
}

/**
 * Delete an API key
 *
 * This will cascade delete all associated usage_windows due to the foreign key
 * constraint defined in the schema.
 *
 * @param key - The API key string to delete
 * @returns true if deleted, false if not found
 *
 * @example
 * ```ts
 * import { deleteApiKey } from './db/operations.js';
 *
 * const deleted = await deleteApiKey('sk-1234567890');
 * if (deleted) {
 *   console.log('API key deleted successfully');
 * }
 * ```
 */
export async function deleteApiKey(key: string): Promise<boolean> {
  try {
    const { db, type } = await getDb();

    // Select the appropriate table based on database type
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;

    // Check if key exists
    const existing = await db.select().from(table).where(eq(table.key, key)).limit(1);
    if (existing.length === 0) {
      return false;
    }

    // Delete the API key (cascade delete will handle usage_windows)
    await db.delete(table).where(eq(table.key, key));

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to delete API key: ${errorMessage}`);
  }
}

/**
 * Update API key usage with transaction-based operations
 *
 * This function handles:
 * 1. Updating last_used timestamp
 * 2. Incrementing total_lifetime_tokens
 * 3. Managing usage windows (5-hour rolling window)
 * 4. Cleaning up old usage windows
 *
 * All operations are performed within a database transaction to ensure atomicity
 * and prevent race conditions during concurrent requests.
 *
 * @param key - The API key string to update usage for
 * @param tokensUsed - Number of tokens to add to the usage tracking
 * @param model - Model used (not currently stored but kept for interface compatibility)
 * @throws Error if the key is not found or update fails
 *
 * @example
 * ```ts
 * import { updateApiKeyUsage } from './db/operations.js';
 *
 * // After processing an API request
 * await updateApiKeyUsage('sk-1234567890', 1250, 'claude-3-5-sonnet-20241022');
 * ```
 */
export async function updateApiKeyUsage(
  key: string,
  tokensUsed: number,
  _model: string
): Promise<void> {
  if (tokensUsed < 0) {
    throw new Error('Tokens used must be a non-negative number');
  }

  try {
    const { db, type } = await getDb();

    // Select the appropriate tables based on database type
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;
    const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

    // Use a transaction to ensure atomicity
    await db.transaction(async (tx) => {
      // Check if key exists
      const existing = await tx.select().from(table).where(eq(table.key, key)).limit(1);
      if (existing.length === 0) {
        throw new Error(`API key '${key}' not found`);
      }

      const now = new Date().toISOString();
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();

      // Update last_used and total_lifetime_tokens in api_keys table
      await tx
        .update(table)
        .set({
          lastUsed: now,
          totalLifetimeTokens: existing[0].totalLifetimeTokens + tokensUsed,
        })
        .where(eq(table.key, key));

      // Find existing usage window within the last 5 hours
      const existingWindows = await tx
        .select()
        .from(usageTable)
        .where(
          and(
            eq(usageTable.apiKey, key),
            gte(usageTable.windowStart, fiveHoursAgo)
          )
        )
        .orderBy(usageTable.windowStart)
        .limit(1);

      if (existingWindows.length > 0) {
        // Update existing window
        await tx
          .update(usageTable)
          .set({
            tokensUsed: existingWindows[0].tokensUsed + tokensUsed,
          })
          .where(eq(usageTable.id, existingWindows[0].id));
      } else {
        // Create new usage window
        await tx.insert(usageTable).values({
          apiKey: key,
          windowStart: now,
          tokensUsed: tokensUsed,
        });
      }

      // Clean up old usage windows (older than 5 hours)
      await tx
        .delete(usageTable)
        .where(
          and(
            eq(usageTable.apiKey, key),
            lt(usageTable.windowStart, fiveHoursAgo)
          )
        );
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to update API key usage: ${errorMessage}`);
  }
}

/**
 * Get comprehensive statistics for an API key
 *
 * This function joins api_keys with usage_windows and computes statistics including:
 * - Expiration status
 * - Current rolling window usage (5-hour window)
 * - Remaining tokens in current window
 * - Total lifetime usage
 *
 * @param key - The API key string to get statistics for
 * @returns StatsResponse object with full statistics, or null if key not found
 *
 * @example
 * ```ts
 * import { getKeyStats } from './db/operations.js';
 *
 * const stats = await getKeyStats('sk-1234567890');
 * if (stats) {
 *   console.log(`Current usage: ${stats.current_usage.tokens_used_in_current_window}`);
 *   console.log(`Remaining: ${stats.current_usage.remaining_tokens}`);
 *   console.log(`Expired: ${stats.is_expired}`);
 * }
 * ```
 */
export async function getKeyStats(key: string): Promise<StatsResponse | null> {
  try {
    const { db, type } = await getDb();

    // Select the appropriate tables based on database type
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;
    const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

    // Query the API key
    const result = await db.select().from(table).where(eq(table.key, key)).limit(1);

    if (result.length === 0) {
      return null;
    }

    const apiKeyRow = result[0];

    // Calculate if key is expired
    const now = new Date();
    const expiryDate = new Date(apiKeyRow.expiryDate);
    const isExpired = expiryDate < now;

    // Get usage windows within the last 5 hours for current window calculation
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();

    // Get all usage windows for total calculation
    const allUsageWindows = await db
      .select()
      .from(usageTable)
      .where(eq(usageTable.apiKey, key))
      .orderBy(desc(usageTable.windowStart));

    // Get current window (most recent window within 5 hours)
    const currentWindow = allUsageWindows.find(w => {
      const windowStart = new Date(w.windowStart);
      return windowStart >= new Date(fiveHoursAgo);
    });

    // Calculate current window usage
    const tokensUsedInCurrentWindow = currentWindow?.tokensUsed ?? 0;
    const windowStartedAt = currentWindow?.windowStart ?? apiKeyRow.lastUsed;
    const windowEndsAt = currentWindow
      ? new Date(new Date(currentWindow.windowStart).getTime() + 5 * 60 * 60 * 1000).toISOString()
      : new Date(new Date(apiKeyRow.lastUsed).getTime() + 5 * 60 * 60 * 1000).toISOString();

    const remainingTokens = Math.max(0, apiKeyRow.tokenLimitPer5h - tokensUsedInCurrentWindow);

    // Map to StatsResponse interface
    return {
      key: apiKeyRow.key,
      name: apiKeyRow.name,
      model: apiKeyRow.model ?? '',
      token_limit_per_5h: apiKeyRow.tokenLimitPer5h,
      expiry_date: apiKeyRow.expiryDate,
      created_at: apiKeyRow.createdAt,
      last_used: apiKeyRow.lastUsed,
      is_expired: isExpired,
      current_usage: {
        tokens_used_in_current_window: tokensUsedInCurrentWindow,
        window_started_at: windowStartedAt,
        window_ends_at: windowEndsAt,
        remaining_tokens: remainingTokens,
      },
      total_lifetime_tokens: apiKeyRow.totalLifetimeTokens,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to get API key stats: ${errorMessage}`);
  }
}

/**
 * Get all API keys with optional pagination
 *
 * @param options - Pagination options
 * @param options.limit - Maximum number of keys to return (default: 100)
 * @param options.offset - Number of keys to skip (default: 0)
 * @returns Array of ApiKey objects
 *
 * @example
 * ```ts
 * import { getAllApiKeys } from './db/operations.js';
 *
 * // Get first 100 keys
 * const keys = await getAllApiKeys();
 *
 * // Get next 100 keys (pagination)
 * const page2 = await getAllApiKeys({ limit: 100, offset: 100 });
 *
 * // Get first 50 keys
 * const first50 = await getAllApiKeys({ limit: 50 });
 * ```
 */
export async function getAllApiKeys(
  options: { limit?: number; offset?: number } = {}
): Promise<ApiKey[]> {
  const { limit = 100, offset = 0 } = options;

  if (limit <= 0) {
    throw new Error('Limit must be greater than 0');
  }

  if (offset < 0) {
    throw new Error('Offset must be non-negative');
  }

  try {
    const { db, type } = await getDb();

    // Select the appropriate tables based on database type
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;
    const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

    // Query all API keys with pagination
    const result = await db
      .select()
      .from(table)
      .orderBy(desc(table.createdAt))
      .limit(limit)
      .offset(offset);

    // For each key, fetch its usage windows
    const keysWithUsage: ApiKey[] = await Promise.all(
      result.map(async (apiKeyRow) => {
        const usageWindows = await db
          .select()
          .from(usageTable)
          .where(eq(usageTable.apiKey, apiKeyRow.key));

        return {
          key: apiKeyRow.key,
          name: apiKeyRow.name,
          model: apiKeyRow.model ?? undefined,
          token_limit_per_5h: apiKeyRow.tokenLimitPer5h,
          expiry_date: apiKeyRow.expiryDate,
          created_at: apiKeyRow.createdAt,
          last_used: apiKeyRow.lastUsed,
          total_lifetime_tokens: apiKeyRow.totalLifetimeTokens,
          usage_windows: usageWindows.map(w => ({
            window_start: w.windowStart,
            tokens_used: w.tokensUsed,
          })),
        };
      })
    );

    return keysWithUsage;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to get all API keys: ${errorMessage}`);
  }
}

/**
 * Find API keys by model name
 *
 * @param model - The model name to search for (e.g., 'claude-3-5-sonnet-20241022')
 * @returns Array of ApiKey objects matching the model
 *
 * @example
 * ```ts
 * import { findKeysByModel } from './db/operations.js';
 *
 * const sonnetKeys = await findKeysByModel('claude-3-5-sonnet-20241022');
 * console.log(`Found ${sonnetKeys.length} keys for Sonnet model`);
 * ```
 */
export async function findKeysByModel(model: string): Promise<ApiKey[]> {
  if (!model || !model.trim()) {
    throw new Error('Model name is required and cannot be empty');
  }

  try {
    const { db, type } = await getDb();

    // Select the appropriate tables based on database type
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;
    const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

    // Query API keys by model
    const result = await db
      .select()
      .from(table)
      .where(eq(table.model, model))
      .orderBy(desc(table.createdAt));

    // For each key, fetch its usage windows
    const keysWithUsage: ApiKey[] = await Promise.all(
      result.map(async (apiKeyRow) => {
        const usageWindows = await db
          .select()
          .from(usageTable)
          .where(eq(usageTable.apiKey, apiKeyRow.key));

        return {
          key: apiKeyRow.key,
          name: apiKeyRow.name,
          model: apiKeyRow.model ?? undefined,
          token_limit_per_5h: apiKeyRow.tokenLimitPer5h,
          expiry_date: apiKeyRow.expiryDate,
          created_at: apiKeyRow.createdAt,
          last_used: apiKeyRow.lastUsed,
          total_lifetime_tokens: apiKeyRow.totalLifetimeTokens,
          usage_windows: usageWindows.map(w => ({
            window_start: w.windowStart,
            tokens_used: w.tokensUsed,
          })),
        };
      })
    );

    return keysWithUsage;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to find API keys by model: ${errorMessage}`);
  }
}

/**
 * Find all expired API keys
 *
 * @returns Array of ApiKey objects that are expired (expiry_date < now)
 *
 * @example
 * ```ts
 * import { findExpiredKeys } from './db/operations.js';
 *
 * const expiredKeys = await findExpiredKeys();
 * console.log(`Found ${expiredKeys.length} expired keys`);
 *
 * // Optionally delete expired keys
 * for (const key of expiredKeys) {
 *   await deleteApiKey(key.key);
 * }
 * ```
 */
export async function findExpiredKeys(): Promise<ApiKey[]> {
  try {
    const { db, type } = await getDb();

    // Select the appropriate tables based on database type
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;
    const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

    const now = new Date().toISOString();

    // Query expired API keys
    const result = await db
      .select()
      .from(table)
      .where(lt(table.expiryDate, now))
      .orderBy(desc(table.expiryDate));

    // For each key, fetch its usage windows
    const keysWithUsage: ApiKey[] = await Promise.all(
      result.map(async (apiKeyRow) => {
        const usageWindows = await db
          .select()
          .from(usageTable)
          .where(eq(usageTable.apiKey, apiKeyRow.key));

        return {
          key: apiKeyRow.key,
          name: apiKeyRow.name,
          model: apiKeyRow.model ?? undefined,
          token_limit_per_5h: apiKeyRow.tokenLimitPer5h,
          expiry_date: apiKeyRow.expiryDate,
          created_at: apiKeyRow.createdAt,
          last_used: apiKeyRow.lastUsed,
          total_lifetime_tokens: apiKeyRow.totalLifetimeTokens,
          usage_windows: usageWindows.map(w => ({
            window_start: w.windowStart,
            tokens_used: w.tokensUsed,
          })),
        };
      })
    );

    return keysWithUsage;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to find expired API keys: ${errorMessage}`);
  }
}

/**
 * Find all active (non-expired) API keys
 *
 * @returns Array of ApiKey objects that are active (expiry_date >= now)
 *
 * @example
 * ```ts
 * import { findActiveKeys } from './db/operations.js';
 *
 * const activeKeys = await findActiveKeys();
 * console.log(`Found ${activeKeys.length} active keys`);
 *
 * // Get keys expiring soon (within 7 days)
 * const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
 * const expiringSoon = activeKeys.filter(key => {
 *   return new Date(key.expiry_date) < new Date(sevenDaysFromNow);
 * });
 * ```
 */
export async function findActiveKeys(): Promise<ApiKey[]> {
  try {
    const { db, type } = await getDb();

    // Select the appropriate tables based on database type
    const table = type === 'sqlite' ? schema.sqliteApiKeys : schema.pgApiKeys;
    const usageTable = type === 'sqlite' ? schema.sqliteUsageWindows : schema.pgUsageWindows;

    const now = new Date().toISOString();

    // Query active API keys
    const result = await db
      .select()
      .from(table)
      .where(gte(table.expiryDate, now))
      .orderBy(desc(table.createdAt));

    // For each key, fetch its usage windows
    const keysWithUsage: ApiKey[] = await Promise.all(
      result.map(async (apiKeyRow) => {
        const usageWindows = await db
          .select()
          .from(usageTable)
          .where(eq(usageTable.apiKey, apiKeyRow.key));

        return {
          key: apiKeyRow.key,
          name: apiKeyRow.name,
          model: apiKeyRow.model ?? undefined,
          token_limit_per_5h: apiKeyRow.tokenLimitPer5h,
          expiry_date: apiKeyRow.expiryDate,
          created_at: apiKeyRow.createdAt,
          last_used: apiKeyRow.lastUsed,
          total_lifetime_tokens: apiKeyRow.totalLifetimeTokens,
          usage_windows: usageWindows.map(w => ({
            window_start: w.windowStart,
            tokens_used: w.tokensUsed,
          })),
        };
      })
    );

    return keysWithUsage;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to find active API keys: ${errorMessage}`);
  }
}
