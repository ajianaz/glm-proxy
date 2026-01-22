/**
 * Unit Tests: Validation Middleware
 *
 * Tests for request validation middleware including body, query, and params validation.
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  validateBody,
  validateQuery,
  validateParams,
  validateParamsAndBody,
  formatValidationErrors,
} from '../../src/middleware/validation';

describe('Validation Middleware', () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
  });

  describe('formatValidationErrors', () => {
    test('should format simple field errors', () => {
      const schema = z.object({
        name: z.string().min(1),
      });
      const result = schema.safeParse({ name: '' });

      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = formatValidationErrors(result.error);
        expect(errors).toBeArray();
        expect(errors.length).toBe(1);
        expect(errors[0].field).toBe('name');
        expect(errors[0].message).toBeString();
        expect(errors[0].message.length).toBeGreaterThan(0);
      }
    });

    test('should format nested field errors', () => {
      const schema = z.object({
        user: z.object({
          email: z.string().email(),
        }),
      });
      const result = schema.safeParse({ user: { email: 'invalid' } });

      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = formatValidationErrors(result.error);
        expect(errors).toBeArray();
        expect(errors.length).toBe(1);
        expect(errors[0].field).toBe('user.email');
        expect(errors[0].message).toBeString();
        expect(errors[0].message.length).toBeGreaterThan(0);
      }
    });

    test('should format multiple field errors', () => {
      const schema = z.object({
        name: z.string().min(1),
        age: z.number().min(0),
        email: z.string().email(),
      });
      const result = schema.safeParse({ name: '', age: -1, email: 'invalid' });

      expect(result.success).toBe(false);
      if (!result.success) {
        const errors = formatValidationErrors(result.error);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors).toBeArray();

        // Check that all expected fields are present
        const fields = errors.map((e) => e.field);
        expect(fields).toContain('name');
        expect(fields).toContain('age');
        expect(fields).toContain('email');

        // Check that all messages are non-empty strings
        errors.forEach((error) => {
          expect(error.message).toBeString();
          expect(error.message.length).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('validateBody', () => {
    test('should pass validation with valid data', async () => {
      const schema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
      });

      app.post('/test', validateBody(schema), async (c) => {
        const body = c.get('validatedBody');
        return c.json({ success: true, data: body });
      });

      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual({ name: 'John', email: 'john@example.com' });
    });

    test('should return 400 for invalid JSON', async () => {
      const schema = z.object({
        name: z.string(),
      });

      app.post('/test', validateBody(schema), async (c) => {
        return c.json({ success: true });
      });

      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Invalid JSON');
      expect(json.details).toEqual([
        { field: 'body', message: 'Request body contains invalid JSON' },
      ]);
    });

    test('should return 400 for validation errors', async () => {
      const schema = z.object({
        name: z.string().min(1, 'Name is required'),
        email: z.string().email('Invalid email format'),
      });

      app.post('/test', validateBody(schema), async (c) => {
        return c.json({ success: true });
      });

      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', email: 'invalid' }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Validation failed');
      expect(json.details).toBeArray();
      expect(json.details.length).toBeGreaterThan(0);
    });

    test('should handle optional fields', async () => {
      const schema = z.object({
        name: z.string(),
        age: z.number().optional(),
      });

      app.post('/test', validateBody(schema), async (c) => {
        const body = c.get('validatedBody');
        return c.json({ success: true, data: body });
      });

      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual({ name: 'John' });
    });

    test('should handle nested objects', async () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
      });

      app.post('/test', validateBody(schema), async (c) => {
        const body = c.get('validatedBody');
        return c.json({ success: true, data: body });
      });

      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: { name: 'John', email: 'john@example.com' },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual({
        user: { name: 'John', email: 'john@example.com' },
      });
    });

    test('should handle transform operations', async () => {
      const schema = z.object({
        age: z.string().transform((val) => parseInt(val, 10)),
      });

      app.post('/test', validateBody(schema), async (c) => {
        const body = c.get('validatedBody');
        return c.json({ success: true, data: body });
      });

      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ age: '30' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.age).toBe(30);
      expect(typeof json.data.age).toBe('number');
    });
  });

  describe('validateQuery', () => {
    test('should pass validation with valid query params', async () => {
      const schema = z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
      });

      app.get('/test', validateQuery(schema), async (c) => {
        const query = c.get('validatedQuery');
        return c.json({ success: true, data: query });
      });

      const res = await app.request('/test?page=1&limit=10');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual({ page: '1', limit: '10' });
    });

    test('should handle empty query params', async () => {
      const schema = z.object({
        search: z.string().optional(),
      });

      app.get('/test', validateQuery(schema), async (c) => {
        const query = c.get('validatedQuery');
        return c.json({ success: true, data: query });
      });

      const res = await app.request('/test');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual({});
    });

    test('should return 400 for validation errors', async () => {
      const schema = z.object({
        age: z.string().refine((val) => !isNaN(parseInt(val)), {
          message: 'Age must be a number',
        }),
      });

      app.get('/test', validateQuery(schema), async (c) => {
        return c.json({ success: true });
      });

      const res = await app.request('/test?age=abc');

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Validation failed');
      expect(json.details).toBeArray();
    });

    test('should handle transform operations', async () => {
      const schema = z.object({
        page: z
          .string()
          .optional()
          .transform((val) => (val ? parseInt(val, 10) : undefined)),
        limit: z
          .string()
          .optional()
          .transform((val) => (val ? parseInt(val, 10) : undefined)),
      });

      app.get('/test', validateQuery(schema), async (c) => {
        const query = c.get('validatedQuery');
        return c.json({ success: true, data: query });
      });

      const res = await app.request('/test?page=2&limit=20');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.page).toBe(2);
      expect(json.data.limit).toBe(20);
      expect(typeof json.data.page).toBe('number');
    });
  });

  describe('validateParams', () => {
    test('should pass validation with valid path params', async () => {
      const schema = z.object({
        id: z
          .string()
          .regex(/^\d+$/, 'ID must be a positive integer')
          .transform((val) => parseInt(val, 10)),
      });

      app.get('/test/:id', validateParams(schema), async (c) => {
        const params = c.get('validatedParams');
        return c.json({ success: true, data: params });
      });

      const res = await app.request('/test/123');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.id).toBe(123);
    });

    test('should return 400 for invalid path params', async () => {
      const schema = z.object({
        id: z
          .string()
          .regex(/^\d+$/, 'ID must be a positive integer')
          .transform((val) => parseInt(val, 10)),
      });

      app.get('/test/:id', validateParams(schema), async (c) => {
        return c.json({ success: true });
      });

      const res = await app.request('/test/abc');

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Validation failed');
      expect(json.details).toBeArray();
      expect(json.details[0].field).toBe('id');
    });

    test('should handle multiple path params', async () => {
      const schema = z.object({
        userId: z
          .string()
          .regex(/^\d+$/, 'User ID must be a positive integer')
          .transform((val) => parseInt(val, 10)),
        postId: z
          .string()
          .regex(/^\d+$/, 'Post ID must be a positive integer')
          .transform((val) => parseInt(val, 10)),
      });

      app.get('/test/:userId/posts/:postId', validateParams(schema), async (c) => {
        const params = c.get('validatedParams');
        return c.json({ success: true, data: params });
      });

      const res = await app.request('/test/123/posts/456');

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.userId).toBe(123);
      expect(json.data.postId).toBe(456);
    });

    test('should handle refine operations', async () => {
      const schema = z.object({
        id: z
          .string()
          .regex(/^\d+$/, 'ID must be a positive integer')
          .transform((val) => parseInt(val, 10))
          .refine((val) => val > 0, 'ID must be greater than 0'),
      });

      app.get('/test/:id', validateParams(schema), async (c) => {
        const params = c.get('validatedParams');
        return c.json({ success: true, data: params });
      });

      const res = await app.request('/test/0');

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Validation failed');
      expect(json.details[0].message).toBe('ID must be greater than 0');
    });
  });

  describe('validateParamsAndBody', () => {
    test('should pass validation with valid params and body', async () => {
      const paramsSchema = z.object({
        id: z
          .string()
          .regex(/^\d+$/, 'ID must be a positive integer')
          .transform((val) => parseInt(val, 10)),
      });

      const bodySchema = z.object({
        name: z.string().min(1),
        email: z.string().email(),
      });

      app.put('/test/:id', validateParamsAndBody(paramsSchema, bodySchema), async (c) => {
        const params = c.get('validatedParams');
        const body = c.get('validatedBody');
        return c.json({ success: true, params, body });
      });

      const res = await app.request('/test/123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John', email: 'john@example.com' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.params.id).toBe(123);
      expect(json.body).toEqual({ name: 'John', email: 'john@example.com' });
    });

    test('should return 400 for invalid params', async () => {
      const paramsSchema = z.object({
        id: z
          .string()
          .regex(/^\d+$/, 'ID must be a positive integer')
          .transform((val) => parseInt(val, 10)),
      });

      const bodySchema = z.object({
        name: z.string(),
      });

      app.put('/test/:id', validateParamsAndBody(paramsSchema, bodySchema), async (c) => {
        return c.json({ success: true });
      });

      const res = await app.request('/test/abc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John' }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Validation failed');
    });

    test('should return 400 for invalid body', async () => {
      const paramsSchema = z.object({
        id: z
          .string()
          .regex(/^\d+$/, 'ID must be a positive integer')
          .transform((val) => parseInt(val, 10)),
      });

      const bodySchema = z.object({
        name: z.string().min(1, 'Name is required'),
      });

      app.put('/test/:id', validateParamsAndBody(paramsSchema, bodySchema), async (c) => {
        return c.json({ success: true });
      });

      const res = await app.request('/test/123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Validation failed');
    });

    test('should return 400 for invalid JSON', async () => {
      const paramsSchema = z.object({
        id: z.string().regex(/^\d+$/),
      });

      const bodySchema = z.object({
        name: z.string(),
      });

      app.put('/test/:id', validateParamsAndBody(paramsSchema, bodySchema), async (c) => {
        return c.json({ success: true });
      });

      const res = await app.request('/test/123', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json{',
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('Invalid JSON');
    });
  });

  describe('Integration with authentication middleware', () => {
    test('should work with authentication middleware', async () => {
      // Mock auth middleware
      const authMiddleware = async (c: any, next: any) => {
        c.set('isAuthenticated', true);
        await next();
      };

      const bodySchema = z.object({
        name: z.string().min(1),
      });

      app.post('/test', authMiddleware, validateBody(bodySchema), async (c) => {
        const authenticated = c.get('isAuthenticated');
        const body = c.get('validatedBody');
        return c.json({ success: true, authenticated, data: body });
      });

      const res = await app.request('/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'John' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.authenticated).toBe(true);
      expect(json.data.name).toBe('John');
    });
  });
});
