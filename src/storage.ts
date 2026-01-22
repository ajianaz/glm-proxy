/**
 * Storage - API key storage with optimized rate limit updates
 *
 * Optimized with:
 * - Batched rate limit updates to minimize storage operations
 * - In-memory API key cache
 * - Efficient file locking
 */

import fs from 'fs';
import path from 'path';
import type { ApiKeysData, ApiKey } from './types.js';
import { getApiKeyCache } from './cache/index.js';
import { getRateLimitTracker } from './ratelimit/index.js';

// Helper to get DATA_FILE at runtime (for testing)
function getDataFilePath(): string {
  return process.env.DATA_FILE || path.join(process.cwd(), 'data/apikeys.json');
}

// Helper to get LOCK_FILE at runtime
function getLockFilePath(dataFilePath: string): string {
  return dataFilePath + '.lock';
}

// Ensure data directory exists
function ensureDataDir(filePath: string): void {
  const DATA_DIR = path.dirname(filePath);
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// Pre-computed constants
const WINDOW_DURATION_MS = 5 * 60 * 60 * 1000; // 5 hours

// Pending updates for batching (key -> { tokens: number, timestamp: number })
const pendingUpdates = new Map<string, { tokens: number; timestamp: number }>();

// Batch configuration
const BATCH_FLUSH_INTERVAL = parseInt(process.env.RATE_LIMIT_BATCH_INTERVAL_MS || '5000', 10); // 5 seconds
const MAX_BATCH_SIZE = parseInt(process.env.RATE_LIMIT_MAX_BATCH_SIZE || '100', 10);

// Track if batch timer is running
let batchTimer: NodeJS.Timeout | null = null;

/**
 * Simple file lock using mkdir (atomic on Unix)
 *
 * @param fn - Function to execute while holding lock
 * @returns Result of function
 */
export async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const dataFilePath = getDataFilePath();
  const lockFilePath = getLockFilePath(dataFilePath);
  ensureDataDir(dataFilePath);

  const maxRetries = 10;
  const retryDelay = 50;

  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.mkdirSync(lockFilePath, { mode: 0o755 });
      break;
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || i === maxRetries - 1) throw e;
      await new Promise(r => setTimeout(r, retryDelay));
    }
  }

  try {
    return await fn();
  } finally {
    fs.rmdirSync(lockFilePath);
  }
}

/**
 * Read API keys from storage
 *
 * @returns API keys data
 */
export async function readApiKeys(): Promise<ApiKeysData> {
  const dataFilePath = getDataFilePath();
  try {
    const content = await fs.promises.readFile(dataFilePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { keys: [] };
  }
}

/**
 * Write API keys to storage
 *
 * Uses atomic write pattern with temporary file.
 *
 * @param data - API keys data to write
 */
export async function writeApiKeys(data: ApiKeysData): Promise<void> {
  const dataFilePath = getDataFilePath();
  const tempFile = dataFilePath + '.tmp';
  await fs.promises.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  await fs.promises.rename(tempFile, dataFilePath);
}

/**
 * Find an API key by key string
 *
 * Checks cache first, then reads from storage on cache miss.
 *
 * @param key - API key string
 * @returns API key object or null if not found
 */
export async function findApiKey(key: string): Promise<ApiKey | null> {
  // Check cache first
  const cache = getApiKeyCache();
  const cachedKey = cache.get(key);

  if (cachedKey) {
    return cachedKey;
  }

  // Cache miss - read from storage
  return await withLock(async () => {
    const data = await readApiKeys();
    const apiKey = data.keys.find(k => k.key === key) || null;

    // Populate cache for future requests
    if (apiKey) {
      cache.set(key, apiKey);
    }

    return apiKey;
  });
}

/**
 * Update API key usage with batched rate limit updates
 *
 * Optimizations:
 * - Batches rate limit updates to minimize storage operations
 * - Only writes to storage when batch is full or on timer
 * - Updates in-memory tracker immediately for fast rate limit checks
 *
 * @param key - API key string
 * @param tokensUsed - Number of tokens used
 * @param _model - Model name (unused but kept for interface compatibility)
 */
export async function updateApiKeyUsage(
  key: string,
  tokensUsed: number,
  _model: string
): Promise<void> {
  // Get API key from cache or storage
  const apiKey = await findApiKey(key);
  if (!apiKey) return;

  // Update in-memory rate limit tracker immediately
  const tracker = getRateLimitTracker();
  tracker.recordUsage(apiKey, tokensUsed);

  // Add to pending batch
  const existing = pendingUpdates.get(key);
  if (existing) {
    existing.tokens += tokensUsed;
    existing.timestamp = Date.now();
  } else {
    pendingUpdates.set(key, {
      tokens: tokensUsed,
      timestamp: Date.now(),
    });
  }

  // Flush if batch is full
  if (pendingUpdates.size >= MAX_BATCH_SIZE) {
    await flushPendingUpdates();
    return;
  }

  // Start batch timer if not running
  if (!batchTimer) {
    batchTimer = setTimeout(() => {
      void flushPendingUpdates();
    }, BATCH_FLUSH_INTERVAL);
  }
}

/**
 * Flush pending rate limit updates to storage
 *
 * Writes all pending updates to storage in a single operation.
 * Called automatically when batch is full or on timer.
 */
export async function flushPendingUpdates(): Promise<void> {
  if (pendingUpdates.size === 0) {
    return;
  }

  // Stop timer
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }

  // Get all pending updates
  const updates = Array.from(pendingUpdates.entries());
  pendingUpdates.clear();

  // Write all updates in a single storage operation
  await withLock(async () => {
    const data = await readApiKeys();
    const now = new Date().toISOString();
    const cutoffTime = new Date(Date.now() - WINDOW_DURATION_MS).toISOString();

    // Process each update
    for (const [keyString, update] of updates) {
      const keyIndex = data.keys.findIndex(k => k.key === keyString);

      if (keyIndex === -1) continue;

      const apiKey = data.keys[keyIndex];

      // Update last_used and total tokens
      apiKey.last_used = now;
      apiKey.total_lifetime_tokens += update.tokens;

      // Find or create current window (aligned to hour boundary)
      const currentHour = new Date();
      currentHour.setMinutes(0, 0, 0);
      const windowStart = currentHour.toISOString();

      let currentWindow = apiKey.usage_windows.find(
        w => w.window_start >= cutoffTime
      );

      if (!currentWindow) {
        currentWindow = { window_start: windowStart, tokens_used: 0 };
        apiKey.usage_windows.push(currentWindow);
      }

      currentWindow.tokens_used += update.tokens;

      // Clean up old windows
      apiKey.usage_windows = apiKey.usage_windows.filter(
        w => w.window_start >= cutoffTime
      );
    }

    await writeApiKeys(data);

    // Invalidate cache entries for updated keys
    const cache = getApiKeyCache();
    for (const [keyString] of updates) {
      cache.invalidate(keyString);
    }
  });
}

/**
 * Get API key statistics
 *
 * @param key - API key string
 * @returns API key object or null if not found
 */
export async function getKeyStats(key: string): Promise<ApiKey | null> {
  return await findApiKey(key);
}

/**
 * Force flush of pending updates
 *
 * Can be called manually to ensure all updates are written to storage.
 * Usually called on shutdown.
 */
export async function forceFlush(): Promise<void> {
  await flushPendingUpdates();
}

/**
 * Get pending updates statistics
 *
 * @returns Number of pending updates
 */
export function getPendingUpdatesCount(): number {
  return pendingUpdates.size;
}
