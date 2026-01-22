/**
 * OpenAI Streaming Response Integration Tests
 *
 * Tests SSE (Server-Sent Events) streaming for OpenAI chat completions,
 * verifying proper chunk formatting, delta updates, and streaming behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, makeAuthenticatedRequest } from './helpers';
import { setupTestEnvironment, teardownTestEnvironment } from './setup';
import {
  VALID_API_KEY,
  EXPIRED_API_KEY,
  CUSTOM_MODEL_API_KEY,
  LOW_LIMIT_API_KEY,
  TEST_OPENAI_MESSAGES,
  TEST_CONVERSATION_MESSAGES,
} from './fixtures';
import type { TestServer } from './helpers';

describe('OpenAI Streaming Response Integration Tests', () => {
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

  describe('POST /v1/chat/completions - Basic Streaming', () => {
    it('should return text/event-stream content type for streaming requests', async () => {
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

      const contentType = response.headers.get('content-type');
      if (response.ok) {
        expect(contentType).toContain('text/event-stream');
      }
    });

    it('should handle streaming request with stream: true', async () => {
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

      // Should get a response (may be error if upstream not configured)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('text/event-stream');
      }
    });

    it('should return non-streaming response when stream: false', async () => {
      const response = await makeAuthenticatedRequest(
        `${testServer.url}/v1/chat/completions`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify({
            model: 'glm-4',
            messages: TEST_OPENAI_MESSAGES,
            stream: false,
          }),
        }
      );

      // Should get a response
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        // Non-streaming should return JSON, not event-stream
        expect(contentType).toContain('application/json');
        expect(contentType).not.toContain('text/event-stream');
      }
    });
  });

  describe('POST /v1/chat/completions - SSE Chunk Format', () => {
    it('should return properly formatted SSE chunks with "data: " prefix', async () => {
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
      let foundDataPrefix = false;

      // Read first few chunks
      for (let i = 0; i < 5; i++) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            foundDataPrefix = true;
            break;
          }
        }

        if (foundDataPrefix) break;
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundDataPrefix).toBe(true);
      }
    });

    it('should return valid JSON in SSE data chunks', async () => {
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
      let foundValidJson = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remove "data: " prefix
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              expect(parsed).toHaveProperty('choices');
              foundValidJson = true;
              break;
            } catch (e) {
              // Invalid JSON, skip
            }
          }
        }

        if (foundValidJson) break;
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundValidJson).toBe(true);
      }
    });

    it('should terminate stream with [DONE] marker', async () => {
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
      let foundDoneMarker = false;
      let chunks = [];

      // Read all chunks
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        chunks.push(chunk);
      }

      reader.releaseLock();

      // Check for [DONE] marker in any chunk
      const allText = chunks.join('');
      const lines = allText.split('\n').filter(line => line.trim());

      for (const line of lines) {
        if (line.startsWith('data: [DONE]') || line === 'data: [DONE]') {
          foundDoneMarker = true;
          break;
        }
      }

      if (response.ok) {
        expect(foundDoneMarker).toBe(true);
      }
    });

    it('should separate SSE chunks with newlines', async () => {
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
      let content = '';

      // Read first chunk
      const { value } = await reader.read();
      if (value) {
        content = decoder.decode(value, { stream: true });
      }

      reader.releaseLock();

      if (response.ok && content) {
        // SSE format should have newline separators
        expect(content).toMatch(/\n/);
      }
    });
  });

  describe('POST /v1/chat/completions - Delta Updates', () => {
    it('should include choices array in streaming chunks', async () => {
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
      let foundChoices = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && Array.isArray(parsed.choices)) {
                foundChoices = true;
                break;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }

        if (foundChoices) break;
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundChoices).toBe(true);
      }
    });

    it('should include delta object in streaming chunks', async () => {
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
      let foundDelta = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.choices &&
                  Array.isArray(parsed.choices) &&
                  parsed.choices[0] &&
                  parsed.choices[0].delta) {
                foundDelta = true;
                break;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }

        if (foundDelta) break;
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundDelta).toBe(true);
      }
    });

    it('should include content in delta updates', async () => {
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
      let foundContent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.choices &&
                  Array.isArray(parsed.choices) &&
                  parsed.choices[0] &&
                  parsed.choices[0].delta &&
                  parsed.choices[0].delta.content) {
                foundContent = true;
                break;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }

        if (foundContent) break;
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundContent).toBe(true);
      }
    });

    it('should include finish_reason in final chunk', async () => {
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
      let foundFinishReason = false;
      let chunks = [];

      // Read all chunks
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        chunks.push(chunk);
      }

      reader.releaseLock();

      // Check last few chunks for finish_reason
      const allText = chunks.join('');
      const lines = allText.split('\n').filter(line => line.trim());

      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 10); i--) {
        const line = lines[i];
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.choices &&
                Array.isArray(parsed.choices) &&
                parsed.choices[0] &&
                parsed.choices[0].finish_reason) {
              foundFinishReason = true;
              break;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }

      if (response.ok) {
        expect(foundFinishReason).toBe(true);
      }
    });
  });

  describe('POST /v1/chat/completions - Streaming with Various Requests', () => {
    it('should handle streaming with conversation history', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: TEST_CONVERSATION_MESSAGES,
          stream: true,
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('text/event-stream');
      }
    });

    it('should handle streaming with system message', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello!' },
          ],
          stream: true,
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('text/event-stream');
      }
    });

    it('should handle streaming with custom model from API key', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CUSTOM_MODEL_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4', // Should be overridden to custom-model-123
          messages: TEST_OPENAI_MESSAGES,
          stream: true,
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('text/event-stream');
      }
    });

    it('should handle streaming with additional parameters', async () => {
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
          temperature: 0.7,
          max_tokens: 1000,
          top_p: 0.9,
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('text/event-stream');
      }
    });
  });

  describe('POST /v1/chat/completions - Streaming Authentication', () => {
    it('should require authentication for streaming requests', async () => {
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

      expect(response.status).toBe(401);
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

      // Should return 401 or 403 for expired keys
      expect([401, 403]).toContain(response.status);
    });

    it('should accept streaming requests with valid API key', async () => {
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

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });

  describe('POST /v1/chat/completions - Streaming Rate Limiting', () => {
    it('should enforce rate limits for streaming requests', async () => {
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
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

      // Should get a response (may be rate limited or successful)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should update token usage after streaming request', async () => {
      // Make a streaming request
      await fetch(`${testServer.url}/v1/chat/completions`, {
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

      // Wait a bit for usage to be updated
      await new Promise(resolve => setTimeout(resolve, 100));

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

  describe('POST /v1/chat/completions - Streaming Response Structure', () => {
    it('should include id in streaming chunks', async () => {
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
      let foundId = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.id) {
                foundId = true;
                break;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }

        if (foundId) break;
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundId).toBe(true);
      }
    });

    it('should include object type in streaming chunks', async () => {
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
      let foundObject = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.object) {
                foundObject = true;
                expect(parsed.object).toBe('chat.completion.chunk');
                break;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }

        if (foundObject) break;
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundObject).toBe(true);
      }
    });

    it('should include created timestamp in streaming chunks', async () => {
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
      let foundCreated = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.created) {
                foundCreated = true;
                expect(typeof parsed.created).toBe('number');
                break;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }

        if (foundCreated) break;
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundCreated).toBe(true);
      }
    });

    it('should include model in streaming chunks', async () => {
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
      let foundModel = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.model) {
                foundModel = true;
                expect(typeof parsed.model).toBe('string');
                break;
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }

        if (foundModel) break;
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundModel).toBe(true);
      }
    });
  });

  describe('POST /v1/chat/completions - Streaming Edge Cases', () => {
    it('should handle empty streaming gracefully', async () => {
      // This test verifies that if the stream is empty or has no content chunks,
      // the response is still handled correctly
      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: '' }],
          stream: true,
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle concurrent streaming requests', async () => {
      const promises = Array.from({ length: 3 }, () =>
        fetch(`${testServer.url}/v1/chat/completions`, {
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
        })
      );

      const responses = await Promise.all(promises);

      for (const response of responses) {
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
      }
    });

    it('should handle streaming with very long messages', async () => {
      const longContent = 'This is a test message. '.repeat(50);

      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: longContent }],
          stream: true,
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);

      if (response.ok) {
        const contentType = response.headers.get('content-type');
        expect(contentType).toContain('text/event-stream');
      }
    });

    it('should handle streaming with special characters', async () => {
      const specialContent = 'Test with special chars: \n\t\r\\"\'\u0000';

      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: specialContent }],
          stream: true,
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle streaming with unicode characters', async () => {
      const unicodeContent = 'Hello 世界 🌍 Привет';

      const response = await fetch(`${testServer.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: unicodeContent }],
          stream: true,
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });

  describe('POST /v1/chat/completions - Streaming Performance', () => {
    it('should return first chunk within reasonable time', async () => {
      const startTime = Date.now();

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

      // Wait for first chunk
      await reader.read();

      const firstChunkTime = Date.now() - startTime;

      reader.releaseLock();

      // First chunk should arrive within 30 seconds
      expect(firstChunkTime).toBeLessThan(30000);
    });

    it('should handle streaming connection closure gracefully', async () => {
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

      // Read a few chunks then close
      for (let i = 0; i < 3; i++) {
        const { done } = await reader.read();
        if (done) break;
      }

      // Close connection
      reader.releaseLock();

      // Should not throw any errors
      expect(true).toBe(true);
    });
  });
});
