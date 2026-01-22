/**
 * Profiling middleware for request lifecycle tracking
 *
 * Optimized version with lazy initialization and reduced overhead.
 *
 * Integrates with Hono to automatically track request timing
 * through auth, rate limiting, validation, and proxying.
 */

import type { Context, Next } from 'hono';
import { Profiler } from '../profiling/Profiler.js';

// Cache for profiling enabled check to avoid repeated lookups
let profilingEnabledCache: boolean | null = null;

/**
 * Reset the profiling enabled cache (for testing)
 */
export function resetProfilingCache(): void {
  profilingEnabledCache = null;
}

/**
 * Check if profiling is enabled (cached check)
 */
function isProfilingEnabled(): boolean {
  if (profilingEnabledCache === null) {
    profilingEnabledCache = Profiler.isEnabled();
  }
  return profilingEnabledCache;
}

export type ProfilingContext = {
  profiler: Profiler | null;
  requestId: string;
  _cachedMethod?: string;
  _cachedPath?: string;
  _cachedUserAgent?: string;
};

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Extract or generate request ID from headers
 */
function getRequestId(c: Context): string {
  const existingId = c.req.header('X-Request-ID');
  if (existingId) {
    return existingId;
  }
  return generateRequestId();
}

/**
 * Profiling middleware - tracks request lifecycle
 *
 * This middleware should be added as early as possible in the chain
 * to capture the full request duration.
 *
 * Optimizations:
 * - Lazy profiler initialization (only created when profiling is enabled)
 * - Cached request metadata to avoid repeated header lookups
 * - Single enabled check for entire request
 * - Null profiler when disabled (zero overhead)
 */
export async function profilingMiddleware(c: Context<{ Variables: ProfilingContext }>, next: Next) {
  const requestId = getRequestId(c);

  // Cache frequently accessed request metadata
  const cachedMethod = c.req.method;
  const cachedPath = c.req.path;
  const cachedUserAgent = c.req.header('user-agent');

  // Lazy profiler initialization - only create if enabled
  const profiler = isProfilingEnabled() ? new Profiler({ enabled: true }) : null;

  // Attach profiler to context (null if disabled)
  c.set('profiler', profiler);
  c.set('requestId', requestId);
  c.set('_cachedMethod', cachedMethod);
  c.set('_cachedPath', cachedPath);
  c.set('_cachedUserAgent', cachedUserAgent);

  // Add request ID to response header
  c.header('X-Request-ID', requestId);

  // Start profiling (only if enabled)
  if (profiler) {
    profiler.start(requestId);
    profiler.addMetadata('method', cachedMethod);
    profiler.addMetadata('path', cachedPath);
    profiler.addMetadata('userAgent', cachedUserAgent);
    profiler.mark('request_start');
  }

  try {
    await next();

    if (profiler) {
      profiler.mark('request_complete');
      profiler.endMark('request_complete');
      profiler.addMetadata('status', c.res.status);
    }
  } catch (error) {
    if (profiler) {
      profiler.mark('request_error');
      profiler.endMark('request_error');
      profiler.addMetadata('error', error instanceof Error ? error.message : 'Unknown error');
    }
    throw error;
  } finally {
    if (profiler) {
      profiler.end();
    }
  }
}

/**
 * Helper to get profiler from context
 */
export function getProfilerFromContext(c: Context<{ Variables: ProfilingContext }>): Profiler {
  return c.get('profiler');
}

/**
 * Helper to get request ID from context
 */
export function getRequestIdFromContext(c: Context<{ Variables: ProfilingContext }>): string {
  return c.get('requestId');
}

/**
 * Mark an operation within the request lifecycle
 *
 * Helper function to mark operations from middleware or handlers
 */
export function markOperation(
  c: Context<{ Variables: ProfilingContext }>,
  operation: string,
  metadata?: Record<string, unknown>
): void {
  const profiler = getProfilerFromContext(c);
  if (profiler) {
    profiler.mark(operation, metadata);
  }
}

/**
 * End a marked operation
 *
 * Helper function to end operations from middleware or handlers
 */
export function endOperation(
  c: Context<{ Variables: ProfilingContext }>,
  operation: string
): void {
  const profiler = getProfilerFromContext(c);
  if (profiler) {
    profiler.endMark(operation);
  }
}

/**
 * Wrap an async function with profiling marks
 *
 * Utility to automatically mark the start and end of an operation
 */
export async function withProfiling<T>(
  c: Context<{ Variables: ProfilingContext }>,
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  markOperation(c, operation, metadata);
  try {
    const result = await fn();
    endOperation(c, operation);
    return result;
  } catch (error) {
    endOperation(c, operation);
    throw error;
  }
}
