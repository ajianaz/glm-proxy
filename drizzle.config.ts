import type { Config } from 'drizzle-kit';

/**
 * Drizzle ORM Configuration
 *
 * Supports both SQLite and PostgreSQL based on environment:
 * - PostgreSQL: Set DATABASE_URL environment variable
 * - SQLite: Set DATABASE_PATH environment variable (defaults to ./data/sqlite.db)
 *
 * Environment variables:
 * - DATABASE_URL: PostgreSQL connection string (postgres://...)
 * - DATABASE_PATH: SQLite database file path (./data/sqlite.db)
 */

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: process.env.DATABASE_URL ? 'pg' : 'better-sqlite',
  dbCredentials: process.env.DATABASE_URL
    ? {
        url: process.env.DATABASE_URL,
      }
    : {
        url: process.env.DATABASE_PATH || './data/sqlite.db',
      },
  verbose: true,
  strict: true,
} satisfies Config;
