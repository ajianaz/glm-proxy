/**
 * Request Logging Middleware
 *
 * Logs all admin API requests with method, path, status, and timing.
 * This helps with debugging, monitoring, and auditing admin operations.
 */

import type { Context, Next } from 'hono';
import type { AdminAuthContext } from './adminAuth.js';

/**
 * Log entry structure for admin API requests
 */
export interface RequestLogEntry {
  timestamp: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  auth_method?: 'api_key' | 'token';
}

/**
 * Request logger middleware for admin API
 * Logs request details before and after processing
 *
 * @example
 * ```ts
 * import { requestLoggerMiddleware } from './middleware/requestLogger.js';
 *
 * app.use('/admin/api/*', requestLoggerMiddleware);
 * ```
 */
export async function requestLoggerMiddleware(
  c: Context<{ Variables: AdminAuthContext }>,
  next: Next
) {
  // Capture start time
  const startTime = performance.now();

  // Extract request details
  const method = c.req.method;
  const path = c.req.path;

  // Process the request
  await next();

  // Calculate duration
  const endTime = performance.now();
  const duration = endTime - startTime;

  // Get response status
  const status = c.res.status;

  // Get auth method if available
  const authMethod = c.get('authMethod');

  // Create log entry
  const logEntry: RequestLogEntry = {
    timestamp: new Date().toISOString(),
    method,
    path,
    status,
    duration_ms: Math.round(duration * 100) / 100, // Round to 2 decimal places
  };

  // Add auth method if available
  if (authMethod) {
    logEntry.auth_method = authMethod;
  }

  // Log the request (using console.log for structured logging)
  console.log('Admin API Request:', JSON.stringify(logEntry));
}

/**
 * Helper to format request log entry as human-readable string
 * @param logEntry - The log entry to format
 * @returns Formatted string for logging
 */
export function formatLogEntry(logEntry: RequestLogEntry): string {
  const authInfo = logEntry.auth_method ? ` [${logEntry.auth_method}]` : '';
  return `${logEntry.timestamp} | ${logEntry.method} ${logEntry.path}${authInfo} | ${logEntry.status} | ${logEntry.duration_ms}ms`;
}

/**
 * Parse log entry from JSON string
 * @param json - JSON stringified log entry
 * @returns Parsed log entry or null if invalid
 */
export function parseLogEntry(json: string): RequestLogEntry | null {
  try {
    const parsed = JSON.parse(json);
    // Basic validation
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'timestamp' in parsed &&
      'method' in parsed &&
      'path' in parsed &&
      'status' in parsed &&
      'duration_ms' in parsed
    ) {
      return parsed as RequestLogEntry;
    }
    return null;
  } catch {
    return null;
  }
}
