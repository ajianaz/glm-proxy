import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import {
  startTestServer,
  makeRequest,
  makeAuthenticatedRequest,
  buildOpenAIChatRequest,
  buildOpenAIStreamingRequest,
  buildAnthropicMessagesRequest,
  buildAnthropicStreamingRequest,
  createMockApiKey,
  createExpiredApiKey,
  createRateLimitedApiKey,
  createTestDataDir,
  cleanupTestDataDir,
  createTestApiKeysFile,
  cleanupTestApiKeysFile,
  validateHealthResponse,
  validateErrorResponse,
} from './helpers';
import { setupTestEnvironment, teardownTestEnvironment, isTestEnvironment } from './setup';

describe('Integration Test Helpers', () => {
  describe('Environment Setup', () => {
    it('should set up test environment', () => {
      const env = setupTestEnvironment();
      expect(env.testDataDir).toBeTruthy();
      expect(env.testDataFile).toBeTruthy();
      expect(isTestEnvironment()).toBe(true);
      teardownTestEnvironment(env);
    });

    it('should create and cleanup test data directory', () => {
      const testDir = '/tmp/test-glm-proxy';
      createTestDataDir(testDir);
      expect(fs.existsSync(testDir)).toBe(true);
      cleanupTestDataDir(testDir);
      expect(fs.existsSync(testDir)).toBe(false);
    });

    it('should create and cleanup API keys file', () => {
      const testFile = '/tmp/test-apikeys.json';
      const mockKey = createMockApiKey();
      createTestApiKeysFile(testFile, [mockKey]);
      expect(fs.existsSync(testFile)).toBe(true);
      cleanupTestApiKeysFile(testFile);
      expect(fs.existsSync(testFile)).toBe(false);
    });
  });

  describe('Mock API Key Creation', () => {
    it('should create valid mock API key', () => {
      const key = createMockApiKey();
      expect(key.key).toMatch(/^pk_test_/);
      expect(key.name).toBe('Test User');
      expect(key.model).toBe('glm-4.7');
      expect(key.token_limit_per_5h).toBe(100000);
      expect(new Date(key.expiry_date).getTime()).toBeGreaterThan(new Date().getTime());
    });

    it('should create expired API key', () => {
      const key = createExpiredApiKey();
      expect(new Date(key.expiry_date).getTime()).toBeLessThan(new Date().getTime());
    });

    it('should create rate-limited API key', () => {
      const key = createRateLimitedApiKey();
      expect(key.token_limit_per_5h).toBe(1000);
      expect(key.usage_windows.length).toBeGreaterThan(0);
      const totalTokens = key.usage_windows.reduce((sum, w) => sum + w.tokens_used, 0);
      expect(totalTokens).toBeGreaterThan(key.token_limit_per_5h);
    });

    it('should allow overriding mock key properties', () => {
      const key = createMockApiKey({ name: 'Custom User', model: 'custom-model' });
      expect(key.name).toBe('Custom User');
      expect(key.model).toBe('custom-model');
    });
  });

  describe('Request Builders', () => {
    it('should build OpenAI chat request', () => {
      const request = buildOpenAIChatRequest([{ role: 'user', content: 'Hello' }]);
      const parsed = JSON.parse(request);
      expect(parsed.model).toBe('glm-4');
      expect(parsed.messages).toEqual([{ role: 'user', content: 'Hello' }]);
      expect(parsed.stream).toBe(false);
    });

    it('should build OpenAI streaming request', () => {
      const request = buildOpenAIStreamingRequest([{ role: 'user', content: 'Hello' }]);
      const parsed = JSON.parse(request);
      expect(parsed.stream).toBe(true);
    });

    it('should build Anthropic messages request', () => {
      const request = buildAnthropicMessagesRequest([{ role: 'user', content: 'Hello' }]);
      const parsed = JSON.parse(request);
      expect(parsed.model).toBe('claude-3-5-sonnet-20241022');
      expect(parsed.messages).toEqual([{ role: 'user', content: 'Hello' }]);
      expect(parsed.stream).toBe(false);
      expect(parsed.max_tokens).toBe(1024);
    });

    it('should build Anthropic streaming request', () => {
      const request = buildAnthropicStreamingRequest([{ role: 'user', content: 'Hello' }]);
      const parsed = JSON.parse(request);
      expect(parsed.stream).toBe(true);
    });
  });

  describe('Response Validators', () => {
    it('should validate health response', () => {
      const mockResponse = {
        status: 200,
        headers: new Headers(),
        body: JSON.stringify({ status: 'ok', timestamp: '2026-01-22T00:00:00Z' }),
        json: () => ({ status: 'ok', timestamp: '2026-01-22T00:00:00Z' }),
      };
      expect(() => validateHealthResponse(mockResponse)).not.toThrow();
    });

    it('should throw on invalid health response status', () => {
      const mockResponse = {
        status: 500,
        headers: new Headers(),
        body: 'Internal Server Error',
        json: () => ({ error: 'Internal error' }),
      };
      expect(() => validateHealthResponse(mockResponse)).toThrow();
    });

    it('should validate error response', () => {
      const mockResponse = {
        status: 401,
        headers: new Headers(),
        body: JSON.stringify({ error: 'Unauthorized' }),
        json: () => ({ error: 'Unauthorized' }),
      };
      expect(() => validateErrorResponse(mockResponse, 401)).not.toThrow();
    });

    it('should validate error response with message', () => {
      const mockResponse = {
        status: 401,
        headers: new Headers(),
        body: JSON.stringify({ error: 'Invalid API key' }),
        json: () => ({ error: 'Invalid API key' }),
      };
      expect(() => validateErrorResponse(mockResponse, 401, 'API key')).not.toThrow();
    });
  });

  describe('Test Server Utilities', () => {
    it('should have startTestServer function', () => {
      expect(typeof startTestServer).toBe('function');
    });

    it('should have makeRequest function', () => {
      expect(typeof makeRequest).toBe('function');
    });

    it('should have makeAuthenticatedRequest function', () => {
      expect(typeof makeAuthenticatedRequest).toBe('function');
    });

    // Note: Actual server functionality tests will be in dedicated integration test files
    // to ensure proper environment isolation
  });
});
