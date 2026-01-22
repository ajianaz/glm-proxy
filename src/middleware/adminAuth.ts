import type { Context, Next } from 'hono';
import { getConfig } from '../config.js';
import {
  validateAdminToken,
  extractTokenFromHeader,
  isLikelyJWT,
  type TokenValidationResult,
} from '../utils/adminToken.js';

export type AdminAuthContext = {
  isAuthenticated: true;
  authMethod: 'api_key' | 'token';
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
 * Extract authentication credential from headers
 * Returns both the credential value and which header it came from
 */
function extractAuthCredential(headers: Headers): {
  credential: string | null;
  source: 'authorization' | 'x-api-key' | null;
} {
  const authHeader = headers.get('authorization');
  const xApiKey = headers.get('x-api-key');

  // Prioritize Authorization header
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return { credential: match[1].trim(), source: 'authorization' };
    }
    // If Authorization header exists but doesn't match Bearer format,
    // still use it (could be a token without Bearer prefix)
    return { credential: authHeader.trim(), source: 'authorization' };
  }

  // Fall back to x-api-key header
  if (xApiKey) {
    return { credential: xApiKey.trim(), source: 'x-api-key' };
  }

  return { credential: null, source: null };
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
 * Validate admin credential (API key or token)
 * Tries API key validation first, then token validation if it looks like a JWT
 *
 * @param credential - The credential string to validate
 * @returns Object with valid flag, optional error details, and auth method
 */
async function validateAdminCredential(credential: string | null): Promise<{
  valid: boolean;
  error?: string;
  statusCode?: number;
  authMethod?: 'api_key' | 'token';
}> {
  // Check if admin API is enabled
  const config = getConfig();
  if (!config.adminApiEnabled) {
    return {
      valid: false,
      error: 'Admin API is disabled',
      statusCode: 403,
    };
  }

  // Check if credential is provided
  if (!credential || credential.trim() === '') {
    return {
      valid: false,
      error: 'Admin API key or token required. Use Authorization: Bearer <credential> or x-api-key: <credential>',
      statusCode: 401,
    };
  }

  const trimmedCredential = credential.trim();

  // Try API key validation first
  if (trimmedCredential === config.adminApiKey) {
    return {
      valid: true,
      authMethod: 'api_key',
    };
  }

  // If it looks like a JWT, try token validation
  if (isLikelyJWT(trimmedCredential)) {
    const tokenResult = await validateAdminToken(trimmedCredential);
    if (tokenResult.valid) {
      return {
        valid: true,
        authMethod: 'token',
      };
    }

    // Token looked like JWT but was invalid
    return {
      valid: false,
      error: tokenResult.error || 'Invalid admin token',
      statusCode: tokenResult.statusCode || 401,
    };
  }

  // Not a valid API key and doesn't look like a token
  return {
    valid: false,
    error: 'Invalid admin API key or token',
    statusCode: 401,
  };
}

/**
 * Admin authentication middleware
 * Validates admin API key or token and attaches authentication status to context
 *
 * Supports both direct API key authentication and JWT token authentication.
 * Tokens are validated after API key validation fails.
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
  const { credential } = extractAuthCredential(c.req.raw.headers);
  const validation = await validateAdminCredential(credential);

  if (!validation.valid) {
    return c.json(
      { error: validation.error },
      validation.statusCode as any
    );
  }

  // Attach authentication status and method to context
  c.set('isAuthenticated', true);
  c.set('authMethod', validation.authMethod!);
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

/**
 * Helper to get the authentication method used
 * @param c - Hono context with admin auth variables
 * @returns The authentication method ('api_key' or 'token') or undefined
 */
export function getAuthMethod(
  c: Context<{ Variables: AdminAuthContext }>
): 'api_key' | 'token' | undefined {
  return c.get('authMethod');
}
