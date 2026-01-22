import fs from 'fs';
import path from 'path';
import type { ApiKeysData, ApiKey } from './types.js';
import { RollingWindow } from './rolling-window.js';

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
  return await withLock(async () => {
    const data = await readApiKeys();
    return data.keys.find(k => k.key === key) || null;
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
