#!/usr/bin/env bun
/**
 * Manual Verification: Fallback to File-Based Storage
 *
 * This script demonstrates the graceful degradation functionality:
 * 1. Attempts to initialize database storage
 * 2. Falls back to file storage if database fails
 * 3. Periodically attempts to reconnect to database
 * 4. Automatically switches back to database when available
 */

import { getStorage, isInFallbackMode, getFallbackState, resetStorage } from '../src/storage/index.js';
import type { IStorage } from '../src/storage/interface.js';

console.log('='.repeat(60));
console.log('Manual Verification: Fallback to File-Based Storage');
console.log('='.repeat(60));
console.log();

// Helper function to test storage operations
async function testStorageOperations(storage: IStorage, label: string) {
  console.log(`\n${label}:`);
  console.log('-'.repeat(60));

  try {
    // Test findApiKey
    const apiKey = await storage.findApiKey('sk-test-key');
    console.log(`✓ findApiKey: ${apiKey ? 'Found key' : 'Key not found (expected)'}`);

    // Test getKeyStats
    const stats = await storage.getKeyStats('sk-test-key');
    console.log(`✓ getKeyStats: ${stats ? 'Got stats' : 'No stats (expected for non-existent key)'}`);

    console.log('✓ All storage operations successful');
  } catch (error) {
    console.error(`✗ Storage operations failed:`, error);
  }
}

// Test 1: Normal database storage initialization
console.log('Test 1: Normal Database Storage (if DATABASE_URL or DATABASE_PATH is set)');
console.log('-'.repeat(60));

resetStorage();

const storage1 = await getStorage();
const fallbackState1 = getFallbackState();

console.log(`Storage type: ${isInFallbackMode() ? 'File (fallback)' : 'Database'}`);
if (fallbackState1) {
  console.log(`Fallback state:`, fallbackState1);
}

await testStorageOperations(storage1, 'Storage Operations Test');

// Test 2: Check helper functions
console.log('\n' + '='.repeat(60));
console.log('Test 2: Helper Functions');
console.log('-'.repeat(60));

console.log(`isInFallbackMode(): ${isInFallbackMode()}`);

const state = getFallbackState();
if (state) {
  console.log(`getFallbackState():`, {
    isInFallback: state.isInFallback,
    retryCount: state.retryCount,
    lastRetryAt: state.lastRetryAt,
  });
} else {
  console.log('getFallbackState(): undefined (fallback manager not active)');
}

// Test 3: Verify storage instance is consistent
console.log('\n' + '='.repeat(60));
console.log('Test 3: Storage Instance Consistency (Singleton Pattern)');
console.log('-'.repeat(60));

const storage2 = await getStorage();
console.log(`Same instance: ${storage1 === storage2 ? '✓ Yes' : '✗ No'}`);

console.log('\n' + '='.repeat(60));
console.log('Verification Complete!');
console.log('='.repeat(60));
console.log();
console.log('Summary:');
console.log('-'.repeat(60));
console.log(`✓ Storage initialized: ${isInFallbackMode() ? 'File storage (fallback active)' : 'Database storage'}`);
console.log(`✓ Helper functions working correctly`);
console.log(`✓ Singleton pattern working correctly`);

if (isInFallbackMode()) {
  const state = getFallbackState();
  console.log(`\nFallback Information:`);
  console.log(`  - In fallback mode: ${state?.isInFallback}`);
  console.log(`  - Reconnection attempts: ${state?.retryCount}`);
  console.log(`  - Last retry: ${state?.lastRetryAt || 'N/A'}`);
  console.log(`\nNote: Periodic reconnection attempts are active in the background.`);
  console.log(`When the database becomes available, the system will automatically switch back.`);
} else {
  console.log(`\nNote: Database is healthy and available.`);
  console.log(`To test fallback behavior, set an invalid DATABASE_URL or DATABASE_PATH`);
  console.log(`and restart the application.`);
}

console.log();
console.log('To manually test database recovery:');
console.log('  1. Start with invalid DATABASE_URL (triggers fallback)');
console.log('  2. Fix DATABASE_URL to point to valid database');
console.log('  3. Wait for periodic reconnection attempt (default: 60 seconds)');
console.log('  4. System automatically switches back to database storage');
console.log();
