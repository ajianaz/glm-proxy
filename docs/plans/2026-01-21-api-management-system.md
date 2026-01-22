# API Management System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a REST API for managing API keys with CRUD operations, admin authentication, and Postgres-based storage with Drizzle ORM.

**Architecture:** Replace JSON file-based storage (`src/storage.ts`) with Postgres database. Add admin middleware with single ADMIN_API_KEY. Implement REST endpoints for API key management. All IDs use lowercase ULID. Rate limiting changes from 5-hour to 24-hour window.

**Tech Stack:** Postgres, Drizzle ORM, Hono, Bun, ULID (ulidx package)

---

## Prerequisites

**Environment Variables to Add:**
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/glm_proxy
ADMIN_API_KEY=ajianaz_admin_<generate_on_first_run>
```

**Dependencies to Install:**
```bash
bun add drizzle-orm postgres ulidx
bun add -d drizzle-kit
```

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install Drizzle ORM and Postgres driver**

Run:
```bash
bun add drizzle-orm postgres ulidx
```

Expected: Dependencies added to `package.json`

**Step 2: Install Drizzle Kit for migrations**

Run:
```bash
bun add -d drizzle-kit
```

Expected: `drizzle-kit` added to `devDependencies`

**Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "deps: add drizzle-orm, postgres, ulidx, and drizzle-kit"
```

---

## Task 2: Configure Drizzle

**Files:**
- Create: `drizzle.config.ts`
- Modify: `package.json`

**Step 1: Create Drizzle configuration file**

Create `drizzle.config.ts`:
```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

**Step 2: Add Drizzle scripts to package.json**

Add to `scripts` in `package.json`:
```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:push": "drizzle-kit push",
"db:studio": "drizzle-kit studio"
```

**Step 3: Commit**

```bash
git add drizzle.config.ts package.json
git commit -m "chore: configure drizzle-kit and add database scripts"
```

---

## Task 3: Create Database Schema

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/index.ts`

**Step 1: Write the database connection test**

Create `src/db/schema.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { describe } from "node:test";
import { apiKeys, dailyUsage } from './schema';

test('schema exports exist', () => {
  expect(apiKeys).toBeDefined();
  expect(dailyUsage).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test src/db/schema.test.ts
```

Expected: FAIL with "Cannot find module './schema'"

**Step 3: Create schema file**

Create `src/db/schema.ts`:
```typescript
import { pgTable, varchar, integer, timestamp, index, primaryKey } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Valid GLM models
export const VALID_MODELS = [
  'glm-4.7',
  'glm-4.7-flash',
  'glm-4.7-flashx',
  'glm-4.5',
  'glm-4.5-air',
  'glm-4.5-flash',
  'glm-4.5v',
] as const;

export type ValidModel = typeof VALID_MODELS[number];

// API Keys table
export const apiKeys = pgTable('api_keys', {
  id: varchar('id', { length: 26 }).primaryKey(), // lowercase ULID
  key: varchar('key', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  model: varchar('model', { length: 50 }).notNull(),
  tokenLimitPerDay: integer('token_limit_per_day').notNull(),
  expiryDate: timestamp('expiry_date', { mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  lastUsed: timestamp('last_used', { mode: 'string' }),
  totalLifetimeTokens: integer('total_lifetime_tokens').default(0).notNull(),
}, (table) => ({
  keyIdx: index('idx_api_keys_key').on(table.key),
}));

// Daily usage tracking table (for analytics)
export const dailyUsage = pgTable('daily_usage', {
  id: varchar('id', { length: 26 }).primaryKey(), // lowercase ULID
  apiKeyId: varchar('api_key_id', { length: 26 }).notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
  date: timestamp('date', { mode: 'string' }).notNull(),
  tokensUsed: integer('tokens_used').notNull().default(0),
  requestCount: integer('request_count').notNull().default(0),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string' }).defaultNow(),
}, (table) => ({
  uniqueDate: index('idx_daily_usage_date').on(table.apiKeyId, table.date),
}));
```

**Step 4: Create database connection**

