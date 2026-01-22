/**
 * Manual WebSocket Connection Test
 *
 * This script demonstrates how to connect to the WebSocket endpoint
 * with proper authentication. Run this while the dashboard server is running.
 */

// Test connection with valid credentials
async function testAuthenticatedConnection() {
  console.log('Testing WebSocket connection with authentication...\n');

  // Get auth credentials from environment or use defaults
  const token = process.env.DASHBOARD_AUTH_TOKEN || 'test-token';
  const username = process.env.DASHBOARD_AUTH_USERNAME || 'admin';
  const password = process.env.DASHBOARD_AUTH_PASSWORD || 'secret';

  const port = process.env.DASHBOARD_PORT || '3001';
  const wsUrl = `ws://localhost:${port}/ws`;

  // Test 1: Connection with bearer token via query params
  console.log('Test 1: Connecting with bearer token (query parameter)...');
  const bearerUrl = `${wsUrl}?auth_type=bearer&auth_token=${token}`;
  await testConnection(bearerUrl, 'Bearer Token (Query Param)');

  // Test 2: Connection with basic auth via query params
  console.log('\nTest 2: Connecting with basic auth (query parameter)...');
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  const basicUrl = `${wsUrl}?auth_type=basic&auth_token=${credentials}`;
  await testConnection(basicUrl, 'Basic Auth (Query Param)');

  // Test 3: Connection without auth (should fail if auth is configured)
  console.log('\nTest 3: Connecting without authentication...');
  await testConnection(wsUrl, 'No Authentication');
}

async function testConnection(url: string, label: string) {
  return new Promise<void>((resolve) => {
    const ws = new WebSocket(url);

    const timeout = setTimeout(() => {
      console.log(`  ✗ ${label}: Connection timeout`);
      ws.close();
      resolve();
    }, 5000);

    ws.onopen = () => {
      clearTimeout(timeout);
      console.log(`  ✓ ${label}: Connected successfully!`);
      console.log(`  Waiting for server message...`);

      // Wait a bit to receive any initial messages
      setTimeout(() => {
        ws.close();
        resolve();
      }, 1000);
    };

    ws.onmessage = (event) => {
      clearTimeout(timeout);
      try {
        const data = JSON.parse(event.data);
        console.log(`  ✓ ${label}: Received message:`, JSON.stringify(data, null, 2));
      } catch (err) {
        console.log(`  ✓ ${label}: Received raw message:`, event.data);
      }
    };

    ws.onerror = (error) => {
      clearTimeout(timeout);
      console.log(`  ✗ ${label}: Connection error`);
      resolve();
    };

    ws.onclose = (event) => {
      clearTimeout(timeout);
      if (event.code !== 1000) {
        console.log(`  ✗ ${label}: Connection closed with code ${event.code}`);
      } else {
        console.log(`  ✓ ${label}: Connection closed normally`);
      }
      resolve();
    };
  });
}

// Run the tests
testAuthenticatedConnection().then(() => {
  console.log('\nAll tests completed!');
  process.exit(0);
}).catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
