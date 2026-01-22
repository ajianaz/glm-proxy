/**
 * Validation Middleware
 *
 * Provides reusable middleware for validating request bodies, query parameters,
 * and path parameters using Zod schemas. Returns consistent error responses.
 */

import type { Context, Next } from 'hono';
import type { z } from 'zod';

/**
 * Validation error detail format
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
}

/**
 * Validation error response format
 */
export interface ValidationErrorResponse {
  error: string;
  details: ValidationErrorDetail[] | string;
}

/**
 * Format Zod validation errors for API response
 *
 * @param error - Zod validation error
 * @returns Array of field-level error details
 */
export function formatValidationErrors(error: z.ZodError): ValidationErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Request body validation context type
 */
export type BodyValidationContext<T> = {
  validatedBody: T;
};

/**
 * Query parameters validation context type
 */
export type QueryValidationContext<T> = {
  validatedQuery: T;
};

/**
 * Path parameters validation context type
 */
export type ParamsValidationContext<T> = {
  validatedParams: T;
};

/**
 * Validate request body against a Zod schema
 *
 * Parses the request body as JSON and validates it against the provided schema.
 * On success, attaches the validated data to the context.
 * On failure, returns a 400 Bad Request response with field-level error details.
 *
 * @param schema - Zod schema to validate against
 * @returns Hono middleware
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 * import { validateBody } from './middleware/validation.js';
 *
 * const createSchema = z.object({
 *   name: z.string().min(1),
 *   email: z.string().email(),
 * });
 *
 * app.post('/users', validateBody(createSchema), async (c) => {
 *   const data = c.get('validatedBody'); // Type-safe validated data
 *   // ... handle request
 * });
 * ```
 */
export function validateBody<T extends z.ZodType>(
  schema: T
): (
  c: Context<{ Variables: BodyValidationContext<z.infer<T>> }>,
  next: Next
) => Promise<Response | void> {
  return async (c, next) => {
    try {
      // Parse request body as JSON
      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch (parseError) {
        return c.json<ValidationErrorResponse>(
          {
            error: 'Invalid JSON',
            details: [{ field: 'body', message: 'Request body contains invalid JSON' }],
          },
          400
        );
      }

      // Validate against schema
      const validationResult = schema.safeParse(rawBody);

      if (!validationResult.success) {
        const errors = formatValidationErrors(validationResult.error);
        return c.json<ValidationErrorResponse>(
          {
            error: 'Validation failed',
            details: errors,
          },
          400
        );
      }

      // Attach validated data to context
      c.set('validatedBody', validationResult.data);
      await next();
    } catch (error) {
      // Handle unexpected errors
      console.error('Unexpected error during request body validation:', error);
      return c.json<ValidationErrorResponse>(
        {
          error: 'Internal server error',
          details: 'An unexpected error occurred during request validation',
        },
        500
      );
    }
  };
}

/**
 * Validate query parameters against a Zod schema
 *
 * Extracts query parameters from the request and validates them against
 * the provided schema. On success, attaches the validated data to the context.
 * On failure, returns a 400 Bad Request response with field-level error details.
 *
 * @param schema - Zod schema to validate against
 * @returns Hono middleware
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 * import { validateQuery } from './middleware/validation.js';
 *
 * const listSchema = z.object({
 *   page: z.string().optional().transform((val) => val ? parseInt(val, 10) : undefined),
 *   limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : undefined),
 * });
 *
 * app.get('/users', validateQuery(listSchema), async (c) => {
 *   const params = c.get('validatedQuery'); // Type-safe validated data
 *   // ... handle request
 * });
 * ```
 */
export function validateQuery<T extends z.ZodType>(
  schema: T
): (
  c: Context<{ Variables: QueryValidationContext<z.infer<T>> }>,
  next: Next
) => Promise<Response | void> {
  return async (c, next) => {
    try {
      // Extract query parameters
      const queryParams = c.req.query();

      // Validate against schema
      const validationResult = schema.safeParse(queryParams);

      if (!validationResult.success) {
        const errors = formatValidationErrors(validationResult.error);
        return c.json<ValidationErrorResponse>(
          {
            error: 'Validation failed',
            details: errors,
          },
          400
        );
      }

      // Attach validated data to context
      c.set('validatedQuery', validationResult.data);
      await next();
    } catch (error) {
      // Handle unexpected errors
      console.error('Unexpected error during query parameter validation:', error);
      return c.json<ValidationErrorResponse>(
        {
          error: 'Internal server error',
          details: 'An unexpected error occurred during query parameter validation',
        },
        500
      );
    }
  };
}

