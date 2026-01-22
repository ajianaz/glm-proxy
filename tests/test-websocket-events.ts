#!/usr/bin/env bun
/**
 * Test WebSocket events during API key operations
 */

const API_BASE = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3001/ws';

console.log('Testing WebSocket events during API operations...\n');

// Create WebSocket connection and listen for events
const ws = new WebSocket(WS_URL);
const events: any[] = [];

ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data.toString());
    events.push(data);
    console.log(`📨 WebSocket Event: ${data.type}`);
    if (data.data) {
      console.log(`   Key: ${data.data.key || data.data.name || 'N/A'}`);
    }
  } catch (e) {
    console.log('📨 Raw message:', event.data);
  }
};

// Wait for WebSocket to connect
await new Promise<void>((resolve) => {
  ws.onopen = () => {
    console.log('✓ WebSocket connected\n');
    resolve();
  };
});

// Test 1: Create a key
console.log('Test 1: Creating a new API key...');
const timestamp = Date.now();
const newKey = {
  key: `test-ws-${timestamp}`,
  name: `WS Test Key ${timestamp}`,
  model: 'glm-4.7',
  token_limit_per_5h: 50000,
  expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
};

const createResponse = await fetch(`${API_BASE}/keys`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(newKey),
});

if (createResponse.ok) {
  console.log('✓ Key created successfully');
} else {
  console.log('✗ Failed to create key:', createResponse.status);
}

// Wait a moment for WebSocket event
await new Promise((resolve) => setTimeout(resolve, 500));

// Test 2: Update the key
console.log('\nTest 2: Updating the key...');
const updateResponse = await fetch(`${API_BASE}/keys/${encodeURIComponent(newKey.key)}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Updated WS Test Key' }),
});

if (updateResponse.ok) {
  console.log('✓ Key updated successfully');
} else {
  console.log('✗ Failed to update key:', updateResponse.status);
}

// Wait a moment for WebSocket event
await new Promise((resolve) => setTimeout(resolve, 500));

// Test 3: Delete the key
console.log('\nTest 3: Deleting the key...');
const deleteResponse = await fetch(`${API_BASE}/keys/${encodeURIComponent(newKey.key)}`, {
  method: 'DELETE',
});

if (deleteResponse.ok) {
  console.log('✓ Key deleted successfully');
} else {
  console.log('✗ Failed to delete key:', deleteResponse.status);
}

// Wait a moment for WebSocket event
await new Promise((resolve) => setTimeout(resolve, 500));

// Summary
console.log('\n' + '='.repeat(60));
console.log('WebSocket Events Received:');
console.log('='.repeat(60));
console.log(`Total events: ${events.length}`);
events.forEach((e, i) => {
  console.log(`${i + 1}. ${e.type} at ${e.timestamp}`);
});

// Check for expected events
const eventTypes = events.map((e) => e.type);
console.log('\nEvent Type Checks:');
console.log(`  connected event: ${eventTypes.includes('connected') ? '✓' : '✗'}`);
console.log(`  key_created event: ${eventTypes.includes('key_created') ? '✓' : '✗'}`);
console.log(`  key_updated event: ${eventTypes.includes('key_updated') ? '✓' : '✗'}`);
console.log(`  key_deleted event: ${eventTypes.includes('key_deleted') ? '✓' : '✗'}`);

ws.close();
console.log('\n✓ Test complete');
