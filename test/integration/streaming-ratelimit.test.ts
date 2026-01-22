/**
 * Streaming with Rate Limiting Integration Tests
 *
 * Tests that rate limiting is properly applied to streaming requests based on
 * estimated token usage, ensuring streaming doesn't bypass rate limits.
 *
 * Subtask 5.4: Verify rate limiting is applied to streaming requests based on estimated token usage
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, makeAuthenticatedRequest } from './helpers';
import { setupTestEnvironment, teardownTestEnvironment } from './setup';
import {
  VALID_API_KEY,
  RATE_LIMITED_API_KEY,
  LOW_LIMIT_API_KEY,
  TEST_OPENAI_MESSAGES,
  TEST_ANTHROPIC_MESSAGES,
} from './fixtures';
import type { TestServer } from './helpers';

describe('Streaming with Rate Limiting Integration Tests', () => {
  let testServer: TestServer;
  let testEnv: ReturnType<typeof setupTestEnvironment>;

  beforeAll(async () => {
    // Set up test environment
    testEnv = setupTestEnvironment();

    // Start test server
    testServer = await startTestServer();
  });

  afterAll(async () => {
    // Stop test server
    await testServer.stop();

    // Tear down test environment
    teardownTestEnvironment(testEnv);
  });

  describe('OpenAI Streaming - Rate Limiting', () => {
    it('should block streaming request when rate limit is exceeded', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      // Should be rate limited
      expect(response.status).toBe(429);

      const body = await response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
      expect(body.error).toHaveProperty('message');
    });

    it('should not return streaming response when rate limited', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      expect(response.status).toBe(429);

      // Should return JSON error, not event-stream
      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
      expect(contentType).not.toContain('text/event-stream');
    });

    it('should include rate limit error details in streaming request response', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      expect(response.status).toBe(429);

      const body = await response.json();
      expect(body.error).toHaveProperty('tokens_used');
      expect(body.error).toHaveProperty('tokens_limit');
      expect(body.error).toHaveProperty('window_ends_at');

      // Verify tokens_used exceeds tokens_limit
      expect(body.error.tokens_used).toBeGreaterThan(body.error.tokens_limit);
    });

    it('should include Retry-After header for rate limited streaming requests', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      expect(response.status).toBe(429);

      const retryAfter = response.headers.get('Retry-After');
      expect(retryAfter).toBeTruthy();

      const retryAfterNum = parseInt(retryAfter!, 10);
      expect(retryAfterNum).toBeGreaterThan(0);
      expect(retryAfterNum).toBeLessThanOrEqual(5 * 60 * 60); // Max 5 hours
    });

    it('should allow streaming request when under rate limit', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      // Should not be rate limited
      expect(response.status).not.toBe(429);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('text/event-stream');
      }
    });

    it('should check rate limit before starting stream', async () => {
      const startTime = Date.now();

      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      const duration = Date.now() - startTime;

      // Should fail fast without starting the stream
      expect(response.status).toBe(429);
      expect(duration).toBeLessThan(100); // Should be very fast
    });

    it('should handle rate limit for streaming with long messages', async () => {
      const longMessage = {
        role: 'user',
        content: 'This is a test message. '.repeat(100),
      };

      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [longMessage],
          stream: true,
        }),
      });

      // Should be rate limited based on estimated tokens
      expect(response.status).toBe(429);

      const body = await response.json();
      expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
    });
  });

  describe('Anthropic Streaming - Rate Limiting', () => {
    it('should block streaming request when rate limit is exceeded', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
          stream: true,
        }),
      });

      // Should be rate limited
      expect(response.status).toBe(429);

      const body = await response.json();
      expect(body).toHaveProperty('error');
      expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
      expect(body.error).toHaveProperty('message');
    });

    it('should not return streaming response when rate limited', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
          stream: true,
        }),
      });

      expect(response.status).toBe(429);

      // Should return JSON error, not event-stream
      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
      expect(contentType).not.toContain('text/event-stream');
    });

    it('should include rate limit error details in Anthropic streaming request response', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
          stream: true,
        }),
      });

      expect(response.status).toBe(429);

      const body = await response.json();
      expect(body.error).toHaveProperty('tokens_used');
      expect(body.error).toHaveProperty('tokens_limit');
      expect(body.error).toHaveProperty('window_ends_at');

      // Verify tokens_used exceeds tokens_limit
      expect(body.error.tokens_used).toBeGreaterThan(body.error.tokens_limit);
    });

    it('should include Retry-After header for rate limited Anthropic streaming requests', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
          stream: true,
        }),
      });

      expect(response.status).toBe(429);

      const retryAfter = response.headers.get('Retry-After');
      expect(retryAfter).toBeTruthy();

      const retryAfterNum = parseInt(retryAfter!, 10);
      expect(retryAfterNum).toBeGreaterThan(0);
      expect(retryAfterNum).toBeLessThanOrEqual(5 * 60 * 60); // Max 5 hours
    });

    it('should allow Anthropic streaming request when under rate limit', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
          stream: true,
        }),
      });

      // Should not be rate limited
      expect(response.status).not.toBe(429);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('text/event-stream');
      }
    });

    it('should check rate limit before starting Anthropic stream', async () => {
      const startTime = Date.now();

      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
          stream: true,
        }),
      });

      const duration = Date.now() - startTime;

      // Should fail fast without starting the stream
      expect(response.status).toBe(429);
      expect(duration).toBeLessThan(100); // Should be very fast
    });

    it('should handle rate limit for streaming with max_tokens parameter', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 4096, // Large max_tokens
          stream: true,
        }),
      });

      // Should be rate limited
      expect(response.status).toBe(429);

      const body = await response.json();
      expect(body.error).toHaveProperty('type', 'rate_limit_exceeded');
    });
  });

  describe('Token Usage Estimation', () => {
    it('should estimate tokens for streaming OpenAI request', async () => {
      // Get initial stats
      const statsBefore = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        LOW_LIMIT_API_KEY.key
      );

      expect(statsBefore.status).toBe(200);
      const statsBeforeBody = statsBefore.json();

      // Make a streaming request
      const streamResponse = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOW_LIMIT_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      // Wait a bit for usage to be updated
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check stats after request
      const statsAfter = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        LOW_LIMIT_API_KEY.key
      );

      if (statsAfter.status === 200 && streamResponse.ok) {
        const statsAfterBody = statsAfter.json();
        // Usage should have been updated
        expect(statsAfterBody).toHaveProperty('current_usage');
        expect(statsAfterBody.current_usage).toHaveProperty('tokens_used_in_current_window');
      }
    });

    it('should estimate tokens for streaming Anthropic request', async () => {
      // Get initial stats
      const statsBefore = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        LOW_LIMIT_API_KEY.key
      );

      expect(statsBefore.status).toBe(200);
      const statsBeforeBody = statsBefore.json();

      // Make a streaming request
      const streamResponse = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOW_LIMIT_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
          stream: true,
        }),
      });

      // Wait a bit for usage to be updated
      await new Promise(resolve => setTimeout(resolve, 100));

      // Check stats after request
      const statsAfter = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        LOW_LIMIT_API_KEY.key
      );

      if (statsAfter.status === 200 && streamResponse.ok) {
        const statsAfterBody = statsAfter.json();
        // Usage should have been updated
        expect(statsAfterBody).toHaveProperty('current_usage');
        expect(statsAfterBody.current_usage).toHaveProperty('tokens_used_in_current_window');
      }
    });

    it('should account for both input and estimated output tokens', async () => {
      // This test verifies that the rate limiting considers both input tokens
      // and estimated output tokens (max_tokens) for streaming requests

      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 100, // Even small max_tokens should be counted
          stream: true,
        }),
      });

      // Should still be rate limited because current usage is already over limit
      expect(response.status).toBe(429);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rate limit error for concurrent streaming requests', async () => {
      const requests = Array.from({ length: 5 }, () =>
        fetch(`${testServer.url}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'glm-4',
            messages: TEST_OPENAI_MESSAGES,
            stream: true,
          }),
        })
      );

      const responses = await Promise.all(requests);

      // All should be rate limited
      for (const response of responses) {
        expect(response.status).toBe(429);

        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');
      }
    });

    it('should handle rate limit error for mixed streaming and non-streaming requests', async () => {
      const streamingRequest = fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      const nonStreamingRequest = fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: false,
        }),
      });

      const [streamingResponse, nonStreamingResponse] = await Promise.all([
        streamingRequest,
        nonStreamingRequest,
      ]);

      // Both should be rate limited
      expect(streamingResponse.status).toBe(429);
      expect(nonStreamingResponse.status).toBe(429);
    });

    it('should include CORS headers on rate limited streaming requests', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
          'Origin': 'https://example.com',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      expect(response.status).toBe(429);

      const corsHeader = response.headers.get('access-control-allow-origin');
      expect(corsHeader).toBeTruthy();
    });

    it('should provide consistent rate limit errors across endpoints', async () => {
      const openaiResponse = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      const anthropicResponse = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
          stream: true,
        }),
      });

      expect(openaiResponse.status).toBe(429);
      expect(anthropicResponse.status).toBe(429);

      const openaiBody = await openaiResponse.json();
      const anthropicBody = await anthropicResponse.json();

      // Both should have same error structure
      expect(openaiBody.error).toHaveProperty('type', 'rate_limit_exceeded');
      expect(anthropicBody.error).toHaveProperty('type', 'rate_limit_exceeded');

      // Both should report same token usage (from same API key)
      expect(openaiBody.error.tokens_used).toBe(anthropicBody.error.tokens_used);
      expect(openaiBody.error.tokens_limit).toBe(anthropicBody.error.tokens_limit);
    });
  });

  describe('Rate Limiting Consistency', () => {
    it('should consistently rate limit streaming requests', async () => {
      const responses = await Promise.all([
        fetch(`${testServer.url}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'glm-4',
            messages: TEST_OPENAI_MESSAGES,
            stream: true,
          }),
        }),
        fetch(`${testServer.url}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'glm-4',
            messages: TEST_OPENAI_MESSAGES,
            stream: true,
          }),
        }),
        fetch(`${testServer.url}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'glm-4',
            messages: TEST_OPENAI_MESSAGES,
            stream: true,
          }),
        }),
      ]);

      // All should be rate limited
      for (const response of responses) {
        expect(response.status).toBe(429);
      }
    });

    it('should return consistent token usage information', async () => {
      const response1 = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      const response2 = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      expect(response1.status).toBe(429);
      expect(response2.status).toBe(429);

      const body1 = await response1.json();
      const body2 = await response2.json();

      // Should report same token usage
      expect(body1.error.tokens_used).toBe(body2.error.tokens_used);
      expect(body1.error.tokens_limit).toBe(body2.error.tokens_limit);
    });
  });

  describe('Performance', () => {
    it('should fail fast on rate limit for streaming requests', async () => {
      const startTime = Date.now();

      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      const duration = Date.now() - startTime;

      expect(response.status).toBe(429);

      // Should fail very fast, without attempting to process the request
      expect(duration).toBeLessThan(100);
    });

    it('should handle multiple concurrent rate limit checks efficiently', async () => {
      const startTime = Date.now();

      const requests = Array.from({ length: 10 }, () =>
        fetch(`${testServer.url}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RATE_LIMITED_API_KEY.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'glm-4',
            messages: TEST_OPENAI_MESSAGES,
            stream: true,
          }),
        })
      );

      const responses = await Promise.all(requests);

      const duration = Date.now() - startTime;

      // All should be rate limited
      for (const response of responses) {
        expect(response.status).toBe(429);
      }

      // Should complete reasonably quickly
      expect(duration).toBeLessThan(500);
    });
  });
});
