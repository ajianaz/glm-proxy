import fs from 'fs';
import path from 'path';
import type { ApiKeysData, ApiKey } from './types.js';

const DATA_FILE = process.env.DATA_FILE || '/app/data/apikeys.json';
const LOCK_FILE = DATA_FILE + '.lock';

// Simple file lock using mkdir (atomic on Unix)
export async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const maxRetries = 10;
  const retryDelay = 50;

  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.mkdirSync(LOCK_FILE, { mode: 0o755 });
      break;
    } catch (e: any) {
      if (e.code !== 'EEXIST' || i === maxRetries - 1) throw e;
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
  } catch (e) {
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
  model: string
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
  });
}

export async function getKeyStats(key: string): Promise<ApiKey | null> {
  return await findApiKey(key);
}
