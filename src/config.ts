/**
 * Application Configuration
 *
 * Centralized environment variable management with validation.
 * Bun automatically loads .env files, so we just need to validate and type the values.
 */

interface AppConfig {
  // Core Application Settings
  zaiApiKey: string;
  defaultModel: string;
  port: number;

  // Admin API Configuration
  adminApiKey: string;
  adminApiEnabled: boolean;
  databasePath: string;

  // Admin Token Configuration
  adminTokenExpirationSeconds: number;

  // Rate Limiting Configuration
  defaultRateLimit: number;

  // CORS Configuration
  corsOrigins: string[];
}

/**
 * Parse CORS origins from environment variable
 * Supports comma-separated list of origins
 */
function parseCorsOrigins(value: string): string[] {
  if (!value || value.trim() === '*') {
    return ['*'];
  }
  return value.split(',').map(origin => origin.trim()).filter(Boolean);
}

/**
 * Validate and load application configuration
 * @throws {Error} If required environment variables are missing or invalid
 */
function loadConfig(): AppConfig {
  // Validate required environment variables
  const requiredVars = ['ZAI_API_KEY', 'ADMIN_API_KEY', 'DATABASE_PATH'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}\n` +
      `Please check your .env file and .env.example`
    );
  }

  // Parse port with validation
  const portValue = process.env.PORT || '3000';
  const port = parseInt(portValue, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${portValue}. Must be between 1 and 65535.`);
  }

  // Parse rate limit with validation
  const rateLimitValue = process.env.DEFAULT_RATE_LIMIT || '60';
  const defaultRateLimit = parseInt(rateLimitValue, 10);
  if (isNaN(defaultRateLimit) || defaultRateLimit < 0) {
    throw new Error(`Invalid DEFAULT_RATE_LIMIT value: ${rateLimitValue}. Must be a positive number.`);
  }

  // Parse admin API enabled flag
  const adminApiEnabled = process.env.ADMIN_API_ENABLED !== 'false';

  // Parse admin token expiration (default 24 hours)
  const tokenExpirationValue = process.env.ADMIN_TOKEN_EXPIRATION_SECONDS || '86400';
  const adminTokenExpirationSeconds = parseInt(tokenExpirationValue, 10);
  if (isNaN(adminTokenExpirationSeconds) || adminTokenExpirationSeconds < 60) {
    throw new Error(
      `Invalid ADMIN_TOKEN_EXPIRATION_SECONDS value: ${tokenExpirationValue}. Must be at least 60 seconds.`
    );
  }

  return {
    // Core Application Settings
    zaiApiKey: process.env.ZAI_API_KEY!,
    defaultModel: process.env.DEFAULT_MODEL || 'glm-4.7',
    port,

    // Admin API Configuration
    adminApiKey: process.env.ADMIN_API_KEY!,
    adminApiEnabled,
    databasePath: process.env.DATABASE_PATH!,

    // Admin Token Configuration
    adminTokenExpirationSeconds,

    // Rate Limiting Configuration
    defaultRateLimit,

    // CORS Configuration
    corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS || '*'),
  };
}

/**
 * Application configuration singleton
 * Loaded once on first access to ensure consistency
 */
let cachedConfig: AppConfig | null = null;

/**
 * Reset cached configuration (useful for testing)
 * @internal
 */
export function resetConfig(): void {
  cachedConfig = null;
}

/**
 * Get application configuration
 * Use this to access all environment-based configuration
 *
 * @example
 * ```ts
 * import { config } from './config.js';
 *
 * console.log(`Server running on port ${config.port}`);
 * ```
 */
export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

/**
 * Export configuration as default for convenience
 * Note: This will load config on first import
 */
export default getConfig;

/**
 * Export individual config values for destructuring convenience
 * Note: These will load config on first access
 */
export const zaiApiKey = () => getConfig().zaiApiKey;
export const defaultModel = () => getConfig().defaultModel;
export const port = () => getConfig().port;
export const adminApiKey = () => getConfig().adminApiKey;
export const adminApiEnabled = () => getConfig().adminApiEnabled;
export const databasePath = () => getConfig().databasePath;
export const adminTokenExpirationSeconds = () => getConfig().adminTokenExpirationSeconds;
export const defaultRateLimit = () => getConfig().defaultRateLimit;
export const corsOrigins = () => getConfig().corsOrigins;
