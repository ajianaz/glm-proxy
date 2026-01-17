# Proxy Gateway Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an API gateway with rate limiting that proxies requests to Z.AI API (glm-4.7) using Hono + Bun, Docker containerized.

**Architecture:**
- Hono web server handling `/v1/*` proxy and `/stats` endpoint
- JSON file storage for API keys with atomic writes
- Rolling 5-hour window rate limiting on tokens
- Docker deployment with volume mount for data persistence

**Tech Stack:** Bun 1.x, Hono 4.x, Docker

---

## Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `bun.lockb` (via bun install)
- Create: `.gitignore`
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `data/apikeys.json`
- Create: `.env.example`

**Step 1: Initialize package.json**

```bash
bun init -y
```

**Step 2: Install Hono dependency**

```bash
bun add hono
```

**Step 3: Create .gitignore**

Create `.gitignore`:
```
node_modules/
.env
data/apikeys.json
*.log
.DS_Store
```

**Step 4: Create .env.example**

Create `.env.example`:
```bash
ZAI_API_KEY=your_zai_api_key_here
DEFAULT_MODEL=glm-4.7
PORT=3000
```

**Step 5: Create initial apikeys.json**

Create `data/apikeys.json`:
```json
{
  "keys": []
}
```

**Step 6: Create Dockerfile**

Create `Dockerfile`:
```dockerfile
FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY src/ ./src/
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["bun", "src/index.ts"]
```

**Step 7: Create docker-compose.yml**

Create `docker-compose.yml`:
```yaml
services:
  proxy-gateway:
    build: .
    ports:
      - "3000:3000"
    environment:
      ZAI_API_KEY: ${ZAI_API_KEY}
      DEFAULT_MODEL: glm-4.7
      PORT: 3000
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

**Step 8: Commit**

```bash
git add package.json bun.lockb .gitignore .env.example Dockerfile docker-compose.yml data/apikeys.json
git commit -m "feat: initialize project structure and dependencies"
```

---

## Task 2: Storage Layer with Atomic Writes

**Files:**
- Create: `src/storage.ts`
- Create: `src/types.ts`

**Step 1: Create types**

Create `src/types.ts`:
```typescript
export interface UsageWindow {
  window_start: string; // ISO 8601
  tokens_used: number;
}

export interface ApiKey {
  key: string;
  name: string;
  model?: string; // Optional override
  token_limit_per_5h: number;
  expiry_date: string; // ISO 8601
  created_at: string; // ISO 8601
  last_used: string; // ISO 8601
  total_lifetime_tokens: number;
  usage_windows: UsageWindow[];
}

export interface ApiKeysData {
  keys: ApiKey[];
}

export interface StatsResponse {
  key: string;
  name: string;
  model: string;
  token_limit_per_5h: number;
  expiry_date: string;
  created_at: string;
  last_used: string;
  is_expired: boolean;
  current_usage: {
    tokens_used_in_current_window: number;
    window_started_at: string;
    window_ends_at: string;
    remaining_tokens: number;
  };
  total_lifetime_tokens: number;
}
```

**Step 2: Create storage utilities**

Create `src/storage.ts`:
```typescript
import fs from 'fs';
import path from 'path';
import type { ApiKeysData, ApiKey } from './types.js';

const DATA_FILE = process.env.DATA_FILE || '/app/data/apikeys.json';
const LOCK_FILE = DATA_FILE + '.lock';

// Simple file lock using mkdir (atomic on Unix)
export async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const maxRetries = 10;
  const retryDelay = 50;

  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.mkdirSync(LOCK_FILE, { mode: 0o755 });
      break;
    } catch (e: any) {
      if (e.code !== 'EEXIST' || i === maxRetries - 1) throw e;
      await new Promise(r => setTimeout(r, retryDelay));
    }
  }

  try {
    return await fn();
  } finally {
    fs.rmdirSync(LOCK_FILE);
  }
}

export async function readApiKeys(): Promise<ApiKeysData> {
  try {
    const content = await fs.promises.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return { keys: [] };
  }
}

export async function writeApiKeys(data: ApiKeysData): Promise<void> {
  const tempFile = DATA_FILE + '.tmp';
  await fs.promises.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
  await fs.promises.rename(tempFile, DATA_FILE);
}

export async function findApiKey(key: string): Promise<ApiKey | null> {
  return await withLock(async () => {
    const data = await readApiKeys();
    return data.keys.find(k => k.key === key) || null;
  });
}

