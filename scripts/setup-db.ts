#!/usr/bin/env bun
import Database from 'bun:sqlite';

const databasePath = process.env.DATABASE_PATH || './data/sqlite.db';

// Ensure database directory exists
import { existsSync, mkdirSync } from 'node:fs';
const databaseDir = databasePath.substring(0, databasePath.lastIndexOf('/'));
if (databaseDir && !existsSync(databaseDir)) {
  mkdirSync(databaseDir, { recursive: true });
}

// Create SQLite database instance
const sqlite = new Database(databasePath);
sqlite.exec('PRAGMA journal_mode = WAL;');
sqlite.exec('PRAGMA foreign_keys = ON;');

// Create tables
sqlite.exec(`
CREATE TABLE IF NOT EXISTS \`api_keys\` (
	\`key\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`model\` text,
	\`token_limit_per_5h\` integer NOT NULL,
	\`expiry_date\` text NOT NULL,
	\`created_at\` text NOT NULL,
	\`last_used\` text NOT NULL,
	\`total_lifetime_tokens\` integer DEFAULT 0 NOT NULL
);
`);

sqlite.exec(`
CREATE INDEX IF NOT EXISTS \`api_keys_last_used_idx\` ON \`api_keys\` (\`last_used\`);
`);

sqlite.exec(`
CREATE INDEX IF NOT EXISTS \`api_keys_expiry_date_idx\` ON \`api_keys\` (\`expiry_date\`);
`);

sqlite.exec(`
CREATE TABLE IF NOT EXISTS \`usage_windows\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`api_key\` text NOT NULL,
	\`window_start\` text NOT NULL,
	\`tokens_used\` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (\`api_key\`) REFERENCES \`api_keys\`(\`key\`) ON UPDATE no action ON DELETE cascade
);
`);

sqlite.exec(`
CREATE INDEX IF NOT EXISTS \`usage_windows_api_key_idx\` ON \`usage_windows\` (\`api_key\`);
`);

sqlite.exec(`
CREATE INDEX IF NOT EXISTS \`usage_windows_window_start_idx\` ON \`usage_windows\` (\`window_start\`);
`);

sqlite.exec(`
CREATE INDEX IF NOT EXISTS \`usage_windows_api_key_window_start_idx\` ON \`usage_windows\` (\`api_key\`,\`window_start\`);
`);

sqlite.close();
console.log('Database tables created successfully!');
