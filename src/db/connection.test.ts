import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getDb, closeDb, getDatabaseType, testConnection } from './connection';

describe('Database Connection', () => {
  afterEach(async () => {
    await closeDb();
  });

  it('should create SQLite connection by default', () => {
    const db = getDb();

    expect(db.type).toBe('sqlite');
    expect(db.db).toBeDefined();
    expect(db.client).toBeDefined();
  });

  it('should return correct database type', () => {
    // Default should be sqlite when DATABASE_URL is not set
    const type = getDatabaseType();
    expect(type).toBe('sqlite');
  });

  it('should support connection testing', async () => {
    const isHealthy = await testConnection();
    expect(isHealthy).toBe(true);
  });

  it('should close connection successfully', async () => {
    const db1 = getDb();
    expect(db1).toBeDefined();

    await closeDb();

    // Should create new connection after close
    const db2 = getDb();
    expect(db2).toBeDefined();
  });
});
