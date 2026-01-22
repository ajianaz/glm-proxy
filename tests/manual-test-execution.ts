#!/usr/bin/env bun
/**
 * Manual UI Test Execution Script
 * Tests all user flows for the API Key Management Dashboard
 */

const BASE_URL = 'http://localhost:3001';
const API_BASE = `${BASE_URL}/api`;

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  details?: any;
}

const results: TestResult[] = [];

// Helper function to make API requests
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return {
    ok: response.ok,
    status: response.status,
    data: response.ok ? await response.json() : await response.text(),
  };
}

// Helper to record test result
function recordTest(name: string, status: 'pass' | 'fail' | 'skip', message: string, details?: any) {
  const result: TestResult = { name, status, message, details };
  results.push(result);
  const icon = status === 'pass' ? '✓' : status === 'fail' ? '✗' : '○';
  console.log(`${icon} ${name}: ${message}`);
  if (details && status === 'fail') {
    console.log('  Details:', JSON.stringify(details, null, 2));
  }
}

// Test: Health check - verify server is running
async function testServerHealth() {
  try {
    const response = await fetch(BASE_URL);
    recordTest(
      'Server Health',
      response.ok ? 'pass' : 'fail',
      response.ok ? 'Server is running' : `Server returned ${response.status}`
    );
  } catch (error: any) {
    recordTest('Server Health', 'fail', 'Server not accessible', { error: error.message });
  }
}

// Test: GET /api/keys - List all keys
async function testListKeys() {
  try {
    const result = await apiRequest('/keys');
    if (result.ok && Array.isArray(result.data.keys)) {
      recordTest('List API Keys', 'pass', `Retrieved ${result.data.keys.length} keys`, {
        count: result.data.keys.length,
      });
    } else {
      recordTest('List API Keys', 'fail', 'Invalid response format', result);
    }
  } catch (error: any) {
    recordTest('List API Keys', 'fail', error.message, { error: error.message });
  }
}

