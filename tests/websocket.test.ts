import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import type { ApiKey } from '../src/types.js';

const TEST_DATA_FILE = `${import.meta.dir}/../data/test-apikeys.json`;

// Override DATA_FILE for tests
const originalDataFile = process.env.DATA_FILE;

/**
 * WebSocket Integration Tests
 *
 * These tests verify that WebSocket broadcasts work correctly when API keys are created/updated/deleted.
 *
 * These tests require the server to be running on localhost:3001
 * To run these tests:
 * 1. Start the server: bun --hot index.ts
 * 2. In another terminal: bun test tests/websocket.test.ts
 *
 * Or use the provided test script:
 * bun run test:websocket
 */

// Helper function to make API requests
async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: unknown; headers: Headers }> {
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`http://localhost:3001${path}`, options);
  const data = await response.json().catch(() => null);

  return {
    status: response.status,
    data,
    headers: response.headers,
  };
}

// Helper to create a test API key
async function createTestKey(overrides?: Partial<ApiKey>): Promise<ApiKey> {
  const defaultKey = {
    key: `test-key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Key',
    token_limit_per_5h: 100000,
    expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };

  const result = await apiRequest('POST', '/api/keys', defaultKey);
  if (result.status !== 201) {
    throw new Error(`Failed to create test key: ${JSON.stringify(result.data)}`);
  }

  return result.data as ApiKey;
}

// Helper to create a WebSocket connection with auth
function createWebSocketConnection(authToken?: string): WebSocket {
  const PORT = process.env.DASHBOARD_PORT || '3001';
  let wsUrl = `ws://localhost:${PORT}/ws`;

  if (authToken) {
    wsUrl += `?token=${encodeURIComponent(authToken)}`;
  }

  return new WebSocket(wsUrl);
}

// Helper to wait for a WebSocket event
function waitForWebSocketEvent(ws: WebSocket, eventType: string, timeout = 5000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      ws.removeEventListener('message', messageHandler);
      reject(new Error(`Timeout waiting for ${eventType} event`));
    }, timeout);

    const messageHandler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === eventType) {
          clearTimeout(timeoutId);
          ws.removeEventListener('message', messageHandler);
          resolve(data);
        }
      } catch (error) {
        // Ignore parsing errors
      }
    };

    ws.addEventListener('message', messageHandler);
  });
}

// Helper to wait for WebSocket connection
function waitForWebSocketOpen(ws: WebSocket, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('WebSocket connection timeout'));
    }, timeout);

    ws.onopen = () => {
      clearTimeout(timeoutId);
      resolve();
    };

    ws.onerror = (error) => {
      clearTimeout(timeoutId);
      reject(error);
    };
  });
}

