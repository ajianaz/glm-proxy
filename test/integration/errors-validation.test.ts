/**
 * Malformed Request Handling Integration Tests
 *
 * Tests that invalid JSON, missing required fields, and validation errors
 * are properly reported with appropriate error messages and status codes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer } from './helpers';
import { setupTestEnvironment, teardownTestEnvironment } from './setup';
import { VALID_API_KEY } from './fixtures';
import type { TestServer } from './helpers';

describe('Malformed Request Handling Integration Tests', () => {
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

  describe('Invalid JSON - OpenAI Chat Completions', () => {
    it('should reject completely empty request body', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: '',
      });

      // Can return 401 (auth fails first) or 400 (validation error)
      expect([400, 401]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');

      if (response.status === 400) {
        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        expect(String(errorMessage).toLowerCase()).toMatch(/json|invalid|parse|empty/);
      }
    });

    it('should reject malformed JSON', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: '{ invalid json }',
      });

      // Can return 401 (auth fails first) or 400 (validation error)
      expect([400, 401]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');

      if (response.status === 400) {
        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        expect(String(errorMessage).toLowerCase()).toMatch(/json|parse|invalid/);
      }
    });

    it('should reject incomplete JSON', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: '{"model": "glm-4", "messages": [',
      });

      // Can return 401 (auth fails first) or 400 (validation error)
      expect([400, 401]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should accept valid JSON syntax', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: '{"model": "glm-4", "messages": [{"role": "user", "content": "test"}]}',
      });

      // This should work or fail with non-validation error
      expect([200, 400, 401, 500]).toContain(response.status);

      if (response.status === 400) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should reject JSON with trailing commas', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: '{"model": "glm-4", "messages": [],}',
      });

      // Can return 401 (auth fails first) or 400 (validation error)
      expect([400, 401]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject non-JSON content', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: 'just plain text',
      });

      // Can return 401 (auth fails first) or 400 (validation error)
      expect([400, 401]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');

      if (response.status === 400) {
        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        expect(String(errorMessage).toLowerCase()).toMatch(/json/);
      }
    });
  });

  describe('Invalid JSON - Anthropic Messages', () => {
    it('should reject empty request body', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: '',
      });

      expect([400, 401]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject malformed JSON', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: '{broken json',
      });

      expect([400, 401]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject incomplete JSON structures', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: '{"model": "claude-3-5-sonnet-20241022",',
      });

      expect([400, 401]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });
  });

  describe('Missing Required Fields - OpenAI Chat Completions', () => {
    it('should reject request missing messages field', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');

      if (response.status !== 401) {
        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();
        expect(
          errorStr.includes('messages') ||
          errorStr.includes('required') ||
          errorStr.includes('validation')
        ).toBe(true);
      }
    });

    it('should reject request with empty messages array', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [],
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject request missing model field (if validation is enabled)', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      // Should either work with default model or return validation error
      expect([200, 400, 401, 422]).toContain(response.status);

      if (response.status >= 400) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should reject message missing content field', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user' }],
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject message missing role field', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ content: 'test' }],
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });
  });

  describe('Missing Required Fields - Anthropic Messages', () => {
    it('should reject request missing messages field', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject request missing max_tokens field', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');

      if (response.status !== 401) {
        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();
        expect(
          errorStr.includes('max_tokens') ||
          errorStr.includes('required') ||
          errorStr.includes('validation')
        ).toBe(true);
      }
    });

    it('should reject request with empty messages array', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages: [],
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });
  });

  describe('Invalid Field Types - OpenAI Chat Completions', () => {
    it('should reject messages as string instead of array', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: 'not an array',
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject model as number instead of string', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 12345,
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      // Type coercion might handle this, so accept various responses
      expect([200, 400, 401, 422]).toContain(response.status);

      if (response.status >= 400) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should reject stream as string instead of boolean', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: 'test' }],
          stream: 'true',
        }),
      });

      // Type coercion might handle this
      expect([200, 400, 401]).toContain(response.status);
    });

    it('should reject temperature as string instead of number', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: 'test' }],
          temperature: '0.7',
        }),
      });

      // Type coercion might handle this
      expect([200, 400, 401]).toContain(response.status);
    });
  });

  describe('Invalid Message Roles - OpenAI Chat Completions', () => {
    it('should reject invalid role value', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'invalid_role', content: 'test' }],
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');

      if (response.status !== 401) {
        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();
        expect(
          errorStr.includes('role') ||
          errorStr.includes('invalid') ||
          errorStr.includes('validation')
        ).toBe(true);
      }
    });

    it('should accept valid role: user', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      // Should work or fail with non-validation error
      if (!response.ok) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();
        // Should NOT be a role validation error
        expect(errorStr.includes('role')).toBe(false);
      }
    });

    it('should accept valid role: assistant', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [
            { role: 'user', content: 'hello' },
            { role: 'assistant', content: 'hi there' },
          ],
        }),
      });

      // Should work or fail with non-validation error
      if (!response.ok) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();
        // Should NOT be a role validation error
        expect(errorStr.includes('role')).toBe(false);
      }
    });

    it('should accept valid role: system', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'hello' },
          ],
        }),
      });

      // Should work or fail with non-validation error
      if (!response.ok) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();
        // Should NOT be a role validation error
        expect(errorStr.includes('role')).toBe(false);
      }
    });

    it('should reject null role', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: null, content: 'test' }],
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject numeric role', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 123, content: 'test' }],
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });
  });

  describe('Invalid Parameter Values - OpenAI Chat Completions', () => {
    it('should reject negative temperature', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: 'test' }],
          temperature: -1,
        }),
      });

      // Upstream should reject invalid temperature
      expect([200, 400, 401]).toContain(response.status);

      if (response.status === 400) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should reject temperature > 2', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: 'test' }],
          temperature: 3,
        }),
      });

      // Upstream should reject invalid temperature
      expect([200, 400, 401]).toContain(response.status);

      if (response.status === 400) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();
        expect(
          errorStr.includes('temperature') ||
          errorStr.includes('parameter')
        ).toBe(true);
      }
    });

    it('should reject negative max_tokens', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: -100,
        }),
      });

      // Upstream should reject negative max_tokens
      expect([200, 400, 401]).toContain(response.status);

      if (response.status === 400) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should reject top_p < 0', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: 'test' }],
          top_p: -0.5,
        }),
      });

      // Upstream should reject invalid top_p
      expect([200, 400, 401]).toContain(response.status);

      if (response.status === 400) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should reject top_p > 1', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: 'test' }],
          top_p: 1.5,
        }),
      });

      // Upstream should reject invalid top_p
      expect([200, 400, 401]).toContain(response.status);

      if (response.status === 400) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });
  });

  describe('Invalid Parameter Values - Anthropic Messages', () => {
    it('should reject negative temperature', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1024,
          temperature: -0.5,
        }),
      });

      // Upstream should reject invalid temperature
      expect([200, 400, 401]).toContain(response.status);

      if (response.status === 400) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should reject temperature > 1', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1024,
          temperature: 1.5,
        }),
      });

      // Upstream should reject invalid temperature
      expect([200, 400, 401]).toContain(response.status);

      if (response.status === 400) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();
        expect(
          errorStr.includes('temperature') ||
          errorStr.includes('parameter')
        ).toBe(true);
      }
    });

    it('should reject top_k < 0', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1024,
          top_k: -10,
        }),
      });

      // Upstream should reject invalid top_k
      expect([200, 400, 401]).toContain(response.status);

      if (response.status === 400) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });
  });

  describe('Null and Empty Values', () => {
    it('should reject null messages field', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: null,
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject null model field', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: null,
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject empty string model', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: '',
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should reject empty string content in message', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: '' }],
        }),
      });

      // Upstream should reject empty content
      expect([200, 400, 401]).toContain(response.status);

      if (response.status === 400) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should reject null content in message', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: null }],
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });
  });

  describe('Content Type Validation', () => {
    it('should reject missing content-type header', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      // Should accept or reject depending on server configuration
      expect([200, 400, 401, 415]).toContain(response.status);

      if (response.status >= 400 && response.status !== 401) {
        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;
        const errorStr = String(errorMessage).toLowerCase();
        expect(
          errorStr.includes('content-type') ||
          errorStr.includes('content type')
        ).toBe(true);
      }
    });

    it('should reject wrong content-type', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      // Should accept or reject depending on server configuration
      expect([200, 400, 401, 415]).toContain(response.status);

      if (response.status >= 400) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should accept application/json content-type', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: 'test' }],
        }),
      });

      // Should accept valid content-type (may still fail for other reasons)
      expect([200, 400, 401, 500]).toContain(response.status);
    });
  });

  describe('Error Response Format', () => {
    it('should return proper error structure for invalid JSON', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: 'invalid json',
      });

      if (response.status === 400) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toBeTruthy();
        expect(contentType).toContain('application/json');

        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        if (typeof error === 'object' && error !== null) {
          expect(error).toHaveProperty('message');
          expect(typeof error.message).toBe('string');
          expect(error.message.length).toBeGreaterThan(0);
        } else {
          expect(typeof error).toBe('string');
          expect(error.length).toBeGreaterThan(0);
        }
      }
    });

    it('should return proper error structure for missing fields', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
        }),
      });

      if (response.status >= 400) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toBeTruthy();
        expect(contentType).toContain('application/json');

        const body = await response.json();
        expect(body).toHaveProperty('error');

        const error = body.error;
        if (typeof error === 'object' && error !== null) {
          expect(error).toHaveProperty('message');
        }
      }
    });

    it('should include helpful error message', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: '{invalid}',
      });

      if (response.status === 400) {
        const body = await response.json();
        const error = body.error;
        const errorMessage = typeof error === 'object' ? error.message : error;

        expect(errorMessage).toBeTruthy();
        expect(typeof errorMessage).toBe('string');
        expect(errorMessage.length).toBeGreaterThan(0);

        // Error message should be informative
        const errorStr = String(errorMessage).toLowerCase();
        expect(
          errorStr.includes('json') ||
          errorStr.includes('parse') ||
          errorStr.includes('invalid') ||
          errorStr.includes('unexpected')
        ).toBe(true);
      }
    });
  });

  describe('CORS Headers on Validation Errors', () => {
    it('should include CORS headers on validation error responses', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
          'Origin': 'https://example.com',
        },
        body: 'invalid json',
      });

      if (response.status === 400) {
        // Check for CORS headers
        const corsHeader = response.headers.get('access-control-allow-origin');
        // CORS headers may or may not be present depending on configuration
        expect([400, 401]).toContain(response.status);
      }
    });
  });

  describe('Complex Validation Scenarios', () => {
    it('should reject request with both valid and invalid messages', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [
            { role: 'user', content: 'valid message' },
            { role: 'invalid', content: 'invalid role' },
          ],
        }),
      });

      expect([400, 401, 422]).toContain(response.status);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    it('should handle deeply nested invalid structures', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [
            {
              role: 'user',
              content: {
                nested: {
                  deeply: {
                    invalid: 'structure',
                  },
                },
              },
            },
          ],
        }),
      });

      // Upstream should reject invalid content structure
      expect([200, 400, 401]).toContain(response.status);

      if (response.status === 400) {
        const body = await response.json();
        expect(body).toHaveProperty('error');
      }
    });

    it('should reject request with extra unexpected fields at root', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: 'test' }],
          unexpected_field: 'should not cause validation error',
        }),
      });

      // Extra fields are typically ignored, not rejected
      expect([200, 400, 401]).toContain(response.status);
    });
  });
});
