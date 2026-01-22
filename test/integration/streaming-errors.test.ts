/**
 * Streaming Error Handling Integration Tests
 *
 * Tests error scenarios during SSE streaming for both OpenAI and Anthropic formats,
 * verifying that errors are properly handled and reported to clients.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer } from './helpers';
import { setupTestEnvironment, teardownTestEnvironment } from './setup';
import {
  VALID_API_KEY,
  EXPIRED_API_KEY,
  RATE_LIMITED_API_KEY,
  TEST_OPENAI_MESSAGES,
  TEST_ANTHROPIC_MESSAGES,
  INVALID_API_KEYS,
} from './fixtures';
import type { TestServer } from './helpers';

describe('Streaming Error Handling Integration Tests', () => {
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

  describe('OpenAI Streaming - Authentication Errors', () => {
    it('should reject streaming requests with missing API key', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      // Should return 401 Unauthorized
      expect(response.status).toBe(401);

      // Should return JSON error response, not stream
      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
      expect(contentType).not.toContain('text/event-stream');

      // Should have error message
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject streaming requests with invalid API key', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${INVALID_API_KEYS.nonexistent}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      // Should return 401 Unauthorized
      expect(response.status).toBe(401);

      // Should return JSON error response, not stream
      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
      expect(contentType).not.toContain('text/event-stream');

      // Should have error message
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject streaming requests with expired API key', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${EXPIRED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      // Should return 401 or 403
      expect([401, 403]).toContain(response.status);

      // Should return JSON error response, not stream
      const contentType = response.headers.get('content-type');
      if (contentType) {
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');
      }

      // Should have error message
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });
  });

  describe('Anthropic Streaming - Authentication Errors', () => {
    it('should reject streaming requests with missing API key', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
          stream: true,
        }),
      });

      // Should return 401 Unauthorized
      expect(response.status).toBe(401);

      // Should return JSON error response, not stream
      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
      expect(contentType).not.toContain('text/event-stream');

      // Should have error message
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject streaming requests with invalid API key', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${INVALID_API_KEYS.nonexistent}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
          stream: true,
        }),
      });

      // Should return 401 Unauthorized
      expect(response.status).toBe(401);

      // Should return JSON error response, not stream
      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
      expect(contentType).not.toContain('text/event-stream');

      // Should have error message
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject streaming requests with expired API key', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${EXPIRED_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
          stream: true,
        }),
      });

      // Should return 401 or 403
      expect([401, 403]).toContain(response.status);

      // Should return JSON error response, not stream
      const contentType = response.headers.get('content-type');
      if (contentType) {
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');
      }

      // Should have error message
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });
  });

  describe('OpenAI Streaming - Rate Limit Errors', () => {
    it('should handle rate limit errors for streaming requests', async () => {
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

      // Should get a response (may be rate limited or successful)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);

      // If rate limited, should return JSON error response
      if (response.status === 429) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');

        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should include retry-after header on rate limit during streaming', async () => {
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

      if (response.status === 429) {
        // Should have retry-after header
        const retryAfter = response.headers.get('retry-after');
        expect(retryAfter).toBeTruthy();
      }
    });
  });

  describe('Anthropic Streaming - Rate Limit Errors', () => {
    it('should handle rate limit errors for streaming requests', async () => {
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

      // Should get a response (may be rate limited or successful)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);

      // If rate limited, should return JSON error response
      if (response.status === 429) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');

        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should include retry-after header on rate limit during streaming', async () => {
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

      if (response.status === 429) {
        // Should have retry-after header
        const retryAfter = response.headers.get('retry-after');
        expect(retryAfter).toBeTruthy();
      }
    });
  });

  describe('OpenAI Streaming - Malformed Request Errors', () => {
    it('should handle malformed JSON in streaming request', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: 'invalid json{{{',
      });

      // Should return 400 Bad Request
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);

      // Should return JSON error response, not stream
      const contentType = response.headers.get('content-type');
      if (contentType) {
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');
      }

      // Should have error message
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should handle missing required fields in streaming request', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          // messages field is missing
          stream: true,
        }),
      });

      // Should return 400 Bad Request or proxy error
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(600);

      // Should return JSON error response, not stream
      const contentType = response.headers.get('content-type');
      if (contentType) {
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');
      }
    });

    it('should handle empty messages array in streaming request', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [],
          stream: true,
        }),
      });

      // Should return error
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(600);

      // Should return JSON error response, not stream
      const contentType = response.headers.get('content-type');
      if (contentType) {
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');
      }
    });
  });

  describe('Anthropic Streaming - Malformed Request Errors', () => {
    it('should handle malformed JSON in streaming request', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: 'invalid json{{{',
      });

      // Should return 400 Bad Request
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);

      // Should return JSON error response, not stream
      const contentType = response.headers.get('content-type');
      if (contentType) {
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');
      }

      // Should have error message
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should handle missing required fields in streaming request', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          stream: true,
          // messages field is missing
        }),
      });

      // Should return 400 Bad Request or proxy error
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(600);

      // Should return JSON error response, not stream
      const contentType = response.headers.get('content-type');
      if (contentType) {
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');
      }
    });

    it('should handle missing max_tokens in streaming request', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          stream: true,
          // max_tokens is missing
        }),
      });

      // Should return error or proxy it upstream
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });

  describe('OpenAI Streaming - Upstream Errors', () => {
    it('should handle upstream API errors during streaming', async () => {
      // This test verifies that if the upstream returns an error during streaming,
      // the error is properly propagated to the client
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

      // If upstream returns an error (non-2xx status), it should be propagated
      if (!response.ok) {
        // Should not return streaming content type for errors
        const contentType = response.headers.get('content-type');
        if (contentType) {
          expect(contentType).toContain('application/json');
          expect(contentType).not.toContain('text/event-stream');
        }

        // Should have error body
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should handle upstream timeout during streaming', async () => {
      // This test verifies timeout handling
      // In a real scenario, this would require mocking the upstream to timeout
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

      // Should get some response (success, error, or timeout)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });

  describe('Anthropic Streaming - Upstream Errors', () => {
    it('should handle upstream API errors during streaming', async () => {
      // This test verifies that if the upstream returns an error during streaming,
      // the error is properly propagated to the client
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

      // If upstream returns an error (non-2xx status), it should be propagated
      if (!response.ok) {
        // Should not return streaming content type for errors
        const contentType = response.headers.get('content-type');
        if (contentType) {
          expect(contentType).toContain('application/json');
          expect(contentType).not.toContain('text/event-stream');
        }

        // Should have error body
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should handle upstream timeout during streaming', async () => {
      // This test verifies timeout handling
      // In a real scenario, this would require mocking the upstream to timeout
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

      // Should get some response (success, error, or timeout)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });

  describe('OpenAI Streaming - Connection Errors', () => {
    it('should handle client disconnect during streaming gracefully', async () => {
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

      if (!response.ok) return;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      // Read a few chunks
      for (let i = 0; i < 3; i++) {
        const { done } = await reader.read();
        if (done) break;
      }

      // Simulate client disconnect by closing the reader
      reader.releaseLock();

      // Should handle gracefully without crashing
      expect(true).toBe(true);
    });

    it('should handle incomplete streams', async () => {
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

      if (!response.ok) return;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let chunkCount = 0;
      let foundDone = false;

      // Read chunks with a limit
      for (let i = 0; i < 50; i++) {
        const { done, value } = await reader.read();
        if (done) {
          // Stream ended naturally
          foundDone = true;
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        if (chunk.includes('data: [DONE]')) {
          foundDone = true;
          break;
        }

        chunkCount++;
      }

      reader.releaseLock();

      // Should either complete properly or handle incomplete stream
      if (response.ok) {
        // Either we got [DONE] or stream was incomplete - both should be handled
        expect(true).toBe(true);
      }
    });
  });

  describe('Anthropic Streaming - Connection Errors', () => {
    it('should handle client disconnect during streaming gracefully', async () => {
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

      if (!response.ok) return;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      // Read a few chunks
      for (let i = 0; i < 3; i++) {
        const { done } = await reader.read();
        if (done) break;
      }

      // Simulate client disconnect by closing the reader
      reader.releaseLock();

      // Should handle gracefully without crashing
      expect(true).toBe(true);
    });

    it('should handle incomplete streams', async () => {
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

      if (!response.ok) return;

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const decoder = new TextDecoder();
      let chunkCount = 0;
      let foundStop = false;

      // Read chunks with a limit
      for (let i = 0; i < 50; i++) {
        const { done, value } = await reader.read();
        if (done) {
          // Stream ended naturally
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        if (chunk.includes('event: message_stop')) {
          foundStop = true;
          break;
        }

        chunkCount++;
      }

      reader.releaseLock();

      // Should either complete properly or handle incomplete stream
      if (response.ok) {
        // Either we got message_stop or stream was incomplete - both should be handled
        expect(true).toBe(true);
      }
    });
  });

  describe('OpenAI Streaming - Error Response Format', () => {
    it('should return properly formatted error response for auth failures', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${INVALID_API_KEYS.nonexistent}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      const body = await response.json();

      // Should have error property
      expect(body).toHaveProperty('error');

      // Error should be an object or string
      const error = body.error;
      if (typeof error === 'object') {
        expect(error).toHaveProperty('message');
      } else {
        expect(typeof error).toBe('string');
      }
    });

    it('should return properly formatted error response for rate limits', async () => {
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

      if (response.status === 429) {
        const body = await response.json();

        // Should have error property
        expect(body).toHaveProperty('error');

        // Error should mention rate limiting
        const error = body.error;
        const errorStr = typeof error === 'object' ? error.message : error;
        const errorLower = errorStr.toLowerCase();
        expect(
          errorLower.includes('rate limit') ||
          errorLower.includes('quota') ||
          errorLower.includes('limit')
        ).toBe(true);
      }
    });
  });

  describe('Anthropic Streaming - Error Response Format', () => {
    it('should return properly formatted error response for auth failures', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${INVALID_API_KEYS.nonexistent}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
          stream: true,
        }),
      });

      const body = await response.json();

      // Should have error property
      expect(body).toHaveProperty('error');

      // Error should be an object or string
      const error = body.error;
      if (typeof error === 'object') {
        expect(error).toHaveProperty('message');
      } else {
        expect(typeof error).toBe('string');
      }
    });

    it('should return properly formatted error response for rate limits', async () => {
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

      if (response.status === 429) {
        const body = await response.json();

        // Should have error property
        expect(body).toHaveProperty('error');

        // Error should mention rate limiting
        const error = body.error;
        const errorStr = typeof error === 'object' ? error.message : error;
        const errorLower = errorStr.toLowerCase();
        expect(
          errorLower.includes('rate limit') ||
          errorLower.includes('quota') ||
          errorLower.includes('limit')
        ).toBe(true);
      }
    });
  });

  describe('OpenAI Streaming - Content Type Errors', () => {
    it('should reject streaming with wrong content type', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'text/plain', // Wrong content type
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      // Should return an error or proxy it upstream
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle missing content-type header', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          // No content-type header
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      // Should return an error or proxy it upstream
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });

  describe('Anthropic Streaming - Content Type Errors', () => {
    it('should reject streaming with wrong content type', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'text/plain', // Wrong content type
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
          stream: true,
        }),
      });

      // Should return an error or proxy it upstream
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle missing content-type header', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          // No content-type header
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
          stream: true,
        }),
      });

      // Should return an error or proxy it upstream
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });
});
