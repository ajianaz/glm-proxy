/**
 * API Client Utilities
 *
 * Provides HTTP client functions for interacting with the API key management endpoints.
 * Includes error handling, loading states, and proper TypeScript typing.
 */

import type { ApiKey } from '../types.js';

/**
 * Get authorization headers from sessionStorage
 *
 * Retrieves the stored authentication credentials and returns the appropriate
 * Authorization header for Bearer token or Basic auth.
 *
 * @returns Headers object with Authorization if authenticated, empty object otherwise
 */
function getAuthHeaders(): Record<string, string> {
  const token = sessionStorage.getItem('dashboard_auth_token');
  const authType = sessionStorage.getItem('dashboard_auth_type');

  if (!token || !authType) {
    return {};
  }

  if (authType === 'bearer') {
    return { 'Authorization': `Bearer ${token}` };
  } else {
    return { 'Authorization': `Basic ${token}` };
  }
}

/**
 * API Error class for handling API-specific errors
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/**
 * API Response interface for list operations
 */
export interface ApiListResponse<T> {
  keys: T[];
  total?: number;
}

/**
 * Options for API requests
 */
export interface ApiRequestOptions {
  signal?: AbortSignal;
}

/**
 * Fetch all API keys from the server
 *
 * @param signal - Optional AbortSignal for request cancellation
 * @returns Promise resolving to array of API keys
 * @throws ApiClientError on network or server errors
 */
export async function fetchApiKeys(
  options?: ApiRequestOptions
): Promise<ApiKey[]> {
  try {
    const response = await fetch('/api/keys', {
      signal: options?.signal,
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      const errorData: unknown = await response.json();
      const errorMessage = errorData && typeof errorData === 'object' && 'error' in errorData
        ? String(errorData.error)
        : `HTTP ${response.status}: ${response.statusText}`;
      throw new ApiClientError(errorMessage, response.status, errorData);
    }

    const data: unknown = await response.json();

    if (data && typeof data === 'object' && 'keys' in data && Array.isArray(data.keys)) {
      return data.keys;
    }

    return [];
  } catch (err) {
    if (err instanceof ApiClientError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch API keys';
    throw new ApiClientError(message, undefined, err);
  }
}

/**
 * Create a new API key
 *
 * @param keyData - API key data to create (excluding auto-generated fields)
 * @param signal - Optional AbortSignal for request cancellation
 * @returns Promise resolving to created API key
 * @throws ApiClientError on validation errors or server errors
 */
export async function createApiKey(
  keyData: Omit<ApiKey, 'created_at' | 'last_used' | 'total_lifetime_tokens' | 'usage_windows'>,
  options?: ApiRequestOptions
): Promise<void> {
  try {
    const response = await fetch('/api/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(keyData),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorData: unknown = await response.json();
      const errorMessage = errorData && typeof errorData === 'object' && 'error' in errorData
        ? String(errorData.error)
        : `Failed to create API key: ${response.statusText}`;
      throw new ApiClientError(errorMessage, response.status, errorData);
    }

    // Success - no return value needed (WebSocket will handle updates)
  } catch (err) {
    if (err instanceof ApiClientError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Failed to create API key';
    throw new ApiClientError(message, undefined, err);
  }
}

/**
 * Update an existing API key
 *
 * @param keyId - The key ID to update
 * @param updates - Partial updates to apply (excluding immutable fields)
 * @param signal - Optional AbortSignal for request cancellation
 * @returns Promise resolving when update is complete
 * @throws ApiClientError on validation errors, not found, or server errors
 */
export async function updateApiKey(
  keyId: string,
  updates: Partial<Omit<ApiKey, 'key' | 'created_at'>>,
  options?: ApiRequestOptions
): Promise<void> {
  try {
    const response = await fetch(`/api/keys/${encodeURIComponent(keyId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(updates),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorData: unknown = await response.json();
      const errorMessage = errorData && typeof errorData === 'object' && 'error' in errorData
        ? String(errorData.error)
        : `Failed to update API key: ${response.statusText}`;
      throw new ApiClientError(errorMessage, response.status, errorData);
    }

    // Success - no return value needed (WebSocket will handle updates)
  } catch (err) {
    if (err instanceof ApiClientError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Failed to update API key';
    throw new ApiClientError(message, undefined, err);
  }
}

/**
 * Delete an API key
 *
 * @param keyId - The key ID to delete
 * @param signal - Optional AbortSignal for request cancellation
 * @returns Promise resolving when deletion is complete
 * @throws ApiClientError on not found or server errors
 */
export async function deleteApiKey(
  keyId: string,
  options?: ApiRequestOptions
): Promise<void> {
  try {
    const response = await fetch(`/api/keys/${encodeURIComponent(keyId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal: options?.signal,
    });

    // DELETE returns 204 No Content on success
    if (!response.ok && response.status !== 204) {
      const errorData: unknown = await response.json();
      const errorMessage = errorData && typeof errorData === 'object' && 'error' in errorData
        ? String(errorData.error)
        : `Failed to delete API key: ${response.statusText}`;
      throw new ApiClientError(errorMessage, response.status, errorData);
    }

    // Success - no return value needed (WebSocket will handle updates)
  } catch (err) {
    if (err instanceof ApiClientError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Failed to delete API key';
    throw new ApiClientError(message, undefined, err);
  }
}

/**
 * Fetch usage statistics for a specific API key
 *
 * @param keyId - The key ID to fetch usage for
 * @param signal - Optional AbortSignal for request cancellation
 * @returns Promise resolving to usage statistics
 * @throws ApiClientError on not found or server errors
 */
export async function fetchApiKeyUsage(
  keyId: string,
  options?: ApiRequestOptions
): Promise<unknown> {
  try {
    const response = await fetch(`/api/keys/${encodeURIComponent(keyId)}/usage`, {
      headers: getAuthHeaders(),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorData: unknown = await response.json();
      const errorMessage = errorData && typeof errorData === 'object' && 'error' in errorData
        ? String(errorData.error)
        : `Failed to fetch usage: ${response.statusText}`;
      throw new ApiClientError(errorMessage, response.status, errorData);
    }

    return await response.json();
  } catch (err) {
    if (err instanceof ApiClientError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch usage statistics';
    throw new ApiClientError(message, undefined, err);
  }
}

/**
 * Type-safe helper to extract error message from unknown error
 *
 * @param err - Unknown error object
 * @returns Human-readable error message
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'An unexpected error occurred';
}
