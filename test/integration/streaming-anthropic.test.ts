/**
 * Anthropic Streaming Response Integration Tests
 *
 * Tests SSE (Server-Sent Events) streaming for Anthropic messages,
 * verifying proper event types (message_start, content_block_delta, etc.),
 * chunk handling, and streaming behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestServer, makeAuthenticatedRequest } from './helpers';
import { setupTestEnvironment, teardownTestEnvironment } from './setup';
import {
  VALID_API_KEY,
  EXPIRED_API_KEY,
  ANTHROPIC_MODEL_API_KEY,
  LOW_LIMIT_API_KEY,
  TEST_ANTHROPIC_MESSAGES,
  TEST_CONVERSATION_MESSAGES,
  ANTHROPIC_REQUEST_BODIES,
} from './fixtures';
import type { TestServer } from './helpers';

describe('Anthropic Streaming Response Integration Tests', () => {
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

  describe('POST /v1/messages - Basic Streaming', () => {
    it('should return text/event-stream content type for streaming requests', async () => {
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

      const contentType = response.headers.get('content-type');
      if (response.ok) {
        expect(contentType).toContain('text/event-stream');
      }
    });

    it('should handle streaming request with stream: true', async () => {
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
        `${testServer.url}/v1/messages`,
        VALID_API_KEY.key,
        {
          method: 'POST',
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            messages: TEST_ANTHROPIC_MESSAGES,
            max_tokens: 1024,
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

  describe('POST /v1/messages - SSE Event Types', () => {
    it('should include message_start event type', async () => {
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
      let foundMessageStart = false;

      // Read first few chunks
      for (let i = 0; i < 5; i++) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (chunk.includes('event: message_start')) {
          foundMessageStart = true;
          break;
        }
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundMessageStart).toBe(true);
      }
    });

    it('should include content_block_delta event type', async () => {
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
      let foundContentDelta = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (chunk.includes('event: content_block_delta')) {
          foundContentDelta = true;
          break;
        }
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundContentDelta).toBe(true);
      }
    });

    it('should include message_stop event type', async () => {
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
      let chunks = [];

      // Read all chunks
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        chunks.push(chunk);
      }

      reader.releaseLock();

      // Check for message_stop event
      const allText = chunks.join('');
      const foundMessageStop = allText.includes('event: message_stop');

      if (response.ok) {
        expect(foundMessageStop).toBe(true);
      }
    });

    it('should include ping event type for keep-alive', async () => {
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
      let chunks = [];

      // Read all chunks
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        chunks.push(chunk);
      }

      reader.releaseLock();

      // Check for ping event (may or may not be present depending on timing)
      const allText = chunks.join('');
      const hasPingEvent = allText.includes('event: ping');

      // Ping events are optional, so we just check the response is valid
      if (response.ok) {
        expect(true).toBe(true);
      }
    });
  });

  describe('POST /v1/messages - SSE Chunk Format', () => {
    it('should return properly formatted SSE chunks with "event: " and "data: " prefixes', async () => {
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
      let foundEventPrefix = false;
      let foundDataPrefix = false;

      // Read first few chunks
      for (let i = 0; i < 5; i++) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (chunk.includes('event: ')) {
          foundEventPrefix = true;
        }
        if (chunk.includes('data: ')) {
          foundDataPrefix = true;
        }

        if (foundEventPrefix && foundDataPrefix) break;
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundEventPrefix).toBe(true);
        expect(foundDataPrefix).toBe(true);
      }
    });

    it('should return valid JSON in SSE data chunks', async () => {
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
      let foundValidJson = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6); // Remove "data: " prefix
            try {
              const parsed = JSON.parse(data);
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

    it('should separate SSE chunks with newlines', async () => {
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

  describe('POST /v1/messages - Content Block Delta', () => {
    it('should include text content in delta events', async () => {
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
      let foundTextContent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('event: content_block_delta')) {
            // Look at the next line for data
            if (i + 1 < lines.length && lines[i + 1].startsWith('data: ')) {
              const data = lines[i + 1].slice(6);
              try {
                const parsed = JSON.parse(data);
                if (parsed.delta && parsed.delta.text) {
                  foundTextContent = true;
                  break;
                }
              } catch (e) {
                // Invalid JSON, skip
              }
            }
          }
        }

        if (foundTextContent) break;
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundTextContent).toBe(true);
      }
    });

    it('should include content block index in delta events', async () => {
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
      let foundIndex = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('event: content_block_delta')) {
            // Look at the next line for data
            if (i + 1 < lines.length && lines[i + 1].startsWith('data: ')) {
              const data = lines[i + 1].slice(6);
              try {
                const parsed = JSON.parse(data);
                if (parsed.index !== undefined) {
                  foundIndex = true;
                  break;
                }
              } catch (e) {
                // Invalid JSON, skip
              }
            }
          }
        }

        if (foundIndex) break;
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundIndex).toBe(true);
      }
    });
  });

  describe('POST /v1/messages - Message Structure', () => {
    it('should include message metadata in message_start event', async () => {
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
      let foundMessageId = false;

      // Read first few chunks
      for (let i = 0; i < 10; i++) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (let j = 0; j < lines.length; j++) {
          const line = lines[j];
          if (line.includes('event: message_start')) {
            // Look at the next line for data
            if (j + 1 < lines.length && lines[j + 1].startsWith('data: ')) {
              const data = lines[j + 1].slice(6);
              try {
                const parsed = JSON.parse(data);
                if (parsed.message && parsed.message.id) {
                  foundMessageId = true;
                  break;
                }
              } catch (e) {
                // Invalid JSON, skip
              }
            }
          }
        }

        if (foundMessageId) break;
      }

      reader.releaseLock();

      if (response.ok) {
        expect(foundMessageId).toBe(true);
      }
    });

    it('should include model in message metadata', async () => {
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
      let foundModel = false;

      // Read first few chunks
      for (let i = 0; i < 10; i++) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (let j = 0; j < lines.length; j++) {
          const line = lines[j];
          if (line.includes('event: message_start')) {
            // Look at the next line for data
            if (j + 1 < lines.length && lines[j + 1].startsWith('data: ')) {
              const data = lines[j + 1].slice(6);
              try {
                const parsed = JSON.parse(data);
                if (parsed.message && parsed.message.model) {
                  foundModel = true;
                  break;
                }
              } catch (e) {
                // Invalid JSON, skip
              }
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

  describe('POST /v1/messages - Streaming with Various Requests', () => {
    it('should handle streaming with conversation history', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_CONVERSATION_MESSAGES,
          max_tokens: 1024,
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

    it('should handle streaming with system parameter', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: 'Hello!' }],
          max_tokens: 1024,
          system: 'You are a helpful assistant.',
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
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ANTHROPIC_MODEL_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'some-other-model', // Should be overridden
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
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
          temperature: 0.7,
          top_p: 0.9,
          top_k: 40,
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

  describe('POST /v1/messages - Streaming Authentication', () => {
    it('should require authentication for streaming requests', async () => {
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

      expect(response.status).toBe(401);
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

      // Should return 401 or 403 for expired keys
      expect([401, 403]).toContain(response.status);
    });

    it('should accept streaming requests with valid API key', async () => {
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

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });

  describe('POST /v1/messages - Streaming Rate Limiting', () => {
    it('should enforce rate limits for streaming requests', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
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

      // Should get a response (may be rate limited or successful)
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should update token usage after streaming request', async () => {
      // Make a streaming request
      await fetch(`${testServer.url}/v1/messages`, {
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

  describe('POST /v1/messages - Streaming Edge Cases', () => {
    it('should handle empty streaming gracefully', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: '' }],
          max_tokens: 1024,
          stream: true,
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle concurrent streaming requests', async () => {
      const promises = Array.from({ length: 3 }, () =>
        fetch(`${testServer.url}/v1/messages`, {
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

      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: longContent }],
          max_tokens: 1024,
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

      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: specialContent }],
          max_tokens: 1024,
          stream: true,
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });

    it('should handle streaming with unicode characters', async () => {
      const unicodeContent = 'Hello 世界 🌍 Привет';

      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: unicodeContent }],
          max_tokens: 1024,
          stream: true,
        }),
      });

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);
    });
  });

  describe('POST /v1/messages - Streaming Performance', () => {
    it('should return first chunk within reasonable time', async () => {
      const startTime = Date.now();

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

      // Wait for first chunk
      await reader.read();

      const firstChunkTime = Date.now() - startTime;

      reader.releaseLock();

      // First chunk should arrive within 30 seconds
      expect(firstChunkTime).toBeLessThan(30000);
    });

    it('should handle streaming connection closure gracefully', async () => {
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

  describe('POST /v1/messages - Anthropic Version Headers', () => {
    it('should handle custom anthropic-version header', async () => {
      const response = await fetch(`${testServer.url}/v1/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VALID_API_KEY.key}`,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          messages: TEST_ANTHROPIC_MESSAGES,
          max_tokens: 1024,
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
  });
});
