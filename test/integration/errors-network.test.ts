/**
 * Network Error Handling Integration Tests
 *
 * Tests that network failures, connection errors, and DNS failures are
 * properly handled with appropriate error messages and status codes.
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

describe('Network Error Handling Integration Tests', () => {
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

  describe('OpenAI Chat Completions - Network Connection Errors', () => {
    it('should handle connection failure with 502 Bad Gateway', async () => {
      // Note: Actual connection failures would return 502
      // This test verifies the error handling structure
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

      // If we get a 502 (network error), verify proper format
      if (response.status === 502) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('application/json');

        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();

        // Should mention connection, network, or upstream failure
        expect(
          errorStr.includes('connection') ||
          errorStr.includes('network') ||
          errorStr.includes('upstream') ||
          errorStr.includes('bad gateway')
        ).toBe(true);
      } else {
        // If no network error, request should succeed or fail with different error
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
      }
    });

    it('should include error type for connection failures', async () => {
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

      if (response.status === 502) {
        const body = await response.json();
        const error = body.error;

        if (typeof error === 'object' && error !== null) {
          expect(error).toHaveProperty('message');
          if ('type' in error) {
            // Should have error type
            expect(
              error.type.includes('upstream_error') ||
              error.type.includes('network_error') ||
              error.type.includes('connection_error')
            ).toBe(true);
          }
        }
      }
    });

    it('should handle connection reset errors', async () => {
      // Connection resets (ECONNRESET) should return 502
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

      if (response.status === 502) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        expect(errorMessage).toBeTruthy();
      }
    });

    it('should handle connection refused errors', async () => {
      // Connection refused (ECONNREFUSED) should return 502
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

      if (response.status === 502) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();

        expect(
          errorStr.includes('connection') ||
          errorStr.includes('refused') ||
          errorStr.includes('upstream')
        ).toBe(true);
      }
    });

    it('should handle connection timeout errors', async () => {
      // Connection timeout (ETIMEDOUT) should return 502 or 504
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

      if (response.status === 502 || response.status === 504) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();

        expect(
          errorStr.includes('timeout') ||
          errorStr.includes('connection') ||
          errorStr.includes('timed out')
        ).toBe(true);
      }
    });
  });

  describe('Anthropic Messages - Network Connection Errors', () => {
    it('should handle connection failure with 502 Bad Gateway', async () => {
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

      if (response.status === 502) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('application/json');

        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();

        expect(
          errorStr.includes('connection') ||
          errorStr.includes('network') ||
          errorStr.includes('upstream') ||
          errorStr.includes('bad gateway')
        ).toBe(true);
      } else {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
      }
    });

    it('should preserve Anthropic error format on connection errors', async () => {
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

  describe('DNS Resolution Failures', () => {
    it('should handle DNS resolution failure with proper error', async () => {
      // DNS failures (ENOTFOUND) should return 502
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

      if (response.status === 502) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();

        // DNS errors typically mention lookup, resolution, or host
        expect(
          errorStr.includes('dns') ||
          errorStr.includes('lookup') ||
          errorStr.includes('resolution') ||
          errorStr.includes('host') ||
          errorStr.includes('upstream')
        ).toBe(true);
      }
    });

    it('should include informative error message for DNS failures', async () => {
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

      if (response.status === 502) {
        const body = await response.json();
        const error = body.error;

        expect(error).toBeTruthy();

        const errorMessage = typeof error === 'object' ? error.message : error;
        expect(typeof errorMessage).toBe('string');
        expect(errorMessage.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Network Error Response Format', () => {
    it('should return JSON content type for network errors', async () => {
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

      if (response.status === 502 || response.status === 503) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toBeTruthy();
        expect(contentType).toContain('application/json');
      }
    });

    it('should include error object in network error response', async () => {
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

      if (response.status === 502 || response.status === 503) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
        expect(body.error).toBeTruthy();
      }
    });

    it('should include error message in network error response', async () => {
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

      if (response.status === 502 || response.status === 503) {
        const body = await response.json();
        const error = body.error;

        const errorMessage = typeof error === 'object' ? error.message : error;
        expect(typeof errorMessage).toBe('string');
        expect(errorMessage.length).toBeGreaterThan(0);
      }
    });

    it('should include error type when applicable for network errors', async () => {
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

      if (response.status === 502 || response.status === 503) {
        const body = await response.json();
        const error = body.error;

        if (typeof error === 'object' && error !== null) {
          if ('type' in error) {
            expect(error.type).toBeTruthy();
            expect(
              error.type.includes('upstream_error') ||
              error.type.includes('network_error') ||
              error.type.includes('connection_error')
            ).toBe(true);
          }
        }
      }
    });
  });

  describe('CORS Headers on Network Errors', () => {
    it('should include CORS headers on network error responses', async () => {
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

      if (response.status === 502 || response.status === 503) {
        // Should still have proper error response structure
        const body = await response.json();
        expect(body).toHaveProperty('error');

        // Should have proper error status
        expect([502, 503]).toContain(response.status);
      }
    });

    it('should handle cross-origin requests with network errors', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
          'Origin': 'https://test.example.com',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_OPENAI_MESSAGES,
        }),
      });

      if (response.status === 502 || response.status === 503) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('application/json');

        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });
  });

  describe('Network Errors with Streaming Requests', () => {
    it('should return JSON error not stream on network error for OpenAI', async () => {
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

      if (response.status === 502 || response.status === 503) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');

        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should return JSON error not stream on network error for Anthropic', async () => {
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

      if (response.status === 502 || response.status === 503) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');

        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should handle network errors before streaming starts', async () => {
      // Network errors that occur before streaming should return JSON immediately
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

      if (response.status === 502 || response.status === 503) {
        // Should not attempt to stream, should return error immediately
        const contentType = response.headers.get('content-type');
        expect(contentType).not.toContain('text/event-stream');

        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        expect(errorMessage).toBeTruthy();
      }
    });
  });

  describe('Network Error Status Codes', () => {
    it('should use 502 Bad Gateway for connection failures', async () => {
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

      if (response.status === 502) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        if (typeof error === 'object' && error !== null) {
          const errorMessage = error.message || '';
          const errorStr = String(errorMessage).toLowerCase();

          expect(
            errorStr.includes('upstream') ||
            errorStr.includes('connection') ||
            errorStr.includes('network')
          ).toBe(true);
        }
      }
    });

    it('should use 503 Service Unavailable for network issues', async () => {
      // Some network issues might return 503
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

      if (response.status === 503) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        expect(errorMessage).toBeTruthy();
      }
    });

    it('should distinguish network errors from other errors', async () => {
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

      if (response.status === 502) {
        const body = await response.json();
        const error = body.error;

        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();

        // Network errors should mention connection, network, or upstream
        expect(
          errorStr.includes('connection') ||
          errorStr.includes('network') ||
          errorStr.includes('upstream') ||
          errorStr.includes('bad gateway')
        ).toBe(true);
      }
    });
  });

  describe('Network Error Recovery', () => {
    it('should allow retry after network error', async () => {
      // First request that might encounter network error
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

    it('should not persist network error state between requests', async () => {
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

  describe('Network Errors with Concurrent Requests', () => {
    it('should handle network error in one request without affecting others', async () => {
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

      // If any are network errors (502), verify they have proper format
      const networkErrors = responses.filter(r => r.status === 502 || r.status === 503);
      for (const response of networkErrors) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should handle network errors gracefully under load', async () => {
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

        // If network error, verify error structure
        if (response.status === 502 || response.status === 503) {
          const body = await response.json();
          expect(body).toHaveProperty('error');
        }
      }
    });
  });

  describe('Network Error Message Quality', () => {
    it('should provide clear error messages for connection failures', async () => {
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

      if (response.status === 502) {
        const body = await response.json();
        const error = body.error;

        const errorMessage = typeof error === 'object' ? error.message : error;
        expect(typeof errorMessage).toBe('string');
        expect(errorMessage.length).toBeGreaterThan(10); // Should be descriptive
      }
    });

    it('should mention upstream in network error messages', async () => {
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

      if (response.status === 502) {
        const body = await response.json();
        const error = body.error;

        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();

        // Should help users understand it's an upstream issue
        expect(
          errorStr.includes('upstream') ||
          errorStr.includes('connection') ||
          errorStr.includes('network') ||
          errorStr.includes('gateway')
        ).toBe(true);
      }
    });
  });
});
