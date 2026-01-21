import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { adminAuthMiddleware } from './adminAuth.js';

describe('adminAuthMiddleware', () => {
  const mockEnv = {
    ADMIN_API_KEY: 'test-admin-key-12345'
  };

  it('should reject request without admin key (401)', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.env = mockEnv as any;
      return adminAuthMiddleware()(c, next);
    });
    app.get('/test', (c) => c.json({ success: true }));

    const response = await app.request('/test');
    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json).toHaveProperty('message', 'Invalid admin credentials');
  });

  it('should reject request with invalid admin key (401)', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.env = mockEnv as any;
      return adminAuthMiddleware()(c, next);
    });
    app.get('/test', (c) => c.json({ success: true }));

    const response = await app.request('/test', {
      headers: {
        'Authorization': 'Bearer wrong-key'
      }
    });

    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json).toHaveProperty('message', 'Invalid admin credentials');
  });

  it('should accept request with valid admin key (200)', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.env = mockEnv as any;
      return adminAuthMiddleware()(c, next);
    });
    app.get('/test', (c) => c.json({ success: true }));

    const response = await app.request('/test', {
      headers: {
        'Authorization': 'Bearer test-admin-key-12345'
      }
    });

    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty('success', true);
  });

  it('should reject request with Bearer prefix missing', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.env = mockEnv as any;
      return adminAuthMiddleware()(c, next);
    });
    app.get('/test', (c) => c.json({ success: true }));

    const response = await app.request('/test', {
      headers: {
        'Authorization': 'test-admin-key-12345'
      }
    });

    expect(response.status).toBe(401);

    const json = await response.json();
    expect(json).toHaveProperty('message', 'Invalid admin credentials');
  });

  it('should return 500 when ADMIN_API_KEY is not configured', async () => {
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.env = {} as any;
      return adminAuthMiddleware()(c, next);
    });
    app.get('/test', (c) => c.json({ success: true }));

    const response = await app.request('/test');
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json).toHaveProperty('message', 'ADMIN_API_KEY not configured');
  });
});
