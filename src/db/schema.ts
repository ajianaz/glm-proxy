import { pgTable, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';

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