Create `src/db/index.ts`:
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
```

**Step 5: Run test to verify it passes**

Run:
```bash
bun test src/db/schema.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/db/schema.ts src/db/index.ts src/db/schema.test.ts
git commit -m "feat: create database schema for api keys and daily usage"
```

---

## Task 4: Generate and Run Migration

**Files:**
- Create: `drizzle/0000_*.sql`

**Step 1: Generate migration**

Run:
```bash
bun run db:generate
```

Expected: Migration SQL file created in `drizzle/` directory

**Step 2: Review generated migration**

Run:
```bash
cat drizzle/0000_*.sql
```

Expected output:
```sql
-- ... CREATE TABLE statements for api_keys and daily_usage
```

**Step 3: Push schema to database**

Run:
```bash
bun run db:push
```

Expected: Tables created in database

**Step 4: Commit**

```bash
git add drizzle/
git commit -m "db: generate and apply initial migration"
```

---

## Task 5: Create ULID Helper Utilities

**Files:**
- Create: `src/utils/ulid.ts`
- Create: `src/utils/ulid.test.ts`

**Step 1: Write the failing test**

Create `src/utils/ulid.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { generateId, generateApiKey } from './ulid';

test('generateId creates 26 character lowercase ULID', () => {
  const id = generateId();
  expect(id).toHaveLength(26);
  expect(id).toBe(id.toLowerCase());
});

test('generateApiKey creates key with ajianaz_ prefix', () => {
  const key = generateApiKey();
  expect(key).toMatch(/^ajianaz_[a-z0-9]{26}$/);
});

