import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getModelForKey } from './validator.js';
import { proxyRequest } from './proxy.js';
import { proxyAnthropicRequest } from './anthropic.js';
import { checkRateLimit } from './ratelimit.js';
import { authMiddleware, getApiKeyFromContext, type AuthContext } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { createProxyHandler } from './handlers/proxyHandler.js';
import { keysRoutes } from './routes/admin/index.js';
import type { StatsResponse, CacheStatsResponse } from './types.js';
import { internalServerError } from './utils/errors.js';
import { startScheduler, loadSchedulerConfigFromEnv, type ScheduledBackupResult } from './db/scheduler.js';
import { checkHealth, type HealthCheckResult } from './db/health.js';
import { getStorageType, isInFallbackMode, getFallbackState } from './storage/index.js';
import { warmupCache } from './storage.js';
import { apiKeyCache } from './cache.js';

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

// Global error handler - catches all unhandled errors across all routes
app.onError((error, c) => {
  // Log the error for debugging
  console.error('Unhandled error:', {
    message: error.message,
    stack: error.stack,
    path: c.req.path,
    method: c.req.method,
  });

  // Return 500 Internal Server Error with generic message
  return internalServerError(c, 'An unexpected error occurred');
});

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

// Cache statistics endpoint
app.get('/cache-stats', authMiddleware, async (c) => {
  const cacheStats = apiKeyCache.getStats();
  const cacheEnabled = process.env.CACHE_ENABLED !== 'false';

  const stats: CacheStatsResponse = {
    ...cacheStats,
    enabled: cacheEnabled,
  };

  return c.json(stats);
});

// Create proxy handlers
const openaiProxyHandler = createProxyHandler(proxyRequest);
const anthropicProxyHandler = createProxyHandler(proxyAnthropicRequest);

// Admin API - API Key Management
app.route('/admin/api/keys', keysRoutes);

// Anthropic Messages API - must be defined before /v1/* catch-all
app.post('/v1/messages', authMiddleware, rateLimitMiddleware, anthropicProxyHandler);

// OpenAI-Compatible API - catch-all for /v1/*
app.all('/v1/*', authMiddleware, rateLimitMiddleware, openaiProxyHandler);

// Health check endpoint with database status
app.get('/health', async (c) => {
  const storageType = getStorageType();
  const inFallbackMode = isInFallbackMode();
  const timestamp = new Date().toISOString();

  // Build base health response
  const healthResponse: Record<string, any> = {
    status: 'ok',
    timestamp,
    storage: {
      type: storageType,
      inFallbackMode,
    },
  };

  // Add fallback state details if in fallback mode
  if (inFallbackMode) {
    const fallbackState = getFallbackState();
    if (fallbackState) {
      healthResponse.storage.fallback = {
        retryCount: fallbackState.retryCount,
        lastRetryAt: fallbackState.lastRetryAt,
      };
    }
  }

  // Check database health if using database storage
  if (storageType === 'database') {
    try {
      const dbHealth: HealthCheckResult = await checkHealth({
        includeKeyCount: false, // Don't count keys for faster health checks
        slowQueryThreshold: 1000,
      });

      // Add database health details to response
      healthResponse.database = {
        type: dbHealth.databaseType,
        connected: dbHealth.connected,
        responseTimeMs: dbHealth.responseTimeMs,
        status: dbHealth.status,
      };

      // Add error details if unhealthy
      if (dbHealth.error) {
        healthResponse.database.error = dbHealth.error;
      }

      // Determine overall health status and HTTP status code
      if (!dbHealth.connected || dbHealth.status === 'unhealthy') {
        // Database is unhealthy
        if (inFallbackMode) {
          // Using file storage fallback, service is degraded but operational
          healthResponse.status = 'degraded';
          healthResponse.message = 'Service is running in fallback mode using file storage';
          return c.json(healthResponse, 200); // Return 200 because service is still operational
        } else {
          // No fallback available, service is unhealthy
          healthResponse.status = 'unhealthy';
          healthResponse.message = 'Database connection failed and no fallback available';
          return c.json(healthResponse, 503); // Return 503 for load balancers
        }
      } else if (dbHealth.status === 'degraded') {
        // Database is slow but connected
        healthResponse.status = 'degraded';
        healthResponse.message = 'Database is slow but operational';
        return c.json(healthResponse, 200); // Return 200 because service is operational
      }

      // Database is healthy
      healthResponse.message = inFallbackMode
        ? 'Service is running in fallback mode (database recovering)'
        : 'All systems operational';
      return c.json(healthResponse, 200);
    } catch (error) {
      // Health check itself failed (unexpected error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      healthResponse.status = 'unhealthy';
      healthResponse.database = {
        error: errorMessage,
      };

      if (inFallbackMode) {
        healthResponse.message = 'Health check failed but service is running in fallback mode';
        return c.json(healthResponse, 200); // Return 200 because fallback is working
      } else {
        healthResponse.message = 'Health check failed and no fallback available';
        return c.json(healthResponse, 503);
      }
    }
  }

  // Using file storage (no database)
  healthResponse.message = 'Service is running with file storage';
  return c.json(healthResponse, 200);
});

// Root
app.get('/', (c) => {
  return c.json({
    name: 'Proxy Gateway',
    version: '1.0.0',
    endpoints: {
      health: 'GET /health',
      stats: 'GET /stats',
      admin_api: 'GET, POST /admin/api/keys',
      cache_stats: 'GET /cache-stats',
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

  // Optional cache warm-up on startup (non-blocking)
  if (process.env.CACHE_WARMUP_ON_START === 'true') {
    // Fire and forget - don't await, let it run in background
    warmupCache().catch(error => {
      console.error('Cache warm-up error:', error);
    });
  }
})();

export default {
  port,
  fetch: app.fetch,
};
