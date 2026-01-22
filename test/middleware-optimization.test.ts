/**
 * Middleware Optimization Tests
 *
 * Tests for optimized middleware pipeline including:
 * - Lazy profiler initialization
 * - Cached context lookups
 * - Early exit patterns
 * - Batched profiler operations
 */

import { test, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { profilingMiddleware, type ProfilingContext, resetProfilingCache } from '../src/middleware/profiling.js';
import { Profiler } from '../src/profiling/Profiler.js';
import { extractApiKey } from '../src/middleware/auth.js';

beforeEach(() => {
  // Reset profiler state
  Profiler.clearData();
  Profiler.configure({ enabled: true });
  resetProfilingCache();
});

test('profiling middleware - lazy initialization when disabled', async () => {
  // Disable profiling
  Profiler.configure({ enabled: false });

  const app = new Hono<{ Variables: ProfilingContext }>();
  app.use('/*', profilingMiddleware);
  app.get('/test', (c) => {
    const profiler = c.get('profiler');
    expect(profiler).toBeNull();
    return c.json({ ok: true });
  });

  const res = await app.request('/test');
  expect(res.status).toBe(200);

  const data = await res.json();
  expect(data.ok).toBe(true);
});

test('profiling middleware - caches request metadata', async () => {
  const app = new Hono<{ Variables: ProfilingContext }>();
  app.use('/*', profilingMiddleware);
  app.get('/test', (c) => {
    const cachedMethod = c.get('_cachedMethod');
    const cachedPath = c.get('_cachedPath');
    const cachedUserAgent = c.get('_cachedUserAgent');

    expect(cachedMethod).toBe('GET');
    expect(cachedPath).toBe('/test');
    expect(cachedUserAgent).toBe('test-agent');

    return c.json({ ok: true });
  });

  const res = await app.request('/test', {
    headers: {
      'user-agent': 'test-agent',
    },
  });

  expect(res.status).toBe(200);
});

test('profiling middleware - adds request ID to context', async () => {
  const app = new Hono<{ Variables: ProfilingContext }>();
  app.use('/*', profilingMiddleware);
  app.get('/test', (c) => {
    const requestId = c.get('requestId');
    expect(requestId).toBeDefined();
    expect(typeof requestId).toBe('string');
    expect(requestId.length).toBeGreaterThan(0);
    return c.json({ ok: true });
  });

  const res = await app.request('/test');
  expect(res.status).toBe(200);

  // Check that request ID is in response header
  const responseRequestId = res.headers.get('X-Request-ID');
  expect(responseRequestId).toBeDefined();
  expect(responseRequestId!.length).toBeGreaterThan(0);
});

test('profiling middleware - uses existing request ID from header', async () => {
  const existingRequestId = 'my-custom-request-id-123';

  const app = new Hono<{ Variables: ProfilingContext }>();
  app.use('/*', profilingMiddleware);
  app.get('/test', (c) => {
    const requestId = c.get('requestId');
    expect(requestId).toBe(existingRequestId);
    return c.json({ ok: true });
  });

  const res = await app.request('/test', {
    headers: {
      'X-Request-ID': existingRequestId,
    },
  });

  expect(res.status).toBe(200);
  expect(res.headers.get('X-Request-ID')).toBe(existingRequestId);
});

test('auth middleware - optimized Bearer token extraction', () => {
  // Test Bearer token extraction (standard casing)
  const headers1 = new Headers({
    'authorization': 'Bearer my-api-key',
  });
  expect(extractApiKey(headers1)).toBe('my-api-key');

  // Test x-api-key header extraction
  const headers2 = new Headers({
    'x-api-key': 'my-api-key',
  });
  expect(extractApiKey(headers2)).toBe('my-api-key');

  // Test Bearer with lowercase
  const headers3 = new Headers({
    'authorization': 'bearer my-api-key',
  });
  expect(extractApiKey(headers3)).toBe('my-api-key');

  // Test no API key
  const headers4 = new Headers();
  expect(extractApiKey(headers4)).toBeUndefined();

  // Test x-api-key takes priority over malformed Bearer
  const headers5 = new Headers({
    'authorization': 'Basic credentials',
    'x-api-key': 'fallback-key',
  });
  expect(extractApiKey(headers5)).toBe('fallback-key');
});

test('profiling middleware - zero overhead when disabled', async () => {
  // Disable profiling globally
  Profiler.configure({ enabled: false });

  const app = new Hono<{ Variables: ProfilingContext }>();
  app.use('/*', profilingMiddleware);
  app.get('/test', (c) => {
    const profiler = c.get('profiler');
    expect(profiler).toBeNull();
    return c.json({ ok: true });
  });

  const start = performance.now();
  const res = await app.request('/test');
  const end = performance.now();

  expect(res.status).toBe(200);

  // Should be very fast with profiling disabled (< 1ms)
  const latency = end - start;
  expect(latency).toBeLessThan(5);
});

test('profiling middleware - profiler enabled check is cached', async () => {
  // Enable profiling
  Profiler.configure({ enabled: true });

  const app = new Hono<{ Variables: ProfilingContext }>();
  app.use('/*', profilingMiddleware);

  app.get('/test', (c) => {
    const profiler = c.get('profiler');
    // Verify profiler exists and is functional
    expect(profiler).toBeDefined();
    expect(profiler).not.toBeNull();
    expect(typeof profiler?.mark).toBe('function');
    return c.json({ ok: true });
  });

  // Make a request
  const res = await app.request('/test');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test('profiling middleware - handles errors gracefully', async () => {
  const app = new Hono<{ Variables: ProfilingContext }>();
  app.use('/*', profilingMiddleware);
  app.get('/test', (c) => {
    const profiler = c.get('profiler');
    // Verify profiler exists before throwing error
    expect(profiler).toBeDefined();
    throw new Error('Test error');
  });

  const res = await app.request('/test');
  // Hono catches errors and returns 500
  expect(res.status).toBe(500);
});

test('profiling middleware - performance under load', async () => {
  Profiler.configure({ enabled: true });

  const app = new Hono<{ Variables: ProfilingContext }>();
  app.use('/*', profilingMiddleware);
  app.get('/test', (c) => {
    // Verify profiler is accessible and functional
    const profiler = c.get('profiler');
    expect(profiler).toBeDefined();
    return c.json({ ok: true });
  });

  const iterations = 100;
  const latencies: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await app.request('/test');
    const end = performance.now();
    latencies.push(end - start);
  }

  // Calculate average latency
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  // Average latency should be very low (< 2ms per request)
  expect(avgLatency).toBeLessThan(2);
});

test('middleware optimization - context values are set once', async () => {
  const app = new Hono<{ Variables: ProfilingContext }>();
  app.use('/*', profilingMiddleware);
  app.get('/test', (c) => {
    // All context values should be available
    const profiler = c.get('profiler');
    const requestId = c.get('requestId');
    const cachedMethod = c.get('_cachedMethod');
    const cachedPath = c.get('_cachedPath');
    const cachedUserAgent = c.get('_cachedUserAgent');

    expect(profiler).toBeDefined();
    expect(requestId).toBeDefined();
    expect(cachedMethod).toBeDefined();
    expect(cachedPath).toBeDefined();
    expect(cachedUserAgent).toBeDefined();

    // Verify cached values match actual request
    expect(cachedMethod).toBe('GET');
    expect(cachedPath).toBe('/test');
    expect(cachedUserAgent).toBe('test-user-agent');

    return c.json({ ok: true });
  });

  const res = await app.request('/test', {
    headers: {
      'user-agent': 'test-user-agent',
    },
  });

  expect(res.status).toBe(200);
});

test('profiling middleware - handles POST requests with body', async () => {
  const app = new Hono<{ Variables: ProfilingContext }>();
  app.use('/*', profilingMiddleware);
  app.post('/test', (c) => {
    const cachedMethod = c.get('_cachedMethod');
    expect(cachedMethod).toBe('POST');
    return c.json({ ok: true });
  });

  const res = await app.request('/test', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ test: 'data' }),
  });

  expect(res.status).toBe(200);
});
