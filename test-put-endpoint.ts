/**
 * Test script for PUT /api/keys/:id endpoint
 *
 * Tests various scenarios for updating API keys
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

async function testPutEndpoint() {
  logTest('PUT /api/keys/:id Endpoint Tests');

  // First, create a test key to update
  let testKeyId: string;

  try {
    logTest('Setup: Creating test API key');
    const createResponse = await fetch(`${API_BASE}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'test-key-for-put-endpoint',
        name: 'Test Key for PUT',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    if (createResponse.status === 201) {
      const createdKey = await createResponse.json();
      testKeyId = createdKey.key;
      logSuccess(`Test key created: ${testKeyId}`);
    } else {
      const error = await createResponse.json();
      logError(`Failed to create test key: ${JSON.stringify(error)}`);
      return;
    }
  } catch (error) {
    logError(`Error creating test key: ${error}`);
    return;
  }

  // Test 1: Update name
  logTest('Test 1: Update API key name');
  try {
    const response = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(testKeyId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Test Key Name' }),
    });

    if (response.status === 200) {
      const updatedKey = await response.json();
      logSuccess('Name updated successfully');
      logInfo(`New name: ${updatedKey.name}`);
      if (updatedKey.name === 'Updated Test Key Name') {
        logSuccess('Name verification passed');
      } else {
        logError('Name verification failed');
      }
    } else {
      const error = await response.json();
      logError(`Update failed with status ${response.status}: ${JSON.stringify(error)}`);
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 2: Update quota
  logTest('Test 2: Update token limit');
  try {
    const response = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(testKeyId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_limit_per_5h: 250000 }),
    });

    if (response.status === 200) {
      const updatedKey = await response.json();
      logSuccess('Token limit updated successfully');
      logInfo(`New limit: ${updatedKey.token_limit_per_5h}`);
      if (updatedKey.token_limit_per_5h === 250000) {
        logSuccess('Token limit verification passed');
      } else {
        logError('Token limit verification failed');
      }
    } else {
      const error = await response.json();
      logError(`Update failed with status ${response.status}: ${JSON.stringify(error)}`);
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 3: Update expiry date
  logTest('Test 3: Update expiry date');
  const newExpiryDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const response = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(testKeyId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiry_date: newExpiryDate }),
    });

    if (response.status === 200) {
      const updatedKey = await response.json();
      logSuccess('Expiry date updated successfully');
      logInfo(`New expiry: ${updatedKey.expiry_date}`);
      if (updatedKey.expiry_date === newExpiryDate) {
        logSuccess('Expiry date verification passed');
      } else {
        logError('Expiry date verification failed');
      }
    } else {
      const error = await response.json();
      logError(`Update failed with status ${response.status}: ${JSON.stringify(error)}`);
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 4: Update model
  logTest('Test 4: Update model');
  try {
    const response = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(testKeyId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'glm-4.7' }),
    });

    if (response.status === 200) {
      const updatedKey = await response.json();
      logSuccess('Model updated successfully');
      logInfo(`New model: ${updatedKey.model}`);
      if (updatedKey.model === 'glm-4.7') {
        logSuccess('Model verification passed');
      } else {
        logError('Model verification failed');
      }
    } else {
      const error = await response.json();
      logError(`Update failed with status ${response.status}: ${JSON.stringify(error)}`);
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 5: Update multiple fields
  logTest('Test 5: Update multiple fields');
  try {
    const response = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(testKeyId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Multi-Updated Key',
        token_limit_per_5h: 500000,
        model: 'glm-4',
      }),
    });

    if (response.status === 200) {
      const updatedKey = await response.json();
      logSuccess('Multiple fields updated successfully');
      logInfo(`Name: ${updatedKey.name}`);
      logInfo(`Limit: ${updatedKey.token_limit_per_5h}`);
      logInfo(`Model: ${updatedKey.model}`);
      if (updatedKey.name === 'Multi-Updated Key' &&
          updatedKey.token_limit_per_5h === 500000 &&
          updatedKey.model === 'glm-4') {
        logSuccess('All fields verification passed');
      } else {
        logError('Fields verification failed');
      }
    } else {
      const error = await response.json();
      logError(`Update failed with status ${response.status}: ${JSON.stringify(error)}`);
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 6: Update non-existent key (should return 404)
  logTest('Test 6: Update non-existent key (should fail with 404)');
  try {
    const response = await fetch(`${API_BASE}/api/keys/non-existent-key-id`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
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

  // Test 7: Invalid field type (should return 400)
  logTest('Test 7: Invalid field type (should fail with 400)');
  try {
    const response = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(testKeyId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_limit_per_5h: 'not-a-number' }),
    });

    if (response.status === 400) {
      logSuccess('Correctly rejected invalid field type');
      const error = await response.json();
      logInfo(`Error message: ${error.message || error.error}`);
    } else {
      logError(`Expected 400 but got status ${response.status}`);
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 8: Empty update (should return 400)
  logTest('Test 8: Empty update - no fields to update (should fail with 400)');
  try {
    const response = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(testKeyId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (response.status === 400) {
      logSuccess('Correctly rejected empty update');
      const error = await response.json();
      logInfo(`Error message: ${error.message || error.error}`);
    } else {
      logError(`Expected 400 but got status ${response.status}`);
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 9: Invalid name format (should return 400)
  logTest('Test 9: Invalid name format (should fail with 400)');
  try {
    const response = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(testKeyId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Invalid@#$%Name' }),
    });

    if (response.status === 400) {
      logSuccess('Correctly rejected invalid name format');
      const error = await response.json();
      logInfo(`Error message: ${error.message || error.error}`);
    } else {
      logError(`Expected 400 but got status ${response.status}`);
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 10: Negative quota (should return 400)
  logTest('Test 10: Negative quota (should fail with 400)');
  try {
    const response = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(testKeyId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_limit_per_5h: -100 }),
    });

    if (response.status === 400) {
      logSuccess('Correctly rejected negative quota');
      const error = await response.json();
      logInfo(`Error message: ${error.message || error.error}`);
    } else {
      logError(`Expected 400 but got status ${response.status}`);
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 11: Invalid expiry date format (should return 400)
  logTest('Test 11: Invalid expiry date format (should fail with 400)');
  try {
    const response = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(testKeyId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiry_date: 'invalid-date' }),
    });

    if (response.status === 400) {
      logSuccess('Correctly rejected invalid expiry date');
      const error = await response.json();
      logInfo(`Error message: ${error.message || error.error}`);
    } else {
      logError(`Expected 400 but got status ${response.status}`);
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 12: Special characters in key ID (URL encoding test)
  logTest('Test 12: Special characters in key ID (URL encoding)');
  try {
    // Create a key with special characters
    const createResponse = await fetch(`${API_BASE}/api/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'test-key-with-special-chars-123',
        name: 'Special Chars Key',
        model: 'glm-4',
        token_limit_per_5h: 100000,
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });

    if (createResponse.status === 201) {
      const createdKey = await createResponse.json();
      const specialKeyId = createdKey.key;

      // Try to update it
      const updateResponse = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(specialKeyId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Special Chars Name' }),
      });

      if (updateResponse.status === 200) {
        const updatedKey = await updateResponse.json();
        logSuccess('Special characters in key ID handled correctly');
        logInfo(`Updated name: ${updatedKey.name}`);
      } else {
        logError(`Update failed with status ${updateResponse.status}`);
      }
    } else {
      logError('Failed to create test key with special characters');
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 13: Verify key cannot be changed
  logTest('Test 13: Attempt to change key field (should fail with 400)');
  try {
    const response = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(testKeyId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'different-key-value' }),
    });

    if (response.status === 400) {
      logSuccess('Correctly rejected attempt to change key field');
      const error = await response.json();
      logInfo(`Error message: ${error.message || error.error}`);
    } else {
      logError(`Expected 400 but got status ${response.status}`);
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Test 14: Very long name (should fail with 400)
  logTest('Test 14: Very long name (should fail with 400)');
  try {
    const longName = 'a'.repeat(101); // Exceeds 100 character limit
    const response = await fetch(`${API_BASE}/api/keys/${encodeURIComponent(testKeyId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: longName }),
    });

    if (response.status === 400) {
      logSuccess('Correctly rejected name exceeding 100 characters');
      const error = await response.json();
      logInfo(`Error message: ${error.message || error.error}`);
    } else {
      logError(`Expected 400 but got status ${response.status}`);
    }
  } catch (error) {
    logError(`Error: ${error}`);
  }

  // Cleanup: Delete test keys
  logTest('Cleanup: Deleting test keys');
  try {
    await fetch(`${API_BASE}/api/keys/${encodeURIComponent(testKeyId)}`, {
      method: 'DELETE',
    });
    logSuccess('Test key deleted');
  } catch (error) {
    logError('Failed to delete test key');
  }

  try {
    await fetch(`${API_BASE}/api/keys/test-key-with-special-chars-123`, {
      method: 'DELETE',
    });
    logSuccess('Special chars test key deleted');
  } catch (error) {
    logError('Failed to delete special chars test key');
  }

  logTest('All PUT endpoint tests completed!');
}

// Run tests
testPutEndpoint().catch(console.error);
