/**
 * API Key Model
 *
 * Handles CRUD operations for API keys including validation, hashing, and database operations.
 * Uses SHA-256 for secure key hashing and provides methods for key management.
 */

import { getDatabase } from './database.js';
import type {
  ApiKeyRecord,
  ApiKeyResponse,
  CreateApiKeyData,
  UpdateApiKeyData,
  ApiKeyListParams,
  ApiKeyListResponse,
} from './schema.js';

/**
 * Error types for API key operations
 */
export class ApiKeyNotFoundError extends Error {
  constructor(id: number) {
    super(`API key with id ${id} not found`);
    this.name = 'ApiKeyNotFoundError';
  }
}

export class ApiKeyDuplicateError extends Error {
  constructor() {
    super('API key with this hash already exists');
    this.name = 'ApiKeyDuplicateError';
  }
}

export class ApiKeyValidationError extends Error {
  constructor(message: string) {
    super(`Validation error: ${message}`);
    this.name = 'ApiKeyValidationError';
  }
}

/**
 * Hash an API key using SHA-256
 * @param key - The raw API key to hash
 * @returns Hex-encoded SHA-256 hash
 */
function hashApiKeySync(key: string): string {
  // Use Node.js crypto module (compatible with Bun)
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a safe preview of the API key
 * Shows first 8 and last 4 characters with asterisks in between
 * @param key - The raw API key
 * @returns Masked key preview
 */
function generateKeyPreview(key: string): string {
  if (key.length <= 12) {
    return '****';
  }
  return `${key.slice(0, 8)}${'*'.repeat(Math.min(key.length - 12, 20))}${key.slice(-4)}`;
}

/**
 * Parse JSON string to array with fallback
 * @param jsonString - JSON string to parse
 * @returns Parsed array or empty array
 */
function parseScopes(jsonString: string | null): string[] {
  if (!jsonString) {
    return [];
  }
  try {
    const parsed = JSON.parse(jsonString);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Serialize array to JSON string
 * @param scopes - Array to serialize
 * @returns JSON string representation
 */
function serializeScopes(scopes: string[] = []): string {
  return JSON.stringify(scopes);
}

/**
 * Convert database record to API response format
 * @param record - Database record
 * @returns Safe API response (never includes full key or hash)
 */
function recordToResponse(record: ApiKeyRecord): ApiKeyResponse {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    scopes: parseScopes(record.scopes),
    rate_limit: record.rate_limit,
    is_active: record.is_active === 1,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

/**
 * Validate API key format
 * @param key - The API key to validate
 * @throws {ApiKeyValidationError} If key is invalid
 */
function validateKeyFormat(key: string): void {
  if (!key || typeof key !== 'string') {
    throw new ApiKeyValidationError('API key must be a non-empty string');
  }
  if (key.length < 16) {
    throw new ApiKeyValidationError('API key must be at least 16 characters long');
  }
  if (key.length > 256) {
    throw new ApiKeyValidationError('API key must not exceed 256 characters');
  }
  if (!/^[a-zA-Z0-9\-_\.]+$/.test(key)) {
    throw new ApiKeyValidationError('API key can only contain alphanumeric characters, hyphens, underscores, and dots');
  }
}

/**
 * Validate create data
 * @param data - Data to validate
 * @throws {ApiKeyValidationError} If data is invalid
 */
function validateCreateData(data: CreateApiKeyData): void {
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    throw new ApiKeyValidationError('Name is required and must be a non-empty string');
  }
  if (data.name.length > 255) {
    throw new ApiKeyValidationError('Name must not exceed 255 characters');
  }
  if (data.description !== undefined && data.description !== null && data.description.length > 1000) {
    throw new ApiKeyValidationError('Description must not exceed 1000 characters');
  }
  if (data.rate_limit !== undefined && (data.rate_limit < 0 || data.rate_limit > 10000)) {
    throw new ApiKeyValidationError('Rate limit must be between 0 and 10000');
  }
  if (data.scopes !== undefined && !Array.isArray(data.scopes)) {
    throw new ApiKeyValidationError('Scopes must be an array');
  }
  validateKeyFormat(data.key);
}

/**
 * Validate update data
 * @param data - Data to validate
 * @throws {ApiKeyValidationError} If data is invalid
 */
function validateUpdateData(data: UpdateApiKeyData): void {
  if (data.name !== undefined) {
    if (typeof data.name !== 'string' || data.name.trim().length === 0) {
      throw new ApiKeyValidationError('Name must be a non-empty string');
    }
    if (data.name.length > 255) {
      throw new ApiKeyValidationError('Name must not exceed 255 characters');
    }
  }
  if (data.description !== undefined && data.description !== null && data.description.length > 1000) {
    throw new ApiKeyValidationError('Description must not exceed 1000 characters');
  }
  if (data.rate_limit !== undefined && (data.rate_limit < 0 || data.rate_limit > 10000)) {
    throw new ApiKeyValidationError('Rate limit must be between 0 and 10000');
  }
  if (data.scopes !== undefined && !Array.isArray(data.scopes)) {
    throw new ApiKeyValidationError('Scopes must be an array');
  }
  if (data.is_active !== undefined && typeof data.is_active !== 'boolean') {
    throw new ApiKeyValidationError('is_active must be a boolean');
  }
}

/**
 * API Key Model - CRUD Operations
 */
export const ApiKeyModel = {
  /**
   * Create a new API key
   * @param data - API key creation data
   * @returns Created API key response with key preview
   * @throws {ApiKeyValidationError} If validation fails
   * @throws {ApiKeyDuplicateError} If key hash already exists
   */
  create(data: CreateApiKeyData): ApiKeyResponse & { key_preview: string } {
    validateCreateData(data);

    const db = getDatabase();
    const keyHash = hashApiKeySync(data.key);

    // Use transaction for atomic operation
    const createTx = db.transaction(() => {
      try {
        const query = db.query<{
          id: number;
          key_hash: string;
          name: string;
          description: string | null;
          scopes: string;
          rate_limit: number;
          is_active: number;
          created_at: string;
          updated_at: string;
        }, [string, string, string | null, string, number, number]>(
          `INSERT INTO api_keys (key_hash, name, description, scopes, rate_limit, is_active)
           VALUES (?, ?, ?, ?, ?, ?)
           RETURNING *`
        );

        const result = query.get(
          keyHash,
          data.name.trim(),
          data.description?.trim() || null,
          serializeScopes(data.scopes),
          data.rate_limit ?? 60,
          1
        );

        if (!result) {
          throw new Error('Failed to create API key');
        }

        const response = recordToResponse(result);
        return {
          ...response,
          key_preview: generateKeyPreview(data.key),
        };
      } catch (error: any) {
        if (error.message?.includes('UNIQUE constraint failed')) {
          throw new ApiKeyDuplicateError();
        }
        throw error;
      }
    });

    return createTx();
  },

  /**
   * Find API key by ID
   * @param id - API key ID
   * @returns API key response or null if not found
   */
  findById(id: number): ApiKeyResponse | null {
    const db = getDatabase();

    const query = db.query<ApiKeyRecord, number>(
      'SELECT * FROM api_keys WHERE id = ?'
    );

    const result = query.get(id);

    return result ? recordToResponse(result) : null;
  },

  /**
   * Find API key by key hash (for authentication)
   * @param keyHash - SHA-256 hash of the API key
   * @returns API key record or null if not found
   * @internal This returns the full record including hash, use carefully
   */
  findByKeyHash(keyHash: string): ApiKeyRecord | null {
    const db = getDatabase();

    const query = db.query<ApiKeyRecord, string>(
      'SELECT * FROM api_keys WHERE key_hash = ?'
    );

    return query.get(keyHash) || null;
  },

  /**
   * Validate an API key
   * @param key - Raw API key to validate
   * @returns API key response if valid and active, null otherwise
   */
  validateKey(key: string): ApiKeyResponse | null {
    const keyHash = hashApiKeySync(key);
    const record = this.findByKeyHash(keyHash);

    if (!record) {
      return null;
    }

    if (record.is_active !== 1) {
      return null;
    }

    return recordToResponse(record);
  },

  /**
   * List API keys with pagination and filtering
   * @param params - List query parameters
   * @returns Paginated list of API keys
   */
  list(params: ApiKeyListParams = {}): ApiKeyListResponse {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 10));
    const offset = (page - 1) * limit;

    const db = getDatabase();

    // Build WHERE clause based on filters
    const conditions: string[] = [];
    const queryParams: (number | string)[] = [];

    if (params.is_active !== undefined) {
      conditions.push('is_active = ?');
      queryParams.push(params.is_active ? 1 : 0);
    }

    if (params.search) {
      conditions.push('name LIKE ?');
      queryParams.push(`%${params.search}%`);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // Get total count
    const countQuery = db.query<{ count: number }, (number | string)[]>(
      `SELECT COUNT(*) as count FROM api_keys ${whereClause}`
    );
    const countResult = countQuery.get(...queryParams);
    const total = countResult?.count ?? 0;

    // Get paginated results
    const recordsQuery = db.query<ApiKeyRecord, (number | string)[]>(
      `SELECT * FROM api_keys ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    );
    const records = recordsQuery.all(...queryParams, limit, offset);

    return {
      data: records.map(recordToResponse),
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    };
  },

  /**
   * Update an existing API key (atomic operation)
   * @param id - API key ID
   * @param data - Update data
   * @returns Updated API key response
   * @throws {ApiKeyNotFoundError} If key not found
   * @throws {ApiKeyValidationError} If validation fails
   */
  update(id: number, data: UpdateApiKeyData): ApiKeyResponse {
    validateUpdateData(data);

    const db = getDatabase();

    // Use transaction for atomic operation to prevent race conditions
    const updateTx = db.transaction(() => {
      // Build SET clause dynamically
      const updates: string[] = [];
      const queryParams: (string | number | null)[] = [];

      if (data.name !== undefined) {
        updates.push('name = ?');
        queryParams.push(data.name.trim());
      }

      if (data.description !== undefined) {
        updates.push('description = ?');
        queryParams.push(data.description?.trim() || null);
      }

      if (data.scopes !== undefined) {
        updates.push('scopes = ?');
        queryParams.push(serializeScopes(data.scopes));
      }

      if (data.rate_limit !== undefined) {
        updates.push('rate_limit = ?');
        queryParams.push(data.rate_limit);
      }

      if (data.is_active !== undefined) {
        updates.push('is_active = ?');
        queryParams.push(data.is_active ? 1 : 0);
      }

      if (updates.length === 0) {
        // No updates, just return existing key
        const existing = this.findById(id);
        if (!existing) {
          throw new ApiKeyNotFoundError(id);
        }
        return existing;
      }

      queryParams.push(id);

      const query = db.query<ApiKeyRecord, (string | number | null)[]>(
        `UPDATE api_keys SET ${updates.join(', ')} WHERE id = ? RETURNING *`
      );

      const result = query.get(...queryParams);

      if (!result) {
        throw new ApiKeyNotFoundError(id);
      }

      return recordToResponse(result);
    });

    return updateTx();
  },

  /**
   * Delete an API key (atomic operation)
   * @param id - API key ID
   * @returns true if deleted, false if not found
   */
  delete(id: number): boolean {
    const db = getDatabase();

    // Use transaction for atomic operation
    const deleteTx = db.transaction(() => {
      const query = db.query<{ changes: number }, number>(
        'DELETE FROM api_keys WHERE id = ?'
      );

      const result = query.run(id);

      return result.changes > 0;
    });

    return deleteTx();
  },

  /**
   * Check if an API key exists
   * @param id - API key ID
   * @returns true if exists, false otherwise
   */
  exists(id: number): boolean {
    const db = getDatabase();

    const query = db.query<{ count: number }, number>(
      'SELECT COUNT(*) as count FROM api_keys WHERE id = ?'
    );

    const result = query.get(id);

    return (result?.count ?? 0) > 0;
  },

  /**
   * Count total API keys
   * @param options - Optional filters
   * @returns Total count
   */
  count(options: { is_active?: boolean } = {}): number {
    const db = getDatabase();

    let query = 'SELECT COUNT(*) as count FROM api_keys';
    const params: number[] = [];

    if (options.is_active !== undefined) {
      query += ' WHERE is_active = ?';
      params.push(options.is_active ? 1 : 0);
    }

    const result = db.query<{ count: number }, number[]>(query).get(...params);

    return result?.count ?? 0;
  },
};

export default ApiKeyModel;
