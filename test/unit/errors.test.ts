/**
 * Error Response Utilities Tests
 *
 * Tests for standardized error response formatting functions.
 */

import { test, expect } from 'bun:test';
import {
  badRequestError,
  unauthorizedError,
  forbiddenError,
  notFoundError,
  conflictError,
  internalServerError,
  validationError,
  invalidJsonError,
  handleApiError,
  ApiError,
  ErrorType,
  createBadRequestError,
  createNotFoundError,
  createConflictError,
  type ErrorResponse,
  type ValidationErrorDetail,
} from '../../src/utils/errors.js';

// Mock Hono context for testing
function createMockContext(): any {
  return {
    json: (data: ErrorResponse, status: number) => ({
      json: data,
      status,
    }),
  };
}

test('badRequestError creates 400 error', () => {
  const c = createMockContext();
  const response = badRequestError(c, 'Invalid input');
  // @ts-expect-error Bun test type inference
  expect(response.status).toBe(400);
  // @ts-expect-error Bun test type inference
  expect(response.json).toEqual({
    error: 'Invalid input',
  });
});

test('badRequestError with default message', () => {
  const c = createMockContext();
  const response = badRequestError(c);
  expect(response.status).toBe(400);
  expect(response.json).toEqual({
    error: 'Bad request',
  });
});

test('badRequestError with details', () => {
  const c = createMockContext();
  const details = [{ field: 'name', message: 'Name is required' }];
  const response = badRequestError(c, 'Validation failed', details);
  expect(response.status).toBe(400);
  expect(response.json).toEqual({
    error: 'Validation failed',
    details,
  });
});

test('unauthorizedError creates 401 error', () => {
  const c = createMockContext();
  const response = unauthorizedError(c, 'Authentication required');
  expect(response.status).toBe(401);
  expect(response.json).toEqual({
    error: 'Authentication required',
  });
});

test('unauthorizedError with default message', () => {
  const c = createMockContext();
  const response = unauthorizedError(c);
  expect(response.status).toBe(401);
  expect(response.json).toEqual({
    error: 'Unauthorized',
  });
});

test('forbiddenError creates 403 error', () => {
  const c = createMockContext();
  const response = forbiddenError(c, 'Admin API is disabled');
  expect(response.status).toBe(403);
  expect(response.json).toEqual({
    error: 'Admin API is disabled',
  });
});

test('forbiddenError with default message', () => {
  const c = createMockContext();
  const response = forbiddenError(c);
  expect(response.status).toBe(403);
  expect(response.json).toEqual({
    error: 'Forbidden',
  });
});

test('notFoundError creates 404 error with resource', () => {
  const c = createMockContext();
  const response = notFoundError(c, 'API key', 'ID 123');
  expect(response.status).toBe(404);
  expect(response.json).toEqual({
    error: 'API key with ID 123 not found',
    details: 'ID 123',
  });
});

test('notFoundError without identifier', () => {
  const c = createMockContext();
  const response = notFoundError(c, 'User');
  expect(response.status).toBe(404);
  expect(response.json).toEqual({
    error: 'User not found',
  });
});

test('conflictError creates 409 error', () => {
  const c = createMockContext();
  const details = [{ field: 'key', message: 'Duplicate key' }];
  const response = conflictError(c, 'Duplicate API key', details);
  expect(response.status).toBe(409);
  expect(response.json).toEqual({
    error: 'Duplicate API key',
    details,
  });
});

test('conflictError with default message', () => {
  const c = createMockContext();
  const response = conflictError(c);
  expect(response.status).toBe(409);
  expect(response.json).toEqual({
    error: 'Conflict',
  });
});

test('internalServerError creates 500 error', () => {
  const c = createMockContext();
  const response = internalServerError(c, 'Database error');
  expect(response.status).toBe(500);
  expect(response.json).toEqual({
    error: 'Database error',
    details: 'An unexpected error occurred. Please try again later.',
  });
});

test('internalServerError with default message', () => {
  const c = createMockContext();
  const response = internalServerError(c);
  expect(response.status).toBe(500);
  expect(response.json).toEqual({
    error: 'Internal server error',
    details: 'An unexpected error occurred. Please try again later.',
  });
});

test('internalServerError logs details', () => {
  const c = createMockContext();
  let loggedError: unknown;
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    loggedError = args;
  };

  const error = new Error('Database connection failed');
  const response = internalServerError(c, 'Failed to connect', error);

  expect(response.status).toBe(500);
  expect(response.json).toEqual({
    error: 'Failed to connect',
    details: 'An unexpected error occurred. Please try again later.',
  });
  expect(loggedError).toBeDefined();

  console.error = originalConsoleError;
});

test('validationError creates 400 error with field details', () => {
  const c = createMockContext();
  const details: ValidationErrorDetail[] = [
    { field: 'email', message: 'Invalid email format' },
    { field: 'password', message: 'Password too short' },
  ];
  const response = validationError(c, details);
  expect(response.status).toBe(400);
  expect(response.json).toEqual({
    error: 'Validation failed',
    details,
  });
});

test('invalidJsonError creates 400 error for malformed JSON', () => {
  const c = createMockContext();
  const response = invalidJsonError(c);
  expect(response.status).toBe(400);
  expect(response.json).toEqual({
    error: 'Invalid JSON',
    details: [{ field: 'body', message: 'Request body contains invalid JSON' }],
  });
});

