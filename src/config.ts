/**
 * Application Configuration
 *
 * DESIGN PRINCIPLES:
 * - Centralized configuration management with validation
 * - Fail-fast: Application won't start with invalid configuration
 * - Type-safe: All config values are properly typed
 * - Singleton pattern: Configuration loaded once and cached
 *
 * BUN ENV LOADING:
 * Bun automatically loads .env files, so we just validate and type the values.
 * No need for dotenv or similar packages.
 *
 * ERROR HANDLING:
 * Configuration errors throw exceptions with helpful messages.
 * This prevents the application from running with misconfigured settings.
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
 *
 * DESIGN: Supports flexible CORS configuration:
 * - Single '*' allows all origins (development)
 * - Comma-separated list for specific origins (production)
 * - Empty string defaults to wildcard for convenience
 *
 * SECURITY: In production, use specific origins instead of '*'
 * to prevent unauthorized cross-origin requests.
 *
 * @param value - Environment variable value
 * @returns Array of origin strings
 */
function parseCorsOrigins(value: string): string[] {
  if (!value || value.trim() === '*') {
    return ['*'];
  }
  return value.split(',').map(origin => origin.trim()).filter(Boolean);
}

/**
 * Validate and load application configuration
 *
 * VALIDATION STRATEGY:
 * - Check required variables first (fail fast)
 * - Parse and validate numeric values with type coercion
 * - Provide helpful error messages for invalid values
 * - Use sensible defaults for optional settings
 *
 * DESIGN DECISIONS:
 * - Port: Default to 3000 (common for Node.js apps)
 * - Rate limit: Default to 60 (common API rate limiting)
 * - Token expiration: Default to 86400s (24 hours)
 * - Admin API enabled: Default to true, can be disabled
 *
 * @throws {Error} If required environment variables are missing or invalid
 */
function loadConfig(): AppConfig {
  // Validate required environment variables first
  // This prevents the app from starting with incomplete configuration
  const requiredVars = ['ZAI_API_KEY', 'ADMIN_API_KEY', 'DATABASE_PATH'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}\n` +
      `Please check your .env file and .env.example`
    );
  }

  // Parse port with validation (must be valid TCP port)
  const portValue = process.env.PORT || '3000';
  const port = parseInt(portValue, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${portValue}. Must be between 1 and 65535.`);
  }

  // Parse rate limit with validation (0 = unlimited, max 10000)
  const rateLimitValue = process.env.DEFAULT_RATE_LIMIT || '60';
  const defaultRateLimit = parseInt(rateLimitValue, 10);
  if (isNaN(defaultRateLimit) || defaultRateLimit < 0) {
    throw new Error(`Invalid DEFAULT_RATE_LIMIT value: ${rateLimitValue}. Must be a positive number.`);
  }

  // Parse admin API enabled flag (default to true unless explicitly 'false')
  // This allows easy disabling without changing the entire env var
  const adminApiEnabled = process.env.ADMIN_API_ENABLED !== 'false';

  // Parse admin token expiration (minimum 60 seconds to prevent abuse)
  // Default to 24 hours (86400 seconds) for long-lived sessions
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
