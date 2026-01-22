/**
 * Admin Token Generation and Validation
 *
 * Provides JWT-based token generation for admin authentication.
 * Tokens can be used as an alternative to direct API key authentication.
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { getConfig } from '../config.js';
import { getRawAdminKey } from './adminCredentials.js';

/**
 * Admin token payload structure
 */
export interface AdminTokenPayload extends JWTPayload {
  /** Token type identifier */
  type: 'admin';
  /** When the token was issued */
  iat: number;
  /** Token expiration time */
  exp: number;
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  /** Whether the token is valid */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** HTTP status code for error responses */
  statusCode?: number;
  /** Decoded token payload if valid */
  payload?: AdminTokenPayload;
}

/**
 * Generate a secure random key for JWT signing
 * Uses the admin API key to derive a consistent signing key
 */
async function getSigningKey(): Promise<Uint8Array> {
  // Use the admin API key as the secret key for signing tokens
  // We use getRawAdminKey() which retrieves the key from environment variables
  // The key is only used for signing, never compared directly
  const encoder = new TextEncoder();
  return encoder.encode(getRawAdminKey());
}

/**
 * Generate an admin authentication token
 *
 * Tokens are JWTs signed with the admin API key and include:
 * - Type identifier ('admin')
 * - JWT ID (jti) - unique identifier for each token
 * - Issued at timestamp (iat) with millisecond precision
 * - Expiration timestamp (exp)
 *
 * @returns JWT token string
 *
 * @example
 * ```ts
 * import { generateAdminToken } from './utils/adminToken.js';
 *
 * const token = await generateAdminToken();
 * console.log(`Admin token: ${token}`);
 * ```
 */
export async function generateAdminToken(): Promise<string> {
  const signingKey = await getSigningKey();

  // Calculate expiration time
  const config = getConfig();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + config.adminTokenExpirationSeconds;

  // Generate unique JWT ID using timestamp and random string
  const jti = `${Date.now()}-${crypto.randomUUID()}`;

  // Create and sign the JWT
  const token = await new SignJWT({ type: 'admin', jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setJti(jti)
    .sign(signingKey);

  return token;
}

/**
 * Validate an admin authentication token
 *
 * Verifies the JWT signature, checks expiration, and ensures it's an admin token.
 *
 * @param token - The JWT token string to validate
 * @returns Validation result with payload if valid
 *
 * @example
 * ```ts
 * import { validateAdminToken } from './utils/adminToken.js';
 *
 * const result = await validateAdminToken(token);
 * if (result.valid) {
 *   console.log('Token is valid:', result.payload);
 * } else {
 *   console.log('Token invalid:', result.error);
 * }
 * ```
 */
export async function validateAdminToken(token: string): Promise<TokenValidationResult> {
  // Check if token is provided
  if (!token || token.trim() === '') {
    return {
      valid: false,
      error: 'Token is required',
      statusCode: 401,
    };
  }

  // Trim whitespace
  token = token.trim();

  try {
    const signingKey = await getSigningKey();

    // Verify the JWT signature and decode
    const { payload } = await jwtVerify(token, signingKey);

    // Verify it's an admin token
    if (payload.type !== 'admin') {
      return {
        valid: false,
        error: 'Invalid token type',
        statusCode: 401,
      };
    }

    // Token is valid
    return {
      valid: true,
      payload: payload as AdminTokenPayload,
    };
  } catch (error) {
    // Handle specific JWT errors
    if (error instanceof Error) {
      if (error.name === 'JWTExpired') {
        return {
          valid: false,
          error: 'Token has expired',
          statusCode: 401,
        };
      }
      if (error.name === 'JWTInvalid' || error.name === 'JWSSignatureVerificationFailed') {
        return {
          valid: false,
          error: 'Invalid token signature',
          statusCode: 401,
        };
      }
    }

    // Generic error
    return {
      valid: false,
      error: 'Token validation failed',
      statusCode: 401,
    };
  }
}

/**
 * Extract token from Authorization header
 * Supports both "Bearer <token>" and direct token formats
 *
 * @param authHeader - The Authorization header value
 * @returns The token string or null if not found
 *
 * @example
 * ```ts
 * const token = extractTokenFromHeader('Bearer eyJhbGci...');
 * console.log(token); // 'eyJhbGci...'
 * ```
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  const trimmed = authHeader.trim();

  // Check for Bearer prefix
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    return trimmed.slice(7).trim();
  }

  // Return the whole value as the token
  return trimmed;
}

/**
 * Check if a string looks like a JWT token
 * JWTs have 3 parts separated by dots, and all parts must be non-empty
 *
 * @param str - String to check
 * @returns True if it looks like a JWT
 */
export function isLikelyJWT(str: string): boolean {
  const trimmed = str.trim();
  const parts = trimmed.split('.');
  // Must have exactly 3 parts and all parts must be non-empty
  return parts.length === 3 && parts.every(part => part.length > 0);
}
