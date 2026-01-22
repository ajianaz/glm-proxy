/**
 * Integration Test Fixtures
 *
 * Provides mock API keys and test data for various testing scenarios.
 */

import type { ApiKey, UsageWindow } from '../../src/types';

/**
 * Valid API key with default settings
 */
export const VALID_API_KEY: ApiKey = {
  key: 'pk_test_valid_key',
  name: 'Valid Test User',
  model: 'glm-4.7',
  token_limit_per_5h: 100000,
  expiry_date: '2026-12-31T23:59:59Z',
  created_at: '2026-01-18T00:00:00Z',
  last_used: '2026-01-18T00:00:00Z',
  total_lifetime_tokens: 0,
  usage_windows: [],
};

/**
 * Expired API key for testing expiry handling
 */
export const EXPIRED_API_KEY: ApiKey = {
  key: 'pk_test_expired_key',
  name: 'Expired Test User',
  model: 'glm-4.7',
  token_limit_per_5h: 100000,
  expiry_date: '2025-01-01T00:00:00Z',
  created_at: '2024-01-01T00:00:00Z',
  last_used: '2024-12-31T23:59:59Z',
  total_lifetime_tokens: 50000,
  usage_windows: [],
};

/**
 * API key that will expire soon for testing upcoming expiry
 */
export const EXPIRING_SOON_API_KEY: ApiKey = {
  key: 'pk_test_expiring_soon',
  name: 'Expiring Soon User',
  model: 'glm-4.7',
  token_limit_per_5h: 100000,
  expiry_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
  created_at: '2026-01-01T00:00:00Z',
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 10000,
  usage_windows: [],
};

/**
 * API key with low token limit for testing rate limiting
 */
export const LOW_LIMIT_API_KEY: ApiKey = {
  key: 'pk_test_low_limit',
  name: 'Low Limit User',
  model: 'glm-4.7',
  token_limit_per_5h: 5000,
  expiry_date: '2026-12-31T23:59:59Z',
  created_at: '2026-01-18T00:00:00Z',
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 1000,
  usage_windows: [],
};

/**
 * API key that has exceeded its rate limit
 */
export const RATE_LIMITED_API_KEY: ApiKey = {
  key: 'pk_test_rate_limited',
  name: 'Rate Limited User',
  model: 'glm-4.7',
  token_limit_per_5h: 10000,
  expiry_date: '2026-12-31T23:59:59Z',
  created_at: '2026-01-18T00:00:00Z',
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 15000,
  usage_windows: [
    {
      window_start: new Date(Date.now() - 3600000).toISOString(),
      tokens_used: 12000,
    },
  ],
};

/**
 * API key with usage in multiple time windows for testing rolling window behavior
 */
export const MULTI_WINDOW_API_KEY: ApiKey = {
  key: 'pk_test_multi_window',
  name: 'Multi Window User',
  model: 'glm-4.7',
  token_limit_per_5h: 100000,
  expiry_date: '2026-12-31T23:59:59Z',
  created_at: '2026-01-18T00:00:00Z',
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 90000,
  usage_windows: [
    {
      window_start: new Date(Date.now() - 3600000).toISOString(),
      tokens_used: 30000,
    },
    {
      window_start: new Date(Date.now() - 7200000).toISOString(),
      tokens_used: 40000,
    },
    {
      window_start: new Date(Date.now() - 14400000).toISOString(),
      tokens_used: 20000,
    },
  ],
};

/**
 * API key with old usage windows (some expired) for testing cleanup
 */
export const MIXED_WINDOWS_API_KEY: ApiKey = {
  key: 'pk_test_mixed_windows',
  name: 'Mixed Windows User',
  model: 'glm-4.7',
  token_limit_per_5h: 100000,
  expiry_date: '2026-12-31T23:59:59Z',
  created_at: '2026-01-18T00:00:00Z',
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 80000,
  usage_windows: [
    {
      window_start: new Date(Date.now() - 3600000).toISOString(),
      tokens_used: 30000,
    },
    {
      window_start: new Date(Date.now() - 21600000).toISOString(),
      tokens_used: 50000,
    },
  ],
};

/**
 * API key with custom model override
 */
export const CUSTOM_MODEL_API_KEY: ApiKey = {
  key: 'pk_test_custom_model',
  name: 'Custom Model User',
  model: 'custom-model-123',
  token_limit_per_5h: 100000,
  expiry_date: '2026-12-31T23:59:59Z',
  created_at: '2026-01-18T00:00:00Z',
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 5000,
  usage_windows: [],
};

/**
 * API key with Anthropic model
 */
export const ANTHROPIC_MODEL_API_KEY: ApiKey = {
  key: 'pk_test_anthropic',
  name: 'Anthropic User',
  model: 'claude-3-5-sonnet-20241022',
  token_limit_per_5h: 100000,
  expiry_date: '2026-12-31T23:59:59Z',
  created_at: '2026-01-18T00:00:00Z',
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 15000,
  usage_windows: [],
};

/**
 * API key for concurrent request testing with moderate limit
 */
