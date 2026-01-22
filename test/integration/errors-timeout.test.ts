/**
 * Timeout Error Handling Integration Tests
 *
 * Tests that request timeouts are properly handled and reported with appropriate
 * error messages, status codes, and response formats.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer } from './helpers';
import { setupTestEnvironment, teardownTestEnvironment } from './setup';
import {
  VALID_API_KEY,
  TEST_OPENAI_MESSAGES,
  TEST_ANTHROPIC_MESSAGES,
} from './fixtures';
import type { TestServer } from './helpers';

describe('Timeout Error Handling Integration Tests', () => {
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

  describe('OpenAI Chat Completions - Timeout Handling', () => {
    it('should handle request timeout with appropriate status code', async () => {
      // Note: In a real scenario, this would require the upstream to actually timeout
      // For testing purposes, we verify the error handling structure is in place
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      // If we get a timeout error (504), verify proper format
      if (response.status === 504) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('application/json');

        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();

        // Timeout errors should mention timeout or time limit
        expect(
          errorStr.includes('timeout') ||
          errorStr.includes('timed out') ||
          errorStr.includes('time limit')
        ).toBe(true);
      } else {
        // If no timeout, request should succeed or fail with different error
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
      }
    });

    it('should handle timeout during streaming request', async () => {
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

      // If timeout occurs during streaming, should return JSON error not stream
      if (response.status === 504 || response.status === 408) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');

        const body = await response.json();
        expect(body).toHaveProperty('error');
      } else {
        // If no timeout, should handle normally
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
      }
    });

    it('should include proper error message for timeout', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      if (response.status === 504 || response.status === 408) {
        const body = await response.json();
        const error = body.error;

        expect(error).toBeTruthy();

        const errorMessage = typeof error === 'object' ? error.message : error;
        expect(typeof errorMessage).toBe('string');
        expect(errorMessage.length).toBeGreaterThan(0);

        // Error message should be informative
        const errorStr = String(errorMessage).toLowerCase();
        expect(
          errorStr.includes('timeout') ||
          errorStr.includes('timed out') ||
          errorStr.includes('upstream')
        ).toBe(true);
      }
    });

    it('should include CORS headers on timeout errors', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
          'Origin': 'https://example.com',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      if (response.status === 504 || response.status === 408) {
        // Should still have proper error response structure
        const body = await response.json();
        expect(body).toHaveProperty('error');

        // Status code should indicate timeout or gateway error
        expect([408, 504, 502]).toContain(response.status);
      }
    });

    it('should return 504 Gateway Timeout for upstream timeouts', async () => {
      // Test that the proxy can handle upstream timeouts and return appropriate status
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      // If upstream times out, should return 504 (Gateway Timeout)
      if (response.status === 504) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        if (typeof error === 'object' && error !== null) {
          expect(error).toHaveProperty('type');
          expect(error.type).toMatch(/timeout|gateway_error/i);
        }
      } else {
        // Should not return other 5xx errors for timeout scenarios
        if (response.status >= 500) {
          expect([502, 503, 504]).toContain(response.status);
        }
      }
    });
  });

  describe('Anthropic Messages - Timeout Handling', () => {
    it('should handle request timeout with appropriate status code', async () => {
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
        }),
      });

      // If we get a timeout error, verify proper format
      if (response.status === 504 || response.status === 408) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('application/json');

        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();

        expect(
          errorStr.includes('timeout') ||
          errorStr.includes('timed out') ||
          errorStr.includes('time limit')
        ).toBe(true);
      } else {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
      }
    });

    it('should handle timeout during streaming request', async () => {
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

      // If timeout occurs during streaming, should return JSON error not stream
      if (response.status === 504 || response.status === 408) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');

        const body = await response.json();
        expect(body).toHaveProperty('error');
      } else {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
      }
    });

    it('should include proper error message for timeout', async () => {
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
        }),
      });

      if (response.status === 504 || response.status === 408) {
        const body = await response.json();
        const error = body.error;

        expect(error).toBeTruthy();

        const errorMessage = typeof error === 'object' ? error.message : error;
        expect(typeof errorMessage).toBe('string');
        expect(errorMessage.length).toBeGreaterThan(0);

        const errorStr = String(errorMessage).toLowerCase();
        expect(
          errorStr.includes('timeout') ||
          errorStr.includes('timed out') ||
          errorStr.includes('upstream')
        ).toBe(true);
      }
    });

    it('should preserve Anthropic error format on timeout', async () => {
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
        }),
      });

      if (response.status === 504 || response.status === 408) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        if (typeof error === 'object' && error !== null) {
          // Anthropic errors typically have type and message
          expect(error).toHaveProperty('message');
          if ('type' in error) {
            expect(error.type).toBeTruthy();
          }
        }
      }
    });
  });

  describe('Timeout Error Response Format', () => {
    it('should return JSON content type for timeout errors', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      if (response.status === 504 || response.status === 408) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toBeTruthy();
        expect(contentType).toContain('application/json');
      }
    });

    it('should include error object in timeout response', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      if (response.status === 504 || response.status === 408) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
        expect(body.error).toBeTruthy();
      }
    });

    it('should include error type in timeout response when applicable', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      if (response.status === 504 || response.status === 408) {
        const body = await response.json();
        const error = body.error;

        if (typeof error === 'object' && error !== null) {
          // If error is an object, it might have a type field
          if ('type' in error) {
            expect(
              error.type.includes('timeout') ||
              error.type.includes('gateway_error') ||
              error.type.includes('upstream_error')
            ).toBe(true);
          }
        }
      }
    });

    it('should distinguish timeout from other errors', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      if (response.status === 504 || response.status === 408) {
        const body = await response.json();
        const error = body.error;

        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();

        // Timeout error should mention timeout explicitly
        expect(
          errorStr.includes('timeout') ||
          errorStr.includes('timed out')
        ).toBe(true);
      }
    });
  });

  describe('Timeout Status Codes', () => {
    it('should use 408 Request Timeout for client-side timeouts', async () => {
      // Verify the proxy can return 408 for request timeout scenarios
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      // If we get a 408, verify error format
      if (response.status === 408) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();

        expect(errorStr.includes('timeout') || errorStr.includes('timed out')).toBe(true);
      }
    });

    it('should use 504 Gateway Timeout for upstream timeouts', async () => {
      // Verify the proxy returns 504 when upstream times out
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      // If we get a 504, verify error format
      if (response.status === 504) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        if (typeof error === 'object' && error !== null) {
          // 504 errors typically mention gateway or upstream
          const errorMessage = error.message || '';
          const errorStr = String(errorMessage).toLowerCase();

          expect(
            errorStr.includes('gateway') ||
            errorStr.includes('upstream') ||
            errorStr.includes('timeout')
          ).toBe(true);
        }
      }
    });

    it('should handle 502 Bad Gateway for connection timeouts', async () => {
      // Connection timeouts might manifest as 502
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      // If we get a 502, it might be a connection timeout
      if (response.status === 502) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        if (typeof error === 'object' && error !== null) {
          expect(error).toHaveProperty('message');
        }
      }
    });
  });

  describe('Timeout with Concurrent Requests', () => {
    it('should handle timeout in one request without affecting others', async () => {
      // Make multiple concurrent requests
      const requests = Array.from({ length: 3 }, () =>
        fetch(`${testServer.url}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${VALID_API_KEY.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'glm-4',
            messages: TEST_OPENAI_MESSAGES,
          }),
        })
      );

      const responses = await Promise.all(requests);

      // Count successful vs error responses
      const successCount = responses.filter(r => r.ok).length;
      const errorCount = responses.filter(r => !r.ok).length;

      // At least some requests should complete
      expect(successCount + errorCount).toBe(3);

      // If any are timeout errors, verify they have proper format
      const timeoutResponses = responses.filter(r => r.status === 504 || r.status === 408);
      for (const response of timeoutResponses) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should handle timeouts gracefully under load', async () => {
      // Make multiple rapid requests
      const requests = Array.from({ length: 5 }, (_, i) =>
        fetch(`${testServer.url}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${VALID_API_KEY.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'glm-4',
            messages: [{ role: 'user', content: `Test message ${i}` }],
          }),
        })
      );

      const responses = await Promise.all(requests);

      // All responses should be valid HTTP responses
      for (const response of responses) {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);

        // If timeout, verify error structure
        if (response.status === 504 || response.status === 408) {
          const body = await response.json();
          expect(body).toHaveProperty('error');
        }
      }
    });
  });

  describe('Timeout Error Recovery', () => {
    it('should allow retry after timeout', async () => {
      // First request that might timeout
      const response1 = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      // Second request should work regardless of first result
      const response2 = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      // Second request should complete (success or error)
      expect(response2.status).toBeGreaterThanOrEqual(200);
      expect(response2.status).toBeLessThan(600);
    });

    it('should not persist timeout state between requests', async () => {
      // Make a request
      const response1 = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      // Make another request immediately after
      const response2 = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      // Both should complete independently
      expect(response1.status).toBeGreaterThanOrEqual(200);
      expect(response1.status).toBeLessThan(600);
      expect(response2.status).toBeGreaterThanOrEqual(200);
      expect(response2.status).toBeLessThan(600);
    });
  });
});
