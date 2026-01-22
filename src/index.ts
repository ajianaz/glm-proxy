import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getModelForKey } from './validator.js';
import { proxyRequest } from './proxy.js';
import { proxyAnthropicRequest } from './anthropic.js';
import { checkRateLimit } from './ratelimit.js';
import { authMiddleware, getApiKeyFromContext, type AuthContext } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { createProxyHandler } from './handlers/proxyHandler.js';
import type { StatsResponse } from './types.js';
import { startScheduler, loadSchedulerConfigFromEnv, type ScheduledBackupResult } from './db/scheduler.js';

type Bindings = {
  ZAI_API_KEY: string;
  DEFAULT_MODEL: string;
  PORT: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: AuthContext }>();

// Enable CORS
app.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
}));

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

// Start scheduled backups if enabled
const startScheduledBackups = async (): Promise<void> => {
  try {
    const config = loadSchedulerConfigFromEnv();

    if (config.enabled) {
      // Add callback to log backup completions and errors
      config.onBackupComplete = (result: ScheduledBackupResult) => {
        console.log(`[${result.timestamp}] Scheduled backup created: ${result.backupPath}`);
        console.log(`  Size: ${(result.size / 1024).toFixed(2)} KB, Compressed: ${result.compressed}`);
        console.log(`  Removed old backups: ${result.removedOldBackups}`);
        console.log(`  Next backup: ${result.nextBackupTime}`);
      };

      config.onBackupError = (error: Error) => {
        console.error(`Scheduled backup failed: ${error.message}`);
      };

      await startScheduler(config);
      console.log('Scheduled backups enabled with schedule:', config.schedule);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to start scheduled backups:', errorMessage);
  }
};

// Start the application
(async () => {
  await startScheduledBackups();
  console.log(`Proxy Gateway starting on port ${port}`);
})();

export default {
  port,
  fetch: app.fetch,
};