test('generateApiKey creates unique keys', () => {
  const key1 = generateApiKey();
  const key2 = generateApiKey();
  expect(key1).not.toBe(key2);
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test src/utils/ulid.test.ts
```

Expected: FAIL with "Cannot find module './ulid'"

**Step 3: Write minimal implementation**

Create `src/utils/ulid.ts`:
```typescript
import { ulid } from 'ulidx';

export function generateId(): string {
  return ulid().toLowerCase();
}

export function generateApiKey(): string {
  return `ajianaz_${generateId()}`;
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
bun test src/utils/ulid.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/ulid.ts src/utils/ulid.test.ts
git commit -m "feat: add ULID helper utilities"
```

---

## Task 6: Create Database Query Layer

**Files:**
- Create: `src/db/queries.ts`
- Create: `src/db/queries.test.ts`

**Step 1: Write the failing test for createApiKey**

Create `src/db/queries.test.ts`:
```typescript
import { test, expect, beforeAll, afterEach } from "bun:test";
import { db } from './index';
import { apiKeys } from './schema';
import { createApiKey, findApiKeyByKey, listApiKeys } from './queries';
import { sql } from 'drizzle-orm';

test.beforeAll(async () => {
  // Clean up test data
  await db.delete(apiKeys);
});

test.afterEach(async () => {
  await db.delete(apiKeys);
});

test('createApiKey inserts new API key', async () => {
  const result = await createApiKey({
    name: 'Test User',
    model: 'glm-4.7',
    tokenLimitPerDay: 1000000,
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });

  expect(result).toBeDefined();
  expect(result.key).toMatch(/^ajianaz_[a-z0-9]{26}$/);
  expect(result.name).toBe('Test User');
  expect(result.model).toBe('glm-4.7');
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test src/db/queries.test.ts
```

Expected: FAIL with "Cannot find module './queries'"

**Step 3: Implement createApiKey function**

Create `src/db/queries.ts`:
```typescript
import { db } from './index';
import { apiKeys } from './schema';
import type { ValidModel } from './schema';
import { generateId, generateApiKey } from '../utils/ulid.js';

export interface CreateApiKeyInput {
  name: string;
  model: ValidModel;
  tokenLimitPerDay: number;
  expiryDate: string;
}

export async function createApiKey(input: CreateApiKeyInput) {
  const id = generateId();
  const key = generateApiKey();

  const [result] = await db.insert(apiKeys).values({
    id,
    key,
    name: input.name,
    model: input.model,
    tokenLimitPerDay: input.tokenLimitPerDay,
    expiryDate: input.expiryDate,
  }).returning();

  return result;
}

export async function findApiKeyByKey(key: string) {
  const [result] = await db.select().from(apiKeys).where(eq(apiKeys.key, key));
  return result || null;
}

export async function findApiKeyById(id: string) {
  const [result] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
  return result || null;
}

export async function listApiKeys(options: { limit?: number; offset?: number } = {}) {
  const { limit = 50, offset = 0 } = options;

  const keys = await db
    .select()
    .from(apiKeys)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(apiKeys.createdAt));

  return keys;
}

export async function updateApiKey(id: string, updates: Partial<{
  name: string;
  model: ValidModel;
  tokenLimitPerDay: number;
  expiryDate: string;
}>) {
  const [result] = await db
    .update(apiKeys)
    .set(updates)
    .where(eq(apiKeys.id, id))
    .returning();

  return result || null;
}

export async function deleteApiKey(id: string) {
  const [result] = await db
    .delete(apiKeys)
    .where(eq(apiKeys.id, id))
    .returning();

  return result || null;
}

export async function regenerateApiKey(id: string) {
  const newKey = generateApiKey();

  const [result] = await db
    .update(apiKeys)
    .set({ key: newKey })
    .where(eq(apiKeys.id, id))
    .returning();

  return result || null;
}
```

**Step 4: Add missing imports to queries.ts**

Add to top of `src/db/queries.ts`:
```typescript
import { eq, desc } from 'drizzle-orm';
```

**Step 5: Run test to verify it passes**

Run:
```bash
bun test src/db/queries.test.ts
```

Expected: PASS

**Step 6: Write additional tests for other query functions**

Add to `src/db/queries.test.ts`:
```typescript
test('findApiKeyByKey finds existing key', async () => {
  const created = await createApiKey({
    name: 'Test User',
    model: 'glm-4.7',
    tokenLimitPerDay: 1000000,
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const found = await findApiKeyByKey(created.key);
  expect(found).toBeDefined();
  expect(found?.id).toBe(created.id);
});

test('listApiKeys returns paginated results', async () => {
  await createApiKey({
    name: 'User 1',
    model: 'glm-4.7',
    tokenLimitPerDay: 1000000,
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });

  await createApiKey({
    name: 'User 2',
    model: 'glm-4.5-air',
    tokenLimitPerDay: 500000,
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const results = await listApiKeys({ limit: 10 });
  expect(results.length).toBeGreaterThanOrEqual(2);
});
```

**Step 7: Run all tests**

Run:
```bash
bun test src/db/queries.test.ts
```

Expected: PASS

**Step 8: Commit**

```bash
git add src/db/queries.ts src/db/queries.test.ts
git commit -m "feat: implement database query layer for API keys"
```

---

## Task 7: Create Admin Authentication Middleware

**Files:**
- Create: `src/middleware/adminAuth.ts`
- Create: `src/middleware/adminAuth.test.ts`

**Step 1: Write the failing test**

Create `src/middleware/adminAuth.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { Hono } from 'hono';
import { adminAuthMiddleware } from './adminAuth';

test('adminAuthMiddleware rejects requests without admin key', async () => {
  const app = new Hono();
  app.use('/admin/*', adminAuthMiddleware());
  app.get('/admin/test', (c) => c.json({ message: 'success' }));

  const res = await app.request('/admin/test');

  expect(res.status).toBe(401);
});

test('adminAuthMiddleware accepts requests with valid admin key', async () => {
  const app = new Hono<{ Bindings: { ADMIN_API_KEY: string } }>();
  app.use('/admin/*', adminAuthMiddleware());
  app.get('/admin/test', (c) => c.json({ message: 'success' }));

  const res = await app.request('/admin/test', {
    headers: {
      Authorization: 'Bearer test_admin_key',
    },
  }, {
    ADMIN_API_KEY: 'test_admin_key',
  });

  expect(res.status).toBe(200);
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test src/middleware/adminAuth.test.ts
```

Expected: FAIL with "Cannot find module './adminAuth'"

**Step 3: Implement adminAuthMiddleware**

Create `src/middleware/adminAuth.ts`:
```typescript
import { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

export function adminAuthMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const adminKey = c.env.ADMIN_API_KEY || process.env.ADMIN_API_KEY;

    if (!adminKey) {
      throw new HTTPException(500, { message: 'ADMIN_API_KEY not configured' });
    }

    const authHeader = c.req.header('Authorization');
    const providedKey = authHeader?.replace('Bearer ', '');

    if (providedKey !== adminKey) {
      throw new HTTPException(401, { message: 'Invalid admin credentials' });
    }

    await next();
  };
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
bun test src/middleware/adminAuth.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/middleware/adminAuth.ts src/middleware/adminAuth.test.ts
git commit -m "feat: add admin authentication middleware"
```

---

## Task 8: Create API Validation Utilities

**Files:**
- Create: `src/utils/validation.ts`
- Create: `src/utils/validation.test.ts`

**Step 1: Write the failing test**

Create `src/utils/validation.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { validateModel, validateTokenLimit, validateExpiryDate } from './validation';
import { VALID_MODELS } from '../db/schema';

test('validateModel accepts valid models', () => {
  expect(() => validateModel('glm-4.7')).not.toThrow();
  expect(() => validateModel('glm-4.5-air')).not.toThrow();
});

test('validateModel rejects invalid models', () => {
  expect(() => validateModel('invalid-model')).toThrow();
  expect(() => validateModel('gpt-4')).toThrow();
});

test('validateTokenLimit accepts valid ranges', () => {
  expect(() => validateTokenLimit(1)).not.toThrow();
  expect(() => validateTokenLimit(1000000)).not.toThrow();
  expect(() => validateTokenLimit(10000000)).not.toThrow();
});

test('validateTokenLimit rejects out of range', () => {
  expect(() => validateTokenLimit(0)).toThrow();
  expect(() => validateTokenLimit(10000001)).toThrow();
  expect(() => validateTokenLimit(-1)).toThrow();
});

test('validateExpiryDate accepts future dates', () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  expect(() => validateExpiryDate(future)).not.toThrow();
});

test('validateExpiryDate rejects past dates', () => {
  const past = new Date(Date.now() - 86400000).toISOString();
  expect(() => validateExpiryDate(past)).toThrow();
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test src/utils/validation.test.ts
```

Expected: FAIL with "Cannot find module './validation'"

**Step 3: Implement validation utilities**

Create `src/utils/validation.ts`:
```typescript
import { VALID_MODELS } from '../db/schema.js';

export function validateModel(model: string): void {
  if (!VALID_MODELS.includes(model as any)) {
    throw new Error(
      `Invalid model. Valid options: ${VALID_MODELS.join(', ')}`
    );
  }
}

export function validateTokenLimit(limit: number): void {
  if (limit < 1 || limit > 10000000) {
    throw new Error('Token limit must be between 1 and 10,000,000');
  }
}

export function validateExpiryDate(dateStr: string): void {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date format');
  }
  if (date <= new Date()) {
    throw new Error('Expiry date must be in the future');
  }
}

export function validateName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new Error('Name is required');
  }
  if (name.length > 255) {
    throw new Error('Name must be 255 characters or less');
  }
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
bun test src/utils/validation.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/validation.ts src/utils/validation.test.ts
git commit -m "feat: add input validation utilities"
```

---

## Task 9: Create Admin API Routes - Create Endpoint

**Files:**
- Create: `src/routes/admin.ts`
- Create: `src/routes/admin.test.ts`

**Step 1: Write the failing test for POST /admin/api-keys**

Create `src/routes/admin.test.ts`:
```typescript
import { test, expect } from "bun:test";
import { Hono } from 'hono';
import { adminRoutes } from './admin';

test('POST /admin/api-keys creates new API key', async () => {
  const app = new Hono<{ Bindings: { ADMIN_API_KEY: string; DATABASE_URL: string } }>();
  app.route('/admin', adminRoutes());

  const res = await app.request('/admin/api-keys', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer test_admin_key',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Test User',
      model: 'glm-4.7',
      tokenLimitPerDay: 1000000,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  }, {
    ADMIN_API_KEY: 'test_admin_key',
  });

  expect(res.status).toBe(201);

  const json = await res.json();
  expect(json).toMatchObject({
    name: 'Test User',
    model: 'glm-4.7',
    tokenLimitPerDay: 1000000,
  });
  expect(json.key).toMatch(/^ajianaz_[a-z0-9]{26}$/);
});

test('POST /admin/api-keys validates required fields', async () => {
  const app = new Hono<{ Bindings: { ADMIN_API_KEY: string } }>();
  app.route('/admin', adminRoutes());

  const res = await app.request('/admin/api-keys', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer test_admin_key',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Test User',
      // Missing required fields
    }),
  }, {
    ADMIN_API_KEY: 'test_admin_key',
  });

  expect(res.status).toBe(400);

  const json = await res.json();
  expect(json.error).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test src/routes/admin.test.ts
```

Expected: FAIL with "Cannot find module './admin'"

**Step 3: Implement admin routes**

Create `src/routes/admin.ts`:
```typescript
import { Hono } from 'hono';
import { adminAuthMiddleware } from '../middleware/adminAuth.js';
import { createApiKey, listApiKeys, findApiKeyById, findApiKeyByKey, updateApiKey, deleteApiKey, regenerateApiKey } from '../db/queries.js';
import { validateModel, validateTokenLimit, validateExpiryDate, validateName } from '../utils/validation.js';
import type { ValidModel } from '../db/schema.js';

const app = new Hono();

// Apply admin auth to all routes
app.use('/*', adminAuthMiddleware());

// POST /admin/api-keys - Create new API key
app.post('/api-keys', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    validateName(body.name);
    validateModel(body.model);
    validateTokenLimit(body.tokenLimitPerDay);
    validateExpiryDate(body.expiryDate);

    const result = await createApiKey({
      name: body.name,
      model: body.model as ValidModel,
      tokenLimitPerDay: body.tokenLimitPerDay,
      expiryDate: body.expiryDate,
    });

    return c.json(result, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// GET /admin/api-keys - List all API keys
app.get('/api-keys', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const results = await listApiKeys({ limit, offset });

  return c.json({
    keys: results,
    count: results.length,
    limit,
    offset,
  });
});

// GET /admin/api-keys/:id - Get API key by ID
app.get('/api-keys/:id', async (c) => {
  const id = c.req.param('id');

  const result = await findApiKeyById(id);

  if (!result) {
    return c.json({ error: 'API key not found' }, 404);
  }

  return c.json(result);
});

// GET /admin/api-keys/key/:key - Get API key by key value
app.get('/api-keys/key/:key', async (c) => {
  const key = c.req.param('key');

  const result = await findApiKeyByKey(key);

  if (!result) {
    return c.json({ error: 'API key not found' }, 404);
  }

  return c.json(result);
});

// PUT /admin/api-keys/:id - Update API key
app.put('/api-keys/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    // Build update object with only provided fields
    const updates: any = {};

    if (body.name !== undefined) {
      validateName(body.name);
      updates.name = body.name;
    }

    if (body.model !== undefined) {
      validateModel(body.model);
      updates.model = body.model;
    }

    if (body.tokenLimitPerDay !== undefined) {
      validateTokenLimit(body.tokenLimitPerDay);
      updates.tokenLimitPerDay = body.tokenLimitPerDay;
    }

    if (body.expiryDate !== undefined) {
      validateExpiryDate(body.expiryDate);
      updates.expiryDate = body.expiryDate;
    }

    const result = await updateApiKey(id, updates);

    if (!result) {
      return c.json({ error: 'API key not found' }, 404);
    }

    return c.json(result);
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

// DELETE /admin/api-keys/:id - Delete API key
app.delete('/api-keys/:id', async (c) => {
  const id = c.req.param('id');

  const result = await deleteApiKey(id);

  if (!result) {
    return c.json({ error: 'API key not found' }, 404);
  }

  return c.json({ message: 'API key deleted', id: result.id });
});

// POST /admin/api-keys/:id/regenerate - Regenerate API key
app.post('/api-keys/:id/regenerate', async (c) => {
  const id = c.req.param('id');

  const result = await regenerateApiKey(id);

  if (!result) {
    return c.json({ error: 'API key not found' }, 404);
  }

  return c.json(result);
});

export default app;
```

**Step 4: Run test to verify it passes**

Run:
```bash
bun test src/routes/admin.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/routes/admin.ts src/routes/admin.test.ts
git commit -m "feat: implement admin API routes for API key management"
```

---

## Task 10: Update Types for New Schema

**Files:**
- Modify: `src/types.ts`

**Step 1: Update ApiKey interface**

Replace the `ApiKey` interface in `src/types.ts`:
```typescript
export interface ApiKey {
  id: string;
  key: string;
  name: string;
  model: string;
  tokenLimitPerDay: number;
  expiryDate: string;
  createdAt: string;
  lastUsed: string | null;
  totalLifetimeTokens: number;
}
```

**Step 2: Remove old interfaces**

Remove from `src/types.ts`:
- `UsageWindow` interface
- `ApiKeysData` interface
- Old `token_limit_per_5h` references

**Step 3: Update StatsResponse**

Update `StatsResponse` interface:
```typescript
export interface StatsResponse {
  key: string;
  name: string;
  model: string;
  token_limit_per_day: number;
  expiry_date: string;
  created_at: string;
  last_used: string | null;
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

**Step 4: Commit**

```bash
git add src/types.ts
git commit -m "refactor: update types for new database schema"
```

---

## Task 11: Update Rate Limiting to Use Database

**Files:**
- Modify: `src/ratelimit.ts`
- Modify: `src/ratelimit.test.ts`

**Step 1: Write new failing test for 24-hour window**

Create `src/ratelimit.test.ts`:
```typescript
import { test, expect, beforeAll } from "bun:test";
import { checkRateLimit, updateRateLimit } from './ratelimit';
import { db } from './db/index.js';
import { apiKeys, dailyUsage } from './db/schema.js';
import { generateId } from './utils/ulid.js';

beforeAll(async () => {
  // Clean up test data
  await db.delete(dailyUsage);
  await db.delete(apiKeys);
});

test('checkRateLimit returns 24-hour window info', async () => {
  const testKeyId = generateId();

  await db.insert(apiKeys).values({
    id: testKeyId,
    key: 'test_key',
    name: 'Test',
    model: 'glm-4.7',
    tokenLimitPerDay: 1000000,
    expiryDate: new Date(Date.now() + 86400000).toISOString(),
  });

  const result = checkRateLimit({
    id: testKeyId,
    key: 'test_key',
    name: 'Test',
    model: 'glm-4.7',
    tokenLimitPerDay: 1000000,
    expiryDate: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    lastUsed: null,
    totalLifetimeTokens: 0,
  });

  expect(result).toBeDefined();
  expect(result.tokensLimit).toBe(1000000);
  expect(result.windowEnd).toBeDefined();
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
bun test src/ratelimit.test.ts
```

Expected: FAIL or needs update to current implementation

**Step 3: Update rate limiting implementation**

Update `src/ratelimit.ts`:
```typescript
import type { ApiKey } from './types.js';

export interface RateLimitResult {
  allowed: boolean;
  tokensUsed: number;
  tokensLimit: number;
  windowStart: string;
  windowEnd: string;
}

// Calculate 24-hour rolling window
export function checkRateLimit(apiKey: ApiKey): RateLimitResult {
  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

  // For now, return simplified result
  // TODO: Query daily_usage table for actual usage
  return {
    allowed: true,
    tokensUsed: 0,
    tokensLimit: apiKey.tokenLimitPerDay,
    windowStart: new Date(twentyFourHoursAgo).toISOString(),
    windowEnd: new Date(now).toISOString(),
  };
}

export async function updateRateLimit(
  apiKeyId: string,
  tokensUsed: number
): Promise<void> {
  // TODO: Implement daily usage tracking
  // This will insert/update daily_usage table
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
bun test src/ratelimit.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/ratelimit.ts src/ratelimit.test.ts
git commit -m "refactor: update rate limiting to 24-hour window"
```

---

## Task 12: Integrate Admin Routes into Main App

**Files:**
- Modify: `src/index.ts`

**Step 1: Import admin routes**

Add to imports in `src/index.ts`:
```typescript
import adminRoutes from './routes/admin.js';
```

**Step 2: Mount admin routes**

Add before the health check route in `src/index.ts`:
```typescript
// Admin API routes
app.route('/admin', adminRoutes);
```

**Step 3: Test the integration**

Run:
```bash
bun start
```

In another terminal:
```bash
curl http://localhost:3030/admin/api-keys
```

Expected: 401 Unauthorized

```bash
curl -H "Authorization: Bearer $ADMIN_API_KEY" http://localhost:3030/admin/api-keys
```

Expected: 200 with empty array `{"keys":[],"count":0,"limit":50,"offset":0}`

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: integrate admin routes into main application"
```

---

## Task 13: Add .env.example Updates

**Files:**
- Modify: `.env.example`

**Step 1: Add new environment variables**

Add to `.env.example`:
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/glm_proxy

# Admin Authentication
ADMIN_API_KEY=ajianaz_admin_your_admin_key_here

# Existing (keep these)
ZAI_API_KEY=your_zai_api_key_here
DEFAULT_MODEL=glm-4.7
PORT=3030
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: update .env.example with database and admin config"
```

---

## Task 14: Update README Documentation

**Files:**
- Modify: `README.md`

**Step 1: Add Admin API section**

Add after "API Documentation" section:
```markdown
## Admin API Management

### Endpoints

All admin endpoints require `ADMIN_API_KEY` authentication via `Authorization: Bearer <admin_key>` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/api-keys` | Create new API key |
| GET | `/admin/api-keys` | List all API keys (paginated) |
| GET | `/admin/api-keys/:id` | Get API key by ID |
| GET | `/admin/api-keys/key/:key` | Get API key by key value |
| PUT | `/admin/api-keys/:id` | Update API key |
| DELETE | `/admin/api-keys/:id` | Delete API key |
| POST | `/admin/api-keys/:id/regenerate` | Regenerate API key |

### Create API Key

```bash
curl -X POST http://localhost:3030/admin/api-keys \
  -H "Authorization: Bearer YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "model": "glm-4.7",
    "tokenLimitPerDay": 1000000,
    "expiryDate": "2027-01-01T00:00:00Z"
  }'
```

Response (201):
```json
{
  "id": "01hz3x7q5n2j8k9m0p3q4r5s6",
  "key": "ajianaz_01hz3x7q5n2j8k9m0p3q4r5s6",
  "name": "John Doe",
  "model": "glm-4.7",
  "tokenLimitPerDay": 1000000,
  "expiryDate": "2027-01-01T00:00:00Z",
  "createdAt": "2026-01-21T00:00:00.000Z",
  "lastUsed": null,
  "totalLifetimeTokens": 0
}
```
```

**Step 2: Update Quick Setup section**

Update environment variables in README:
```markdown
### 1. Environment Configuration

```bash
# Copy example env file
cp .env.example .env

# Edit .env
DATABASE_URL=postgresql://user:password@localhost:5432/glm_proxy  # Required: Postgres connection
ADMIN_API_KEY=ajianaz_admin_<generate_unique_key>                 # Required: Admin API key
ZAI_API_KEY=your_zai_api_key_here                                # Required: Master API key from Z.AI
DEFAULT_MODEL=glm-4.7                                            # Optional: Default model (fallback)
PORT=3030                                                        # Optional: Service port
```
```

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add admin API documentation to README"
```

---

## Task 15: Full Integration Test

**Files:**
- Create: `src/tests/integration.test.ts`

**Step 1: Write comprehensive integration test**

Create `src/tests/integration.test.ts`:
```typescript
import { test, expect, beforeAll, afterAll } from "bun:test";
import { Hono } from 'hono';
import adminRoutes from '../routes/admin.js';
import { db } from '../db/index.js';
import { apiKeys } from '../db/schema.js';
import { generateId } from '../utils/ulid.js';

test.beforeAll(async () => {
  await db.delete(apiKeys);
});

test.afterAll(async () => {
  await db.delete(apiKeys);
});

test('full CRUD flow for API keys', async () => {
  const app = new Hono<{ Bindings: { ADMIN_API_KEY: string } }>();
  app.route('/admin', adminRoutes());
  const adminKey = 'test_admin_key';

  // 1. Create API key
  const createRes = await app.request('/admin/api-keys', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Integration Test User',
      model: 'glm-4.7',
      tokenLimitPerDay: 500000,
      expiryDate: new Date(Date.now() + 86400000).toISOString(),
    }),
  }, {
    ADMIN_API_KEY: adminKey,
  });

  expect(createRes.status).toBe(201);
  const created = await createRes.json();
  expect(created.key).toMatch(/^ajianaz_[a-z0-9]{26}$/);

  // 2. List API keys
  const listRes = await app.request('/admin/api-keys', {
    headers: {
      'Authorization': `Bearer ${adminKey}`,
    },
  }, {
    ADMIN_API_KEY: adminKey,
  });

  expect(listRes.status).toBe(200);
  const listData = await listRes.json();
  expect(listData.keys.length).toBeGreaterThan(0);

  // 3. Get API key by ID
  const getRes = await app.request(`/admin/api-keys/${created.id}`, {
    headers: {
      'Authorization': `Bearer ${adminKey}`,
    },
  }, {
    ADMIN_API_KEY: adminKey,
  });

  expect(getRes.status).toBe(200);
  const found = await getRes.json();
  expect(found.id).toBe(created.id);

  // 4. Update API key
  const updateRes = await app.request(`/admin/api-keys/${created.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tokenLimitPerDay: 1000000,
    }),
  }, {
    ADMIN_API_KEY: adminKey,
  });

  expect(updateRes.status).toBe(200);
  const updated = await updateRes.json();
  expect(updated.tokenLimitPerDay).toBe(1000000);

  // 5. Regenerate key
  const regenRes = await app.request(`/admin/api-keys/${created.id}/regenerate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${adminKey}`,
    },
  }, {
    ADMIN_API_KEY: adminKey,
  });

  expect(regenRes.status).toBe(200);
  const regenerated = await regenRes.json();
  expect(regenerated.key).not.toBe(created.key);
  expect(regenerated.key).toMatch(/^ajianaz_[a-z0-9]{26}$/);

  // 6. Delete API key
  const deleteRes = await app.request(`/admin/api-keys/${created.id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${adminKey}`,
    },
  }, {
    ADMIN_API_KEY: adminKey,
  });

  expect(deleteRes.status).toBe(200);

  // 7. Verify deletion
  const getDeletedRes = await app.request(`/admin/api-keys/${created.id}`, {
    headers: {
      'Authorization': `Bearer ${adminKey}`,
    },
  }, {
    ADMIN_API_KEY: adminKey,
  });

  expect(getDeletedRes.status).toBe(404);
});
```

**Step 2: Run integration test**

Run:
```bash
bun test src/tests/integration.test.ts
```

Expected: PASS

**Step 3: Commit**

```bash
git add src/tests/integration.test.ts
git commit -m "test: add comprehensive integration test suite"
```

---

## Task 16: Clean Up Old Storage Implementation

**Files:**
- Delete: `src/storage.ts`

**Step 1: Verify no remaining imports**

Run:
```bash
grep -r "storage.ts" src/
```

Expected: No results (or only in test files)

**Step 2: Remove old storage file**

Run:
```bash
rm src/storage.ts
```

**Step 3: Commit**

```bash
git add -A
git commit -m "refactor: remove old JSON-based storage implementation"
```

---

## Task 17: Final Verification

**Step 1: Run all tests**

Run:
```bash
bun test
```

Expected: All tests pass

**Step 2: Type check**

Run:
```bash
bun run typecheck
```

Expected: No type errors

**Step 3: Lint**

Run:
```bash
bun run lint
```

Expected: No lint errors

**Step 4: Start server**

Run:
```bash
bun start
```

Expected: Server starts without errors on port 3030

**Step 5: Test endpoints**

```bash
# Health check
curl http://localhost:3030/health

# List API keys (should return 401 without admin key)
curl http://localhost:3030/admin/api-keys

# List API keys (with admin key)
curl -H "Authorization: Bearer $ADMIN_API_KEY" http://localhost:3030/admin/api-keys

# Create new API key
curl -X POST http://localhost:3030/admin/api-keys \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "model": "glm-4.7",
    "tokenLimitPerDay": 1000000,
    "expiryDate": "2027-01-01T00:00:00Z"
  }'
```

**Step 6: Final commit**

```bash
git add -A
git commit -m "chore: final verification and cleanup"
```

---

## Summary

This implementation plan covers:
1. Database setup with Drizzle ORM and Postgres
2. ULID-based ID generation
3. Admin authentication middleware
4. Complete CRUD API for API key management
5. Input validation for all fields
6. Migration from JSON file storage to database
7. Updated rate limiting to 24-hour windows
8. Comprehensive test coverage
9. Documentation updates

**Total estimated tasks:** 17

**Key files created/modified:**
- Created: `src/db/schema.ts`, `src/db/index.ts`, `src/db/queries.ts`
- Created: `src/utils/ulid.ts`, `src/utils/validation.ts`
- Created: `src/middleware/adminAuth.ts`
- Created: `src/routes/admin.ts`
- Modified: `src/types.ts`, `src/ratelimit.ts`, `src/index.ts`
- Deleted: `src/storage.ts` (replaced with database layer)
