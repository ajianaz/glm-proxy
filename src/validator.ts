import type { ApiKey } from './types.js';
import { findApiKeyByKey, type ApiKeyListItem } from './db/queries.js';
import { isKeyExpired } from './ratelimit.js';

export interface ValidationResult {
  valid: boolean;
  apiKey?: ApiKey;
  error?: string;
  statusCode?: number;
}

// Helper to convert ApiKeyListItem to ApiKey (handling nullable fields)
function toApiKey(item: ApiKeyListItem): ApiKey {
  return {
    id: item.id,
    key: item.key,
    name: item.name,
    model: item.model,
    tokenLimitPerDay: item.tokenLimitPerDay,
    expiryDate: item.expiryDate,
    createdAt: item.createdAt || new Date().toISOString(),
    lastUsed: item.lastUsed,
    totalLifetimeTokens: item.totalLifetimeTokens,
  };
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

  const apiKeyItem = await findApiKeyByKey(key);

  if (!apiKeyItem) {
    return {
      valid: false,
      error: 'Invalid API key',
      statusCode: 401,
    };
  }

  const apiKey = toApiKey(apiKeyItem);

  if (isKeyExpired(apiKey)) {
    return {
      valid: false,
      error: `API key expired on ${apiKey.expiryDate}`,
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
