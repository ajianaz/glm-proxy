import { describe, test, expect } from 'bun:test';
import type { ApiKey, ApiKeysData } from '../src/types.js';
import { usageWindowsEqual } from '../scripts/migrate.ts';

// Test data
const testApiKey: ApiKey = {
  key: 'sk-test-key-1',
  name: 'Test Key 1',
  model: 'claude-3-5-sonnet-20241022',
  token_limit_per_5h: 50000,
  expiry_date: '2025-12-31T23:59:59Z',
  created_at: '2024-01-01T00:00:00Z',
  last_used: '2024-01-15T12:30:00Z',
  total_lifetime_tokens: 125000,
  usage_windows: [
    {
      window_start: '2024-01-15T10:00:00Z',
      tokens_used: 50000,
    },
    {
      window_start: '2024-01-15T11:00:00Z',
      tokens_used: 75000,
    },
  ],
};

describe('Migration Validation - Helper Functions', () => {
  describe('usageWindowsEqual', () => {
    test('returns true for identical usage windows', () => {
      const windows1 = [
        { window_start: '2024-01-15T10:00:00Z', tokens_used: 50000 },
        { window_start: '2024-01-15T11:00:00Z', tokens_used: 75000 },
      ];
      const windows2 = [
        { window_start: '2024-01-15T10:00:00Z', tokens_used: 50000 },
        { window_start: '2024-01-15T11:00:00Z', tokens_used: 75000 },
      ];

      expect(usageWindowsEqual(windows1, windows2)).toBe(true);
    });

    test('returns true for identical windows in different order', () => {
      const windows1 = [
        { window_start: '2024-01-15T11:00:00Z', tokens_used: 75000 },
        { window_start: '2024-01-15T10:00:00Z', tokens_used: 50000 },
      ];
      const windows2 = [
        { window_start: '2024-01-15T10:00:00Z', tokens_used: 50000 },
        { window_start: '2024-01-15T11:00:00Z', tokens_used: 75000 },
      ];

      expect(usageWindowsEqual(windows1, windows2)).toBe(true);
    });

    test('returns false for different counts', () => {
      const windows1 = [
        { window_start: '2024-01-15T10:00:00Z', tokens_used: 50000 },
      ];
      const windows2 = [
        { window_start: '2024-01-15T10:00:00Z', tokens_used: 50000 },
        { window_start: '2024-01-15T11:00:00Z', tokens_used: 75000 },
      ];

      expect(usageWindowsEqual(windows1, windows2)).toBe(false);
    });

    test('returns false for different window_start values', () => {
      const windows1 = [
        { window_start: '2024-01-15T10:00:00Z', tokens_used: 50000 },
        { window_start: '2024-01-15T11:00:00Z', tokens_used: 75000 },
      ];
      const windows2 = [
        { window_start: '2024-01-15T10:00:00Z', tokens_used: 50000 },
        { window_start: '2024-01-15T12:00:00Z', tokens_used: 75000 },
      ];

      expect(usageWindowsEqual(windows1, windows2)).toBe(false);
    });

    test('returns false for different tokens_used values', () => {
      const windows1 = [
        { window_start: '2024-01-15T10:00:00Z', tokens_used: 50000 },
        { window_start: '2024-01-15T11:00:00Z', tokens_used: 75000 },
      ];
      const windows2 = [
        { window_start: '2024-01-15T10:00:00Z', tokens_used: 50000 },
        { window_start: '2024-01-15T11:00:00Z', tokens_used: 80000 },
      ];

      expect(usageWindowsEqual(windows1, windows2)).toBe(false);
    });

    test('returns true for empty arrays', () => {
      expect(usageWindowsEqual([], [])).toBe(true);
    });
  });
});
