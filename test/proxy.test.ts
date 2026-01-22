import { describe, it, expect, beforeEach, vi } from 'vitest';
import { proxyRequest } from '../src/proxy.js';
import type { ApiKey } from '../src/types.js';
import { getPoolManager } from '../src/pool/PoolManager.js';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock pool manager
vi.mock('../src/pool/PoolManager.js', () => ({
  getPoolManager: vi.fn(),
  getZaiPool: vi.fn(),
}));

const mockGetZaiPool = vi.fn();
const mockPoolRequest = vi.fn();

// Setup mock pool
beforeEach(() => {
  vi.resetAllMocks();
  // Set ZAI_API_KEY for tests
  process.env.ZAI_API_KEY = 'test_zai_key';

  // Mock pool request
  mockPoolRequest.mockResolvedValue({
    success: true,
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ choices: [{ message: { content: 'OK' } }], usage: { total_tokens: 10 } }),
    duration: 50,
  });

  // Mock pool
  mockGetZaiPool.mockReturnValue({
    request: mockPoolRequest,
  });

  // Mock getZaiPool function
  const { getZaiPool } = require('../src/pool/PoolManager.js');
  getZaiPool.mockImplementation(mockGetZaiPool);
});

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

  it('should use connection pool for requests', async () => {
    await proxyRequest({
      apiKey: mockApiKey,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });

    expect(mockGetZaiPool).toHaveBeenCalled();
    expect(mockPoolRequest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/chat/completions',
      headers: expect.objectContaining({
        'Authorization': 'Bearer test_zai_key',
      }),
      body: expect.stringContaining('"model":"glm-4.7"'),
      timeout: 30000,
    });
  });

  it('should inject model into request body when using pool', async () => {
    await proxyRequest({
      apiKey: mockApiKey,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });

    const poolCall = mockPoolRequest.mock.calls[0];
    const bodyArg = JSON.parse(poolCall[0].body as string);
    expect(bodyArg.model).toBe('glm-4.7');
  });

  it('should strip /v1 prefix from path when using pool', async () => {
    await proxyRequest({
      apiKey: mockApiKey,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });

    expect(mockPoolRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/chat/completions',
      })
    );
  });

  it('should fall back to regular fetch when pool fails', async () => {
    // Mock pool to fail
    mockPoolRequest.mockRejectedValue(new Error('Pool exhausted'));

    // Mock fetch to succeed
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (key: string) => key === 'content-type' ? 'application/json' : null },
      text: async () => JSON.stringify({ choices: [{ message: { content: 'OK' } }], usage: { total_tokens: 10 } }),
    });

    const result = await proxyRequest({
      apiKey: mockApiKey,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });

    expect(mockFetch).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
  });

  it('should handle pool error and fetch error', async () => {
    // Mock pool to fail
    mockPoolRequest.mockRejectedValue(new Error('Pool exhausted'));

    // Mock fetch to fail
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await proxyRequest({
      apiKey: mockApiKey,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe(502);
    expect(result.body).toContain('Upstream request failed');
  });

  it('should disable pool when DISABLE_CONNECTION_POOL is set', async () => {
    process.env.DISABLE_CONNECTION_POOL = 'true';

    // Mock fetch to succeed
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

    // Pool should not be called
    expect(mockGetZaiPool).not.toHaveBeenCalled();
    // Fetch should be called instead
    expect(mockFetch).toHaveBeenCalled();

    delete process.env.DISABLE_CONNECTION_POOL;
  });
});
