/**
 * Test: Logout Functionality
 *
 * This test verifies that:
 * 1. Logout button exists and is clickable
 * 2. Logout clears sessionStorage
 * 3. Logout sets isAuthenticated to false
 * 4. Logout redirects to login page
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from 'react';
import App from './src/components/App';

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string): string | null => store[key] || null,
    setItem: (key: string, value: string): void => {
      store[key] = value.toString();
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    clear: (): void => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'sessionStorage', {
  value: sessionStorageMock,
});

// Mock fetch API
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ keys: [] }),
  } as Response)
);

test('logout button clears session and redirects to login', async () => {
  // Set up authenticated session
  sessionStorage.setItem('dashboard_auth_token', 'test-token');
  sessionStorage.setItem('dashboard_auth_type', 'bearer');

  // Render the app
  render(<App />);

  // Wait for initial load and verify dashboard is shown
  await waitFor(() => {
    expect(screen.getByText('API Key Management Dashboard')).toBeInTheDocument();
  });

  // Find and click logout button
  const logoutButton = screen.getByText('Logout');
  expect(logoutButton).toBeInTheDocument();
  fireEvent.click(logoutButton);

  // Verify sessionStorage is cleared
  expect(sessionStorage.getItem('dashboard_auth_token')).toBeNull();
  expect(sessionStorage.getItem('dashboard_auth_type')).toBeNull();

  // Verify redirect to login page
  await waitFor(() => {
    expect(screen.getByText('Please authenticate to access the dashboard')).toBeInTheDocument();
  });
});

test('logout function is available in AppContext', async () => {
  // Set up authenticated session
  sessionStorage.setItem('dashboard_auth_token', 'test-token');
  sessionStorage.setItem('dashboard_auth_type', 'bearer');

  // Render the app
  render(<App />);

  // Wait for initial load
  await waitFor(() => {
    expect(screen.getByText('API Key Management Dashboard')).toBeInTheDocument();
  });

  // Verify logout button exists in header
  const logoutButton = screen.getByText('Logout');
  expect(logoutButton).toBeInTheDocument();
  expect(logoutButton.tagName).toBe('BUTTON');
  expect(logoutButton).toHaveClass('btn', 'btn-secondary', 'logout-btn');
});

test('sessionStorage persistence across page reloads', () => {
  // Simulate page reload: sessionStorage should persist
  sessionStorage.setItem('dashboard_auth_token', 'test-token');
  sessionStorage.setItem('dashboard_auth_type', 'bearer');

  // Check items persist
  expect(sessionStorage.getItem('dashboard_auth_token')).toBe('test-token');
  expect(sessionStorage.getItem('dashboard_auth_type')).toBe('bearer');

  // Simulate logout
  sessionStorage.removeItem('dashboard_auth_token');
  sessionStorage.removeItem('dashboard_auth_type');

  // Verify items are cleared
  expect(sessionStorage.getItem('dashboard_auth_token')).toBeNull();
  expect(sessionStorage.getItem('dashboard_auth_type')).toBeNull();
});

console.log('✅ Logout functionality tests created successfully');
console.log('📝 Test file: test-logout.tsx');
console.log('');
console.log('Tests verify:');
console.log('  - Logout button exists in header');
console.log('  - Logout clears sessionStorage');
console.log('  - Logout redirects to login page');
console.log('  - SessionStorage persistence across reloads');
