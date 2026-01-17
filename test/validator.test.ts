import { describe, it, expect, vi } from 'vitest';
import { validateApiKey, getModelForKey } from '../src/validator.js';
import type { ApiKey } from '../src/types.js';

// Mock storage functions
vi.mock('../src/storage.js', () => ({
  findApiKey: async (key: string) => {
    if (key === 'pk_valid_key') {
      return {
        key: 'pk_valid_key',
        name: 'Test User',
        model: 'glm-4.7',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-18T00:00:00Z',
        last_used: '2026-01-18T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      } as ApiKey;
    }
    if (key === 'pk_expired_key') {
      return {
        key: 'pk_expired_key',
        name: 'Expired User',
        model: 'glm-4.7',
        token_limit_per_5h: 100000,
        expiry_date: '2024-01-01T00:00:00Z',
        created_at: '2023-01-18T00:00:00Z',
        last_used: '2023-01-18T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      } as ApiKey;
    }
    return null;
  },
}));

describe('Validator', () => {
  describe('validateApiKey', () => {
    it('should return valid for existing non-expired key', async () => {
      const result = await validateApiKey('Bearer pk_valid_key');
      expect(result.valid).toBe(true);
      expect(result.apiKey).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for expired key', async () => {
      const result = await validateApiKey('Bearer pk_expired_key');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
      expect(result.statusCode).toBe(403);
    });

    it('should return invalid for missing key', async () => {
      const result = await validateApiKey(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
      expect(result.statusCode).toBe(401);
    });

    it('should return invalid for invalid key', async () => {
      const result = await validateApiKey('Bearer pk_invalid_key');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid API key');
      expect(result.statusCode).toBe(401);
    });
  });

  describe('getModelForKey', () => {
    it('should return model from API key', () => {
      const key: ApiKey = {
        key: 'pk_test',
        name: 'Test',
        model: 'glm-4.7',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-18T00:00:00Z',
        last_used: '2026-01-18T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };
      const model = getModelForKey(key);
      expect(model).toBe('glm-4.7');
    });

    it('should return default model when key has no model', () => {
      const key: ApiKey = {
        key: 'pk_test',
        name: 'Test',
        model: '',
        token_limit_per_5h: 100000,
        expiry_date: '2026-12-31T23:59:59Z',
        created_at: '2026-01-18T00:00:00Z',
        last_used: '2026-01-18T00:00:00Z',
        total_lifetime_tokens: 0,
        usage_windows: [],
      };
      const model = getModelForKey(key);
      expect(model).toBe('glm-4.7'); // DEFAULT_MODEL fallback
    });
  });
});
