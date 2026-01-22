import { describe, it, expect, beforeAll, beforeEach } from 'bun:test';
import {
  generateAdminToken,
  validateAdminToken,
  extractTokenFromHeader,
  isLikelyJWT,
} from '../../src/utils/adminToken';
import { getConfig, resetConfig } from '../../src/config';
import { resetAdminKeyCache } from '../../src/utils/adminCredentials';

describe('Admin Token Utilities', () => {
  beforeAll(() => {
    process.env.ZAI_API_KEY = 'test-zai-key';
    process.env.ADMIN_API_KEY = 'test-master-admin-key-12345';
    process.env.DATABASE_PATH = ':memory:';
    process.env.ADMIN_TOKEN_EXPIRATION_SECONDS = '3600';
  });

  beforeEach(() => {
    resetConfig();
    resetAdminKeyCache();
  });

  describe('generateAdminToken', () => {
    it('should generate a valid JWT token', async () => {
      const token = await generateAdminToken();
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should generate different tokens each time', async () => {
      const token1 = await generateAdminToken();
      const token2 = await generateAdminToken();
      expect(token1).not.toBe(token2);
    });

    it('should generate tokens that can be validated', async () => {
      const token = await generateAdminToken();
      const result = await validateAdminToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.type).toBe('admin');
    });
  });

  describe('validateAdminToken', () => {
    it('should validate a correctly signed token', async () => {
      const token = await generateAdminToken();
      const result = await validateAdminToken(token);
      expect(result.valid).toBe(true);
      expect(result.payload?.type).toBe('admin');
    });

    it('should reject tokens with invalid signatures', async () => {
      const token = await generateAdminToken();
      const tamperedToken = token.slice(0, -10) + 'tampered';
      const result = await validateAdminToken(tamperedToken);
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(401);
    });

    it('should reject empty tokens', async () => {
      const result = await validateAdminToken('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token is required');
    });

    it('should reject null tokens', async () => {
      const result = await validateAdminToken(null as any);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token is required');
    });

    it('should trim whitespace from tokens', async () => {
      const token = await generateAdminToken();
      const result = await validateAdminToken(`  ${token}  `);
      expect(result.valid).toBe(true);
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from Bearer header', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const extracted = extractTokenFromHeader(`Bearer ${token}`);
      expect(extracted).toBe(token);
    });

    it('should handle case-insensitive Bearer', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const extracted = extractTokenFromHeader(`bearer ${token}`);
      expect(extracted).toBe(token);
    });

    it('should return null for null header', () => {
      const extracted = extractTokenFromHeader(null);
      expect(extracted).toBeNull();
    });

    it('should return whole value without Bearer prefix', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const extracted = extractTokenFromHeader(token);
      expect(extracted).toBe(token);
    });
  });

  describe('isLikelyJWT', () => {
    it('should return true for valid JWT format', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature';
      expect(isLikelyJWT(jwt)).toBe(true);
    });

    it('should return true for any string with 3 non-empty parts', () => {
      // The function checks structure, not validity of base64 encoding
      expect(isLikelyJWT('part1.part2.part3')).toBe(true);
      expect(isLikelyJWT('a.b.c')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isLikelyJWT('')).toBe(false);
      expect(isLikelyJWT('one.part')).toBe(false);
      expect(isLikelyJWT('four.parts.here.wrong')).toBe(false);
    });

    it('should return false for strings with empty parts', () => {
      expect(isLikelyJWT('a..b')).toBe(false);
      expect(isLikelyJWT('.b.c')).toBe(false);
      expect(isLikelyJWT('a.b.')).toBe(false);
    });
  });
});
