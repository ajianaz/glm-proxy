import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { pgTable, serial, text as pgText, integer as pgInteger, index as pgIndex } from 'drizzle-orm/pg-core';

// SQLite schema
export const sqliteApiKeys = sqliteTable(
  'api_keys',
  {
    key: text('key').primaryKey(),
    name: text('name').notNull(),
    model: text('model'),
    tokenLimitPer5h: integer('token_limit_per_5h').notNull(),
    expiryDate: text('expiry_date').notNull(),
    createdAt: text('created_at').notNull(),
    lastUsed: text('last_used').notNull(),
    totalLifetimeTokens: integer('total_lifetime_tokens').notNull().default(0),
  },
  (table) => ({
    lastUsedIdx: index('api_keys_last_used_idx').on(table.lastUsed),
    expiryDateIdx: index('api_keys_expiry_date_idx').on(table.expiryDate),
  })
);

export const sqliteUsageWindows = sqliteTable(
  'usage_windows',
  {
    id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
    apiKey: text('api_key')
      .notNull()
      .references(() => sqliteApiKeys.key, { onDelete: 'cascade' }),
    windowStart: text('window_start').notNull(),
    tokensUsed: integer('tokens_used').notNull().default(0),
  },
  (table) => ({
    apiKeyIdx: index('usage_windows_api_key_idx').on(table.apiKey),
    windowStartIdx: index('usage_windows_window_start_idx').on(table.windowStart),
    apiKeyWindowStartIdx: index('usage_windows_api_key_window_start_idx').on(
      table.apiKey,
      table.windowStart
    ),
  })
);

// PostgreSQL schema
export const pgApiKeys = pgTable(
  'api_keys',
  {
    key: pgText('key').primaryKey(),
    name: pgText('name').notNull(),
    model: pgText('model'),
    tokenLimitPer5h: pgInteger('token_limit_per_5h').notNull(),
    expiryDate: pgText('expiry_date').notNull(),
    createdAt: pgText('created_at').notNull(),
    lastUsed: pgText('last_used').notNull(),
    totalLifetimeTokens: pgInteger('total_lifetime_tokens').notNull().default(0),
  },
  (table) => ({
    lastUsedIdx: pgIndex('api_keys_last_used_idx').on(table.lastUsed),
    expiryDateIdx: pgIndex('api_keys_expiry_date_idx').on(table.expiryDate),
  })
);

export const pgUsageWindows = pgTable(
  'usage_windows',
  {
    id: serial('id').primaryKey(),
    apiKey: pgText('api_key')
      .notNull()
      .references(() => pgApiKeys.key, { onDelete: 'cascade' }),
    windowStart: pgText('window_start').notNull(),
    tokensUsed: pgInteger('tokens_used').notNull().default(0),
  },
  (table) => ({
    apiKeyIdx: pgIndex('usage_windows_api_key_idx').on(table.apiKey),
    windowStartIdx: pgIndex('usage_windows_window_start_idx').on(table.windowStart),
    apiKeyWindowStartIdx: pgIndex('usage_windows_api_key_window_start_idx').on(
      table.apiKey,
      table.windowStart
    ),
  })
);
