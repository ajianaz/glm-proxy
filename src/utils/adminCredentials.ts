/**
 * Admin Credential Storage
 *
 * Provides secure storage and validation for admin credentials.
 * Uses SHA-256 hashing to avoid storing plain-text admin keys in memory.
 */

import { createHash } from 'crypto';
import { getConfig } from '../config.js';

/**
 * Cached hash of the admin API key
 * Computed once on initialization to avoid repeated hashing
 */
let cachedAdminKeyHash: string | null = null;

/**
 * Compute SHA-256 hash of a string
 * @param data - String to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function hashCredential(data: string): string {
  return createHash('sha256').update(data, 'utf-8').digest('hex');
}

/**
 * Get the hash of the admin API key from environment
 * Computes and caches the hash on first call
 * @returns SHA-256 hash of the admin API key
 */
export function getAdminKeyHash(): string {
  if (!cachedAdminKeyHash) {
    const config = getConfig();
    cachedAdminKeyHash = hashCredential(config.adminApiKey);
  }
  return cachedAdminKeyHash;
}

/**
 * Validate a credential against the admin key hash
 * @param credential - The credential to validate (plain text key or token)
 * @returns true if the credential matches the admin key
 */
export function validateAdminCredential(credential: string): boolean {
  const credentialHash = hashCredential(credential.trim());
  const adminHash = getAdminKeyHash();
  return credentialHash === adminHash;
}

/**
 * Reset cached admin key hash
 * Useful for testing when environment variables change
 */
export function resetAdminKeyCache(): void {
  cachedAdminKeyHash = null;
}

/**
 * Get the raw admin API key from environment
 * WARNING: This returns the plain text key, use sparingly and only for JWT signing
 * @internal
 */
export function getRawAdminKey(): string {
  const config = getConfig();
  return config.adminApiKey;
}