export async function updateApiKeyUsage(
  key: string,
  tokensUsed: number,
  model: string
): Promise<void> {
  await withLock(async () => {
    const data = await readApiKeys();
    const keyIndex = data.keys.findIndex(k => k.key === key);

    if (keyIndex === -1) return;

    const apiKey = data.keys[keyIndex];
    const now = new Date().toISOString();

    // Update last_used and total tokens
    apiKey.last_used = now;
    apiKey.total_lifetime_tokens += tokensUsed;

    // Find or create current window
    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
    let currentWindow = apiKey.usage_windows.find(
      w => w.window_start >= fiveHoursAgo
    );

    if (!currentWindow) {
      currentWindow = { window_start: now, tokens_used: 0 };
      apiKey.usage_windows.push(currentWindow);
    }

    currentWindow.tokens_used += tokensUsed;

    // Clean up old windows
    apiKey.usage_windows = apiKey.usage_windows.filter(
      w => w.window_start >= fiveHoursAgo
    );

    await writeApiKeys(data);
  });
}

export async function getKeyStats(key: string): Promise<ApiKey | null> {
  return await findApiKey(key);
}
```

**Step 3: Commit**

```bash
git add src/types.ts src/storage.ts
git commit -m "feat: add storage layer with atomic file locking"
```

---

## Task 3: Rate Limiting Logic

**Files:**
- Create: `src/ratelimit.ts`

**Step 1: Create rate limiting utilities**

Create `src/ratelimit.ts`:
```typescript
import type { ApiKey, UsageWindow } from './types.js';

export function isKeyExpired(key: ApiKey): boolean {
  return new Date(key.expiry_date) < new Date();
}

export interface RateLimitCheck {
  allowed: boolean;
  reason?: string;
  tokensUsed: number;
  tokensLimit: number;
  windowStart: string;
  windowEnd: string;
  retryAfter?: number; // seconds
}

export function checkRateLimit(key: ApiKey): RateLimitCheck {
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
  const now = new Date();

  // Get all active windows (within 5 hours)
  const activeWindows = key.usage_windows.filter(
    w => w.window_start >= fiveHoursAgo
  );

  // Sum tokens from all active windows
  const totalTokensUsed = activeWindows.reduce(
    (sum, w) => sum + w.tokens_used,
    0
  );

  // Find earliest window start for calculation
  const windowStart = activeWindows.length > 0
    ? activeWindows[0].window_start
    : now.toISOString();

  // Calculate when this window ends (5 hours from start)
  const startTime = new Date(windowStart);
  const windowEndTime = new Date(startTime.getTime() + 5 * 60 * 60 * 1000);
  const windowEnd = windowEndTime.toISOString();

  // Check if over limit
  if (totalTokensUsed > key.token_limit_per_5h) {
    const retryAfterSeconds = Math.max(0, Math.floor(
      (windowEndTime.getTime() - now.getTime()) / 1000
    ));

    return {
      allowed: false,
      reason: 'Token limit exceeded for 5-hour window',
      tokensUsed: totalTokensUsed,
      tokensLimit: key.token_limit_per_5h,
      windowStart,
      windowEnd,
      retryAfter: retryAfterSeconds,
    };
  }

  return {
    allowed: true,
    tokensUsed: totalTokensUsed,
    tokensLimit: key.token_limit_per_5h,
    windowStart,
    windowEnd,
  };
}
```

**Step 2: Commit**

```bash
git add src/ratelimit.ts
git commit -m "feat: add rate limiting logic with 5-hour rolling window"
```

---

## Task 4: API Key Validator

**Files:**
- Create: `src/validator.ts`

**Step 1: Create validator**

Create `src/validator.ts`:
```typescript
import type { ApiKey } from './types.js';
import { findApiKey } from './storage.js';
import { isKeyExpired } from './ratelimit.js';

export interface ValidationResult {
  valid: boolean;
  apiKey?: ApiKey;
  error?: string;
  statusCode?: number;
}

export async function validateApiKey(
  keyHeader: string | undefined
): Promise<ValidationResult> {
  if (!keyHeader) {
    return {
      valid: false,
      error: 'API key required. Use Authorization: Bearer <key> or x-api-key: <key>',
      statusCode: 401,
    };
  }

  const key = keyHeader.replace(/^Bearer\s+/i, '').trim();

  if (!key) {
    return {
      valid: false,
      error: 'API key cannot be empty',
      statusCode: 401,
    };
  }

  const apiKey = await findApiKey(key);

  if (!apiKey) {
    return {
      valid: false,
      error: 'Invalid API key',
      statusCode: 401,
    };
  }

  if (isKeyExpired(apiKey)) {
    return {
      valid: false,
      error: `API key expired on ${apiKey.expiry_date}`,
      statusCode: 403,
    };
  }

  return {
    valid: true,
    apiKey,
  };
}