/**
 * Validate path parameters against a Zod schema
 *
 * Extracts path parameters from the request and validates them against
 * the provided schema. On success, attaches the validated data to the context.
 * On failure, returns a 400 Bad Request response with field-level error details.
 *
 * @param schema - Zod schema to validate against
 * @returns Hono middleware
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 * import { validateParams } from './middleware/validation.js';
 *
 * const idSchema = z.object({
 *   id: z.string().regex(/^\d+$/, 'ID must be a positive integer')
 *     .transform((val) => parseInt(val, 10))
 *     .refine((val) => val > 0, 'ID must be greater than 0'),
 * });
 *
 * app.get('/users/:id', validateParams(idSchema), async (c) => {
 *   const params = c.get('validatedParams'); // Type-safe validated data
 *   const userId = params.id;
 *   // ... handle request
 * });
 * ```
 */
export function validateParams<T extends z.ZodType>(
  schema: T
): (
  c: Context<{ Variables: ParamsValidationContext<z.infer<T>> }>,
  next: Next
) => Promise<Response | void> {
  return async (c, next) => {
    try {
      // Extract all path parameters
      const pathParams = c.req.param();

      // Validate against schema
      const validationResult = schema.safeParse(pathParams);

      if (!validationResult.success) {
        const errors = formatValidationErrors(validationResult.error);
        return c.json<ValidationErrorResponse>(
          {
            error: 'Validation failed',
            details: errors,
          },
          400
        );
      }

      // Attach validated data to context
      c.set('validatedParams', validationResult.data);
      await next();
    } catch (error) {
      // Handle unexpected errors
      console.error('Unexpected error during path parameter validation:', error);
      return c.json<ValidationErrorResponse>(
        {
          error: 'Internal server error',
          details: 'An unexpected error occurred during path parameter validation',
        },
        500
      );
    }
  };
}

/**
 * Middleware factory for validating both path parameters and request body
 *
 * Useful for PUT/PATCH endpoints that need to validate both the resource ID
 * and the request body.
 *
 * @param paramsSchema - Zod schema for path parameters
 * @param bodySchema - Zod schema for request body
 * @returns Hono middleware
 *
 * @example
 * ```ts
 * import { z } from 'zod';
 * import { validateParamsAndBody } from './middleware/validation.js';
 *
 * const idSchema = z.object({
 *   id: z.string().regex(/^\d+$/).transform((val) => parseInt(val, 10)),
 * });
 *
 * const updateSchema = z.object({
 *   name: z.string().min(1).optional(),
 *   email: z.string().email().optional(),
 * });
 *
 * app.put('/users/:id', validateParamsAndBody(idSchema, updateSchema), async (c) => {
 *   const params = c.get('validatedParams');
 *   const body = c.get('validatedBody');
 *   // ... handle request
 * });
 * ```
 */
export function validateParamsAndBody<
  P extends z.ZodType,
  B extends z.ZodType
>(
  paramsSchema: P,
  bodySchema: B
): (
  c: Context<{
    Variables: ParamsValidationContext<z.infer<P>> & BodyValidationContext<z.infer<B>>;
  }>,
  next: Next
) => Promise<Response | void> {
  return async (c, next) => {
    try {
      // Validate path parameters
      const pathParams = c.req.param();
      const paramsValidation = paramsSchema.safeParse(pathParams);

      if (!paramsValidation.success) {
        const errors = formatValidationErrors(paramsValidation.error);
        return c.json<ValidationErrorResponse>(
          {
            error: 'Validation failed',
            details: errors,
          },
          400
        );
      }

      // Validate request body
      let rawBody: unknown;
      try {
        rawBody = await c.req.json();
      } catch (parseError) {
        return c.json<ValidationErrorResponse>(
          {
            error: 'Invalid JSON',
            details: [{ field: 'body', message: 'Request body contains invalid JSON' }],
          },
          400
        );
      }

      const bodyValidation = bodySchema.safeParse(rawBody);

      if (!bodyValidation.success) {
        const errors = formatValidationErrors(bodyValidation.error);
        return c.json<ValidationErrorResponse>(
          {
            error: 'Validation failed',
            details: errors,
          },
          400
        );
      }

      // Attach validated data to context
      c.set('validatedParams', paramsValidation.data);
      c.set('validatedBody', bodyValidation.data);
      await next();
    } catch (error) {
      // Handle unexpected errors
      console.error('Unexpected error during validation:', error);
      return c.json<ValidationErrorResponse>(
        {
          error: 'Internal server error',
          details: 'An unexpected error occurred during validation',
        },
        500
      );
    }
  };
}
