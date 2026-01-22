import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { requestLoggerMiddleware, formatLogEntry, parseLogEntry, type RequestLogEntry } from '../../src/middleware/requestLogger';
import { adminAuthMiddleware, type AdminAuthContext } from '../../src/middleware/adminAuth';
import { resetConfig } from '../../src/config';
import { resetAdminKeyCache } from '../../src/utils/adminCredentials';

describe('Request Logger Middleware', () => {
  const testAdminKey = 'test-admin-key-logging';

  beforeEach(() => {
    // Reset config and cache before each test
    resetConfig();
    resetAdminKeyCache();

    // Set up environment for testing
    process.env.ADMIN_API_KEY = testAdminKey;
    process.env.ADMIN_API_ENABLED = 'true';
    process.env.ZAI_API_KEY = 'test-zai-key';
    process.env.DATABASE_PATH = ':memory:';
  });

  describe('requestLoggerMiddleware', () => {
    it('should log basic request information', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      const logs: string[] = [];

      // Capture console.log output
      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
        originalLog.apply(console, args);
      };

      app.use('/*', requestLoggerMiddleware);
      app.get('/test', (c) => c.json({ message: 'test' }, 200));

      const res = await app.request('/test');

      // Restore console.log
      console.log = originalLog;

      expect(res.status).toBe(200);

      // Check that a log was written
      expect(logs.length).toBeGreaterThan(0);

      // Parse the log entry
      const logLine = logs.find((log) => log.startsWith('Admin API Request:'));
      expect(logLine).toBeDefined();

      if (logLine) {
        const jsonStr = logLine.replace('Admin API Request: ', '');
        const parsed = JSON.parse(jsonStr) as RequestLogEntry;

        expect(parsed.method).toBe('GET');
        expect(parsed.path).toBe('/test');
        expect(parsed.status).toBe(200);
        expect(parsed.timestamp).toBeDefined();
        expect(parsed.duration_ms).toBeGreaterThanOrEqual(0);
      }
    });

    it('should log POST request with 201 status', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      const logs: string[] = [];

      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
        originalLog.apply(console, args);
      };

      app.use('/*', requestLoggerMiddleware);
      app.post('/create', (c) => c.json({ id: 1 }, 201));

      const res = await app.request('/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test' }),
      });

      console.log = originalLog;

      expect(res.status).toBe(201);

      const logLine = logs.find((log) => log.startsWith('Admin API Request:'));
      expect(logLine).toBeDefined();

      if (logLine) {
        const jsonStr = logLine.replace('Admin API Request: ', '');
        const parsed = JSON.parse(jsonStr) as RequestLogEntry;

        expect(parsed.method).toBe('POST');
        expect(parsed.path).toBe('/create');
        expect(parsed.status).toBe(201);
      }
    });

    it('should log error responses', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      const logs: string[] = [];

      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
        originalLog.apply(console, args);
      };

      app.use('/*', requestLoggerMiddleware);
      app.get('/error', (c) => c.json({ error: 'Not found' }, 404));

      const res = await app.request('/error');

      console.log = originalLog;

      expect(res.status).toBe(404);

      const logLine = logs.find((log) => log.startsWith('Admin API Request:'));
      expect(logLine).toBeDefined();

      if (logLine) {
        const jsonStr = logLine.replace('Admin API Request: ', '');
        const parsed = JSON.parse(jsonStr) as RequestLogEntry;

        expect(parsed.status).toBe(404);
      }
    });

    it('should include auth_method when available', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      const logs: string[] = [];

      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
        originalLog.apply(console, args);
      };

      // Add auth method to context
      app.use('/*', async (c, next) => {
        c.set('isAuthenticated', true);
        c.set('authMethod', 'api_key');
        await next();
      });
      app.use('/*', requestLoggerMiddleware);
      app.get('/test', (c) => c.json({ message: 'test' }, 200));

      const res = await app.request('/test');

      console.log = originalLog;

      expect(res.status).toBe(200);

      const logLine = logs.find((log) => log.startsWith('Admin API Request:'));
      expect(logLine).toBeDefined();

      if (logLine) {
        const jsonStr = logLine.replace('Admin API Request: ', '');
        const parsed = JSON.parse(jsonStr) as RequestLogEntry;

        expect(parsed.auth_method).toBe('api_key');
      }
    });

    it('should work without auth_method when not set', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      const logs: string[] = [];

      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
        originalLog.apply(console, args);
      };

      app.use('/*', requestLoggerMiddleware);
      app.get('/test', (c) => c.json({ message: 'test' }, 200));

      const res = await app.request('/test');

      console.log = originalLog;

      expect(res.status).toBe(200);

      const logLine = logs.find((log) => log.startsWith('Admin API Request:'));
      expect(logLine).toBeDefined();

      if (logLine) {
        const jsonStr = logLine.replace('Admin API Request: ', '');
        const parsed = JSON.parse(jsonStr) as RequestLogEntry;

        expect(parsed.auth_method).toBeUndefined();
      }
    });

    it('should measure request duration accurately', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      const logs: string[] = [];

      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
        originalLog.apply(console, args);
      };

      app.use('/*', requestLoggerMiddleware);
      app.get('/delayed', async (c) => {
        // Add a small delay to test duration measurement
        await new Promise((resolve) => setTimeout(resolve, 10));
        return c.json({ message: 'delayed' }, 200);
      });

      const res = await app.request('/delayed');

      console.log = originalLog;

      expect(res.status).toBe(200);

      const logLine = logs.find((log) => log.startsWith('Admin API Request:'));
      expect(logLine).toBeDefined();

      if (logLine) {
        const jsonStr = logLine.replace('Admin API Request: ', '');
        const parsed = JSON.parse(jsonStr) as RequestLogEntry;

        // Duration should be at least 10ms (our delay)
        expect(parsed.duration_ms).toBeGreaterThanOrEqual(10);
      }
    });

    it('should round duration to 2 decimal places', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      const logs: string[] = [];

      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
        originalLog.apply(console, args);
      };

      app.use('/*', requestLoggerMiddleware);
      app.get('/test', (c) => c.json({ message: 'test' }, 200));

      await app.request('/test');

      console.log = originalLog;

      const logLine = logs.find((log) => log.startsWith('Admin API Request:'));
      expect(logLine).toBeDefined();

      if (logLine) {
        const jsonStr = logLine.replace('Admin API Request: ', '');
        const parsed = JSON.parse(jsonStr) as RequestLogEntry;

        // Check that duration is rounded to 2 decimal places
        const decimalPlaces = parsed.duration_ms.toString().split('.')[1]?.length || 0;
        expect(decimalPlaces).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('formatLogEntry', () => {
    it('should format log entry as human-readable string', () => {
      const logEntry: RequestLogEntry = {
        timestamp: '2024-01-22T12:00:00.000Z',
        method: 'GET',
        path: '/admin/api/keys',
        status: 200,
        duration_ms: 45.67,
        auth_method: 'api_key',
      };

      const formatted = formatLogEntry(logEntry);

      expect(formatted).toBe('2024-01-22T12:00:00.000Z | GET /admin/api/keys [api_key] | 200 | 45.67ms');
    });

    it('should format log entry without auth_method', () => {
      const logEntry: RequestLogEntry = {
        timestamp: '2024-01-22T12:00:00.000Z',
        method: 'POST',
        path: '/admin/api/keys',
        status: 201,
        duration_ms: 123.45,
      };

      const formatted = formatLogEntry(logEntry);

      expect(formatted).toBe('2024-01-22T12:00:00.000Z | POST /admin/api/keys | 201 | 123.45ms');
    });

    it('should format log entry with token auth', () => {
      const logEntry: RequestLogEntry = {
        timestamp: '2024-01-22T12:00:00.000Z',
        method: 'DELETE',
        path: '/admin/api/keys/1',
        status: 204,
        duration_ms: 12.34,
        auth_method: 'token',
      };

      const formatted = formatLogEntry(logEntry);

      expect(formatted).toBe('2024-01-22T12:00:00.000Z | DELETE /admin/api/keys/1 [token] | 204 | 12.34ms');
    });
  });

  describe('parseLogEntry', () => {
    it('should parse valid JSON log entry', () => {
      const logEntry: RequestLogEntry = {
        timestamp: '2024-01-22T12:00:00.000Z',
        method: 'GET',
        path: '/admin/api/keys',
        status: 200,
        duration_ms: 45.67,
      };

      const json = JSON.stringify(logEntry);
      const parsed = parseLogEntry(json);

      expect(parsed).toEqual(logEntry);
    });

    it('should return null for invalid JSON', () => {
      const parsed = parseLogEntry('invalid json');
      expect(parsed).toBeNull();
    });

    it('should return null for JSON missing required fields', () => {
      const incomplete = JSON.stringify({
        timestamp: '2024-01-22T12:00:00.000Z',
        method: 'GET',
        // Missing path, status, duration_ms
      });

      const parsed = parseLogEntry(incomplete);
      expect(parsed).toBeNull();
    });

    it('should return null for non-object JSON', () => {
      const parsed = parseLogEntry(JSON.stringify(['array', 'values']));
      expect(parsed).toBeNull();
    });

    it('should return null for null JSON', () => {
      const parsed = parseLogEntry(JSON.stringify(null));
      expect(parsed).toBeNull();
    });

    it('should parse log entry with auth_method', () => {
      const logEntry: RequestLogEntry = {
        timestamp: '2024-01-22T12:00:00.000Z',
        method: 'GET',
        path: '/admin/api/keys',
        status: 200,
        duration_ms: 45.67,
        auth_method: 'api_key',
      };

      const json = JSON.stringify(logEntry);
      const parsed = parseLogEntry(json);

      expect(parsed).toEqual(logEntry);
    });
  });

  describe('Integration with Admin Routes', () => {
    it('should log admin API requests with authentication', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      const logs: string[] = [];

      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
        originalLog.apply(console, args);
      };

      app.use('/*', adminAuthMiddleware);
      app.use('/*', requestLoggerMiddleware);
      app.get('/admin/test', (c) => c.json({ message: 'test' }, 200));

      const res = await app.request('/admin/test', {
        headers: {
          authorization: `Bearer ${testAdminKey}`,
        },
      });

      console.log = originalLog;

      expect(res.status).toBe(200);

      const logLine = logs.find((log) => log.startsWith('Admin API Request:'));
      expect(logLine).toBeDefined();

      if (logLine) {
        const jsonStr = logLine.replace('Admin API Request: ', '');
        const parsed = JSON.parse(jsonStr) as RequestLogEntry;

        expect(parsed.method).toBe('GET');
        expect(parsed.path).toBe('/admin/test');
        expect(parsed.status).toBe(200);
        expect(parsed.auth_method).toBe('api_key');
      }
    });

    it('should log all HTTP methods', async () => {
      const app = new Hono<{ Variables: AdminAuthContext }>();
      const logs: string[] = [];

      const originalLog = console.log;
      console.log = (...args: any[]) => {
        logs.push(args.join(' '));
        originalLog.apply(console, args);
      };

      app.use('/*', adminAuthMiddleware);
      app.use('/*', requestLoggerMiddleware);

      app.get('/test', (c) => c.json({ method: 'GET' }, 200));
      app.post('/test', (c) => c.json({ method: 'POST' }, 201));
      app.put('/test', (c) => c.json({ method: 'PUT' }, 200));
      app.delete('/test', (c) => new Response(null, { status: 204 }));

      // Test all methods
      const methods = ['GET', 'POST', 'PUT', 'DELETE'] as const;

      for (const method of methods) {
        logs.length = 0; // Clear logs

        await app.request('/test', {
          method,
          headers: {
            authorization: `Bearer ${testAdminKey}`,
          },
        });

        const logLine = logs.find((log) => log.startsWith('Admin API Request:'));
        expect(logLine).toBeDefined();

        if (logLine) {
          const jsonStr = logLine.replace('Admin API Request: ', '');
          const parsed = JSON.parse(jsonStr) as RequestLogEntry;
          expect(parsed.method).toBe(method);
        }
      }

      console.log = originalLog;
    });
  });
});
