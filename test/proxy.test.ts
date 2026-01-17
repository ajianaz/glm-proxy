import { describe, it, expect, beforeEach, vi } from 'vitest';
import { proxyRequest } from '../src/proxy.js';
import type { ApiKey } from '../src/types.js';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('Proxy', () => {
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

  beforeEach(() => {
    vi.resetAllMocks();
    // Set ZAI_API_KEY for tests
    process.env.ZAI_API_KEY = 'test_zai_key';
  });

  it('should return error when ZAI_API_KEY is not set', async () => {
    delete process.env.ZAI_API_KEY;

    const result = await proxyRequest({
      apiKey: mockApiKey,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'glm-4.7', messages: [] }),
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(500);
    expect(result.body).toContain('ZAI_API_KEY environment variable is not configured');
  });

  it('should strip /v1 prefix from path', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (key: string) => key === 'content-type' ? 'application/json' : null },
      text: async () => JSON.stringify({ choices: [{ message: { content: 'OK' } }], usage: { total_tokens: 10 } }),
    });

    await proxyRequest({
      apiKey: mockApiKey,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'glm-4.7', messages: [] }),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/chat/completions'),
      expect.any(Object)
    );
  });

  it('should inject model into request body', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (key: string) => key === 'content-type' ? 'application/json' : null },
      text: async () => JSON.stringify({ choices: [{ message: { content: 'OK' } }], usage: { total_tokens: 10 } }),
    });

    await proxyRequest({
      apiKey: mockApiKey,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });

    const fetchCall = mockFetch.mock.calls[0];
    const bodyArg = JSON.parse(fetchCall[1].body);
    expect(bodyArg.model).toBe('glm-4.7');
  });
});
