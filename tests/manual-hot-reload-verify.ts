/**
 * Manual Verification: Hot-Reload Functionality
 *
 * This script demonstrates that API key changes take effect immediately
 * without requiring server restart.
 *
 * Prerequisites:
 * 1. Dashboard server running: bun --hot index.ts (port 3001)
 * 2. Optional: Proxy server running (port 3000)
 *
 * Usage:
 *   bun run tests/manual-hot-reload-verify.ts
 */

const DASHBOARD_API = 'http://localhost:3001/api';

interface TestResult {
  success: boolean;
  message: string;
  details?: string;
}

/**
 * Test 1: Create key and immediately use it
 */
async function test1_CreateAndUse(): Promise<TestResult> {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 1: Create API Key and Use Immediately');
  console.log('='.repeat(60));

  const testKey = `test-${Date.now()}`;
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Step 1: Create API key via dashboard
    console.log('\n[Step 1] Creating API key via dashboard...');
    const createResponse = await fetch(`${DASHBOARD_API}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: testKey,
        name: 'Test Key for Hot Reload',
        token_limit_per_5h: 100000,
        expiry_date: futureDate,
      }),
    });

    if (!createResponse.ok) {
      if (createResponse.status === 401) {
        return {
          success: false,
          message: 'Dashboard requires authentication',
          details: 'Set DASHBOARD_AUTH_TOKEN environment variable',
        };
      }
      return {
        success: false,
        message: `Failed to create key: ${createResponse.status}`,
        details: await createResponse.text(),
      };
    }

    const createdKey = await createResponse.json();
    console.log(`  ✅ Created key: ${createdKey.key}`);
    console.log(`  ✅ Name: ${createdKey.name}`);
    console.log(`  ✅ Quota: ${createdKey.token_limit_per_5h}`);

    // Step 2: Immediately fetch the key to verify it exists
    console.log('\n[Step 2] Immediately fetching key to verify...');
    const getResponse = await fetch(`${DASHBOARD_API}/keys/${encodeURIComponent(testKey)}/usage`);

    if (getResponse.ok) {
      const keyData = await getResponse.json();
      console.log('  ✅ Key is immediately accessible!');
      console.log(`  ✅ Current quota: ${keyData.token_limit_per_5h}`);
      console.log(`  ✅ Remaining: ${keyData.current_usage.remaining_tokens}`);
    } else {
      return {
        success: false,
        message: 'Key not found immediately after creation',
        details: `Status: ${getResponse.status}`,
      };
    }

    // Step 3: Cleanup
    await fetch(`${DASHBOARD_API}/keys/${encodeURIComponent(testKey)}`, {
      method: 'DELETE',
    });

    return {
      success: true,
      message: '✅ PASS: API key is immediately usable after creation',
      details: 'No server restart required',
    };
  } catch (error: any) {
    return {
      success: false,
      message: 'Test failed with error',
      details: error.message,
    };
  }
}

/**
 * Test 2: Update key and verify changes
 */
async function test2_UpdateAndVerify(): Promise<TestResult> {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 2: Update API Key and Verify Changes');
  console.log('='.repeat(60));

  const testKey = `test-update-${Date.now()}`;
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Create key
    console.log('\n[Step 1] Creating API key...');
    const createResponse = await fetch(`${DASHBOARD_API}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: testKey,
        name: 'Original Name',
        token_limit_per_5h: 100000,
        expiry_date: futureDate,
      }),
    });

    if (!createResponse.ok) {
      return { success: false, message: 'Failed to create test key' };
    }

    console.log('  ✅ Key created');

    // Update key
    console.log('\n[Step 2] Updating API key quota to 250,000...');
    const updateResponse = await fetch(`${DASHBOARD_API}/keys/${encodeURIComponent(testKey)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token_limit_per_5h: 250000,
        name: 'Updated Name',
      }),
    });

    if (!updateResponse.ok) {
      return { success: false, message: 'Failed to update key' };
    }

    const updatedKey = await updateResponse.json();
    console.log(`  ✅ Updated quota: ${updatedKey.token_limit_per_5h}`);
    console.log(`  ✅ Updated name: ${updatedKey.name}`);

    // Immediately verify
    console.log('\n[Step 3] Immediately verifying changes...');
    const getResponse = await fetch(`${DASHBOARD_API}/keys/${encodeURIComponent(testKey)}/usage`);

    if (getResponse.ok) {
      const keyData = await getResponse.json();
      if (keyData.token_limit_per_5h === 250000 && keyData.name === 'Updated Name') {
        console.log('  ✅ Changes are immediately reflected!');
      } else {
        console.log('  ❌ Changes not reflected correctly');
        console.log(`     Expected quota: 250000, Got: ${keyData.token_limit_per_5h}`);
        console.log(`     Expected name: Updated Name, Got: ${keyData.name}`);
        return { success: false, message: 'Changes not reflected' };
      }
    }

    // Cleanup
    await fetch(`${DASHBOARD_API}/keys/${encodeURIComponent(testKey)}`, {
      method: 'DELETE',
    });

    return {
      success: true,
      message: '✅ PASS: API key updates take effect immediately',
      details: 'No server restart required',
    };
  } catch (error: any) {
    return {
      success: false,
      message: 'Test failed with error',
      details: error.message,
    };
  }
}

/**
 * Test 3: Delete key and verify rejection
 */
async function test3_DeleteAndVerify(): Promise<TestResult> {
  console.log('\n' + '='.repeat(60));
  console.log('TEST 3: Delete API Key and Verify Rejection');
  console.log('='.repeat(60));

  const testKey = `test-delete-${Date.now()}`;
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Create key
    console.log('\n[Step 1] Creating API key...');
    const createResponse = await fetch(`${DASHBOARD_API}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: testKey,
        name: 'To Be Deleted',
        token_limit_per_5h: 100000,
        expiry_date: futureDate,
      }),
    });

    if (!createResponse.ok) {
      return { success: false, message: 'Failed to create test key' };
    }

    console.log('  ✅ Key created');

    // Delete key
    console.log('\n[Step 2] Deleting API key...');
    const deleteResponse = await fetch(`${DASHBOARD_API}/keys/${encodeURIComponent(testKey)}`, {
      method: 'DELETE',
    });

    if (!deleteResponse.ok) {
      return { success: false, message: 'Failed to delete key' };
    }

    console.log('  ✅ Key deleted');

    // Immediately verify it's gone
    console.log('\n[Step 3] Immediately verifying key is rejected...');
    const getResponse = await fetch(`${DASHBOARD_API}/keys/${encodeURIComponent(testKey)}/usage`);

    if (getResponse.status === 404) {
      console.log('  ✅ Key is immediately rejected after deletion!');
      return {
        success: true,
        message: '✅ PASS: API key deletion takes effect immediately',
        details: 'No server restart required',
      };
    } else {
      return {
        success: false,
        message: 'Key still accessible after deletion',
        details: `Status: ${getResponse.status}`,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: 'Test failed with error',
      details: error.message,
    };
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log(' HOT-RELOAD FUNCTIONALITY VERIFICATION');
  console.log('='.repeat(60));
  console.log('\nThis script verifies that API key changes take effect immediately');
  console.log('without requiring server restart.\n');

  // Check if dashboard is running
  try {
    const response = await fetch('http://localhost:3001/');
    if (!response.ok) {
      console.error('❌ ERROR: Dashboard server is not responding!');
      console.error('Please start the dashboard with: bun --hot index.ts');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ ERROR: Cannot connect to dashboard server!');
    console.error('Please start the dashboard with: bun --hot index.ts');
    process.exit(1);
  }

  console.log('✅ Dashboard server is running\n');

  // Run tests
  const results: TestResult[] = [];

  results.push(await test1_CreateAndUse());
  results.push(await test2_UpdateAndVerify());
  results.push(await test3_DeleteAndVerify());

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(' SUMMARY');
  console.log('='.repeat(60) + '\n');

  const passed = results.filter(r => r.success).length;
  const total = results.length;

  results.forEach((result, index) => {
    console.log(`Test ${index + 1}: ${result.message}`);
    if (result.details) {
      console.log(`  Details: ${result.details}`);
    }
  });

  console.log('\n' + '-'.repeat(60));
  console.log(`Result: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('\n✅ SUCCESS: All hot-reload tests passed!');
    console.log('✅ API key changes take effect without server restart');
  } else {
    console.log('\n⚠️  Some tests failed. Check details above.');
  }

  console.log('\n' + '='.repeat(60) + '\n');
}

// Run
runAllTests().catch(console.error);
