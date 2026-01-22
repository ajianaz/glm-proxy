/**
 * Error Response Utilities
 *
 * Provides standardized error response formatting for all API endpoints.
 * Ensures consistent error structure: { error: string, details?: any }
 */

import type { Context } from 'hono';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  details?: any;
}

/**
 * Validation error detail format
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
}

/**
 * Error types with their HTTP status codes
 */
export enum ErrorType {
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_SERVER_ERROR = 500,
}

/**
 * Create a standardized error response
 *
 * @param c - Hono context
 * @param message - Error message
 * @param statusCode - HTTP status code
 * @param details - Optional error details
 * @returns JSON response with error format
 *
 * @example
 * ```ts
 * return errorResponse(c, 'Resource not found', 404, 'User ID 123 does not exist');
 * ```
 */
export function errorResponse(
  c: Context,
  message: string,
  statusCode: number,
  details?: any
): Response {
  const response: ErrorResponse = { error: message };

  if (details !== undefined) {
    response.details = details;
  }

  return c.json<ErrorResponse>(response, statusCode as any);
}

/**
 * Create a 400 Bad Request error response
 *
 * @param c - Hono context
 * @param message - Error message
 * @param details - Optional error details
 * @returns JSON response with 400 status
 *
 * @example
 * ```ts
 * return badRequestError(c, 'Invalid input', [{ field: 'email', message: 'Invalid email format' }]);
 * ```
 */
export function badRequestError(
  c: Context,
  message: string = 'Bad request',
  details?: any
): Response {
  return errorResponse(c, message, ErrorType.BAD_REQUEST, details);
}

/**
 * Create a 401 Unauthorized error response
 *
 * @param c - Hono context
 * @param message - Error message
 * @returns JSON response with 401 status
 *
 * @example
 * ```ts
 * return unauthorizedError(c, 'Authentication required');
 * ```
 */
export function unauthorizedError(
  c: Context,
  message: string = 'Unauthorized'
): Response {
  return errorResponse(c, message, ErrorType.UNAUTHORIZED);
}

/**
 * Create a 403 Forbidden error response
 *
 * @param c - Hono context
 * @param message - Error message
 * @returns JSON response with 403 status
 *
 * @example
 * ```ts
 * return forbiddenError(c, 'Admin API is disabled');
 * ```
 */
export function forbiddenError(
  c: Context,
  message: string = 'Forbidden'
): Response {
  return errorResponse(c, message, ErrorType.FORBIDDEN);
}

/**
 * Create a 404 Not Found error response
 *
 * @param c - Hono context
 * @param resource - Resource description (e.g., 'API key', 'User')
 * @param identifier - Optional identifier (e.g., ID, name)
 * @returns JSON response with 404 status
 *
 * @example
 * ```ts
 * return notFoundError(c, 'API key', `ID ${id}`);
 * return notFoundError(c, 'User'); // Generic not found
 * ```
 */
export function notFoundError(
  c: Context,
  resource: string,
  identifier?: string
): Response {
  const message = identifier
    ? `${resource} with ${identifier} not found`
    : `${resource} not found`;

  return errorResponse(c, message, ErrorType.NOT_FOUND, identifier);
}

/**
 * Create a 409 Conflict error response
 *
 * @param c - Hono context
 * @param message - Error message
 * @param details - Optional error details
 * @returns JSON response with 409 status
 *
 * @example
 * ```ts
 * return conflictError(c, 'Duplicate API key', [{ field: 'key', message: 'An API key with this hash already exists' }]);
 * ```
 */
export function conflictError(
  c: Context,
  message: string = 'Conflict',
  details?: any
): Response {
  return errorResponse(c, message, ErrorType.CONFLICT, details);
}

/**
 * Create a 500 Internal Server Error response
 *
 * @param c - Hono context
 * @param message - Error message (optional, defaults to generic message)
 * @param logDetails - Details to log (not included in response)
 * @returns JSON response with 500 status
 *
 * @example
 * ```ts
 * return internalServerError(c, 'Failed to create API key', error);
 * ```
 */
