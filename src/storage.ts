import fs from 'fs';
import path from 'path';
import type { ApiKeysData, ApiKey } from './types.js';
import { apiKeyCache } from './cache.js';

const CACHE_ENABLED = process.env.CACHE_ENABLED !== 'false';

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
  if (CACHE_ENABLED) {
    // Use has() to check if key exists in cache (distinguishes miss from cached null)
    if (apiKeyCache.has(key)) {
      // Key exists in cache, retrieve it (may be null for not-found keys)
      const cached = apiKeyCache.get(key);
      return cached;
    }
    // Cache miss - fall through to file read
  }

  // Cache miss or disabled - fall back to file read
  return await withLock(async () => {
    const data = await readApiKeys();
    const apiKey = data.keys.find(k => k.key === key) || null;

    // Populate cache for future requests (including null for not-found keys)
    if (CACHE_ENABLED) {
      apiKeyCache.set(key, apiKey);
    }

    return apiKey;
  });
}

export async function updateApiKeyUsage(
  key: string,
  tokensUsed: number,
  _model: string
): Promise<void> {
  await withLock(async () => {
    const data = await readApiKeys();
    const keyIndex = data.keys.findIndex(k => k.key === key);

    if (keyIndex === -1) return;

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

    await writeApiKeys(data);

    // Update cache with modified API key to maintain coherency
    if (CACHE_ENABLED) {
      apiKeyCache.set(key, apiKey);
    }
  });
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
  if (!CACHE_ENABLED) {
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

    // Log warm-up completion (only in development or if explicitly enabled)
    if (process.env.NODE_ENV === 'development' || process.env.CACHE_LOG_LEVEL === 'info') {
      const stats = apiKeyCache.getStats();
      console.log(`Cache warm-up completed: ${loaded} API keys loaded (cache size: ${stats.size}/${stats.maxSize})`);
    }
  } catch (error) {
    // Don't fail startup if warm-up fails, just log the error
    console.error('Cache warm-up failed:', error);
  }
}