export function getModelForKey(apiKey: ApiKey): string {
  return apiKey.model || process.env.DEFAULT_MODEL || 'glm-4.7';
}
```

**Step 2: Commit**

```bash
git add src/validator.ts
git commit -m "feat: add API key validation"
```

---

## Task 5: Proxy Handler

**Files:**
- Create: `src/proxy.ts`

**Step 1: Create proxy handler**

Create `src/proxy.ts`:
```typescript
import type { ApiKey } from './types.js';
import { getModelForKey } from './validator.js';
import { updateApiKeyUsage } from './storage.js';

const ZAI_API_BASE = 'https://api.z.ai/api/coding/paas/v4';
const ZAI_API_KEY = process.env.ZAI_API_KEY;

if (!ZAI_API_KEY) {
  throw new Error('ZAI_API_KEY environment variable is required');
}

export interface ProxyOptions {
  apiKey: ApiKey;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface ProxyResult {
  success: boolean;
  status: number;
  headers: Record<string, string>;
  body: string;
  tokensUsed?: number;
}

export async function proxyRequest(options: ProxyOptions): Promise<ProxyResult> {
  const { apiKey, path, method, headers, body } = options;
  const model = getModelForKey(apiKey);

  // Build target URL
  const targetUrl = `${ZAI_API_BASE}${path}`;

  // Prepare headers for Z.AI
  const proxyHeaders: Record<string, string> = {
    'Authorization': `Bearer ${ZAI_API_KEY}`,
    'Content-Type': 'application/json',
  };

  // Forward relevant headers
  const forwardHeaders = ['content-type', 'accept', 'user-agent'];
  for (const h of forwardHeaders) {
    const key = Object.keys(headers).find(k => k.toLowerCase() === h);
    if (key && key !== 'authorization') {
      proxyHeaders[key] = headers[key];
    }
  }

  // Inject/override model in request body
  let processedBody = body;
  let tokensUsed = 0;

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    try {
      const bodyJson = JSON.parse(body);

      // Inject model for chat/completions endpoint
      if (path.includes('/chat/completions') || path.includes('/completions')) {
        bodyJson.model = model;
      }

      processedBody = JSON.stringify(bodyJson);
    } catch (e) {
      // Body not JSON, leave as-is
    }
  }

  // Make request to Z.AI
  try {
    const response = await fetch(targetUrl, {
      method,
      headers: proxyHeaders,
      body: processedBody,
    });

    // Get response body
    const responseBody = await response.text();

    // Extract token usage from response
    if (response.ok) {
      try {
        const responseJson = JSON.parse(responseBody);

        // OpenAI format usage
        if (responseJson.usage) {
          tokensUsed = responseJson.usage.total_tokens || 0;
        }

        // Update usage after successful request
        if (tokensUsed > 0) {
          // Don't await - fire and forget for performance
          updateApiKeyUsage(apiKey.key, tokensUsed, model).catch(console.error);
        }
      } catch (e) {
        // Response not JSON or no usage field
      }
    }

    // Build response headers
    const responseHeaders: Record<string, string> = {
      'content-type': response.headers.get('content-type') || 'application/json',
    };

    return {
      success: response.ok,
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
      tokensUsed,
    };
  } catch (error: any) {
    return {
      success: false,
      status: 502,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: {
          message: `Upstream request failed: ${error.message}`,
          type: 'upstream_error',
        },
      }),
      tokensUsed: 0,
    };
  }
}
```

**Step 2: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: add proxy handler for Z.AI API"
```

---

## Task 6: Main Hono Application

**Files:**
- Create: `src/index.ts`

**Step 1: Create main application**

Create `src/index.ts`:
```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { validator } from 'hono/validator';
import { validateApiKey, getModelForKey } from './validator.js';
import { proxyRequest } from './proxy.js';
import { checkRateLimit } from './ratelimit.js';
import { getKeyStats } from './storage.js';
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
```

**Step 2: Update package.json with start script**

