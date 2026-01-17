import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { proxyAnthropicRequest } from '../src/anthropic.js';
import type { ApiKey } from '../src/types.js';

// Mock storage functions
vi.mock('../src/storage.js', () => ({
  updateApiKeyUsage: vi.fn(),
}));

describe('Anthropic Proxy', () => {
  beforeEach(() => {
    // Set ZAI_API_KEY for tests
    process.env.ZAI_API_KEY = 'test_zai_key';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockApiKey: ApiKey = {
    key: 'pk_test_key',
    name: 'Test User',
    model: 'glm-4.7',
    token_limit_per_5h: 100000,
    expiry_date: '2026-12-31T23:59:59Z',
    created_at: '2026-01-18T00:00:00Z',
    last_used: '2026-01-18T00:00:00Z',
    total_lifetime_tokens: 0,
    usage_windows: [],
  };

  describe('proxyAnthropicRequest', () => {
    it('should return error when ZAI_API_KEY is not configured', async () => {
      delete process.env.ZAI_API_KEY;

      const result = await proxyAnthropicRequest({
        apiKey: mockApiKey,
        path: '/v1/messages',
        method: 'POST',
        headers: {},
        body: '{"messages":[]}',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(500);
      expect(result.tokensUsed).toBe(0);
    });

    it('should proxy request to Z.AI Anthropic API', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'application/json';
            return null;
          },
        },
        text: async () => JSON.stringify({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      });
      global.fetch = mockFetch as any;

      const result = await proxyAnthropicRequest({
        apiKey: mockApiKey,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe(200);
      expect(result.tokensUsed).toBe(30); // 10 + 20

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toBe('https://open.bigmodel.cn/api/anthropic/v1/messages');
      expect(fetchCall[1].method).toBe('POST');
      expect(fetchCall[1].headers['x-api-key']).toBe('test_zai_key');
      expect(fetchCall[1].headers['anthropic-version']).toBe('2023-06-01');
    });

    it('should inject model from API key configuration', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'application/json';
            return null;
          },
        },
        text: async () => JSON.stringify({
          id: 'msg_123',
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });
      global.fetch = mockFetch as any;

      const result = await proxyAnthropicRequest({
        apiKey: mockApiKey,
        path: '/v1/messages',
        method: 'POST',
        headers: {},
        body: JSON.stringify({
          model: 'wrong-model',
          messages: [],
        }),
      });

      expect(result.success).toBe(true);

      const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sentBody.model).toBe('glm-4.7'); // Should be overridden
    });

    it('should handle upstream request failure', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch as any;

      const result = await proxyAnthropicRequest({
        apiKey: mockApiKey,
        path: '/v1/messages',
        method: 'POST',
        headers: {},
        body: '{"messages":[]}',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe(502);
      expect(result.tokensUsed).toBe(0);
      const body = JSON.parse(result.body);
      expect(body.error.type).toBe('upstream_error');
    });

    it('should forward relevant headers from client', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: () => 'application/json',
        },
        text: async () => JSON.stringify({ usage: { input_tokens: 5, output_tokens: 5 } }),
      });
      global.fetch = mockFetch as any;

      await proxyAnthropicRequest({
        apiKey: mockApiKey,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'user-agent': 'TestAgent/1.0',
          'authorization': 'Bearer should_be_ignored',
        },
        body: '{"messages":[]}',
      });

      const sentHeaders = mockFetch.mock.calls[0][1].headers;
      expect(sentHeaders['content-type']).toBe('application/json');
      expect(sentHeaders['accept']).toBe('application/json');
      expect(sentHeaders['user-agent']).toBe('TestAgent/1.0');
      expect(sentHeaders['authorization']).toBeUndefined(); // Should not forward
      expect(sentHeaders['x-api-key']).toBe('test_zai_key'); // Should use master key
    });

    it('should handle non-JSON response', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: () => 'text/plain',
        },
        text: async () => 'Plain text response',
      });
      global.fetch = mockFetch as any;

      const result = await proxyAnthropicRequest({
        apiKey: mockApiKey,
        path: '/v1/messages',
        method: 'POST',
        headers: {},
        body: '{"messages":[]}',
      });

      expect(result.success).toBe(true);
      expect(result.body).toBe('Plain text response');
      expect(result.tokensUsed).toBe(0); // No usage info
    });

    it('should handle streaming response', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'content-type') return 'text/event-stream';
            return null;
          },
        },
        text: async () => 'data: {"content": "Hello"}\n\n',
      });
      global.fetch = mockFetch as any;

      const result = await proxyAnthropicRequest({
        apiKey: mockApiKey,
        path: '/v1/messages',
        method: 'POST',
        headers: {},
        body: JSON.stringify({ stream: true, messages: [] }),
      });

      expect(result.success).toBe(true);
      expect(result.headers['content-type']).toBe('text/event-stream');
    });
  });
});
