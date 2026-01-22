import fs from 'fs';
import path from 'path';
import type { ApiKeysData, ApiKey } from './types.js';
import { broadcastUsageUpdated } from './websocket-manager.js';
import { apiKeyCache } from './cache.js';
import { RollingWindow } from './rolling-window.js';

// Helper function to check if cache is enabled (reads env var at runtime)
function isCacheEnabled(): boolean {
  return process.env.CACHE_ENABLED !== 'false';
}

// Cache logging configuration
const CACHE_LOG_LEVEL = process.env.CACHE_LOG_LEVEL || 'none';

/**
 * Simple logger for cache operations
 * Logs are only output if the level is <= CACHE_LOG_LEVEL
 * Levels: none < info < debug
 */
function logCache(level: 'info' | 'debug', message: string, meta?: Record<string, unknown>): void {
  if (CACHE_LOG_LEVEL === 'none') {
    return;
  }

  if (level === 'debug' && CACHE_LOG_LEVEL !== 'debug') {
    return;
  }

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...meta,
  };

  if (level === 'debug') {
    console.log(`[cache] ${message}`, meta ? JSON.stringify(meta) : '');
  } else {
    console.log(`[cache] ${message}`, meta ? JSON.stringify(meta) : '');
  }
}

const DATA_FILE = process.env.DATA_FILE || path.join(process.cwd(), 'data/apikeys.json');
const LOCK_FILE = DATA_FILE + '.lock';

// Ensure data directory exists
const DATA_DIR = path.dirname(DATA_FILE);
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Simple file lock using mkdir (atomic on Unix)
export async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const maxRetries = 10;
  const retryDelay = 50;

  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.mkdirSync(LOCK_FILE, { mode: 0o755 });
      break;
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || i === maxRetries - 1) throw e;
      await new Promise(r => setTimeout(r, retryDelay));
    }
  }

  try {
    return await fn();
  } finally {
    fs.rmdirSync(LOCK_FILE);
  }
}

export async function readApiKeys(): Promise<ApiKeysData> {
  try {
    const content = await fs.promises.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { keys: [] };
  }
}

export async function writeApiKeys(data: ApiKeysData): Promise<void> {
  const tempFile = DATA_FILE + '.tmp';
  await fs.promises.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  await fs.promises.rename(tempFile, DATA_FILE);
}

export async function findApiKey(key: string): Promise<ApiKey | null> {
  // Check cache first if enabled
  if (isCacheEnabled()) {
    // Use has() to check if key exists in cache (distinguishes miss from cached null)
    if (apiKeyCache.has(key)) {
      // Key exists in cache, retrieve it (may be null for not-found keys)
      const cached = apiKeyCache.get(key);

      // Debug log cache hit
      logCache('debug', 'Cache hit', {
        key: key.substring(0, 8) + '...', // Partial key for security
        found: cached !== null,
      });

      return cached;
    }

    // Debug log cache miss
    logCache('debug', 'Cache miss - fallback to file', {
      key: key.substring(0, 8) + '...',
    });
  }

  // Cache miss or disabled - fall back to file read
  return await withLock(async () => {
    const data = await readApiKeys();
    const apiKey = data.keys.find(k => k.key === key) || null;

    // Populate cache for future requests (including null for not-found keys)
    if (isCacheEnabled()) {
      apiKeyCache.set(key, apiKey);

      // Debug log cache population
      logCache('debug', 'Cache populated after file read', {
        key: key.substring(0, 8) + '...',
        found: apiKey !== null,
      });
    }

    return apiKey;
  });
}

export async function updateApiKeyUsage(
  key: string,
  tokensUsed: number,
  model: string
): Promise<void> {
  await withLock(async () => {
    const data = await readApiKeys();
    const keyIndex = data.keys.findIndex(k => k.key === key);

    if (keyIndex === -1) return;

    const apiKey = data.keys[keyIndex];
    const now = new Date().toISOString();
    const nowDate = new Date();

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

    // Update rolling window cache for O(1) rate limit checks
    // Migrate if cache doesn't exist, then load it
    migrateToRollingWindow(apiKey);
    const rollingWindow = RollingWindow.fromSerializable(apiKey.rolling_window_cache!);

    // Add current usage to rolling window cache
    rollingWindow.addTokens(nowDate, tokensUsed);

    // Serialize and store cache
    apiKey.rolling_window_cache = rollingWindow.toSerializable();

    await writeApiKeys(data);

    // Calculate remaining quota and broadcast usage update
    const windowEnd = new Date(new Date(currentWindow.window_start).getTime() + 5 * 60 * 60 * 1000).toISOString();
    const remainingQuota = Math.max(0, apiKey.token_limit_per_5h - currentWindow.tokens_used);

    // Check if key is expired
    const isExpired = new Date(apiKey.expiry_date) < new Date();

    // Broadcast usage update to connected dashboard clients
    broadcastUsageUpdated({
      key: apiKey.key,
      name: apiKey.name,
      model: apiKey.model || model,
      tokens_used: tokensUsed,
      total_lifetime_tokens: apiKey.total_lifetime_tokens,
      remaining_quota: remainingQuota,
      window_start: currentWindow.window_start,
      window_end: windowEnd,
      is_expired: isExpired,
    });

    // Update cache with modified API key to maintain coherency
    if (isCacheEnabled()) {
      apiKeyCache.set(key, apiKey);

      // Info log cache invalidation/update
      logCache('info', 'Cache updated after usage update', {
        key: key.substring(0, 8) + '...',
        tokensUsed,
        totalTokens: apiKey.total_lifetime_tokens,
      });
    }
  });
}

/**
 * Migrate an API key's usage_windows to rolling window cache format
 * This function provides on-demand migration for keys that don't have a cache
 * @param apiKey - The API key to migrate (modified in place)
 */
export function migrateToRollingWindow(apiKey: ApiKey): void {
  // Skip migration if cache already exists
  if (apiKey.rolling_window_cache) {
    return;
  }

  // Create new RollingWindow instance with 5-hour window and 5-minute buckets
  const rollingWindow = new RollingWindow(5 * 60 * 60 * 1000, 5 * 60 * 1000);

  // Populate cache from existing usage_windows
  for (const window of apiKey.usage_windows) {
    const windowTime = new Date(window.window_start);
    rollingWindow.addTokens(windowTime, window.tokens_used);
  }

  // Serialize and store cache in the API key
  apiKey.rolling_window_cache = rollingWindow.toSerializable();
}

export async function getKeyStats(key: string): Promise<ApiKey | null> {
  return await findApiKey(key);
}

/**
 * Warm up the cache by loading all API keys into memory.
 * This is optional and should be called on application startup if enabled.
 * Runs asynchronously and doesn't block the startup process.
 */
export async function warmupCache(): Promise<void> {
  if (!isCacheEnabled()) {
    return;
  }

  try {
    // Read all API keys from storage
    const data = await withLock(async () => {
      return await readApiKeys();
    });

    // Populate cache with all keys
    let loaded = 0;
    for (const apiKey of data.keys) {
      apiKeyCache.set(apiKey.key, apiKey);
      loaded++;
    }

    // Log warm-up completion
    const stats = apiKeyCache.getStats();
    logCache('info', 'Cache warm-up completed', {
      keysLoaded: loaded,
      cacheSize: stats.size,
      maxSize: stats.maxSize,
    });
  } catch (error) {
    // Don't fail startup if warm-up fails, just log the error
    console.error('Cache warm-up failed:', error);
  }
}
