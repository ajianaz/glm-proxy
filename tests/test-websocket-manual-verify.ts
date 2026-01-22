#!/usr/bin/env bun
/**
 * Quick WebSocket connection test
 */

const WS_URL = 'ws://localhost:3001/ws';

console.log('Testing WebSocket connection to', WS_URL);

try {
  const ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('✓ WebSocket connected successfully');

    // Send a test message
    ws.send(JSON.stringify({ type: 'ping' }));
    console.log('✓ Sent ping message');

    // Close after a short delay
    setTimeout(() => {
      ws.close();
      console.log('✓ WebSocket connection closed');
      process.exit(0);
    }, 1000);
  };

  ws.onmessage = (event) => {
    console.log('✓ Received message:', event.data);
    try {
      const data = JSON.parse(event.data.toString());
      console.log('  Parsed:', JSON.stringify(data, null, 2));
    } catch (e) {
      console.log('  Raw:', event.data);
    }
  };

  ws.onerror = (error) => {
    console.error('✗ WebSocket error:', error);
    process.exit(1);
  };

  ws.onclose = (event) => {
    console.log('✓ WebSocket closed:', event.code, event.reason);
    process.exit(0);
  };

  // Set timeout
  setTimeout(() => {
    console.error('✗ WebSocket connection timeout');
    process.exit(1);
  }, 5000);
} catch (error) {
  console.error('✗ Error creating WebSocket:', error);
  process.exit(1);
}
