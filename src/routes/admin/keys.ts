/**
 * Admin API Routes - API Key Management
 *
 * Provides CRUD endpoints for programmatic API key management.
 * All endpoints require admin authentication via API key or JWT token.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { adminAuthMiddleware, type AdminAuthContext } from '../../middleware/adminAuth.js';
import { ApiKeyModel, ApiKeyValidationError, ApiKeyDuplicateError } from '../../models/apiKey.js';
import type { ApiKeyResponse, CreateApiKeyData } from '../../models/schema.js';

// Create Hono app with admin auth context
const app = new Hono<{ Variables: AdminAuthContext }>();

/**
 * Request validation schema for creating API keys
 */
const createApiKeySchema = z.object({
  key: z.string()
    .min(16, 'API key must be at least 16 characters long')
    .max(256, 'API key must not exceed 256 characters')
    .regex(/^[a-zA-Z0-9\-_\.]+$/, 'API key can only contain alphanumeric characters, hyphens, underscores, and dots'),

  name: z.string()
    .trim()
    .min(1, 'Name is required')
    .max(255, 'Name must not exceed 255 characters'),

  description: z.string()
    .max(1000, 'Description must not exceed 1000 characters')
    .nullable()
    .optional(),

  scopes: z.array(z.string()).optional(),

  rate_limit: z.number()
    .int('Rate limit must be an integer')
    .min(0, 'Rate limit must be at least 0')
    .max(10000, 'Rate limit must not exceed 10000')
    .optional(),
});

/**
 * Type for create API key request body
 */
type CreateApiKeyRequest = z.infer<typeof createApiKeySchema>;

/**
 * Request validation schema for listing API keys (query parameters)
 */
const listApiKeysSchema = z.object({
  page: z.string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : undefined)
    .refine((val) => val === undefined || (Number.isInteger(val) && val >= 1), {
      message: 'Page must be a positive integer',
    }),

  limit: z.string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : undefined)
    .refine((val) => val === undefined || (Number.isInteger(val) && val >= 1 && val <= 100), {
      message: 'Limit must be an integer between 1 and 100',
    }),

  is_active: z.string()
    .optional()
    .refine((val) => !val || val === 'true' || val === 'false', {
      message: 'is_active must be true or false',
    })
    .transform((val) => val === 'true' ? true : val === 'false' ? false : undefined),

  search: z.string()
    .optional()
    .transform((val) => val ? val.trim() : undefined)
    .refine((val) => val === undefined || val.length > 0, {
      message: 'Search cannot be empty',
    }),
});

/**
 * Type for list API keys query parameters
 */
type ListApiKeysQuery = z.infer<typeof listApiKeysSchema>;

/**
 * Format validation errors for API response
 */
function formatValidationErrors(error: z.ZodError): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * POST /admin/api/keys
 *
 * Create a new API key with validation.
 *
 * @example
 * ```bash
 * curl -X POST http://localhost:3000/admin/api/keys \
 *   -H "Authorization: Bearer <admin-api-key>" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "key": "sk-test-1234567890abcdefghijklmnop",
 *     "name": "Test Key",
 *     "description": "A test API key",
 *     "scopes": ["read", "write"],
 *     "rate_limit": 100
 *   }'
 * ```
 */
app.post('/', adminAuthMiddleware, async (c) => {
  try {
    // Parse and validate request body
    let rawBody;
    try {
      rawBody = await c.req.json();
    } catch (parseError) {
      return c.json(
        {
          error: 'Invalid JSON',
          details: [{ field: 'body', message: 'Request body contains invalid JSON' }],
        },
        400
      );
    }

    const validationResult = createApiKeySchema.safeParse(rawBody);

    if (!validationResult.success) {
      const errors = formatValidationErrors(validationResult.error);
      return c.json(
        {
          error: 'Validation failed',
          details: errors,
        },
        400
      );
    }

    const data: CreateApiKeyData = validationResult.data;

    // Create API key using model
    const result = ApiKeyModel.create(data);

    // Return 201 Created with the created key (includes key_preview)
    return c.json(result, 201);
  } catch (error) {
    // Handle specific error types
    if (error instanceof ApiKeyValidationError) {
      return c.json(
        {
          error: 'Validation failed',
          details: [{ field: 'general', message: error.message }],
        },
        400
      );
    }

    if (error instanceof ApiKeyDuplicateError) {
      return c.json(
        {
          error: 'Duplicate API key',
          details: [{ field: 'key', message: 'An API key with this hash already exists' }],
        },
        409
      );
    }

    // Handle unexpected errors
    console.error('Unexpected error creating API key:', error);
    return c.json(
      {
        error: 'Internal server error',
        details: 'An unexpected error occurred while creating the API key',
      },
      500
    );
  }
});

/**
 * GET /admin/api/keys
 *
 * List all API keys with pagination and filtering.
 *
 * @example
 * ```bash
 * curl -X GET "http://localhost:3000/admin/api/keys?page=1&limit=10&is_active=true&search=test" \
 *   -H "Authorization: Bearer <admin-api-key>"
 * ```
 */
app.get('/', adminAuthMiddleware, async (c) => {
  try {
    // Parse and validate query parameters
    const queryParams = c.req.query();
    const validationResult = listApiKeysSchema.safeParse(queryParams);

    if (!validationResult.success) {
      const errors = formatValidationErrors(validationResult.error);
      return c.json(
        {
          error: 'Validation failed',
          details: errors,
        },
        400
      );
    }

    const params = validationResult.data;

    // List API keys using model
    const result = ApiKeyModel.list({
      page: params.page,
      limit: params.limit,
      is_active: params.is_active,
      search: params.search,
    });

    // Return 200 OK with paginated list
    return c.json(result, 200);
  } catch (error) {
    // Handle unexpected errors
    console.error('Unexpected error listing API keys:', error);
    return c.json(
      {
        error: 'Internal server error',
        details: 'An unexpected error occurred while listing API keys',
      },
      500
    );
  }
});

/**
 * GET /admin/api/keys/:id
 *
 * Get a specific API key by ID.
 *
 * @example
 * ```bash
 * curl -X GET "http://localhost:3000/admin/api/keys/1" \
 *   -H "Authorization: Bearer <admin-api-key>"
 * ```
 */
app.get('/:id', adminAuthMiddleware, async (c) => {
  try {
    // Extract and validate ID parameter
    const idParam = c.req.param('id');

    // Validate ID is a positive integer
    const idValidation = z.object({
      id: z.string()
        .regex(/^\d+$/, 'ID must be a positive integer')
        .transform((val) => parseInt(val, 10))
        .refine((val) => val > 0, 'ID must be greater than 0'),
    }).safeParse({ id: idParam });

    if (!idValidation.success) {
      const errors = formatValidationErrors(idValidation.error);
      return c.json(
        {
          error: 'Validation failed',
          details: errors,
        },
        400
      );
    }

    const id = idValidation.data.id;

    // Find API key by ID
    const result = ApiKeyModel.findById(id);

    if (!result) {
      return c.json(
        {
          error: 'Not found',
          details: `API key with id ${id} not found`,
        },
        404
      );
    }

    // Return 200 OK with the API key details
    return c.json(result, 200);
  } catch (error) {
    // Handle unexpected errors
    console.error('Unexpected error retrieving API key:', error);
    return c.json(
      {
        error: 'Internal server error',
        details: 'An unexpected error occurred while retrieving the API key',
      },
      500
    );
  }
});

export default app;