export const CONCURRENT_TEST_API_KEY: ApiKey = {
  key: 'pk_test_concurrent',
  name: 'Concurrent Test User',
  model: 'glm-4.7',
  token_limit_per_5h: 5000,
  expiry_date: '2026-12-31T23:59:59Z',
  created_at: '2026-01-18T00:00:00Z',
  last_used: new Date().toISOString(),
  total_lifetime_tokens: 0,
  usage_windows: [],
};

/**
 * Collection of all test API keys
 */
export const TEST_API_KEYS: ApiKey[] = [
  VALID_API_KEY,
  EXPIRED_API_KEY,
  EXPIRING_SOON_API_KEY,
  LOW_LIMIT_API_KEY,
  RATE_LIMITED_API_KEY,
  MULTI_WINDOW_API_KEY,
  MIXED_WINDOWS_API_KEY,
  CUSTOM_MODEL_API_KEY,
  ANTHROPIC_MODEL_API_KEY,
  CONCURRENT_TEST_API_KEY,
];

/**
 * Get a specific API key by its key value
 */
export function getApiKeyByKeyValue(keyValue: string): ApiKey | undefined {
  return TEST_API_KEYS.find(k => k.key === keyValue);
}

/**
 * Get API keys that match a predicate
 */
export function filterApiKeys(predicate: (key: ApiKey) => boolean): ApiKey[] {
  return TEST_API_KEYS.filter(predicate);
}

/**
 * Get all valid (non-expired) API keys
 */
export function getValidApiKeys(): ApiKey[] {
  return filterApiKeys(key => new Date(key.expiry_date) > new Date());
}

/**
 * Get all expired API keys
 */
export function getExpiredApiKeys(): ApiKey[] {
  return filterApiKeys(key => new Date(key.expiry_date) < new Date());
}

/**
 * Get all rate-limited API keys (currently over limit)
 */
export function getRateLimitedApiKeys(): ApiKey[] {
  return filterApiKeys(key => {
    const totalTokens = key.usage_windows.reduce((sum, w) => sum + w.tokens_used, 0);
    return totalTokens > key.token_limit_per_5h;
  });
}

/**
 * Test messages for OpenAI format
 */
export const TEST_OPENAI_MESSAGES = [
  { role: 'user', content: 'Hello, how are you?' },
];

/**
 * Test messages for Anthropic format
 */
export const TEST_ANTHROPIC_MESSAGES = [
  { role: 'user', content: 'Hello, how are you?' },
];

/**
 * Test message with conversation history
 */
export const TEST_CONVERSATION_MESSAGES = [
  { role: 'user', content: 'What is the capital of France?' },
  { role: 'assistant', content: 'The capital of France is Paris.' },
  { role: 'user', content: 'What is the population?' },
];

/**
 * Long test message for testing token counting
 */
export const TEST_LONG_MESSAGE = {
  role: 'user' as const,
  content: 'This is a longer message that will consume more tokens. '.repeat(100),
};

/**
 * Invalid API keys for testing authentication failure
 */
export const INVALID_API_KEYS = {
  empty: '',
  malformed: 'invalid-key-format',
  nonexistent: 'pk_test_does_not_exist',
  expired: EXPIRED_API_KEY.key,
};

/**
 * Sample OpenAI chat completion request bodies
 */
export const OPENAI_REQUEST_BODIES = {
  basic: {
    model: 'glm-4',
    messages: [{ role: 'user', content: 'Test message' }],
    stream: false,
  },
  withModel: {
    model: 'custom-model',
    messages: [{ role: 'user', content: 'Test message' }],
    stream: false,
  },
  streaming: {
    model: 'glm-4',
    messages: [{ role: 'user', content: 'Test message' }],
    stream: true,
  },
  conversation: {
    model: 'glm-4',
    messages: TEST_CONVERSATION_MESSAGES,
    stream: false,
  },
};

/**
 * Sample Anthropic messages request bodies
 */
export const ANTHROPIC_REQUEST_BODIES = {
  basic: {
    model: 'claude-3-5-sonnet-20241022',
    messages: [{ role: 'user', content: 'Test message' }],
    max_tokens: 1024,
    stream: false,
  },
  streaming: {
    model: 'claude-3-5-sonnet-20241022',
    messages: [{ role: 'user', content: 'Test message' }],
    max_tokens: 1024,
    stream: true,
  },
  conversation: {
    model: 'claude-3-5-sonnet-20241022',
    messages: TEST_CONVERSATION_MESSAGES,
    max_tokens: 1024,
    stream: false,
  },
};

/**
 * Malformed request bodies for testing validation
 */
export const MALFORMED_REQUESTS = {
  emptyJson: '',
  invalidJson: '{ invalid json }',
  missingMessages: JSON.stringify({ model: 'glm-4' }),
  emptyMessages: JSON.stringify({ model: 'glm-4', messages: [] }),
  invalidRole: JSON.stringify({
    model: 'glm-4',
    messages: [{ role: 'invalid', content: 'test' }],
  }),
};
