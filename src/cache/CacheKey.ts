/**
 * Cache Key Generator
 *
 * Generates deterministic cache keys from request parameters.
 * Uses stable hashing to ensure identical requests produce the same key.
 */

import type { CacheKeyParams } from './types.js';
import { createHash } from 'node:crypto';

/**
 * Generates a cache key from request parameters
 *
 * The key is based on:
 * - Model name
 * - Messages array (content, role)
 * - Temperature
 * - Max tokens
 * - Top-p
 * - Other parameters that affect the response
 *
 * @param params - Cache key parameters
 * @returns Deterministic cache key
 */
export function generateCacheKey(params: CacheKeyParams): string {
  // Create a canonical representation of the parameters
  const canonical = canonicalizeParams(params);

  // Generate hash using SHA-256 (fast and secure)
  const hash = createHash('sha256')
    .update(canonical)
    .digest('hex');

  // Return hash as cache key
  return hash;
}

/**
 * Canonicalizes cache parameters for consistent hashing
 *
 * Sorts object keys and array elements to ensure that
 * semantically identical inputs produce the same hash.
 *
 * @param params - Parameters to canonicalize
 * @returns Canonical string representation
 */
function canonicalizeParams(params: CacheKeyParams): string {
  const canonical: Record<string, unknown> = {};

  // Include model (required)
  canonical.model = params.model;

  // Include messages (sorted by index, but preserve order)
  if (params.messages && Array.isArray(params.messages)) {
    canonical.messages = params.messages.map(msg => {
      const msgCopy: Record<string, unknown> = {};

      // Include role and content if present
      if (msg.role) msgCopy.role = msg.role;
      if (msg.content) msgCopy.content = msg.content;

      // Include other fields alphabetically
      const otherKeys = Object.keys(msg)
        .filter(k => k !== 'role' && k !== 'content')
        .sort();

      for (const key of otherKeys) {
        msgCopy[key] = msg[key];
      }

      return msgCopy;
    });
  }

  // Include temperature if present and not default
  if (params.temperature !== undefined && params.temperature !== 0.7) {
    canonical.temperature = params.temperature;
  }

  // Include max_tokens if present
  if (params.maxTokens !== undefined) {
    canonical.max_tokens = params.maxTokens;
  }

  // Include top_p if present and not default
  if (params.topP !== undefined && params.topP !== 1.0) {
    canonical.top_p = params.topP;
  }

  // Include other relevant parameters alphabetically
  const excludeKeys = new Set([
    'model',
    'messages',
    'temperature',
    'maxTokens',
    'topP',
  ]);

  const otherKeys = Object.keys(params)
    .filter(k => !excludeKeys.has(k))
    .sort();

  for (const key of otherKeys) {
    canonical[key] = params[key];
  }

  // Return JSON string with sorted keys
  return JSON.stringify(canonical);
}

/**
 * Extracts cache key parameters from a request body
 *
 * Parses the request body and extracts relevant parameters
 * for cache key generation.
 *
 * @param body - Request body JSON string
 * @returns Cache key parameters or null if not applicable
 */
export function extractCacheKeyParams(body: string): CacheKeyParams | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;

    // Extract model
    const model = parsed.model as string | undefined;
    if (!model) {
      return null; // Model is required for caching
    }

    // Extract messages
    const messages = parsed.messages as Array<Record<string, unknown>> | undefined;
    if (!messages || !Array.isArray(messages)) {
      return null; // Messages are required for caching
    }

    // Build cache key parameters
    const params: CacheKeyParams = {
      model,
      messages,
    };

    // Extract optional parameters
    if (parsed.temperature !== undefined) {
      params.temperature = parsed.temperature as number;
    }
    if (parsed.max_tokens !== undefined) {
      params.maxTokens = parsed.max_tokens as number;
    }
    if (parsed.top_p !== undefined) {
      params.topP = parsed.top_p as number;
    }

    // Include other parameters that might affect response
    const optionalParams = [
      'frequency_penalty',
      'presence_penalty',
      'stop',
      'seed',
      'user',
    ];

    for (const param of optionalParams) {
      if (parsed[param] !== undefined) {
        params[param] = parsed[param];
      }
    }

    return params;
  } catch {
    // Failed to parse body
    return null;
  }
}

/**
 * Validates if a request is cacheable
 *
 * @param method - HTTP method
 * @param body - Request body (optional)
 * @returns Whether request is cacheable
 */
export function isCacheableRequest(
  method: string,
  body?: string | null
): boolean {
  // Only cache POST/PUT/PATCH requests with body
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
    return false;
  }

  // Must have a body
  if (!body) {
    return false;
  }

  // Try to extract cache key params
  const params = extractCacheKeyParams(body);
  return params !== null;
}

/**
 * Generates a cache key from a request
 *
 * Convenience function that combines cacheability check
 * and key generation.
 *
 * @param method - HTTP method
 * @param body - Request body
 * @returns Cache key or null if not cacheable
 */
export function generateCacheKeyFromRequest(
  method: string,
  body: string | null
): string | null {
  if (!isCacheableRequest(method, body)) {
    return null;
  }

  const params = extractCacheKeyParams(body!);
  if (!params) {
    return null;
  }

  return generateCacheKey(params);
}
