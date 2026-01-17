import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { validateApiKey, getModelForKey } from './validator.js';
import { proxyRequest } from './proxy.js';
import { checkRateLimit } from './ratelimit.js';
import type { StatsResponse } from './types.js';

type Bindings = {
  ZAI_API_KEY: string;
  DEFAULT_MODEL: string;
  PORT: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
}));

// Extract API key from headers
const extractApiKey = (headers: Headers): string | undefined => {
  return headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
         headers.get('x-api-key') || undefined;
};

// Stats endpoint
app.get('/stats', async (c) => {
  const apiKeyHeader = extractApiKey(c.req.raw.headers);

  const validation = await validateApiKey(apiKeyHeader);
  if (!validation.valid) {
    return c.json({ error: validation.error }, validation.statusCode as any);
  }

  const apiKey = validation.apiKey!;

  // Get rate limit info
  const rateLimit = checkRateLimit(apiKey);

  // Calculate model
  const model = getModelForKey(apiKey);

  const stats: StatsResponse = {
    key: apiKey.key,
    name: apiKey.name,
    model,
    token_limit_per_5h: apiKey.token_limit_per_5h,
    expiry_date: apiKey.expiry_date,
    created_at: apiKey.created_at,
    last_used: apiKey.last_used,
    is_expired: new Date(apiKey.expiry_date) < new Date(),
    current_usage: {
      tokens_used_in_current_window: rateLimit.tokensUsed,
      window_started_at: rateLimit.windowStart,
      window_ends_at: rateLimit.windowEnd,
      remaining_tokens: Math.max(0, rateLimit.tokensLimit - rateLimit.tokensUsed),
    },
    total_lifetime_tokens: apiKey.total_lifetime_tokens,
  };

  return c.json(stats);
});

// Proxy all /v1/* requests to Z.AI
app.all('/v1/*', async (c) => {
  const apiKeyHeader = extractApiKey(c.req.raw.headers);

  // Validate API key
  const validation = await validateApiKey(apiKeyHeader);
  if (!validation.valid) {
    return c.json({ error: validation.error }, validation.statusCode as any);
  }

  const apiKey = validation.apiKey!;

  // Check rate limit
  const rateLimit = checkRateLimit(apiKey);
  if (!rateLimit.allowed) {
    const headers: Record<string, string> = {};
    if (rateLimit.retryAfter) {
      headers['Retry-After'] = rateLimit.retryAfter.toString();
    }
    return c.json({
      error: {
        message: rateLimit.reason,
        type: 'rate_limit_exceeded',
        tokens_used: rateLimit.tokensUsed,
        tokens_limit: rateLimit.tokensLimit,
        window_ends_at: rateLimit.windowEnd,
      },
    }, 429, headers as any);
  }

  // Proxy request
  const path = c.req.path;
  const method = c.req.method;

  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const body = c.req.raw.body ? await c.req.text() : null;

  const result = await proxyRequest({
    apiKey,
    path,
    method,
    headers,
    body,
  });

  // Set response headers
  Object.entries(result.headers).forEach(([key, value]) => {
    c.header(key, value);
  });

  return c.body(result.body, result.status as any);
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root
app.get('/', (c) => {
  return c.json({
    name: 'Proxy Gateway',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      stats: 'GET /stats',
      proxy: 'ALL /v1/*',
    },
  });
});

const port = parseInt(process.env.PORT || '3000');

export default {
  port,
  fetch: app.fetch,
};

console.log(`Proxy Gateway starting on port ${port}`);
