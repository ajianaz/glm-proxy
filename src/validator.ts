import type { ApiKey } from './types.js';
import { getStorage } from './storage/index.js';
import { isKeyExpired } from './ratelimit.js';

export interface ValidationResult {
  valid: boolean;
  apiKey?: ApiKey;
  error?: string;
  statusCode?: number;
}

export async function validateApiKey(
  keyHeader: string | undefined
): Promise<ValidationResult> {
  if (!keyHeader) {
    return {
      valid: false,
      error: 'API key required. Use Authorization: Bearer <key> or x-api-key: <key>',
      statusCode: 401,
    };
  }

  const key = keyHeader.replace(/^Bearer\s+/i, '').trim();

  if (!key) {
    return {
      valid: false,
      error: 'API key cannot be empty',
      statusCode: 401,
    };
  }

  const storage = await getStorage();
  const apiKey = await storage.findApiKey(key);

  if (!apiKey) {
    return {
      valid: false,
      error: 'Invalid API key',
      statusCode: 401,
    };
  }

  if (isKeyExpired(apiKey)) {
    return {
      valid: false,
      error: `API key expired on ${apiKey.expiry_date}`,
      statusCode: 403,
    };
  }

  return {
    valid: true,
    apiKey,
  };
}

export function getModelForKey(apiKey: ApiKey): string {
  return apiKey.model || process.env.DEFAULT_MODEL || 'glm-4.7';
}
