/**
 * Profiling middleware for request lifecycle tracking
 *
 * Integrates with Hono to automatically track request timing
 * through auth, rate limiting, validation, and proxying.
 */

import type { Context, Next } from 'hono';
import { Profiler } from '../profiling/Profiler.js';

export type ProfilingContext = {
  profiler: Profiler;
  requestId: string;
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
 */
export async function profilingMiddleware(c: Context<{ Variables: ProfilingContext }>, next: Next) {
  const requestId = getRequestId(c);
  const profiler = new Profiler({ enabled: Profiler.isEnabled() });

  // Attach profiler to context
  c.set('profiler', profiler);
  c.set('requestId', requestId);

  // Add request ID to response header
  c.header('X-Request-ID', requestId);

  // Start profiling
  profiler.start(requestId);
  profiler.addMetadata('method', c.req.method);
  profiler.addMetadata('path', c.req.path);
  profiler.addMetadata('userAgent', c.req.header('user-agent'));

  // Mark request start
  profiler.mark('request_start');

  try {
    await next();

    // Mark request completion
    profiler.mark('request_complete');
    profiler.endMark('request_complete');

    // Add response metadata
    profiler.addMetadata('status', c.res.status);
  } catch (error) {
    // Mark request error
    profiler.mark('request_error');
    profiler.endMark('request_error');
    profiler.addMetadata('error', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  } finally {
    // End profiling and store data
    const data = profiler.end();
    if (data) {
      // Data is automatically stored in Profiler's global data store
      // We could add additional logging here if needed
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