Update `package.json`:
```json
{
  "name": "proxy-gateway",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts"
  },
  "dependencies": {
    "hono": "^4.6.0"
  }
}
```

**Step 3: Commit**

```bash
git add src/index.ts package.json
git commit -m "feat: add main Hono application with proxy and stats endpoints"
```

---

## Task 7: Create Example API Key

**Files:**
- Modify: `data/apikeys.json`

**Step 1: Create example API key**

Update `data/apikeys.json`:
```json
{
  "keys": [
    {
      "key": "pk_test_example_key_12345",
      "name": "Example Test Key",
      "model": "glm-4.7",
      "token_limit_per_5h": 100000,
      "expiry_date": "2025-12-31T23:59:59Z",
      "created_at": "2025-01-18T00:00:00Z",
      "last_used": "2025-01-18T00:00:00Z",
      "total_lifetime_tokens": 0,
      "usage_windows": []
    }
  ]
}
```

**Step 2: Commit**

```bash
git add data/apikeys.json
git commit -m "chore: add example API key for testing"
```

---

## Task 8: Testing and Verification

**Step 1: Build and start with Docker**

```bash
docker-compose up --build
```

Expected: Container starts successfully, logs show "Proxy Gateway starting on port 3000"

**Step 2: Test health endpoint**

```bash
curl http://localhost:3000/health
```

Expected: `{"status":"ok","timestamp":"..."}`

**Step 3: Test stats endpoint with example key**

```bash
curl -H "x-api-key: pk_test_example_key_12345" http://localhost:3000/stats
```

Expected: JSON with stats showing 0 tokens used

**Step 4: Test proxy to Z.AI**

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_test_example_key_12345" \
  -d '{
    "model": "glm-4.7",
    "messages": [{"role": "user", "content": "Say hello"}]
  }'
```

Expected: Response from Z.AI with chat completion

**Step 5: Verify stats updated**

```bash
curl -H "x-api-key: pk_test_example_key_12345" http://localhost:3000/stats
```

Expected: `total_lifetime_tokens` > 0, `tokens_used_in_current_window` > 0

**Step 6: Test rate limit (create key with low limit)**

Create a test key with 100 token limit, make requests until exceeded

**Step 7: Test expired key**

Create a key with past expiry date, verify 403 response

**Step 8: Test invalid key**

```bash
curl -H "x-api-key: invalid_key" http://localhost:3000/stats
```

Expected: 401 error

---

## Task 9: Documentation

**Files:**
- Create: `README.md`

**Step 1: Create README**

Create `README.md`:
```markdown
# Proxy Gateway

API Gateway dengan rate limiting yang proxy request ke Z.AI API (glm-4.7).

## Setup

1. Copy environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your Z.AI API key:
   ```bash
   ZAI_API_KEY=your_zai_api_key_here
   ```

3. Start with Docker:
   ```bash
   docker-compose up -d
   ```

## Usage

### Check stats
```bash
curl -H "x-api-key: pk_your_key" http://localhost:3000/stats
```

### Chat completion
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_your_key" \
  -d '{
    "model": "glm-4.7",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Create new API key

Edit `data/apikeys.json`:
```json
{
  "keys": [
    {
      "key": "pk_new_user_key",
      "name": "User Name",
      "model": "glm-4.7",
      "token_limit_per_5h": 100000,
      "expiry_date": "2025-12-31T23:59:59Z",
      "created_at": "2025-01-18T00:00:00Z",
      "last_used": "2025-01-18T00:00:00Z",
      "total_lifetime_tokens": 0,
      "usage_windows": []
    }
  ]
}
```

## Rate Limiting

- Rolling 5-hour window
- Token-based counting
- Returns 429 when exceeded

## Endpoints

- `GET /health` - Health check
- `GET /stats` - Usage statistics (requires API key)
- `ALL /v1/*` - Proxy to Z.AI
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage instructions"
```

---

## Final Task: Clean Up and Verify

**Step 1: Run all tests manually**

Verify all endpoints work correctly

**Step 2: Check for TODO comments**

```bash
grep -r "TODO" src/
```

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup and polish"
```

---

## Implementation Complete

Features implemented:
- [x] Hono + Bun server
- [x] Docker containerization
- [x] API key validation from JSON
- [x] Rolling 5-hour rate limiting
- [x] Fixed expiry date checking
- [x] Proxy to Z.AI with master API key
- [x] /stats endpoint
- [x] Atomic file locking
- [x] Model override per key
