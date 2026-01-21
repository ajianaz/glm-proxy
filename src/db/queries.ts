import { db } from './index';
import { apiKeys, ValidModel } from './schema';
import { eq, desc, count } from 'drizzle-orm';
import { generateId, generateApiKey } from '../utils/ulid';

// Types for input parameters
export type CreateApiKeyInput = {
  name: string;
  model: ValidModel;
  tokenLimitPerDay: number;
  expiryDate: string;
};

export type UpdateApiKeyInput = Partial<{
  name: string;
  model: ValidModel;
  tokenLimitPerDay: number;
  expiryDate: string;
  lastUsed: string | null;
  totalLifetimeTokens: number;
}>;

export type ListApiKeysParams = {
  limit: number;
  offset: number;
};

export type ApiKeyListItem = {
  id: string;
  key: string;
  name: string;
  model: string;
  tokenLimitPerDay: number;
  expiryDate: string;
  createdAt: string | null;
  lastUsed: string | null;
  totalLifetimeTokens: number;
};

export type ListApiKeysResult = {
  items: ApiKeyListItem[];
  total: number;
};

/**
 * Create a new API key with generated ULID and key value
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyListItem> {
  const id = generateId();
  const key = generateApiKey();

  const [result] = await db
    .insert(apiKeys)
    .values({
      id,
      key,
      name: input.name,
      model: input.model,
      tokenLimitPerDay: input.tokenLimitPerDay,
      expiryDate: input.expiryDate,
    })
    .returning();

  return result;
}

/**
 * Find an API key by its key value
 */
export async function findApiKeyByKey(key: string): Promise<ApiKeyListItem | null> {
  const [result] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.key, key))
    .limit(1);

  return result || null;
}

/**
 * Find an API key by its ID
 */
export async function findApiKeyById(id: string): Promise<ApiKeyListItem | null> {
  const [result] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, id))
    .limit(1);

  return result || null;
}

/**
 * List API keys with pagination
 */
export async function listApiKeys(
  params: ListApiKeysParams
): Promise<ListApiKeysResult> {
  const { limit, offset } = params;

  // Get total count
  const [{ value: total }] = await db
    .select({ value: count() })
    .from(apiKeys);

  // Get paginated items
  const items = await db
    .select()
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    items,
    total,
  };
}

/**
 * Update an API key by ID
 */
export async function updateApiKey(
  id: string,
  updates: UpdateApiKeyInput
): Promise<ApiKeyListItem | null> {
  const [result] = await db
    .update(apiKeys)
    .set(updates)
    .where(eq(apiKeys.id, id))
    .returning();

  return result || null;
}

/**
 * Delete an API key by ID
 */
export async function deleteApiKey(id: string): Promise<boolean> {
  const result = await db
    .delete(apiKeys)
    .where(eq(apiKeys.id, id))
    .returning();

  return result.length > 0;
}

/**
 * Regenerate an API key (create new key value, keep everything else)
 */
export async function regenerateApiKey(id: string): Promise<ApiKeyListItem | null> {
  const newKey = generateApiKey();

  const [result] = await db
    .update(apiKeys)
    .set({ key: newKey })
    .where(eq(apiKeys.id, id))
    .returning();

  return result || null;
}