export function internalServerError(
  c: Context,
  message: string = 'Internal server error',
  logDetails?: unknown
): Response {
  // Log error details for debugging (but don't include in response)
  if (logDetails !== undefined) {
    console.error(`${message}:`, logDetails);
  }

  return errorResponse(
    c,
    message,
    ErrorType.INTERNAL_SERVER_ERROR,
    'An unexpected error occurred. Please try again later.'
  );
}

/**
 * Create a validation error response with field-level details
 *
 * @param c - Hono context
 * @param details - Array of validation error details
 * @returns JSON response with 400 status
 *
 * @example
 * ```ts
 * return validationError(c, [
 *   { field: 'email', message: 'Invalid email format' },
 *   { field: 'password', message: 'Password must be at least 8 characters' }
 * ]);
 * ```
 */
export function validationError(
  c: Context,
  details: ValidationErrorDetail[]
): Response {
  return badRequestError(c, 'Validation failed', details);
}

/**
 * Create an invalid JSON error response
 *
 * @param c - Hono context
 * @returns JSON response with 400 status
 *
 * @example
 * ```ts
 * try {
 *   const body = await c.req.json();
 * } catch {
 *   return invalidJsonError(c);
 * }
 * ```
 */
export function invalidJsonError(c: Context): Response {
  return badRequestError(c, 'Invalid JSON', [
    { field: 'body', message: 'Request body contains invalid JSON' },
  ]);
}

/**
 * Handle and format errors from error objects
 *
 * Intelligently handles known error types and formats them appropriately.
 * Falls back to internal server error for unknown errors.
 *
 * @param c - Hono context
 * @param error - Error object
 * @param contextMessage - Context message for internal server errors
 * @returns JSON response with appropriate status code
 *
 * @example
 * ```ts
 * try {
 *   // ... operation that might throw
 * } catch (error) {
 *   return handleApiError(c, error, 'Failed to create API key');
 * }
 * ```
 */
export function handleApiError(
  c: Context,
  error: unknown,
  contextMessage?: string
): Response {
  // Handle known error types with specific status codes
  if (isErrorWithType(error)) {
    switch (error.type) {
      case ErrorType.BAD_REQUEST:
        return badRequestError(c, error.message, error.details);
      case ErrorType.UNAUTHORIZED:
        return unauthorizedError(c, error.message);
      case ErrorType.FORBIDDEN:
        return forbiddenError(c, error.message);
      case ErrorType.NOT_FOUND:
        // Use errorResponse directly to avoid double "not found" message
        return errorResponse(c, error.message, ErrorType.NOT_FOUND, error.details);
      case ErrorType.CONFLICT:
        return conflictError(c, error.message, error.details);
      default:
        break;
    }
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return internalServerError(c, contextMessage, error.message);
  }

  // Handle unknown errors
  return internalServerError(c, contextMessage, error);
}

/**
 * Type guard for error objects with type property
 */
function isErrorWithType(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    'message' in error
  );
}

/**
 * Custom API error class with type and details
 */
export class ApiError extends Error {
  constructor(
    public type: ErrorType,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Create a bad request API error
 */
export function createBadRequestError(message: string, details?: any): ApiError {
  return new ApiError(ErrorType.BAD_REQUEST, message, details);
}

/**
 * Create a not found API error
 */
export function createNotFoundError(resource: string, identifier?: string): ApiError {
  const message = identifier
    ? `${resource} with ${identifier} not found`
    : `${resource} not found`;
  return new ApiError(ErrorType.NOT_FOUND, message, identifier);
}

/**
 * Create a conflict API error
 */
export function createConflictError(message: string, details?: any): ApiError {
  return new ApiError(ErrorType.CONFLICT, message, details);
}
