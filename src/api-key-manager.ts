/**
 * API Key Manager Module
 *
 * Provides CRUD operations for API key management with:
 * - Atomic file operations
 * - Data validation
 * - Error handling
 * - Thread-safe file locking
 */

import type { ApiKey, ApiKeysData, UsageWindow } from './types.js';

function getDataFilePath(): string {
  return process.env.DATA_FILE || `${import.meta.dir}/../data/apikeys.json`;
}

function getLockFilePath(): string {
  return getDataFilePath() + '.lock';
}

/**
 * Custom error classes for better error handling
 */
export class ApiKeyManagerError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'ApiKeyManagerError';
  }
}

export class ValidationError extends ApiKeyManagerError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApiKeyManagerError {
  constructor(message: string) {
    super(message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class LockError extends ApiKeyManagerError {
  constructor(message: string) {
    super(message, 'LOCK_ERROR');
    this.name = 'LockError';
  }
}

/**
 * Validation functions
 */
function validateApiKeyFormat(key: string): void {
  if (!key || typeof key !== 'string') {
    throw new ValidationError('API key must be a non-empty string');
  }

  if (key.length < 8) {
    throw new ValidationError('API key must be at least 8 characters long');
  }

  if (key.length > 256) {
    throw new ValidationError('API key must not exceed 256 characters');
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    throw new ValidationError('API key can only contain alphanumeric characters, hyphens, and underscores');
  }
}

function validateName(name: string): void {
  if (!name || typeof name !== 'string') {
    throw new ValidationError('Name must be a non-empty string');
  }

  if (name.length > 100) {
    throw new ValidationError('Name must not exceed 100 characters');
  }

  if (!/^[\w\s-]+$/.test(name)) {
    throw new ValidationError('Name can only contain letters, numbers, spaces, hyphens, and underscores');
  }
}

function validateQuota(quota: number): void {
  if (typeof quota !== 'number' || isNaN(quota)) {
    throw new ValidationError('Token limit must be a valid number');
  }

  if (quota < 0) {
    throw new ValidationError('Token limit cannot be negative');
  }

  if (quota > 10000000) {
    throw new ValidationError('Token limit cannot exceed 10,000,000');
  }
}

function validateExpiryDate(expiryDate: string): void {
  if (!expiryDate || typeof expiryDate !== 'string') {
    throw new ValidationError('Expiry date must be a string');
  }

  const date = new Date(expiryDate);
  if (isNaN(date.getTime())) {
    throw new ValidationError('Expiry date must be a valid ISO 8601 date');
  }

  if (date < new Date()) {
    throw new ValidationError('Expiry date cannot be in the past');
  }
}

function validateModel(model?: string): void {
  if (model === undefined || model === null) {
    return; // Optional field
  }

  if (typeof model !== 'string') {
    throw new ValidationError('Model must be a string');
  }

  if (model.length > 50) {
    throw new ValidationError('Model name must not exceed 50 characters');
  }
}

function validateApiKey(key: Partial<ApiKey>): void {
  if (!key.key) {
    throw new ValidationError('API key is required');
  }
  validateApiKeyFormat(key.key);

  if (!key.name) {
    throw new ValidationError('Name is required');
  }
  validateName(key.name);

  if (key.token_limit_per_5h === undefined) {
    throw new ValidationError('Token limit is required');
  }
  validateQuota(key.token_limit_per_5h);

  if (!key.expiry_date) {
    throw new ValidationError('Expiry date is required');
  }
  validateExpiryDate(key.expiry_date);

  validateModel(key.model);

  // Validate dates are in ISO format
  const requiredDates = ['created_at', 'last_used'] as const;
  for (const dateField of requiredDates) {
    const value = key[dateField];
    if (value && typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new ValidationError(`${dateField} must be a valid ISO 8601 date`);
      }
    }
  }

  // Validate usage windows if present
  if (key.usage_windows && Array.isArray(key.usage_windows)) {
    for (const window of key.usage_windows) {
      if (!window.window_start || typeof window.window_start !== 'string') {
        throw new ValidationError('Usage window must have a valid window_start');
      }
      if (typeof window.tokens_used !== 'number' || window.tokens_used < 0) {
        throw new ValidationError('Usage window must have a valid tokens_used number');
      }
    }
  }

  // Validate total lifetime tokens
  if (key.total_lifetime_tokens !== undefined) {
    if (typeof key.total_lifetime_tokens !== 'number' || key.total_lifetime_tokens < 0) {
      throw new ValidationError('Total lifetime tokens must be a non-negative number');
    }
  }
}

/**
 * File locking using atomic file operations
 */
const lockState = new Map<string, number>();

async function acquireLock(maxRetries = 10, retryDelay = 50): Promise<void> {
  const lockFile = getLockFilePath();

  for (let i = 0; i < maxRetries; i++) {
    const currentPid = process.pid;
    const lockPid = lockState.get(lockFile);

    if (lockPid === undefined) {
      lockState.set(lockFile, currentPid);
      return;
    }

    if (lockPid === currentPid) {
      return; // Already locked by this process
    }

    if (i < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  throw new LockError('Could not acquire file lock after multiple retries');
}

async function releaseLock(): Promise<void> {
  const lockFile = getLockFilePath();
  lockState.delete(lockFile);
}

/**
 * Execute function with file lock
 */
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  await acquireLock();
  try {
    return await fn();
  } finally {
    await releaseLock();
  }
}

/**
 * Read API keys from file
 */
async function readApiKeysData(): Promise<ApiKeysData> {
  try {
    const dataFile = getDataFilePath();
    const file = Bun.file(dataFile);
    const exists = await file.exists();

    if (!exists) {
      return { keys: [] };
    }

    const content = await file.text();
    const data = JSON.parse(content) as ApiKeysData;

    // Validate structure
    if (!data || typeof data !== 'object') {
      throw new ApiKeyManagerError('Invalid data file format', 'INVALID_DATA');
    }

    if (!Array.isArray(data.keys)) {
      throw new ApiKeyManagerError('Keys must be an array', 'INVALID_DATA');
    }

    return data;
  } catch (error) {
    if (error instanceof ApiKeyManagerError) {
      throw error;
    }
    throw new ApiKeyManagerError(
      `Failed to read API keys file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'READ_ERROR'
    );
  }
}

/**
 * Write API keys to file atomically
 */
async function writeApiKeysData(data: ApiKeysData): Promise<void> {
  try {
    const dataFile = getDataFilePath();
    const jsonContent = JSON.stringify(data, null, 2);

    // Direct write (atomic enough for our use case with locking)
    await Bun.write(dataFile, jsonContent);
  } catch (error) {
    throw new ApiKeyManagerError(
      `Failed to write API keys file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'WRITE_ERROR'
    );
  }
}

/**
 * Public API functions
 */

/**
 * Get all API keys
 */
export async function getAllApiKeys(): Promise<ApiKey[]> {
  return await withLock(async () => {
    const data = await readApiKeysData();
    return data.keys;
  });
}

/**
 * Get API key by key string
 */
export async function getApiKey(key: string): Promise<ApiKey | null> {
  return await withLock(async () => {
    const data = await readApiKeysData();
    return data.keys.find(k => k.key === key) || null;
  });
}

/**
 * Create new API key
 */
export async function createApiKey(apiKey: ApiKey): Promise<ApiKey> {
  return await withLock(async () => {
    // Validate input
    validateApiKey(apiKey);

    const data = await readApiKeysData();

    // Check for duplicate key
    if (data.keys.some(k => k.key === apiKey.key)) {
      throw new ValidationError(`API key with key "${apiKey.key}" already exists`);
    }

    // Add new key
    data.keys.push(apiKey);

    // Write back
    await writeApiKeysData(data);

    return apiKey;
  });
}

/**
 * Update existing API key
 */
export async function updateApiKey(key: string, updates: Partial<ApiKey>): Promise<ApiKey> {
  return await withLock(async () => {
    const data = await readApiKeysData();
    const keyIndex = data.keys.findIndex(k => k.key === key);

    if (keyIndex === -1) {
      throw new NotFoundError(`API key "${key}" not found`);
    }

    // Prevent changing the key itself
    if (updates.key !== undefined && updates.key !== key) {
      throw new ValidationError('Cannot change API key value');
    }

    // Validate updates (but allow past expiry dates for updates)
    const updatedKey: ApiKey = {
      ...data.keys[keyIndex],
      ...updates,
      key, // Ensure key stays the same
    };

    // Use a relaxed validation for updates (allow past dates)
    validateApiKeyPartial(updates);

    // Check for duplicate name if name is being changed
    if (updates.name && updates.name !== data.keys[keyIndex].name) {
      if (data.keys.some((k, i) => i !== keyIndex && k.name === updates.name)) {
        throw new ValidationError(`API key with name "${updates.name}" already exists`);
      }
    }

    // Update the key
    data.keys[keyIndex] = updatedKey;

    // Write back
    await writeApiKeysData(data);

    return updatedKey;
  });
}

/**
 * Validate partial API key data (for updates)
 */
function validateApiKeyPartial(data: Partial<ApiKey>): void {
  if (data.key !== undefined) {
    validateApiKeyFormat(data.key);
  }

  if (data.name !== undefined) {
    validateName(data.name);
  }

  if (data.token_limit_per_5h !== undefined) {
    validateQuota(data.token_limit_per_5h);
  }

  if (data.expiry_date !== undefined) {
    // For updates, only validate format, not whether it's in the past
    if (typeof data.expiry_date !== 'string') {
      throw new ValidationError('Expiry date must be a string');
    }

    const date = new Date(data.expiry_date);
    if (isNaN(date.getTime())) {
      throw new ValidationError('Expiry date must be a valid ISO 8601 date');
    }
  }

  if (data.model !== undefined) {
    validateModel(data.model);
  }

  if (data.total_lifetime_tokens !== undefined) {
    if (typeof data.total_lifetime_tokens !== 'number' || data.total_lifetime_tokens < 0) {
      throw new ValidationError('Total lifetime tokens must be a non-negative number');
    }
  }
}

/**
 * Delete API key
 */
export async function deleteApiKey(key: string): Promise<void> {
  return await withLock(async () => {
    const data = await readApiKeysData();
    const initialLength = data.keys.length;
    data.keys = data.keys.filter(k => k.key !== key);

    if (data.keys.length === initialLength) {
      throw new NotFoundError(`API key "${key}" not found`);
    }

    await writeApiKeysData(data);
  });
}

/**
 * Get API key usage statistics
 */
export async function getApiKeyUsage(key: string): Promise<ApiKey | null> {
  return await getApiKey(key);
}

/**
 * Update API key usage (called by proxy)
 */
export async function updateApiKeyUsage(
  key: string,
  tokensUsed: number,
  model: string
): Promise<void> {
  return await withLock(async () => {
    const data = await readApiKeysData();
    const keyIndex = data.keys.findIndex(k => k.key === key);

    if (keyIndex === -1) {
      return; // Key not found, silently ignore
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

    await writeApiKeysData(data);
  });
}

/**
 * Check if API key is expired
 */
export async function isApiKeyExpired(key: string): Promise<boolean> {
  const apiKey = await getApiKey(key);
  if (!apiKey) {
    return true;
  }

  const expiryDate = new Date(apiKey.expiry_date);
  return expiryDate < new Date();
}

/**
 * Get remaining quota for API key
 */
export async function getRemainingQuota(key: string): Promise<number> {
  const apiKey = await getApiKey(key);
  if (!apiKey) {
    return 0;
  }

  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const currentWindowUsage = apiKey.usage_windows
    .filter(w => w.window_start >= fiveHoursAgo)
    .reduce((sum, w) => sum + w.tokens_used, 0);

  return Math.max(0, apiKey.token_limit_per_5h - currentWindowUsage);
}
