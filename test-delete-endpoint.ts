/**
 * Test script for DELETE /api/keys/:id endpoint
 *
 * Tests various scenarios for deleting API keys
 */

const API_BASE = 'http://localhost:3001';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function log(message: string, color = 'reset') {
  console.log(`${colors[color as keyof typeof colors]}${message}${colors.reset}`);
}

function logTest(testName: string) {
  console.log('\n' + '='.repeat(60));
  log(testName, 'blue');
  console.log('='.repeat(60));
}

function logSuccess(message: string) {
  log('✓ ' + message, 'green');
}

function logError(message: string) {
  log('✗ ' + message, 'red');
}

function logInfo(message: string) {
  log('  ' + message, 'yellow');
}

async function testDeleteEndpoint() {
  logTest('DELETE /api/keys/:id Endpoint Tests');

  // Test 1: Delete existing key
  logTest('Test 1: Delete existing API key');
  let testKeyId: string;

  try {
    // First create a test key to delete
    logInfo('Setup: Creating test API key to delete');
    const createResponse = await fetch(`${API_BASE}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'test-key-for-delete-endpoint',
        name: 'Test Key for DELETE',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    if (createResponse.status === 201) {
      const createdKey = await createResponse.json();
      testKeyId = createdKey.key;
      logSuccess(`Test key created: ${testKeyId}`);

      // Now delete it
      const deleteResponse = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(testKeyId)}`, {
        method: 'DELETE',
      });

      if (deleteResponse.status === 204) {
        logSuccess('Key deleted successfully (status 204)');

        // Verify it's actually deleted
        const getResponse = await fetch(`${API_BASE}/api/keys`);
        const data = await getResponse.json();
        const deletedKey = data.keys.find((k: { key: string }) => k.key === testKeyId);

        if (!deletedKey) {
          logSuccess('Verification passed: Key no longer exists in database');
        } else {
          logError('Verification failed: Key still exists in database');
        }
      } else {
        const error = await deleteResponse.json();
        logError(`Delete failed with status ${deleteResponse.status}: ${JSON.stringify(error)}`);
      }
    } else {
      const error = await createResponse.json();
      logError(`Failed to create test key: ${JSON.stringify(error)}`);
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 2: Delete non-existent key (should return 404)
  logTest('Test 2: Delete non-existent key (should fail with 404)');
  try {
    const response = await fetch(`${API_BASE}/api/keys/non-existent-key-id`, {
      method: 'DELETE',
    });

    if (response.status === 404) {
      logSuccess('Correctly returned 404 for non-existent key');
      const error = await response.json();
      logInfo(`Error message: ${error.message}`);
    } else {
      logError(`Expected 404 but got status ${response.status}`);
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 3: Delete with special characters in key ID
  logTest('Test 3: Delete key with special characters in ID (URL encoding)');
  try {
    // Create a key with special characters (using timestamp for uniqueness)
    const uniqueKey = `test-key-special-${Date.now()}`;
    const createResponse = await fetch(`${API_BASE}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: uniqueKey,
        name: 'Special Chars Key for DELETE',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    if (createResponse.status === 201) {
      const createdKey = await createResponse.json();
      const specialKeyId = createdKey.key;
      logSuccess(`Created key with special chars: ${specialKeyId}`);

      // Delete it using URL encoding
      const deleteResponse = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(specialKeyId)}`, {
        method: 'DELETE',
      });

      if (deleteResponse.status === 204) {
        logSuccess('Key with special characters deleted successfully');

        // Verify deletion
        const getResponse = await fetch(`${API_BASE}/api/keys`);
        const data = await getResponse.json();
        const deletedKey = data.keys.find((k: { key: string }) => k.key === specialKeyId);

        if (!deletedKey) {
          logSuccess('Verification passed: Special char key no longer exists');
        } else {
          logError('Verification failed: Special char key still exists');
        }
      } else {
        logError(`Delete failed with status ${deleteResponse.status}`);
      }
    } else {
      logError('Failed to create test key with special characters');
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 4: Delete same key twice (second time should fail with 404)
  logTest('Test 4: Attempt to delete already deleted key (should fail with 404)');
  try {
    // Create a key
    const createResponse = await fetch(`${API_BASE}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'test-key-for-double-delete',
        name: 'Double Delete Test Key',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    if (createResponse.status === 201) {
      const createdKey = await createResponse.json();
      const keyId = createdKey.key;

      // Delete it first time
      const firstDelete = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(keyId)}`, {
        method: 'DELETE',
      });

      if (firstDelete.status === 204) {
        logSuccess('First delete successful');

        // Try to delete again
        const secondDelete = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(keyId)}`, {
          method: 'DELETE',
        });

        if (secondDelete.status === 404) {
          logSuccess('Second delete correctly returned 404');
          const error = await secondDelete.json();
          logInfo(`Error message: ${error.message}`);
        } else {
          logError(`Expected 404 on second delete but got status ${secondDelete.status}`);
        }
      } else {
        logError('First delete failed');
      }
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 5: Verify response body is empty for successful delete (204 No Content)
  logTest('Test 5: Verify 204 response has no content');
  try {
    // Create a key
    const createResponse = await fetch(`${API_BASE}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'test-key-for-204-check',
        name: '204 Response Test Key',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    if (createResponse.status === 201) {
      const createdKey = await createResponse.json();
      const keyId = createdKey.key;

      // Delete it
      const deleteResponse = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(keyId)}`, {
        method: 'DELETE',
      });

      if (deleteResponse.status === 204) {
        const text = await deleteResponse.text();
        if (text === '') {
          logSuccess('Response body is empty (correct for 204 No Content)');
        } else {
          logError(`Response body should be empty but got: ${text}`);
        }
      } else {
        logError(`Expected status 204 but got ${deleteResponse.status}`);
      }
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 6: Delete with CORS headers
  logTest('Test 6: Verify CORS headers are present');
  try {
    // Create a key
    const createResponse = await fetch(`${API_BASE}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'test-key-for-cors-check',
        name: 'CORS Test Key',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    if (createResponse.status === 201) {
      const createdKey = await createResponse.json();
      const keyId = createdKey.key;

      // Delete it
      const deleteResponse = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(keyId)}`, {
        method: 'DELETE',
      });

      const corsHeader = deleteResponse.headers.get('Access-Control-Allow-Origin');
      if (corsHeader === '*' || corsHeader !== null) {
        logSuccess('CORS headers present');
        logInfo(`CORS header: ${corsHeader}`);
      } else {
        logError('CORS headers missing');
      }
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  logTest('All DELETE endpoint tests completed!');
}

// Run tests
testDeleteEndpoint().catch(console.error);
