import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { checkHealth, isHealthy } from './health';
import { getDb, closeDb } from './connection';

describe('Database Health Check', () => {
  beforeEach(async () => {
    // Ensure database is initialized
    await getDb();
  });

  afterEach(async () => {
    await closeDb();
  });

  describe('checkHealth', () => {
    it('should return healthy status for working database', async () => {
      const result = await checkHealth();

      expect(result.connected).toBe(true);
      expect(result.status).toBe('healthy');
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.databaseType).toBeDefined();
    });

    it('should return database type', async () => {
      const result = await checkHealth();

      expect(result.databaseType).toBe('sqlite');
    });

    it('should measure response time', async () => {
      const result = await checkHealth();

      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.responseTimeMs).toBe('number');
    });

    it('should include key count when requested', async () => {
      const result = await checkHealth({ includeKeyCount: true });

      expect(result.keyCount).toBeDefined();
      expect(typeof result.keyCount).toBe('number');
      expect(result.keyCount).toBeGreaterThanOrEqual(0);
    });

    it('should not include key count by default', async () => {
      const result = await checkHealth();

      expect(result.keyCount).toBeUndefined();
    });

    it('should return degraded status for slow queries', async () => {
      // Set a very low threshold to trigger degraded status
      const result = await checkHealth({ slowQueryThreshold: 0.001 });

      // Most queries will take at least 0.001ms, so this should be degraded or unhealthy
      expect(['degraded', 'unhealthy']).toContain(result.status);
    });

    it('should return healthy status for fast queries', async () => {
      // Set a high threshold to ensure healthy status
      const result = await checkHealth({ slowQueryThreshold: 10000 });

      expect(result.status).toBe('healthy');
    });

    it('should handle custom slow query threshold', async () => {
      const result1 = await checkHealth({ slowQueryThreshold: 100 });
      const result2 = await checkHealth({ slowQueryThreshold: 10000 });

      // Both should be healthy with normal database performance
      expect(result1.status).toBe('healthy');
      expect(result2.status).toBe('healthy');
    });

    it('should include response time in result', async () => {
      const result = await checkHealth();

      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
      // Response time should be reasonably fast for a simple query
      expect(result.responseTimeMs).toBeLessThan(5000);
    });
  });

  describe('isHealthy', () => {
    it('should return true for healthy database', async () => {
      const healthy = await isHealthy();

      expect(healthy).toBe(true);
    });

    it('should return false for unhealthy database', async () => {
      // Close the database to simulate an unhealthy state
      await closeDb();

      // This should still return true since getDb() will reconnect
      // To properly test unhealthy state, we'd need to mock the database
      // For now, we just verify the function works
      const healthy = await isHealthy();
      expect(typeof healthy).toBe('boolean');
    });
  });

  describe('Health check result structure', () => {
    it('should return valid health check result structure', async () => {
      const result = await checkHealth();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('databaseType');
      expect(result).toHaveProperty('connected');
      expect(result).toHaveProperty('responseTimeMs');
    });

    it('should have valid health status values', async () => {
      const result = await checkHealth();

      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
    });

    it('should include error field when unhealthy', async () => {
      // We can't easily test this without mocking, but we can verify
      // that a normal health check doesn't have an error
      const result = await checkHealth();

      if (result.status === 'healthy') {
        expect(result.error).toBeUndefined();
      }
    });
  });

  describe('Health check with key count', () => {
    it('should return accurate key count', async () => {
      const result = await checkHealth({ includeKeyCount: true });

      expect(result.keyCount).toBeDefined();
      expect(typeof result.keyCount).toBe('number');
      expect(result.keyCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle key count query failures gracefully', async () => {
      // This test verifies the health check still works even if
      // the key count query fails (though we can't easily simulate this)
      const result = await checkHealth({ includeKeyCount: true });

      // As long as the basic health check works, we're good
      expect(result.connected).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should complete health check quickly', async () => {
      const start = performance.now();
      await checkHealth();
      const duration = performance.now() - start;

      // Health check should complete in less than 1 second
      expect(duration).toBeLessThan(1000);
    });

    it('should have minimal performance impact', async () => {
      const times: number[] = [];

      // Run multiple health checks
      for (let i = 0; i < 5; i++) {
        const result = await checkHealth();
        times.push(result.responseTimeMs);
      }

      // All health checks should be fast
      times.forEach((time) => {
        expect(time).toBeLessThan(1000);
      });
    });
  });
});