// Test: POST /api/keys - Create new key
async function testCreateKey() {
  const timestamp = Date.now();
  const newKey = {
    key: `test-key-${timestamp}`,
    name: `Manual Test Key ${timestamp}`,
    model: 'glm-4.7',
    token_limit_per_5h: 50000,
    expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  try {
    const result = await apiRequest('/keys', {
      method: 'POST',
      body: JSON.stringify(newKey),
    });

    if (result.ok && result.data.key === newKey.key) {
      recordTest('Create API Key', 'pass', 'Key created successfully', { key: newKey.key });
      return newKey.key; // Return for cleanup
    } else {
      recordTest('Create API Key', 'fail', 'Failed to create key', result);
      return null;
    }
  } catch (error: any) {
    recordTest('Create API Key', 'fail', error.message, { error: error.message });
    return null;
  }
}

// Test: Validation - Missing required fields
async function testValidationMissingFields() {
  const invalidKey = {
    key: 'test-incomplete',
    // Missing name, token_limit_per_5h, expiry_date
  };

  try {
    const result = await apiRequest('/keys', {
      method: 'POST',
      body: JSON.stringify(invalidKey),
    });

    if (!result.ok && result.status === 400) {
      recordTest(
        'Validation: Missing Fields',
        'pass',
        'Correctly rejected incomplete data',
        result.data
      );
    } else {
      recordTest('Validation: Missing Fields', 'fail', 'Should have returned 400', result);
    }
  } catch (error: any) {
    recordTest('Validation: Missing Fields', 'fail', error.message);
  }
}

// Test: Validation - Invalid key format
async function testValidationInvalidKeyFormat() {
  const invalidKey = {
    key: 'test key with spaces',
    name: 'Invalid Key Test',
    token_limit_per_5h: 50000,
    expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  try {
    const result = await apiRequest('/keys', {
      method: 'POST',
      body: JSON.stringify(invalidKey),
    });

    if (!result.ok && result.status === 400) {
      recordTest(
        'Validation: Invalid Key Format',
        'pass',
        'Correctly rejected key with spaces',
        result.data
      );
    } else {
      recordTest('Validation: Invalid Key Format', 'fail', 'Should have returned 400', result);
    }
  } catch (error: any) {
    recordTest('Validation: Invalid Key Format', 'fail', error.message);
  }
}

// Test: Validation - Negative token limit
async function testValidationNegativeQuota() {
  const invalidKey = {
    key: `test-negative-${Date.now()}`,
    name: 'Negative Quota Test',
    token_limit_per_5h: -1000,
    expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  try {
    const result = await apiRequest('/keys', {
      method: 'POST',
      body: JSON.stringify(invalidKey),
    });

    if (!result.ok && result.status === 400) {
      recordTest('Validation: Negative Quota', 'pass', 'Correctly rejected negative quota', result.data);
    } else {
      recordTest('Validation: Negative Quota', 'fail', 'Should have returned 400', result);
    }
  } catch (error: any) {
    recordTest('Validation: Negative Quota', 'fail', error.message);
  }
}

// Test: Validation - Past expiry date
async function testValidationPastExpiry() {
  const invalidKey = {
    key: `test-past-${Date.now()}`,
    name: 'Past Expiry Test',
    token_limit_per_5h: 50000,
    expiry_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
  };

  try {
    const result = await apiRequest('/keys', {
      method: 'POST',
      body: JSON.stringify(invalidKey),
    });

    if (!result.ok && result.status === 400) {
      recordTest('Validation: Past Expiry Date', 'pass', 'Correctly rejected past date', result.data);
    } else {
      recordTest('Validation: Past Expiry Date', 'fail', 'Should have returned 400', result);
    }
  } catch (error: any) {
    recordTest('Validation: Past Expiry Date', 'fail', error.message);
  }
}

// Test: PUT /api/keys/:id - Update key
async function testUpdateKey(keyId: string) {
  if (!keyId) {
    recordTest('Update API Key', 'skip', 'No valid key to update');
    return;
  }

  const updates = {
    name: 'Updated Manual Test Key',
    token_limit_per_5h: 75000,
  };

  try {
    const result = await apiRequest(`/keys/${encodeURIComponent(keyId)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });

    if (result.ok && result.data.name === updates.name) {
      recordTest('Update API Key', 'pass', 'Key updated successfully', updates);
    } else {
      recordTest('Update API Key', 'fail', 'Failed to update key', result);
    }
  } catch (error: any) {
    recordTest('Update API Key', 'fail', error.message);
  }
}

// Test: GET /api/keys with sorting
async function testSorting() {
  try {
    const result = await apiRequest('/keys?sort_by=name&sort_order=asc');

    if (result.ok && Array.isArray(result.data.keys)) {
      const names = result.data.keys.map((k: any) => k.name);
      const isSorted = names.every((name: string, i: number) => {
        return i === 0 || name >= names[i - 1];
      });

      if (isSorted) {
        recordTest('Sorting: Name ASC', 'pass', 'Keys sorted correctly by name');
      } else {
        recordTest('Sorting: Name ASC', 'fail', 'Keys not sorted correctly', { names });
      }
    } else {
      recordTest('Sorting: Name ASC', 'fail', 'Invalid response', result);
    }
  } catch (error: any) {
    recordTest('Sorting: Name ASC', 'fail', error.message);
  }
}

// Test: GET /api/keys with filtering
async function testFiltering() {
  try {
    const result = await apiRequest('/keys?filter_model=glm-4.7');

    if (result.ok && Array.isArray(result.data.keys)) {
      const allMatch = result.data.keys.every((k: any) => k.model === 'glm-4.7');
      if (allMatch) {
        recordTest('Filtering: By Model', 'pass', 'Filtered correctly by model');
      } else {
        recordTest('Filtering: By Model', 'fail', 'Some keys do not match filter');
      }
    } else {
      recordTest('Filtering: By Model', 'fail', 'Invalid response', result);
    }
  } catch (error: any) {
    recordTest('Filtering: By Model', 'fail', error.message);
  }
}

// Test: GET /api/keys with search
async function testSearch() {
  try {
    const result = await apiRequest('/keys?search=test');

    if (result.ok && Array.isArray(result.data.keys)) {
      recordTest('Search: By Name/Key', 'pass', `Found ${result.data.keys.length} matching keys`);
    } else {
      recordTest('Search: By Name/Key', 'fail', 'Invalid response', result);
    }
  } catch (error: any) {
    recordTest('Search: By Name/Key', 'fail', error.message);
  }
}

// Test: GET /api/keys/:id/usage - Get usage statistics
async function testGetUsage(keyId: string) {
  if (!keyId) {
    recordTest('Get Usage Statistics', 'skip', 'No valid key to check usage');
    return;
  }

  try {
    const result = await apiRequest(`/keys/${encodeURIComponent(keyId)}/usage`);

    if (result.ok) {
      recordTest('Get Usage Statistics', 'pass', 'Retrieved usage data', result.data);
    } else {
      recordTest('Get Usage Statistics', 'fail', `Failed with status ${result.status}`, result);
    }
  } catch (error: any) {
    recordTest('Get Usage Statistics', 'fail', error.message);
  }
}

// Test: DELETE /api/keys/:id - Delete key
async function testDeleteKey(keyId: string) {
  if (!keyId) {
    recordTest('Delete API Key', 'skip', 'No valid key to delete');
    return;
  }

  try {
    const result = await apiRequest(`/keys/${encodeURIComponent(keyId)}`, {
      method: 'DELETE',
    });

    if (result.status === 204) {
      recordTest('Delete API Key', 'pass', 'Key deleted successfully');

      // Verify it's actually deleted
      const verifyResult = await apiRequest(`/keys/${encodeURIComponent(keyId)}`);
      if (!verifyResult.ok && verifyResult.status === 404) {
        recordTest('Delete: Verify Removal', 'pass', 'Key confirmed deleted');
      } else {
        recordTest('Delete: Verify Removal', 'fail', 'Key still exists after deletion');
      }
    } else {
      recordTest('Delete API Key', 'fail', `Failed with status ${result.status}`, result);
    }
  } catch (error: any) {
    recordTest('Delete API Key', 'fail', error.message);
  }
}

// Test: CORS headers
async function testCORS() {
  try {
    const response = await fetch(`${API_BASE}/keys`, {
      method: 'OPTIONS',
    });

    const corsHeader = response.headers.get('Access-Control-Allow-Origin');
    if (corsHeader) {
      recordTest('CORS Headers', 'pass', 'CORS headers present', {
        'Access-Control-Allow-Origin': corsHeader,
      });
    } else {
      recordTest('CORS Headers', 'fail', 'CORS headers missing');
    }
  } catch (error: any) {
    recordTest('CORS Headers', 'fail', error.message);
  }
}

// Main test runner
async function runTests() {
  console.log('='.repeat(60));
  console.log('Manual UI Test Execution - Backend API Tests');
  console.log('='.repeat(60));
  console.log('');

  let createdKey: string | null = null;

  // Server health
  await testServerHealth();
  console.log('');

  // Basic CRUD operations
  await testListKeys();
  console.log('');

  createdKey = await testCreateKey();
  console.log('');

  // Validation tests
  await testValidationMissingFields();
  await testValidationInvalidKeyFormat();
  await testValidationNegativeQuota();
  await testValidationPastExpiry();
  console.log('');

  // Update operation
  if (createdKey) {
    await testUpdateKey(createdKey);
    console.log('');
  }

  // Filtering and sorting
  await testSorting();
  await testFiltering();
  await testSearch();
  console.log('');

  // Usage statistics
  if (createdKey) {
    await testGetUsage(createdKey);
    console.log('');
  }

  // Delete operation
  if (createdKey) {
    await testDeleteKey(createdKey);
    console.log('');
  }

  // CORS
  await testCORS();
  console.log('');

  // Print summary
  console.log('='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✓ Passed: ${passed}`);
  console.log(`✗ Failed: ${failed}`);
  console.log(`○ Skipped: ${skipped}`);
  console.log('');

  if (failed > 0) {
    console.log('Failed Tests:');
    results
      .filter((r) => r.status === 'fail')
      .forEach((r) => {
        console.log(`  ✗ ${r.name}: ${r.message}`);
      });
    console.log('');
  }

  if (skipped > 0) {
    console.log('Skipped Tests:');
    results
      .filter((r) => r.status === 'skip')
      .forEach((r) => {
        console.log(`  ○ ${r.name}: ${r.message}`);
      });
    console.log('');
  }

  console.log('='.repeat(60));

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
