import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '../src/ratelimit.js';
import type { ApiKey } from '../src/types.js';

describe('Rate Limiting', () => {
  const createKey = (windows: Array<{ window_start: string; tokens_used: number }>): ApiKey => ({
    key: 'pk_test_key',
    name: 'Test User',
    model: 'glm-4.7',
    token_limit_per_5h: 100000,
    expiry_date: '2026-12-31T23:59:59Z',
    created_at: '2026-01-18T00:00:00Z',
    last_used: '2026-01-18T00:00:00Z',
    total_lifetime_tokens: 0,
    usage_windows: windows,
  });

  describe('checkRateLimit', () => {
    it('should allow request when under limit', () => {
      const key = createKey([
        { window_start: new Date(Date.now() - 3600000).toISOString(), tokens_used: 50000 },
      ]);

      const result = checkRateLimit(key);
      expect(result.allowed).toBe(true);
      expect(result.tokensUsed).toBe(50000);
      expect(result.tokensLimit).toBe(100000);
    });

    it('should deny request when over limit', () => {
      const key = createKey([
        { window_start: new Date(Date.now() - 3600000).toISOString(), tokens_used: 150000 },
      ]);

      const result = checkRateLimit(key);
      expect(result.allowed).toBe(false);
      expect(result.tokensUsed).toBe(150000);
      expect(result.tokensLimit).toBe(100000);
      expect(result.reason).toBe('Token limit exceeded for 5-hour window');
      expect(result.retryAfter).toBeDefined();
    });

    it('should sum tokens from all active windows (5h)', () => {
      const now = Date.now();
      const key = createKey([
        { window_start: new Date(now - 3600000).toISOString(), tokens_used: 30000 }, // 1h ago
        { window_start: new Date(now - 7200000).toISOString(), tokens_used: 40000 }, // 2h ago
        { window_start: new Date(now - 14400000).toISOString(), tokens_used: 20000 }, // 4h ago
      ]);

      const result = checkRateLimit(key);
      expect(result.tokensUsed).toBe(90000); // 30K + 40K + 20K = 90K
      expect(result.allowed).toBe(true);
    });

    it('should ignore windows older than 5 hours', () => {
      const now = Date.now();
      const key = createKey([
        { window_start: new Date(now - 3600000).toISOString(), tokens_used: 30000 }, // 1h ago - active
        { window_start: new Date(now - 21600000).toISOString(), tokens_used: 50000 }, // 6h ago - expired
      ]);

      const result = checkRateLimit(key);
      expect(result.tokensUsed).toBe(30000); // Only 30K counted, 50K ignored
    });
  });
});
