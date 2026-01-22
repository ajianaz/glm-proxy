/**
 * Global Error Handler Integration Tests
 *
 * Tests that the global error handler correctly catches unhandled errors
 * across all routes and returns 500 Internal Server Error responses.
 */

import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { internalServerError } from '../../src/utils/errors.js';

describe('Global Error Handler', () => {
  describe('Server Error Responses', () => {
    it('should return 500 status code with generic message', async () => {
      const app = new Hono();

      app.get('/test', (c) => {
        return internalServerError(c, 'Test error', { details: 'sensitive info' });
      });

      const response = await app.request('/test');
      expect(response.status).toBe(500);
    });

    it('should not expose sensitive log details in response', async () => {
      const app = new Hono();

      app.get('/test', (c) => {
        return internalServerError(c, 'Test error', { password: 'secret123' });
      });

      const response = await app.request('/test');
      const data = await response.json();

      // Response should have error property
      expect(data).toHaveProperty('error');

      // Response should NOT contain the sensitive log details
      expect(data).not.toHaveProperty('password');
      expect(JSON.stringify(data)).not.toContain('secret123');

      // Should use generic message in details
      expect(data.details).toBe('An unexpected error occurred. Please try again later.');
    });

    it('should support custom error messages', async () => {
      const app = new Hono();

      app.get('/test', (c) => {
        return internalServerError(c, 'Failed to process request');
      });

      const response = await app.request('/test');
      const data = await response.json();

      expect(data.error).toBe('Failed to process request');
      expect(data.details).toBe('An unexpected error occurred. Please try again later.');
    });

    it('should log error details to console', async () => {
      const originalError = console.error;
      const errorLogs: any[] = [];
      console.error = (...args: any[]) => {
        errorLogs.push(args);
      };

      try {
        const app = new Hono();

        app.get('/test', (c) => {
          return internalServerError(c, 'Test error', { details: 'debug info' });
        });

        await app.request('/test');

        // Verify console.error was called
        expect(errorLogs.length).toBeGreaterThan(0);
        expect(errorLogs[0][0]).toBe('Test error:');
        expect(errorLogs[0][1]).toEqual({ details: 'debug info' });
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('Global Error Handler Pattern', () => {
    it('should handle Error objects correctly', async () => {
      const app = new Hono();

      // Add a route that throws an error
      app.get('/test', () => {
        throw new Error('Test error');
      });

      // Add global error handler (matching the pattern in src/index.ts)
      app.onError((error, c) => {
        // Log the error
        const errorDetails = {
          message: error.message,
          stack: error.stack,
          path: c.req.path,
          method: c.req.method,
        };

        return internalServerError(c, 'An unexpected error occurred', errorDetails);
      });

      const response = await app.request('/test');
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });

    it('should handle async errors', async () => {
      const app = new Hono();

      // Add a route that throws an async error
      app.get('/test', async () => {
        await Promise.resolve();
        throw new Error('Async test error');
      });

      // Add global error handler
      app.onError((error, c) => {
        return internalServerError(c, 'An unexpected error occurred', {
          message: error.message,
          path: c.req.path,
        });
      });

      const response = await app.request('/test');
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('Error Response Format', () => {
    it('should return consistent error format', async () => {
      const app = new Hono();

      app.get('/test', () => {
        throw new Error('Test');
      });

      app.onError((error, c) => {
        return internalServerError(c, 'Test error');
      });

      const response = await app.request('/test');
      const data = await response.json();

      // Should have error property
      expect(data).toHaveProperty('error');

      // Error should be a string
      expect(typeof data.error).toBe('string');

      // Should have details property with generic message
      expect(data).toHaveProperty('details');
      expect(data.details).toBe('An unexpected error occurred. Please try again later.');
    });

    it('should not leak stack traces in response', async () => {
      const app = new Hono();

      app.get('/test', () => {
        const error = new Error('Test error') as any;
        error.stack = 'Secret stack trace with sensitive info';
        throw error;
      });

      app.onError((error: any, c) => {
        return internalServerError(c, 'Test error', error);
      });

      const response = await app.request('/test');
      const data = await response.json();

      // Response should not contain stack trace
      expect(JSON.stringify(data)).not.toContain('stack');
      expect(JSON.stringify(data)).not.toContain('Secret');
    });
  });
});
