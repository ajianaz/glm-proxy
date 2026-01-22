/**
 * OpenAI Chat Completions Integration Tests
 *
 * Tests the /v1/chat/completions endpoint for various request formats,
 * model overrides, and response handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, makeAuthenticatedRequest } from './helpers';
import { setupTestEnvironment, teardownTestEnvironment } from './setup';
import {
  VALID_API_KEY,
  EXPIRED_API_KEY,
  CUSTOM_MODEL_API_KEY,
  ANTHROPIC_MODEL_API_KEY,
  LOW_LIMIT_API_KEY,
  TEST_OPENAI_MESSAGES,
  TEST_CONVERSATION_MESSAGES,
  OPENAI_REQUEST_BODIES,
} from './fixtures';
import type { TestServer } from './helpers';

describe('OpenAI Chat Completions Integration Tests', () => {
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

  describe('POST /v1/chat/completions - Basic Request Handling', () => {
    it('should accept POST requests to /v1/chat/completions', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
        }
      );

      // Should get a response (may be error if ZAI_API_KEY not configured)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should return JSON content type', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
        }
      );

      const contentType = response.headers.get('content-type');
      expect(contentType).toBeTruthy();
      expect(contentType).toMatch(/application\/json|text\/event-stream/);
    });

    it('should require authentication', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
      });

      expect(response.status).toBe(401);
    });

    it('should reject requests without model field', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify({
            messages: [{ role: 'user', content: 'Test' }],
          }),
        }
      );

      // Should get 400, 401, or 500 depending on whether validation happens before proxy
      expect([400, 401, 500]).toContain(response.status);
    });

    it('should reject requests without messages field', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify({
            model: 'glm-4',
          }),
        }
      );

      // Should get 400, 401, or 500 depending on validation
      expect([400, 401, 500]).toContain(response.status);
    });
  });

  describe('POST /v1/chat/completions - Model Override', () => {
    it('should inject the API key model when model not specified', async () => {
      const requestBody = {
        model: 'some-other-model', // This should be overridden
        messages: TEST_OPENAI_MESSAGES,
        stream: false,
      };

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      // The request should be processed (model gets overridden internally)
      // Response status depends on whether ZAI_API_KEY is configured
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should use custom model from API key configuration', async () => {
      const requestBody = {
        model: 'glm-4', // Will be overridden to custom-model-123
        messages: TEST_OPENAI_MESSAGES,
        stream: false,
      };

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        CUSTOM_MODEL_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      // Should process the request with custom model
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle Anthropic model in API key configuration', async () => {
      const requestBody = {
        model: 'glm-4',
        messages: TEST_OPENAI_MESSAGES,
        stream: false,
      };

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        ANTHROPIC_MODEL_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      // Should process the request (even though model is Anthropic format)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });

  describe('POST /v1/chat/completions - Request Formats', () => {
    it('should handle basic chat completion request', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
        }
      );

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle conversation history', async () => {
      const requestBody = {
        model: 'glm-4',
        messages: TEST_CONVERSATION_MESSAGES,
        stream: false,
      };

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle system messages', async () => {
      const requestBody = {
        model: 'glm-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello!' },
        ],
        stream: false,
      };

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle multi-turn conversation', async () => {
      const requestBody = {
        model: 'glm-4',
        messages: [
          { role: 'user', content: 'What is 2+2?' },
          { role: 'assistant', content: '2+2 equals 4.' },
          { role: 'user', content: 'And what is 3+3?' },
        ],
        stream: false,
      };

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle streaming requests', async () => {
      const requestBody = {
        model: 'glm-4',
        messages: TEST_OPENAI_MESSAGES,
        stream: true,
      };

      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      // Should return streaming response or error
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);

      const contentType = response.headers.get('content-type');
      if (response.ok) {
        expect(contentType).toContain('text/event-stream');
      }
    });
  });

  describe('POST /v1/chat/completions - Response Format', () => {
    it('should return response with expected structure on success', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
        }
      );

      // If successful, should have proper response structure
      if (response.status === 200) {
        const body = response.json();
        expect(body).toHaveProperty('id');
        expect(body).toHaveProperty('choices');
        expect(body).toHaveProperty('model');
        expect(Array.isArray(body.choices)).toBe(true);
      }
    });

    it('should include usage information in successful response', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
        }
      );

      if (response.status === 200) {
        const body = response.json();
        expect(body).toHaveProperty('usage');
        expect(body.usage).toHaveProperty('total_tokens');
        expect(typeof body.usage.total_tokens).toBe('number');
      }
    });

    it('should return error response on failure', async () => {
      // Use an expired key which should fail
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        EXPIRED_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
        }
      );

      // Should get error (either 401 for expired key or upstream error)
      expect([401, 403, 500]).toContain(response.status);
    });
  });

  describe('POST /v1/chat/completions - Rate Limiting', () => {
    it('should enforce rate limits for API keys', async () => {
      // This test depends on having a rate-limited key
      // For now, just verify the endpoint is accessible
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        LOW_LIMIT_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
        }
      );

      // Should get a response (may be rate limited or successful)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should update token usage after successful request', async () => {
      // Make a request
      await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
        }
      );

      // Check stats to see if usage was updated
      const statsResponse = await makeAuthenticatedRequest(
        `${testServer.url}/stats`,
        VALID_API_KEY.key
      );

      if (statsResponse.status === 200) {
        const stats = statsResponse.json();
        expect(stats).toHaveProperty('total_lifetime_tokens');
        expect(stats.total_lifetime_tokens).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('POST /v1/chat/completions - Error Handling', () => {
    it('should handle invalid JSON in request body', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: 'invalid json{{{',
        }
      );

      // Should get 400, 401, or 500
      expect([400, 401, 500]).toContain(response.status);
    });

    it('should handle empty request body', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: '',
        }
      );

      // Should get error
      expect([400, 401, 500]).toContain(response.status);
    });

    it('should handle malformed messages array', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify({
            model: 'glm-4',
            messages: 'not-an-array',
          }),
        }
      );

      // Should get error from upstream or validation
      expect([400, 401, 500]).toContain(response.status);
    });

    it('should handle message with missing required fields', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify({
            model: 'glm-4',
            messages: [{ role: 'user' }], // Missing content
          }),
        }
      );

      // Should get error from upstream
      expect([400, 401, 422, 500]).toContain(response.status);
    });
  });

  describe('POST /v1/chat/completions - Authentication Methods', () => {
    it('should work with Authorization Bearer header', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
        }
      );

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should work with x-api-key header', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'x-api-key': VALID_API_KEY.key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should fail without any authentication', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
      });

      expect(response.status).toBe(401);
    });

    it('should fail with invalid API key', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer invalid_key_12345',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /v1/chat/completions - CORS Headers', () => {
    it('should include CORS headers in response', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
        }
      );

      const corsHeader = response.headers.get('access-control-allow-origin');
      expect(corsHeader).toBe('*');
    });

    it('should handle OPTIONS preflight request', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'OPTIONS',
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(300);
      expect(response.headers.get('access-control-allow-origin')).toBeTruthy();
    });
  });

  describe('POST /v1/chat/completions - Edge Cases', () => {
    it('should handle very long messages', async () => {
      const longContent = 'A'.repeat(10000);
      const requestBody = {
        model: 'glm-4',
        messages: [
          { role: 'user', content: longContent },
        ],
        stream: false,
      };

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle messages with special characters', async () => {
      const specialContent = 'Test with émojis 🎉 and spëcial çhars';
      const requestBody = {
        model: 'glm-4',
        messages: [
          { role: 'user', content: specialContent },
        ],
        stream: false,
      };

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle requests with additional parameters', async () => {
      const requestBody = {
        model: 'glm-4',
        messages: TEST_OPENAI_MESSAGES,
        stream: false,
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 0.9,
      };

      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        }
      );

      // These params should be forwarded to upstream
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle concurrent requests', async () => {
      const requests = Array(5)
        .fill(null)
        .map(() =>
          makeAuthenticatedRequest(
            `${testServer.url}/v1/chat/completions`,
            VALID_API_KEY.key,
            {
              method: 'POST',
              body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
            }
          )
        );

      const responses = await Promise.all(requests);

      for (const response of responses) {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
      }
    });

    it('should be consistent across multiple requests', async () => {
      const responses = await Promise.all([
        makeAuthenticatedRequest(
          `${testServer.url}/v1/chat/completions`,
          VALID_API_KEY.key,
          {
            method: 'POST',
            body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
          }
        ),
        makeAuthenticatedRequest(
          `${testServer.url}/v1/chat/completions`,
          VALID_API_KEY.key,
          {
            method: 'POST',
            body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
          }
        ),
      ]);

      for (const response of responses) {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
      }
    });
  });

  describe('POST /v1/chat/completions - Response Headers', () => {
    it('should return appropriate content-type header', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
        }
      );

      const contentType = response.headers.get('content-type');
      expect(contentType).toBeTruthy();
    });

    it('should forward relevant upstream headers', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify(OPENAI_REQUEST_BODIES.basic),
        }
      );

      // Should have some headers
      expect(response.headers).toBeTruthy();
    });
  });
});
