/**
 * Database Schema Definitions
 *
 * Defines the schema for the API keys table used by the Admin API.
 * This schema supports programmatic API key management with CRUD operations.
 */

/**
 * API Key record structure as stored in the database
 */
export interface ApiKeyRecord {
  /** Primary key (auto-incrementing integer) */
  id: number;

  /** SHA-256 hash of the API key for secure storage */
  key_hash: string;

  /** Human-readable name for the API key */
  name: string;

  /** Optional description of the API key's purpose */
  description: string | null;

  /** JSON string array of scopes/permissions (e.g., ["read", "write"]) */
  scopes: string;

  /** Rate limit for this key (requests per minute) */
  rate_limit: number;

  /** Whether the key is currently active */
  is_active: number; // SQLite doesn't have native boolean, using INTEGER (0/1)

  /** ISO 8601 timestamp when the key was created */
  created_at: string;

  /** ISO 8601 timestamp when the key was last updated */
  updated_at: string;
}

/**
 * API Key data when creating a new key
 */
export interface CreateApiKeyData {
  /** The actual API key (will be hashed before storage) */
  key: string;

  /** Human-readable name for the API key */
  name: string;

  /** Optional description of the API key's purpose */
  description?: string;

  /** Array of scopes/permissions */
  scopes?: string[];

  /** Rate limit for this key (requests per minute) */
  rate_limit?: number;
}

/**
 * API Key data when updating an existing key
 */
export interface UpdateApiKeyData {
  /** Human-readable name for the API key */
  name?: string;

  /** Optional description of the API key's purpose */
  description?: string | null;

  /** Array of scopes/permissions */
  scopes?: string[];

  /** Rate limit for this key (requests per minute) */
  rate_limit?: number;

  /** Whether the key is currently active */
  is_active?: boolean;
}

/**
 * API Key response format (safe to return to clients)
 */
export interface ApiKeyResponse {
  /** Primary key */
  id: number;

  /** Human-readable name for the API key */
  name: string;

  /** Optional description of the API key's purpose */
  description: string | null;

  /** Array of scopes/permissions */
  scopes: string[];

  /** Rate limit for this key (requests per minute) */
  rate_limit: number;

  /** Whether the key is currently active */
  is_active: boolean;

  /** ISO 8601 timestamp when the key was created */
  created_at: string;

  /** ISO 8601 timestamp when the key was last updated */
  updated_at: string;

  /** Truncated key for display (only shown on creation) */
  key_preview?: string;
}

/**
 * List query parameters for pagination
 */
export interface ApiKeyListParams {
  /** Page number (1-indexed) */
  page?: number;

  /** Number of items per page */
  limit?: number;

  /** Filter by active status */
  is_active?: boolean;

  /** Search by name (partial match) */
  search?: string;
}

/**
 * Paginated API key list response
 */
export interface ApiKeyListResponse {
  /** Array of API keys */
  data: ApiKeyResponse[];

  /** Current page number */
  page: number;

  /** Number of items per page */
  limit: number;

  /** Total number of items */
  total: number;

  /** Total number of pages */
  pages: number;
}

/**
 * SQL schema for the api_keys table
 */
export const API_KEYS_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  scopes TEXT NOT NULL DEFAULT '[]',
  rate_limit INTEGER NOT NULL DEFAULT 60,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * SQL indexes for performance optimization
 */
export const API_KEYS_INDEXES = [
  // Index for fast lookup by key hash (authentication)
  `CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);`,

  // Index for filtering by active status
  `CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);`,

  // Index for searching by name
  `CREATE INDEX IF NOT EXISTS idx_api_keys_name ON api_keys(name);`,

  // Composite index for active + name queries
  `CREATE INDEX IF NOT EXISTS idx_api_keys_active_name ON api_keys(is_active, name);`,
];

/**
 * Trigger to automatically update the updated_at timestamp
 *
 * Note: We use WHEN to prevent infinite recursion
 */
export const API_KEYS_UPDATE_TRIGGER = `
CREATE TRIGGER IF NOT EXISTS update_api_keys_timestamp
AFTER UPDATE ON api_keys
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE api_keys SET updated_at = datetime('now') WHERE id = NEW.id;
END;
`;
