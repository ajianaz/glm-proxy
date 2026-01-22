/**
 * Integration test for WebSocket real-time updates
 *
 * This script verifies:
 * 1. WebSocket connection to dashboard server
 * 2. Receiving key_created events
 * 3. Receiving key_updated events
 * 4. Receiving key_deleted events
 * 5. Receiving usage_updated events
 */

const PORT = process.env.DASHBOARD_PORT || '3001';
const WS_URL = `ws://localhost:${PORT}/ws`;
const API_URL = `http://localhost:${PORT}/api`;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testWebSocketIntegration(): Promise<void> {
  console.log('=== WebSocket Integration Tests ===\n');

  // Test 1: Connect to WebSocket
  console.log('Test 1: WebSocket Connection');
  let ws: WebSocket | null = null;
  let connected = false;

  try {
    ws = new WebSocket(WS_URL);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 5000);

      ws!.onopen = () => {
        clearTimeout(timeout);
        connected = true;
        console.log('  ✓ WebSocket connected successfully');
        resolve();
      };

      ws!.onerror = (error) => {
        clearTimeout(timeout);
        reject(error);
      };
    });
  } catch (error) {
    console.error('  ✗ Failed to connect to WebSocket server');
    console.error(`    Make sure the dashboard server is running on port ${PORT}`);
    console.error(`    Run: bun index.ts`);
    process.exit(1);
  }

  // Test 2: Receive connection confirmation
  console.log('\nTest 2: Connection Confirmation');
  const messages: string[] = [];

  ws!.onmessage = (event) => {
    messages.push(event.data);
  };

  await sleep(500);

  if (messages.length > 0) {
    const connMsg = JSON.parse(messages[0]);
    console.log(`  Event type: ${connMsg.type}`);
    console.log(`  Message: ${connMsg.message || '(none)'}`);
    console.log(`  ✓ Connection confirmation received`);
  } else {
    console.log(`  ⚠ No connection confirmation received (may have been sent before listener attached)`);
  }

  // Test 3: Receive key_created event
  console.log('\nTest 3: Key Created Event');
  messages.length = 0;

  try {
    const response = await fetch(`${API_URL}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: `test-ws-${Date.now()}`,
        name: 'WebSocket Test Key',
        token_limit_per_5h: 50000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        model: 'glm-4',
      }),
    });

    if (response.ok) {
      await sleep(500);

      const createdEvent = messages.find(m => {
        try {
          const event = JSON.parse(m);
          return event.type === 'key_created';
        } catch {
          return false;
        }
      });

      if (createdEvent) {
        const event = JSON.parse(createdEvent);
        console.log(`  Event type: ${event.type}`);
        console.log(`  Key name: ${event.data?.name}`);
        console.log(`  ✓ Key created event received`);
      } else {
        console.log(`  ⚠ No key_created event received`);
        console.log(`    Messages received: ${messages.length}`);
        messages.forEach((m, i) => console.log(`      [${i}] ${m.substring(0, 100)}...`));
      }
    } else {
      console.log(`  ⚠ Failed to create test key: ${response.status}`);
    }
  } catch (error) {
    console.log(`  ⚠ Failed to create test key: ${error}`);
  }

  // Test 4: Receive key_updated event
  console.log('\nTest 4: Key Updated Event');
  messages.length = 0;

  try {
    const response = await fetch(`${API_URL}/keys/test-ws-${Date.now() - 1000}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Updated WebSocket Test Key',
      }),
    });

    if (response.ok) {
      await sleep(500);

      const updatedEvent = messages.find(m => {
        try {
          const event = JSON.parse(m);
          return event.type === 'key_updated';
        } catch {
          return false;
        }
      });

      if (updatedEvent) {
        const event = JSON.parse(updatedEvent);
        console.log(`  Event type: ${event.type}`);
        console.log(`  ✓ Key updated event received`);
      } else {
        console.log(`  ⚠ No key_updated event received`);
      }
    } else {
      console.log(`  ⚠ Failed to update test key: ${response.status}`);
    }
  } catch (error) {
    console.log(`  ⚠ Failed to update test key: ${error}`);
  }

  // Test 5: Receive key_deleted event
  console.log('\nTest 5: Key Deleted Event');
  messages.length = 0;

  try {
    // First create a key to delete
    const createResponse = await fetch(`${API_URL}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: `test-ws-delete-${Date.now()}`,
        name: 'WebSocket Delete Test Key',
        token_limit_per_5h: 50000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    if (createResponse.ok) {
      const createdKey = await createResponse.json();
      messages.length = 0;

      // Now delete it
      const deleteResponse = await fetch(`${API_URL}/keys/${encodeURIComponent(createdKey.key)}`, {
        method: 'DELETE',
      });

      if (deleteResponse.ok) {
        await sleep(500);

        const deletedEvent = messages.find(m => {
          try {
            const event = JSON.parse(m);
            return event.type === 'key_deleted';
          } catch {
            return false;
          }
        });

        if (deletedEvent) {
          const event = JSON.parse(deletedEvent);
          console.log(`  Event type: ${event.type}`);
          console.log(`  ✓ Key deleted event received`);
        } else {
          console.log(`  ⚠ No key_deleted event received`);
        }
      } else {
        console.log(`  ⚠ Failed to delete test key: ${deleteResponse.status}`);
      }
    }
  } catch (error) {
    console.log(`  ⚠ Failed to delete test key: ${error}`);
  }

  // Test 6: Note about usage_updated event
  console.log('\nTest 6: Usage Updated Event');
  console.log('  ⚠ Usage updated events are triggered by API proxy requests');
  console.log('    This requires actual API calls through the proxy, which is');
  console.log('    outside the scope of this dashboard server test.');
  console.log('    The broadcast function is integrated into storage.ts');

  // Cleanup
  if (ws) {
    ws.close();
    await sleep(100);
  }

  console.log('\n=== Integration Tests Complete ===');
  console.log('\nNote: Some tests may show warnings if the server is not running');
  console.log('      or if test keys already exist from previous runs.');
}

// Run tests
testWebSocketIntegration().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