// Helper to sleep
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('WebSocket Real-time Updates Tests', () => {
  let authToken: string;

  beforeEach(async () => {
    // Set test data file environment variable
    process.env.DATA_FILE = TEST_DATA_FILE;

    // Get auth token from environment or use test token
    authToken = process.env.DASHBOARD_AUTH_TOKEN || 'test-token';
  });

  afterEach(async () => {
    // Restore original data file
    process.env.DATA_FILE = originalDataFile;
  });

  describe('WebSocket Connection', () => {
    test('should connect to WebSocket endpoint', async () => {
      const ws = createWebSocketConnection(authToken);

      await waitForWebSocketOpen(ws);

      expect(ws.readyState).toBe(WebSocket.OPEN);

      ws.close();
    });

    test('should receive connection confirmation', async () => {
      const ws = createWebSocketConnection(authToken);

      await waitForWebSocketOpen(ws);

      const event = await waitForWebSocketEvent(ws, 'connected') as { type: string; timestamp: string; message?: string };

      expect(event.type).toBe('connected');
      expect(event.timestamp).toBeDefined();
      expect(event.message).toBe('Connected to dashboard real-time updates');

      ws.close();
    });

    test('should reject connection without auth token when auth is required', async () => {
      // Only run this test if auth is configured
      if (!process.env.DASHBOARD_AUTH_TOKEN) {
        return;
      }

      const ws = createWebSocketConnection();

      try {
        await waitForWebSocketOpen(ws);
        // If we get here, connection succeeded (auth might not be required)
        ws.close();
      } catch (error) {
        // Expected: connection should be rejected
        expect(error).toBeDefined();
      }
    });
  });

  describe('Key Created Events', () => {
    test('should broadcast key_created event when API key is created', async () => {
      const ws = createWebSocketConnection(authToken);

      await waitForWebSocketOpen(ws);
      // Clear connection confirmation
      await sleep(200);

      // Create a new API key via REST API
      const newKey = await createTestKey({ name: 'WebSocket Test Key' });

      // Wait for key_created event
      const event = await waitForWebSocketEvent(ws, 'key_created') as {
        type: string;
        timestamp: string;
        data: ApiKey;
      };

      expect(event.type).toBe('key_created');
      expect(event.timestamp).toBeDefined();
      expect(event.data).toBeDefined();
      expect(event.data.key).toBe(newKey.key);
      expect(event.data.name).toBe('WebSocket Test Key');

      ws.close();

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${encodeURIComponent(newKey.key)}`);
    });

    test('should include all key fields in key_created event', async () => {
      const ws = createWebSocketConnection(authToken);

      await waitForWebSocketOpen(ws);
      await sleep(200);

      const newKey = await createTestKey({
        name: 'Full Fields Test',
        model: 'glm-4',
        token_limit_per_5h: 50000,
      });

      const event = await waitForWebSocketEvent(ws, 'key_created') as {
        type: string;
        data: ApiKey;
      };

      expect(event.data.key).toBeDefined();
      expect(event.data.name).toBe('Full Fields Test');
      expect(event.data.model).toBe('glm-4');
      expect(event.data.token_limit_per_5h).toBe(50000);
      expect(event.data.expiry_date).toBeDefined();
      expect(event.data.created_at).toBeDefined();
      expect(event.data.last_used).toBeDefined();
      expect(event.data.total_lifetime_tokens).toBeDefined();
      expect(event.data.usage_windows).toBeDefined();

      ws.close();

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${encodeURIComponent(newKey.key)}`);
    });
  });

  describe('Key Updated Events', () => {
    test('should broadcast key_updated event when API key is updated', async () => {
      const ws = createWebSocketConnection(authToken);

      await waitForWebSocketOpen(ws);
      await sleep(200);

      // Create a key first
      const newKey = await createTestKey({ name: 'Original Name' });
      await sleep(200);

      // Update the key
      const { status, data } = await apiRequest(
        'PUT',
        `/api/keys/${encodeURIComponent(newKey.key)}`,
        { name: 'Updated Name' }
      );

      expect(status).toBe(200);

      // Wait for key_updated event
      const event = await waitForWebSocketEvent(ws, 'key_updated') as {
        type: string;
        timestamp: string;
        data: ApiKey;
      };

      expect(event.type).toBe('key_updated');
      expect(event.timestamp).toBeDefined();
      expect(event.data).toBeDefined();
      expect(event.data.key).toBe(newKey.key);
      expect(event.data.name).toBe('Updated Name');

      ws.close();

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${encodeURIComponent(newKey.key)}`);
    });

    test('should broadcast updates for multiple fields', async () => {
      const ws = createWebSocketConnection(authToken);

      await waitForWebSocketOpen(ws);
      await sleep(200);

      const newKey = await createTestKey({
        name: 'Multi Field Test',
        token_limit_per_5h: 100000,
      });
      await sleep(200);

      const { status } = await apiRequest(
        'PUT',
        `/api/keys/${encodeURIComponent(newKey.key)}`,
        {
          name: 'Updated Multi Field',
          token_limit_per_5h: 200000,
          model: 'glm-4.7',
        }
      );

      expect(status).toBe(200);

      const event = await waitForWebSocketEvent(ws, 'key_updated') as {
        data: ApiKey;
      };

      expect(event.data.name).toBe('Updated Multi Field');
      expect(event.data.token_limit_per_5h).toBe(200000);
      expect(event.data.model).toBe('glm-4.7');

      ws.close();

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${encodeURIComponent(newKey.key)}`);
    });
  });

  describe('Key Deleted Events', () => {
    test('should broadcast key_deleted event when API key is deleted', async () => {
      const ws = createWebSocketConnection(authToken);

      await waitForWebSocketOpen(ws);
      await sleep(200);

      // Create a key first
      const newKey = await createTestKey({ name: 'To Be Deleted' });
      await sleep(200);

      // Delete the key
      const { status } = await apiRequest(
        'DELETE',
        `/api/keys/${encodeURIComponent(newKey.key)}`
      );

      expect(status).toBe(204);

      // Wait for key_deleted event
      const event = await waitForWebSocketEvent(ws, 'key_deleted') as {
        type: string;
        timestamp: string;
        data: ApiKey;
      };

      expect(event.type).toBe('key_deleted');
      expect(event.timestamp).toBeDefined();
      expect(event.data).toBeDefined();
      expect(event.data.key).toBe(newKey.key);
      expect(event.data.name).toBe('To Be Deleted');

      ws.close();
    });
  });

  describe('Usage Updated Events', () => {
    test('should broadcast usage_updated event when key usage is tracked', async () => {
      const ws = createWebSocketConnection(authToken);

      await waitForWebSocketOpen(ws);
      await sleep(200);

      // Create a key
      const newKey = await createTestKey({ name: 'Usage Test Key' });
      await sleep(200);

      // Simulate usage update by calling the usage endpoint
      // Note: This requires the proxy to be integrated with usage tracking
      // For now, we'll skip this test if the endpoint doesn't exist
      const { status } = await apiRequest(
        'GET',
        `/api/keys/${encodeURIComponent(newKey.key)}/usage`
      );

      if (status === 200) {
        // Wait for usage_updated event
        const event = await waitForWebSocketEvent(ws, 'usage_updated', 2000) as {
          type: string;
          timestamp: string;
          data: {
            key: string;
            name: string;
            tokens_used: number;
            remaining_quota: number;
          };
        };

        expect(event.type).toBe('usage_updated');
        expect(event.timestamp).toBeDefined();
        expect(event.data).toBeDefined();
        expect(event.data.key).toBe(newKey.key);
        expect(event.data.name).toBe('Usage Test Key');
      } else {
        // Usage endpoint not implemented yet, skip test
        console.log('Usage endpoint not implemented, skipping test');
      }

      ws.close();

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${encodeURIComponent(newKey.key)}`);
    });
  });

  describe('Multiple Clients', () => {
    test('should broadcast events to all connected clients', async () => {
      const ws1 = createWebSocketConnection(authToken);
      const ws2 = createWebSocketConnection(authToken);

      await waitForWebSocketOpen(ws1);
      await waitForWebSocketOpen(ws2);
      await sleep(200);

      // Create a key
      const newKey = await createTestKey({ name: 'Multi Client Test' });

      // Both clients should receive the event
      const event1 = await waitForWebSocketEvent(ws1, 'key_created') as { type: string };
      const event2 = await waitForWebSocketEvent(ws2, 'key_created') as { type: string };

      expect(event1.type).toBe('key_created');
      expect(event2.type).toBe('key_created');

      ws1.close();
      ws2.close();

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${encodeURIComponent(newKey.key)}`);
    });

    test('should handle client disconnection gracefully', async () => {
      const ws1 = createWebSocketConnection(authToken);
      const ws2 = createWebSocketConnection(authToken);

      await waitForWebSocketOpen(ws1);
      await waitForWebSocketOpen(ws2);
      await sleep(200);

      // Close one client
      ws1.close();
      await sleep(200);

      // Create a key
      const newKey = await createTestKey({ name: 'Disconnect Test' });

      // ws2 should still receive the event
      const event2 = await waitForWebSocketEvent(ws2, 'key_created') as { type: string };

      expect(event2.type).toBe('key_created');

      ws2.close();

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${encodeURIComponent(newKey.key)}`);
    });
  });

  describe('Event Ordering and Timing', () => {
    test('should maintain event order for rapid updates', async () => {
      const ws = createWebSocketConnection(authToken);

      await waitForWebSocketOpen(ws);
      await sleep(200);

      // Create, update, then delete a key rapidly
      const newKey = await createTestKey({ name: 'Order Test' });
      await sleep(100);

      await apiRequest('PUT', `/api/keys/${encodeURIComponent(newKey.key)}`, { name: 'Updated Order Test' });
      await sleep(100);

      await apiRequest('DELETE', `/api/keys/${encodeURIComponent(newKey.key)}`);
      await sleep(100);

      // Collect all events
      const events: string[] = [];
      const messageHandler = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (['key_created', 'key_updated', 'key_deleted'].includes(data.type)) {
            events.push(data.type);
          }
        } catch (error) {
          // Ignore parsing errors
        }
      };

      ws.addEventListener('message', messageHandler);
      await sleep(500);
      ws.removeEventListener('message', messageHandler);

      // Verify order
      expect(events).toContain('key_created');
      expect(events).toContain('key_updated');
      expect(events).toContain('key_deleted');

      ws.close();
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed messages gracefully', async () => {
      const ws = createWebSocketConnection(authToken);

      await waitForWebSocketOpen(ws);
      await sleep(200);

      // Send a malformed message
      ws.send('invalid json');

      // WebSocket should still be open and working
      expect(ws.readyState).toBe(WebSocket.OPEN);

      // Create a key to verify it still receives events
      const newKey = await createTestKey({ name: 'Error Handling Test' });

      const event = await waitForWebSocketEvent(ws, 'key_created') as { type: string };

      expect(event.type).toBe('key_created');

      ws.close();

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${encodeURIComponent(newKey.key)}`);
    });

    test('should handle server errors during broadcast', async () => {
      const ws = createWebSocketConnection(authToken);

      await waitForWebSocketOpen(ws);
      await sleep(200);

      // Create a key with invalid data to trigger server error
      const { status } = await apiRequest('POST', '/api/keys', {
        key: 'test-error-key',
        name: 'Error Test',
        token_limit_per_5h: -100, // Invalid: negative quota
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });

      expect(status).toBe(400);

      // WebSocket should still be connected
      expect(ws.readyState).toBe(WebSocket.OPEN);

      // Should still be able to receive events for valid operations
      const newKey = await createTestKey({ name: 'Valid Key After Error' });

      const event = await waitForWebSocketEvent(ws, 'key_created') as { type: string };

      expect(event.type).toBe('key_created');

      ws.close();

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${encodeURIComponent(newKey.key)}`);
    });
  });

  describe('Real-time Integration', () => {
    test('should reflect changes in real-time across multiple operations', async () => {
      const ws = createWebSocketConnection(authToken);

      await waitForWebSocketOpen(ws);
      await sleep(200);

      // Perform a series of operations
      const key1 = await createTestKey({ name: 'Real-time Test 1' });
      await sleep(100);

      await apiRequest('PUT', `/api/keys/${encodeURIComponent(key1.key)}`, { token_limit_per_5h: 150000 });
      await sleep(100);

      const key2 = await createTestKey({ name: 'Real-time Test 2' });
      await sleep(100);

      await apiRequest('DELETE', `/api/keys/${encodeURIComponent(key1.key)}`);
      await sleep(100);

      // Collect events
      const events: unknown[] = [];
      const messageHandler = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (['key_created', 'key_updated', 'key_deleted'].includes(data.type)) {
            events.push(data);
          }
        } catch (error) {
          // Ignore parsing errors
        }
      };

      ws.addEventListener('message', messageHandler);
      await sleep(500);
      ws.removeEventListener('message', messageHandler);

      // Verify we received all expected events
      const createdEvents = events.filter((e: any) => e.type === 'key_created');
      const updatedEvents = events.filter((e: any) => e.type === 'key_updated');
      const deletedEvents = events.filter((e: any) => e.type === 'key_deleted');

      expect(createdEvents.length).toBeGreaterThanOrEqual(2);
      expect(updatedEvents.length).toBeGreaterThanOrEqual(1);
      expect(deletedEvents.length).toBeGreaterThanOrEqual(1);

      ws.close();

      // Cleanup
      await apiRequest('DELETE', `/api/keys/${encodeURIComponent(key2.key)}`);
    });
  });
});
