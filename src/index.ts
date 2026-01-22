import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getModelForKey } from './validator.js';
import { proxyRequest } from './proxy.js';
import { proxyAnthropicRequest } from './anthropic.js';
import { checkRateLimit } from './ratelimit.js';
import { authMiddleware, getApiKeyFromContext, type AuthContext } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { profilingMiddleware, type ProfilingContext } from './middleware/profiling.js';
import { createProxyHandler } from './handlers/proxyHandler.js';
import type { StatsResponse } from './types.js';
import { Profiler } from './profiling/Profiler.js';

type Bindings = {
  ZAI_API_KEY: string;
  DEFAULT_MODEL: string;
  PORT: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: AuthContext & ProfilingContext }>();

// Configure profiling based on environment variable
const PROFILING_ENABLED = process.env.PROFILING_ENABLED !== 'false';
Profiler.configure({ enabled: PROFILING_ENABLED });

// Enable CORS
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'X-Request-ID'],
}));

// Profiling middleware - must be before auth to capture full request duration
app.use('/*', profilingMiddleware);

// Stats endpoint
app.get('/stats', authMiddleware, async (c) => {
  const apiKey = getApiKeyFromContext(c as any);

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

// Profiling data export endpoint
app.get('/profiling', authMiddleware, async (c) => {
  const stats = Profiler.getStatistics();

  return c.json({
    summary: {
      totalRequests: stats.totalRequests,
      averageDuration: `${stats.averageDuration.toFixed(2)}ms`,
      p50Duration: `${stats.p50Duration.toFixed(2)}ms`,
      p95Duration: `${stats.p95Duration.toFixed(2)}ms`,
      p99Duration: `${stats.p99Duration.toFixed(2)}ms`,
    },
    slowestRequests: stats.slowestRequests.slice(0, 5).map(req => ({
      requestId: req.requestId,
      duration: `${req.totalDuration.toFixed(2)}ms`,
      method: req.metadata.method,
      path: req.metadata.path,
      status: req.metadata.status,
    })),
  });
});

// Profiling data by request ID
app.get('/profiling/:requestId', authMiddleware, async (c) => {
  const requestId = c.req.param('requestId');
  const data = Profiler.getDataById(requestId);

  if (!data) {
    return c.json({ error: 'Request not found' }, 404);
  }

  return c.json(data);
});

// Clear profiling data
app.delete('/profiling', authMiddleware, async (c) => {
  Profiler.clearData();
  return c.json({ message: 'Profiling data cleared' });
});

// Create proxy handlers
const openaiProxyHandler = createProxyHandler(proxyRequest);
const anthropicProxyHandler = createProxyHandler(proxyAnthropicRequest);

// Anthropic Messages API - must be defined before /v1/* catch-all
app.post('/v1/messages', authMiddleware, rateLimitMiddleware, anthropicProxyHandler);

// OpenAI-Compatible API - catch-all for /v1/*
app.all('/v1/*', authMiddleware, rateLimitMiddleware, openaiProxyHandler);

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
      openai_compatible: 'ALL /v1/* (except /v1/messages)',
      anthropic_compatible: 'POST /v1/messages',
    },
  });
});

const port = parseInt(process.env.PORT || '3000');

export default {
  port,
  fetch: app.fetch,
};

console.log(`Proxy Gateway starting on port ${port}`);
