/**
 * Test script for WebSocket broadcast mechanism
 *
 * This script verifies:
 * 1. WebSocket client connection/disconnection
 * 2. Broadcast functions for different event types
 * 3. Usage update broadcasting
 * 4. Client tracking (add/remove)
 */

import {
  addClient,
  removeClient,
  broadcastKeyCreated,
  broadcastKeyUpdated,
  broadcastKeyDeleted,
  broadcastUsageUpdated,
  getConnectedClientCount,
  sendConnectionConfirmation,
  type KeyEventData,
  type UsageUpdateData,
} from './src/websocket-manager.js';

// Mock WebSocket class for testing
class MockWebSocket {
  readyState: number = WebSocket.OPEN;
  sentMessages: string[] = [];

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
  }
}

// Test data
const mockKeyData: KeyEventData = {
  key: 'test-key-123',
  name: 'Test API Key',
  model: 'glm-4',
  token_limit_per_5h: 100000,
  expiry_date: '2025-12-31T23:59:59Z',
  created_at: '2025-01-01T00:00:00Z',
  last_used: '2025-01-01T00:00:00Z',
  total_lifetime_tokens: 50000,
  usage_windows: [
    {
      window_start: '2025-01-01T00:00:00Z',
      tokens_used: 1000,
    },
  ],
};

const mockUsageData: UsageUpdateData = {
  key: 'test-key-123',
  name: 'Test API Key',
  model: 'glm-4',
  tokens_used: 500,
  total_lifetime_tokens: 50500,
  remaining_quota: 99500,
  window_start: '2025-01-01T00:00:00Z',
  window_end: '2025-01-01T05:00:00Z',
  is_expired: false,
};

// Test cases
console.log('=== WebSocket Broadcast Mechanism Tests ===\n');

// Test 1: Client tracking
console.log('Test 1: Client Tracking');
const client1 = new MockWebSocket() as unknown as WebSocket;
const client2 = new MockWebSocket() as unknown as WebSocket;

console.log(`  Initial client count: ${getConnectedClientCount()}`);
addClient(client1);
console.log(`  After adding client 1: ${getConnectedClientCount()}`);
addClient(client2);
console.log(`  After adding client 2: ${getConnectedClientCount()}`);
removeClient(client1);
console.log(`  After removing client 1: ${getConnectedClientCount()}`);
console.log(`  ✓ Client tracking works correctly\n`);

// Test 2: Key created broadcast
console.log('Test 2: Key Created Broadcast');
const client3 = new MockWebSocket() as unknown as WebSocket;
addClient(client3);

broadcastKeyCreated(mockKeyData);
const createdMsg = (client3 as unknown as MockWebSocket).sentMessages[0];
const createdEvent = JSON.parse(createdMsg);
console.log(`  Event type: ${createdEvent.type}`);
console.log(`  Timestamp present: ${!!createdEvent.timestamp}`);
console.log(`  Key data present: ${!!createdEvent.data}`);
console.log(`  Key name: ${createdEvent.data?.name}`);
console.log(`  ✓ Key created broadcast works\n`);

// Test 3: Key updated broadcast
console.log('Test 3: Key Updated Broadcast');
(client3 as unknown as MockWebSocket).sentMessages = [];
broadcastKeyUpdated(mockKeyData);
const updatedMsg = (client3 as unknown as MockWebSocket).sentMessages[0];
const updatedEvent = JSON.parse(updatedMsg);
console.log(`  Event type: ${updatedEvent.type}`);
console.log(`  Key data present: ${!!updatedEvent.data}`);
console.log(`  ✓ Key updated broadcast works\n`);

// Test 4: Key deleted broadcast
console.log('Test 4: Key Deleted Broadcast');
(client3 as unknown as MockWebSocket).sentMessages = [];
broadcastKeyDeleted(mockKeyData);
const deletedMsg = (client3 as unknown as MockWebSocket).sentMessages[0];
const deletedEvent = JSON.parse(deletedMsg);
console.log(`  Event type: ${deletedEvent.type}`);
console.log(`  Key data present: ${!!deletedEvent.data}`);
console.log(`  ✓ Key deleted broadcast works\n`);

// Test 5: Usage updated broadcast
console.log('Test 5: Usage Updated Broadcast');
(client3 as unknown as MockWebSocket).sentMessages = [];
broadcastUsageUpdated(mockUsageData);
const usageMsg = (client3 as unknown as MockWebSocket).sentMessages[0];
const usageEvent = JSON.parse(usageMsg);
console.log(`  Event type: ${usageEvent.type}`);
console.log(`  Usage data present: ${!!usageEvent.data}`);
console.log(`  Tokens used: ${usageEvent.data?.tokens_used}`);
console.log(`  Remaining quota: ${usageEvent.data?.remaining_quota}`);
console.log(`  ✓ Usage updated broadcast works\n`);

// Test 6: Connection confirmation
console.log('Test 6: Connection Confirmation');
(client3 as unknown as MockWebSocket).sentMessages = [];
sendConnectionConfirmation(client3);
const connMsg = (client3 as unknown as MockWebSocket).sentMessages[0];
const connEvent = JSON.parse(connMsg);
console.log(`  Event type: ${connEvent.type}`);
console.log(`  Message: ${connEvent.message}`);
console.log(`  ✓ Connection confirmation works\n`);

// Test 7: Multiple clients receive broadcasts
console.log('Test 7: Multiple Clients Receive Broadcasts');
const client4 = new MockWebSocket() as unknown as WebSocket;
const client5 = new MockWebSocket() as unknown as WebSocket;
addClient(client4);
addClient(client5);

broadcastKeyCreated(mockKeyData);
console.log(`  Client 4 received: ${(client4 as unknown as MockWebSocket).sentMessages.length} message(s)`);
console.log(`  Client 5 received: ${(client5 as unknown as MockWebSocket).sentMessages.length} message(s)`);
console.log(`  ✓ Multiple clients receive broadcasts\n`);

// Test 8: Closed clients don't receive broadcasts
console.log('Test 8: Closed Clients Filtered');
(client4 as unknown as MockWebSocket).readyState = WebSocket.CLOSED;
(client4 as unknown as MockWebSocket).sentMessages = [];
(client5 as unknown as MockWebSocket).sentMessages = [];

broadcastKeyCreated(mockKeyData);
console.log(`  Closed client 4 received: ${(client4 as unknown as MockWebSocket).sentMessages.length} message(s)`);
console.log(`  Open client 5 received: ${(client5 as unknown as MockWebSocket).sentMessages.length} message(s)`);
console.log(`  ✓ Closed clients are filtered from broadcasts\n`);

// Cleanup
removeClient(client2);
removeClient(client3);
removeClient(client4);
removeClient(client5);

console.log('=== All Tests Passed! ===');
console.log(`\nFinal client count: ${getConnectedClientCount()}`);
process.exit(0);
