/**
 * Tests for Admin Credential Storage
 *
 * Tests secure credential hashing and validation functionality
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import {
  hashCredential,
  getAdminKeyHash,
  validateAdminCredential,
  resetAdminKeyCache,
  getRawAdminKey,
} from '../../src/utils/adminCredentials';
import { resetConfig } from '../../src/config';

describe('Admin Credential Storage', () => {
  const testApiKey = 'test-admin-api-key-12345';

  beforeAll(() => {
    // Set test environment variable
    process.env.ADMIN_API_KEY = testApiKey;
    process.env.ZAI_API_KEY = 'test-zai-key';
    process.env.DATABASE_PATH = ':memory:';
    resetConfig();
    resetAdminKeyCache();
  });

  describe('hashCredential', () => {
    test('should generate consistent SHA-256 hashes', () => {
      const input = 'test-credential';
      const hash1 = hashCredential(input);
      const hash2 = hashCredential(input);

      expect(hash1).toBe(hash2);
      expect(hash1).toBeString();
      expect(hash1.length).toBe(64); // SHA-256 produces 64 hex characters
    });

    test('should generate different hashes for different inputs', () => {
      const hash1 = hashCredential('credential-1');
      const hash2 = hashCredential('credential-2');

      expect(hash1).not.toBe(hash2);
    });

    test('should be case-sensitive', () => {
      const hash1 = hashCredential('TestCredential');
      const hash2 = hashCredential('testcredential');

      expect(hash1).not.toBe(hash2);
    });

    test('should handle empty string', () => {
      const hash = hashCredential('');
      expect(hash).toBeString();
      expect(hash.length).toBe(64);
    });

    test('should handle special characters', () => {
      const specialChars = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
      const hash = hashCredential(specialChars);
      expect(hash).toBeString();
      expect(hash.length).toBe(64);
    });

    test('should handle unicode characters', () => {
      const unicode = 'Hello 世界 🌍';
      const hash = hashCredential(unicode);
      expect(hash).toBeString();
      expect(hash.length).toBe(64);
    });

    test('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);
      const hash = hashCredential(longString);
      expect(hash).toBeString();
      expect(hash.length).toBe(64);
    });
  });

  describe('getAdminKeyHash', () => {
    test('should return hash of admin API key', () => {
      const hash = getAdminKeyHash();

      expect(hash).toBeString();
      expect(hash.length).toBe(64);
    });

    test('should return cached hash on subsequent calls', () => {
      const hash1 = getAdminKeyHash();
      const hash2 = getAdminKeyHash();

      expect(hash1).toBe(hash2);
    });

    test('should match manually computed hash', () => {
      const hash = getAdminKeyHash();
      const expectedHash = hashCredential(testApiKey);

      expect(hash).toBe(expectedHash);
    });

    test('should reset after resetAdminKeyCache call', () => {
      const hash1 = getAdminKeyHash();
      resetAdminKeyCache();
      const hash2 = getAdminKeyHash();

      expect(hash1).toBe(hash2); // Same key, same hash
    });
  });

  describe('validateAdminCredential', () => {
    test('should validate correct credential', () => {
      const isValid = validateAdminCredential(testApiKey);
      expect(isValid).toBe(true);
    });

    test('should reject incorrect credential', () => {
      const isValid = validateAdminCredential('wrong-api-key');
      expect(isValid).toBe(false);
    });

    test('should trim whitespace before validation', () => {
      const isValid = validateAdminCredential(`  ${testApiKey}  `);
      expect(isValid).toBe(true);
    });

    test('should reject empty string', () => {
      const isValid = validateAdminCredential('');
      expect(isValid).toBe(false);
    });

    test('should reject whitespace-only string', () => {
      const isValid = validateAdminCredential('   ');
      expect(isValid).toBe(false);
    });

    test('should be case-sensitive', () => {
      const isValid = validateAdminCredential(testApiKey.toUpperCase());
      expect(isValid).toBe(false);
    });

    test('should handle special characters in credential', () => {
      // Update environment for this test
      const specialKey = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
      process.env.ADMIN_API_KEY = specialKey;
      resetConfig();
      resetAdminKeyCache();

      const isValid = validateAdminCredential(specialKey);
      expect(isValid).toBe(true);

      // Restore original key
      process.env.ADMIN_API_KEY = testApiKey;
      resetConfig();
      resetAdminKeyCache();
    });

    test('should handle unicode in credential', () => {
      const unicodeKey = 'Hello 世界 🌍';
      process.env.ADMIN_API_KEY = unicodeKey;
      resetConfig();
      resetAdminKeyCache();

      const isValid = validateAdminCredential(unicodeKey);
      expect(isValid).toBe(true);

      // Restore original key
      process.env.ADMIN_API_KEY = testApiKey;
      resetConfig();
      resetAdminKeyCache();
    });
  });

  describe('getRawAdminKey', () => {
    test('should return the raw admin API key', () => {
      const rawKey = getRawAdminKey();
      expect(rawKey).toBe(testApiKey);
    });

    test('should return string', () => {
      const rawKey = getRawAdminKey();
      expect(rawKey).toBeString();
    });

    test('should reflect environment changes after config reset', () => {
      const newKey = 'new-admin-key-67890';
      process.env.ADMIN_API_KEY = newKey;
      resetConfig();

      const rawKey = getRawAdminKey();
      expect(rawKey).toBe(newKey);

      // Restore original key
      process.env.ADMIN_API_KEY = testApiKey;
      resetConfig();
    });
  });

  describe('resetAdminKeyCache', () => {
    test('should clear cached hash', () => {
      // Get hash to populate cache
      const hash1 = getAdminKeyHash();

      // Change environment
      const newKey = 'changed-admin-key';
      process.env.ADMIN_API_KEY = newKey;
      resetConfig();

      // Hash should still be old cached value
      const hash2 = getAdminKeyHash();
      expect(hash2).toBe(hash1);

      // Reset cache
      resetAdminKeyCache();

      // Now hash should reflect new key
      const hash3 = getAdminKeyHash();
      expect(hash3).not.toBe(hash1);
      expect(hash3).toBe(hashCredential(newKey));

      // Restore original key
      process.env.ADMIN_API_KEY = testApiKey;
      resetConfig();
      resetAdminKeyCache();
    });
  });

  describe('Security Properties', () => {
    test('hashCredential should be deterministic', () => {
      const input = 'deterministic-test';
      const hashes = Array.from({ length: 100 }, () => hashCredential(input));

      // All hashes should be identical
      expect(hashes.every(h => h === hashes[0])).toBe(true);
    });

    test('hashCredential should have avalanche effect', () => {
      const input1 = 'small-change-test';
      const input2 = 'small-change-test!'; // One character difference

      const hash1 = hashCredential(input1);
      const hash2 = hashCredential(input2);

      // Hashes should be completely different
      expect(hash1).not.toBe(hash2);

      // Count differing bits (should be around 50% for SHA-256)
      let diffBits = 0;
      for (let i = 0; i < hash1.length; i++) {
        const c1 = parseInt(hash1[i], 16);
        const c2 = parseInt(hash2[i], 16);
        diffBits += (c1 ^ c2).toString(2).split('1').length - 1;
      }

      // At least 50% of bits should differ (256 bits total, so at least 100)
      expect(diffBits).toBeGreaterThanOrEqual(100);
    });

    test('validateAdminCredential should not leak timing info', () => {
      // This is a basic test - real timing analysis would require more sophisticated tools
      const validKey = testApiKey;
      const invalidKey = 'definitely-wrong-key';

      // Both validations should complete quickly
      const start1 = performance.now();
      validateAdminCredential(validKey);
      const time1 = performance.now() - start1;

      const start2 = performance.now();
      validateAdminCredential(invalidKey);
      const time2 = performance.now() - start2;

      // Both should complete in similar time (within 10ms)
      expect(Math.abs(time1 - time2)).toBeLessThan(10);
    });
  });
});
