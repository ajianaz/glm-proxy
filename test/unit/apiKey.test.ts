import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getDatabase, closeDatabase, resetDatabase } from '../../src/models/database';
import { ApiKeyModel, ApiKeyNotFoundError, ApiKeyDuplicateError, ApiKeyValidationError } from '../../src/models/apiKey';
import { getConfig, resetConfig } from '../../src/config';

describe('ApiKey Model', () => {
  let testDbPath: string;

  beforeEach(() => {
    // Reset configuration
    resetConfig();

    // Set up test environment
    testDbPath = `./test-${Date.now()}.db`;
    process.env.ZAI_API_KEY = 'test-zai-key';
    process.env.ADMIN_API_KEY = 'test-admin-key';
    process.env.DATABASE_PATH = testDbPath;
    process.env.PORT = '3000';
    process.env.DEFAULT_MODEL = 'glm-4.7';
    process.env.ADMIN_API_ENABLED = 'true';
    process.env.DEFAULT_RATE_LIMIT = '60';
    process.env.CORS_ORIGINS = '*';

    // Close any existing database connection
    closeDatabase();
  });

  afterEach(() => {
    // Clean up test database
    closeDatabase();
    try {
      require('fs').unlinkSync(testDbPath);
      require('fs').unlinkSync(testDbPath + '-wal');
      require('fs').unlinkSync(testDbPath + '-shm');
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('create', () => {
    it('should create a new API key with valid data', () => {
      const data = {
        key: 'test-api-key-12345678',
        name: 'Test Key',
        description: 'Test Description',
        scopes: ['read', 'write'],
        rate_limit: 100,
      };

      const result = ApiKeyModel.create(data);

      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
      expect(result.name).toBe('Test Key');
      expect(result.description).toBe('Test Description');
      expect(result.scopes).toEqual(['read', 'write']);
      expect(result.rate_limit).toBe(100);
      expect(result.is_active).toBe(true);
      expect(result.key_preview).toBeDefined();
      expect(result.key_preview).toContain('****');
    });

    it('should create API key with minimal required fields', () => {
      const data = {
        key: 'another-test-key-12345',
        name: 'Minimal Key',
      };

      const result = ApiKeyModel.create(data);

      expect(result).toBeDefined();
      expect(result.name).toBe('Minimal Key');
      expect(result.description).toBeNull();
      expect(result.scopes).toEqual([]);
      expect(result.rate_limit).toBe(60); // default value
      expect(result.is_active).toBe(true);
    });

    it('should trim whitespace from name and description', () => {
      const data = {
        key: 'trim-test-key-12345',
        name: '  Spaced Name  ',
        description: '  Spaced Description  ',
      };

      const result = ApiKeyModel.create(data);

      expect(result.name).toBe('Spaced Name');
      expect(result.description).toBe('Spaced Description');
    });

    it('should throw validation error for missing name', () => {
      const data = {
        key: 'test-key-12345',
        name: '',
      };

      expect(() => ApiKeyModel.create(data)).toThrow(ApiKeyValidationError);
      expect(() => ApiKeyModel.create(data)).toThrow('Name is required');
    });

    it('should throw validation error for invalid key length', () => {
      const data = {
        key: 'short', // less than 16 characters
        name: 'Test Key',
      };

      expect(() => ApiKeyModel.create(data)).toThrow(ApiKeyValidationError);
      expect(() => ApiKeyModel.create(data)).toThrow('at least 16 characters');
    });

    it('should throw validation error for invalid key characters', () => {
      const data = {
        key: 'test key with spaces 123456',
        name: 'Test Key',
      };

      expect(() => ApiKeyModel.create(data)).toThrow(ApiKeyValidationError);
      expect(() => ApiKeyModel.create(data)).toThrow('alphanumeric characters');
    });

    it('should throw validation error for invalid rate limit', () => {
      const data = {
        key: 'rate-limit-test-12345',
        name: 'Test Key',
        rate_limit: -10,
      };

      expect(() => ApiKeyModel.create(data)).toThrow(ApiKeyValidationError);
      expect(() => ApiKeyModel.create(data)).toThrow('Rate limit must be between 0 and 10000');
    });

    it('should throw validation error for invalid scopes', () => {
      const data = {
        key: 'scopes-test-12345',
        name: 'Test Key',
        scopes: 'not-an-array' as any,
      };

      expect(() => ApiKeyModel.create(data)).toThrow(ApiKeyValidationError);
      expect(() => ApiKeyModel.create(data)).toThrow('Scopes must be an array');
    });

    it('should throw duplicate error for existing key hash', () => {
      const data = {
        key: 'duplicate-key-test-123',
        name: 'Test Key',
      };

      ApiKeyModel.create(data);

      expect(() => ApiKeyModel.create(data)).toThrow(ApiKeyDuplicateError);
    });

    it('should generate correct key preview', () => {
      const data = {
        key: 'preview-test-key-12345678',
        name: 'Test Key',
      };

      const result = ApiKeyModel.create(data);

      // For key 'preview-test-key-12345678' (27 chars):
      // First 8: 'preview-'
      // Stars: min(27-12, 20) = 15 stars
      // Last 4: '5678'
      expect(result.key_preview).toBe('preview-*************5678');
    });

    it('should allow keys with dots and underscores', () => {
      const data = {
        key: 'test.key_with-underscore_123',
        name: 'Test Key',
      };

      const result = ApiKeyModel.create(data);

      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
    });

    it('should throw validation error for key exceeding max length', () => {
      const data = {
        key: 'a'.repeat(257), // 257 characters, exceeds 256 max
        name: 'Test Key',
      };

      expect(() => ApiKeyModel.create(data)).toThrow(ApiKeyValidationError);
      expect(() => ApiKeyModel.create(data)).toThrow('must not exceed 256 characters');
    });

    it('should accept key at maximum length', () => {
      const data = {
        key: 'a'.repeat(256), // exactly 256 characters
        name: 'Test Key',
      };

      const result = ApiKeyModel.create(data);

      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
    });

    it('should throw validation error for name exceeding max length', () => {
      const data = {
        key: 'name-length-test-12345',
        name: 'a'.repeat(256), // 256 characters, exceeds 255 max
      };

      expect(() => ApiKeyModel.create(data)).toThrow(ApiKeyValidationError);
      expect(() => ApiKeyModel.create(data)).toThrow('must not exceed 255 characters');
    });

    it('should accept name at maximum length', () => {
      const data = {
        key: 'name-max-test-123456',
        name: 'a'.repeat(255), // exactly 255 characters
      };

      const result = ApiKeyModel.create(data);

      expect(result).toBeDefined();
      expect(result.name).toHaveLength(255);
    });

    it('should throw validation error for description exceeding max length', () => {
      const data = {
        key: 'desc-length-test-123',
        name: 'Test Key',
        description: 'a'.repeat(1001), // 1001 characters, exceeds 1000 max
      };

      expect(() => ApiKeyModel.create(data)).toThrow(ApiKeyValidationError);
      expect(() => ApiKeyModel.create(data)).toThrow('must not exceed 1000 characters');
    });

    it('should accept description at maximum length', () => {
      const data = {
        key: 'desc-max-test-123456',
        name: 'Test Key',
        description: 'a'.repeat(1000), // exactly 1000 characters
      };

      const result = ApiKeyModel.create(data);

      expect(result).toBeDefined();
      expect(result.description).toHaveLength(1000);
    });

    it('should accept rate limit of 0 (unlimited)', () => {
      const data = {
        key: 'rate-zero-test-12345',
        name: 'Test Key',
        rate_limit: 0,
      };

      const result = ApiKeyModel.create(data);

      expect(result).toBeDefined();
      expect(result.rate_limit).toBe(0);
    });

    it('should accept rate limit at maximum value', () => {
      const data = {
        key: 'rate-max-test-123456',
        name: 'Test Key',
        rate_limit: 10000,
      };

      const result = ApiKeyModel.create(data);

      expect(result).toBeDefined();
      expect(result.rate_limit).toBe(10000);
    });
  });

  describe('findById', () => {
    it('should find API key by ID', () => {
      const created = ApiKeyModel.create({
        key: 'findbyid-test-12345',
        name: 'Find Test',
      });

      const found = ApiKeyModel.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('Find Test');
    });

    it('should return null for non-existent ID', () => {
      const found = ApiKeyModel.findById(999999);

      expect(found).toBeNull();
    });

    it('should not include key hash in response', () => {
      const created = ApiKeyModel.create({
        key: 'security-test-12345',
        name: 'Security Test',
      });

      const found = ApiKeyModel.findById(created.id);

      expect(found).toBeDefined();
      expect(found).not.toHaveProperty('key_hash');
      expect(found).not.toHaveProperty('key');
    });
  });

  describe('findByKeyHash', () => {
    it('should find API key by key hash', () => {
      const created = ApiKeyModel.create({
        key: 'hash-test-key-12345',
        name: 'Hash Test',
      });

      // Manually hash the key to search
      const crypto = require('crypto');
      const keyHash = crypto.createHash('sha256').update('hash-test-key-12345').digest('hex');

      const found = ApiKeyModel.findByKeyHash(keyHash);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.key_hash).toBe(keyHash);
    });

    it('should return null for non-existent key hash', () => {
      const found = ApiKeyModel.findByKeyHash('nonexistenthash');

      expect(found).toBeNull();
    });
  });

  describe('validateKey', () => {
    it('should validate a valid active API key', () => {
      const created = ApiKeyModel.create({
        key: 'validate-test-key-123',
        name: 'Validate Test',
      });

      const validated = ApiKeyModel.validateKey('validate-test-key-123');

      expect(validated).toBeDefined();
      expect(validated?.id).toBe(created.id);
      expect(validated?.name).toBe('Validate Test');
    });

    it('should return null for invalid key', () => {
      const validated = ApiKeyModel.validateKey('nonexistent-key');

      expect(validated).toBeNull();
    });

    it('should return null for inactive key', () => {
      const created = ApiKeyModel.create({
        key: 'inactive-test-key-123',
        name: 'Inactive Test',
      });

      ApiKeyModel.update(created.id, { is_active: false });

      const validated = ApiKeyModel.validateKey('inactive-test-key-123');

      expect(validated).toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      // Create test data
      ApiKeyModel.create({ key: 'list-key-1-123456', name: 'Key 1', rate_limit: 10 });
      ApiKeyModel.create({ key: 'list-key-2-123456', name: 'Key 2', rate_limit: 20 });
      ApiKeyModel.create({ key: 'list-key-3-123456', name: 'Key 3', rate_limit: 30 });
      ApiKeyModel.create({ key: 'list-key-4-123456', name: 'Test Key 4', rate_limit: 40 });

      // Deactivate one key
      const keys = ApiKeyModel.list({ limit: 10 });
      ApiKeyModel.update(keys.data[3].id, { is_active: false });
    });

    it('should list all API keys with pagination', () => {
      const result = ApiKeyModel.list({ page: 1, limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
      expect(result.total).toBe(4);
      expect(result.pages).toBe(2);
    });

    it('should return empty list when no keys exist', () => {
      resetDatabase();

      const result = ApiKeyModel.list();

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.pages).toBe(0);
    });

    it('should filter by active status', () => {
      const active = ApiKeyModel.list({ is_active: true });
      const inactive = ApiKeyModel.list({ is_active: false });

      expect(active.data).toHaveLength(3);
      expect(inactive.data).toHaveLength(1);
      expect(active.data.every(k => k.is_active)).toBe(true);
      expect(inactive.data.every(k => !k.is_active)).toBe(true);
    });

    it('should search by name', () => {
      const result = ApiKeyModel.list({ search: 'Test Key' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toContain('Test Key');
    });

    it('should paginate correctly', () => {
      const page1 = ApiKeyModel.list({ page: 1, limit: 2 });
      const page2 = ApiKeyModel.list({ page: 2, limit: 2 });

      expect(page1.data).toHaveLength(2);
      expect(page2.data).toHaveLength(2);
      expect(page1.data[0].id).not.toBe(page2.data[0].id);
    });

    it('should clamp limit to maximum of 100', () => {
      const result = ApiKeyModel.list({ limit: 200 });

      expect(result.limit).toBe(100);
    });

    it('should default to page 1 and limit 10', () => {
      const result = ApiKeyModel.list();

      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should handle page beyond total pages', () => {
      const result = ApiKeyModel.list({ page: 10, limit: 2 });

      expect(result.data).toHaveLength(0);
      expect(result.page).toBe(10);
      expect(result.pages).toBe(2); // total 4 items, limit 2 = 2 pages
    });

    it('should handle minimum limit of 1', () => {
      const result = ApiKeyModel.list({ limit: 0 }); // will be clamped to 1

      expect(result.limit).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('should handle large page number with empty result', () => {
      resetDatabase();

      const result = ApiKeyModel.list({ page: 999 });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.pages).toBe(0);
    });

    it('should handle search with special characters', () => {
      const created = ApiKeyModel.create({
        key: 'special-chars-12345',
        name: 'Test-Key_With.Special',
      });

      const result = ApiKeyModel.list({ search: 'Test-Key_With' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(created.id);
    });

    it('should handle search with unicode characters', () => {
      const created = ApiKeyModel.create({
        key: 'unicode-test-123456',
        name: 'Test键匙',
      });

      const result = ApiKeyModel.list({ search: '键匙' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe(created.id);
    });

    it('should handle case-insensitive search', () => {
      const created = ApiKeyModel.create({
        key: 'case-test-1234567',
        name: 'TestKey',
      });

      const result1 = ApiKeyModel.list({ search: 'testkey' });
      const result2 = ApiKeyModel.list({ search: 'TESTKEY' });
      const result3 = ApiKeyModel.list({ search: 'TestKey' });

      expect(result1.data).toHaveLength(1);
      expect(result2.data).toHaveLength(1);
      expect(result3.data).toHaveLength(1);
      expect(result1.data[0].id).toBe(created.id);
      expect(result2.data[0].id).toBe(created.id);
      expect(result3.data[0].id).toBe(created.id);
    });
  });

  describe('update', () => {
    it('should update API key name', () => {
      const created = ApiKeyModel.create({
        key: 'update-name-test-123',
        name: 'Original Name',
      });

      const updated = ApiKeyModel.update(created.id, { name: 'Updated Name' });

      expect(updated.name).toBe('Updated Name');
      expect(updated.id).toBe(created.id);
    });

    it('should update API key description', () => {
      const created = ApiKeyModel.create({
        key: 'update-desc-test-123',
        name: 'Test Key',
        description: 'Original',
      });

      const updated = ApiKeyModel.update(created.id, { description: 'Updated Description' });

      expect(updated.description).toBe('Updated Description');
    });

    it('should update API key scopes', () => {
      const created = ApiKeyModel.create({
        key: 'update-scopes-test-1',
        name: 'Test Key',
        scopes: ['read'],
      });

      const updated = ApiKeyModel.update(created.id, { scopes: ['read', 'write', 'delete'] });

      expect(updated.scopes).toEqual(['read', 'write', 'delete']);
    });

    it('should update API key rate limit', () => {
      const created = ApiKeyModel.create({
        key: 'update-rate-test-123',
        name: 'Test Key',
        rate_limit: 60,
      });

      const updated = ApiKeyModel.update(created.id, { rate_limit: 120 });

      expect(updated.rate_limit).toBe(120);
    });

    it('should update API key active status', () => {
      const created = ApiKeyModel.create({
        key: 'update-active-test-12',
        name: 'Test Key',
      });

      let updated = ApiKeyModel.update(created.id, { is_active: false });
      expect(updated.is_active).toBe(false);

      updated = ApiKeyModel.update(created.id, { is_active: true });
      expect(updated.is_active).toBe(true);
    });

    it('should update multiple fields at once', () => {
      const created = ApiKeyModel.create({
        key: 'update-multi-test-123',
        name: 'Original',
        rate_limit: 60,
      });

      const updated = ApiKeyModel.update(created.id, {
        name: 'Updated',
        description: 'New Description',
        rate_limit: 100,
        is_active: false,
      });

      expect(updated.name).toBe('Updated');
      expect(updated.description).toBe('New Description');
      expect(updated.rate_limit).toBe(100);
      expect(updated.is_active).toBe(false);
    });

    it('should handle null description', () => {
      const created = ApiKeyModel.create({
        key: 'update-null-desc-123',
        name: 'Test Key',
        description: 'Original',
      });

      const updated = ApiKeyModel.update(created.id, { description: null });

      expect(updated.description).toBeNull();
    });

    it('should throw error for non-existent ID', () => {
      expect(() => ApiKeyModel.update(999999, { name: 'Test' }))
        .toThrow(ApiKeyNotFoundError);
    });

    it('should return existing key if no updates provided', () => {
      const created = ApiKeyModel.create({
        key: 'update-noop-test-123',
        name: 'Test Key',
      });

      const updated = ApiKeyModel.update(created.id, {});

      expect(updated.id).toBe(created.id);
      expect(updated.name).toBe('Test Key');
    });

    it('should throw validation error for invalid name', () => {
      const created = ApiKeyModel.create({
        key: 'validate-update-123',
        name: 'Test Key',
      });

      expect(() => ApiKeyModel.update(created.id, { name: '' }))
        .toThrow(ApiKeyValidationError);
    });

    it('should throw validation error for invalid rate limit', () => {
      const created = ApiKeyModel.create({
        key: 'validate-rate-12345',
        name: 'Test Key',
      });

      expect(() => ApiKeyModel.update(created.id, { rate_limit: -10 }))
        .toThrow(ApiKeyValidationError);
    });

    it('should throw validation error for name exceeding max length on update', () => {
      const created = ApiKeyModel.create({
        key: 'update-name-max-123',
        name: 'Test Key',
      });

      expect(() => ApiKeyModel.update(created.id, { name: 'a'.repeat(256) }))
        .toThrow(ApiKeyValidationError);
      expect(() => ApiKeyModel.update(created.id, { name: 'a'.repeat(256) }))
        .toThrow('must not exceed 255 characters');
    });

    it('should accept name at maximum length on update', () => {
      const created = ApiKeyModel.create({
        key: 'update-name-ok-1234',
        name: 'Original Name',
      });

      const updated = ApiKeyModel.update(created.id, { name: 'a'.repeat(255) });

      expect(updated.name).toHaveLength(255);
    });

    it('should throw validation error for description exceeding max length on update', () => {
      const created = ApiKeyModel.create({
        key: 'update-desc-max-123',
        name: 'Test Key',
      });

      expect(() => ApiKeyModel.update(created.id, { description: 'a'.repeat(1001) }))
        .toThrow(ApiKeyValidationError);
      expect(() => ApiKeyModel.update(created.id, { description: 'a'.repeat(1001) }))
        .toThrow('must not exceed 1000 characters');
    });

    it('should accept description at maximum length on update', () => {
      const created = ApiKeyModel.create({
        key: 'update-desc-ok-1234',
        name: 'Test Key',
      });

      const updated = ApiKeyModel.update(created.id, { description: 'a'.repeat(1000) });

      expect(updated.description).toHaveLength(1000);
    });

    it('should throw validation error for invalid is_active type', () => {
      const created = ApiKeyModel.create({
        key: 'validate-active-123',
        name: 'Test Key',
      });

      expect(() => ApiKeyModel.update(created.id, { is_active: 'true' as any }))
        .toThrow(ApiKeyValidationError);
      expect(() => ApiKeyModel.update(created.id, { is_active: 'true' as any }))
        .toThrow('must be a boolean');
    });

    it('should handle rate limit boundary values on update', () => {
      const created = ApiKeyModel.create({
        key: 'update-rate-bound-12',
        name: 'Test Key',
        rate_limit: 60,
      });

      let updated = ApiKeyModel.update(created.id, { rate_limit: 0 });
      expect(updated.rate_limit).toBe(0);

      updated = ApiKeyModel.update(created.id, { rate_limit: 10000 });
      expect(updated.rate_limit).toBe(10000);
    });
  });

  describe('delete', () => {
    it('should delete an API key', () => {
      const created = ApiKeyModel.create({
        key: 'delete-test-key-123',
        name: 'Delete Test',
      });

      const deleted = ApiKeyModel.delete(created.id);

      expect(deleted).toBe(true);

      const found = ApiKeyModel.findById(created.id);
      expect(found).toBeNull();
    });

    it('should return false for non-existent ID', () => {
      const deleted = ApiKeyModel.delete(999999);

      expect(deleted).toBe(false);
    });

    it('should handle multiple deletions', () => {
      const key1 = ApiKeyModel.create({ key: 'delete-key-1-12345', name: 'Key 1' });
      const key2 = ApiKeyModel.create({ key: 'delete-key-2-12345', name: 'Key 2' });
      const key3 = ApiKeyModel.create({ key: 'delete-key-3-12345', name: 'Key 3' });

      expect(ApiKeyModel.delete(key1.id)).toBe(true);
      expect(ApiKeyModel.delete(key2.id)).toBe(true);
      expect(ApiKeyModel.delete(key3.id)).toBe(true);

      const list = ApiKeyModel.list();
      expect(list.data).toHaveLength(0);
    });
  });

  describe('exists', () => {
    it('should return true for existing key', () => {
      const created = ApiKeyModel.create({
        key: 'exists-test-key-123',
        name: 'Exists Test',
      });

      const exists = ApiKeyModel.exists(created.id);

      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', () => {
      const exists = ApiKeyModel.exists(999999);

      expect(exists).toBe(false);
    });
  });

  describe('count', () => {
    beforeEach(() => {
      ApiKeyModel.create({ key: 'count-test-key-1-12', name: 'Key 1' });
      ApiKeyModel.create({ key: 'count-test-key-2-12', name: 'Key 2' });
      ApiKeyModel.create({ key: 'count-test-key-3-12', name: 'Key 3' });
    });

    it('should count all API keys', () => {
      const count = ApiKeyModel.count();

      expect(count).toBe(3);
    });

    it('should count only active keys', () => {
      const list = ApiKeyModel.list({ limit: 10 });
      ApiKeyModel.update(list.data[0].id, { is_active: false });

      const activeCount = ApiKeyModel.count({ is_active: true });
      const inactiveCount = ApiKeyModel.count({ is_active: false });

      expect(activeCount).toBe(2);
      expect(inactiveCount).toBe(1);
    });

    it('should return 0 for empty database', () => {
      resetDatabase();

      const count = ApiKeyModel.count();

      expect(count).toBe(0);
    });
  });

  describe('helper functions', () => {
    it('should parse scopes correctly', () => {
      const key = ApiKeyModel.create({
        key: 'scopes-parse-12345',
        name: 'Test',
        scopes: ['read', 'write', 'delete'],
      });

      expect(key.scopes).toEqual(['read', 'write', 'delete']);
    });

    it('should handle empty scopes', () => {
      const key = ApiKeyModel.create({
        key: 'scopes-empty-12345',
        name: 'Test',
      });

      expect(key.scopes).toEqual([]);
    });

    it('should handle malformed scopes in database', () => {
      const db = getDatabase();
      db.query(`INSERT INTO api_keys (key_hash, name, scopes, rate_limit, is_active)
                VALUES (?, ?, ?, ?, ?)`)
        .run('hash123', 'Test', 'invalid-json', 60, 1);

      const keys = ApiKeyModel.list();
      expect(keys.data[0].scopes).toEqual([]);
    });
  });
});
