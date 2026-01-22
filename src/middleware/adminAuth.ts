import type { Context, Next } from 'hono';
import { getConfig } from '../config.js';

export type AdminAuthContext = {
  isAuthenticated: true;
};

/**
 * Extract admin API key from headers
 * Supports both Authorization: Bearer <key> and x-api-key: <key> headers
 */
export function extractAdminApiKey(headers: Headers): string | null {
  const authHeader = headers.get('authorization');
  if (authHeader) {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch) {
      return bearerMatch[1].trim();
    }
  }
  const xApiKey = headers.get('x-api-key');
  return xApiKey ? xApiKey.trim() : null;
}

/**
 * Validate admin API key against configured master key
 * @param keyHeader - The API key from request headers
 * @returns Object with valid flag and optional error details
 */
export function validateAdminApiKey(keyHeader: string | null | undefined): {
  valid: boolean;
  error?: string;
  statusCode?: number;
} {
  // Check if admin API is enabled
  const config = getConfig();
  if (!config.adminApiEnabled) {
    return {
      valid: false,
      error: 'Admin API is disabled',
      statusCode: 403,
    };
  }

  // Check if API key is provided
  if (keyHeader === null || keyHeader === undefined) {
    return {
      valid: false,
      error: 'Admin API key required. Use Authorization: Bearer <key> or x-api-key: <key>',
      statusCode: 401,
    };
  }

  // Trim whitespace from API key
  const key = keyHeader.trim();

  // Check if API key is empty (after trimming)
  if (!key) {
    return {
      valid: false,
      error: 'Admin API key cannot be empty',
      statusCode: 401,
    };
  }

  // Validate against master admin key
  if (key !== config.adminApiKey) {
    return {
      valid: false,
      error: 'Invalid admin API key',
      statusCode: 401,
    };
  }

  return {
    valid: true,
  };
}

/**
 * Admin authentication middleware
 * Validates admin API key and attaches authentication status to context
 *
 * @example
 * ```ts
 * import { adminAuthMiddleware } from './middleware/adminAuth.js';
 *
 * app.use('/admin/api/*', adminAuthMiddleware);
 * ```
 */
export async function adminAuthMiddleware(
  c: Context<{ Variables: AdminAuthContext }>,
  next: Next
) {
  const apiKeyHeader = extractAdminApiKey(c.req.raw.headers);
  const validation = validateAdminApiKey(apiKeyHeader);

  if (!validation.valid) {
    return c.json(
      { error: validation.error },
      validation.statusCode as any
    );
  }

  // Attach authentication status to context
  c.set('isAuthenticated', true);
  await next();
}

/**
 * Helper to check if request is authenticated as admin
 * @param c - Hono context with admin auth variables
 * @returns True if authenticated
 */
export function isAdminAuthenticated(
  c: Context<{ Variables: AdminAuthContext }>
): boolean {
  return c.get('isAuthenticated') === true;
}