test('handleApiError with ApiError type BAD_REQUEST', () => {
  const c = createMockContext();
  const error = new ApiError(ErrorType.BAD_REQUEST, 'Invalid input', [
    { field: 'age', message: 'Must be positive' },
  ]);
  const response = handleApiError(c, error);
  expect(response.status).toBe(400);
  expect(response.json).toEqual({
    error: 'Invalid input',
    details: [{ field: 'age', message: 'Must be positive' }],
  });
});

test('handleApiError with ApiError type UNAUTHORIZED', () => {
  const c = createMockContext();
  const error = new ApiError(ErrorType.UNAUTHORIZED, 'Authentication required');
  const response = handleApiError(c, error);
  expect(response.status).toBe(401);
  expect(response.json).toEqual({
    error: 'Authentication required',
  });
});

test('handleApiError with ApiError type FORBIDDEN', () => {
  const c = createMockContext();
  const error = new ApiError(ErrorType.FORBIDDEN, 'Access denied');
  const response = handleApiError(c, error);
  expect(response.status).toBe(403);
  expect(response.json).toEqual({
    error: 'Access denied',
  });
});

test('handleApiError with ApiError type NOT_FOUND', () => {
  const c = createMockContext();
  const error = new ApiError(ErrorType.NOT_FOUND, 'API key not found', 'ID 123');
  const response = handleApiError(c, error);
  expect(response.status).toBe(404);
  expect(response.json).toEqual({
    error: 'API key not found',
    details: 'ID 123',
  });
});

test('handleApiError with ApiError type CONFLICT', () => {
  const c = createMockContext();
  const error = new ApiError(ErrorType.CONFLICT, 'Duplicate key', [
    { field: 'key', message: 'Key already exists' },
  ]);
  const response = handleApiError(c, error);
  expect(response.status).toBe(409);
  expect(response.json).toEqual({
    error: 'Duplicate key',
    details: [{ field: 'key', message: 'Key already exists' }],
  });
});

test('handleApiError with standard Error', () => {
  const c = createMockContext();
  const error = new Error('Something went wrong');
  let loggedError: unknown;
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    loggedError = args;
  };

  const response = handleApiError(c, error, 'Failed to process');

  expect(response.status).toBe(500);
  expect(response.json).toEqual({
    error: 'Failed to process',
    details: 'An unexpected error occurred. Please try again later.',
  });
  expect(loggedError).toBeDefined();

  console.error = originalConsoleError;
});

test('handleApiError with unknown error type', () => {
  const c = createMockContext();
  const error = 'string error';
  let loggedError: unknown;
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    loggedError = args;
  };

  const response = handleApiError(c, error, 'Unexpected error');

  expect(response.status).toBe(500);
  expect(response.json).toEqual({
    error: 'Unexpected error',
    details: 'An unexpected error occurred. Please try again later.',
  });
  expect(loggedError).toBeDefined();

  console.error = originalConsoleError;
});

test('createBadRequestError creates ApiError with BAD_REQUEST type', () => {
  const error = createBadRequestError('Invalid data', [{ field: 'x', message: 'Invalid' }]);
  expect(error).toBeInstanceOf(ApiError);
  expect(error.type).toBe(ErrorType.BAD_REQUEST);
  expect(error.message).toBe('Invalid data');
  expect(error.details).toEqual([{ field: 'x', message: 'Invalid' }]);
});

test('createNotFoundError creates ApiError with NOT_FOUND type', () => {
  const error = createNotFoundError('API key', 'ID 123');
  expect(error).toBeInstanceOf(ApiError);
  expect(error.type).toBe(ErrorType.NOT_FOUND);
  expect(error.message).toBe('API key with ID 123 not found');
  expect(error.details).toBe('ID 123');
});

test('createNotFoundError without identifier', () => {
  const error = createNotFoundError('User');
  expect(error).toBeInstanceOf(ApiError);
  expect(error.type).toBe(ErrorType.NOT_FOUND);
  expect(error.message).toBe('User not found');
  expect(error.details).toBeUndefined();
});

test('createConflictError creates ApiError with CONFLICT type', () => {
  const error = createConflictError('Duplicate entry', [{ field: 'id', message: 'Must be unique' }]);
  expect(error).toBeInstanceOf(ApiError);
  expect(error.type).toBe(ErrorType.CONFLICT);
  expect(error.message).toBe('Duplicate entry');
  expect(error.details).toEqual([{ field: 'id', message: 'Must be unique' }]);
});

test('ErrorType enum values are correct', () => {
  expect(ErrorType.BAD_REQUEST).toBe(400);
  expect(ErrorType.UNAUTHORIZED).toBe(401);
  expect(ErrorType.FORBIDDEN).toBe(403);
  expect(ErrorType.NOT_FOUND).toBe(404);
  expect(ErrorType.CONFLICT).toBe(409);
  expect(ErrorType.INTERNAL_SERVER_ERROR).toBe(500);
});

test('ApiError has correct name and properties', () => {
  const error = new ApiError(ErrorType.NOT_FOUND, 'Resource not found', 'ID 456');
  expect(error.name).toBe('ApiError');
  expect(error.message).toBe('Resource not found');
  expect(error.type).toBe(ErrorType.NOT_FOUND);
  expect(error.details).toBe('ID 456');
  expect(error).toBeInstanceOf(Error);
});

test('badRequestError with undefined details does not include details field', () => {
  const c = createMockContext();
  const response = badRequestError(c, 'Test error');
  expect(response.json).toEqual({ error: 'Test error' });
  expect('details' in response.json).toBe(false);
});
