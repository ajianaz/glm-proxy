/**
 * Test WebSocket Authentication
 *
 * This test verifies that WebSocket connections require valid authentication
 * and reject unauthorized connections.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { authenticateRequest, createUnauthorizedResponse } from './src/auth-middleware.js';

// Mock environment variables for testing
const TEST_TOKEN = 'test-bearer-token-123';
const TEST_USERNAME = 'admin';
const TEST_PASSWORD = 'secret123';

describe('WebSocket Authentication Tests', () => {
  describe('Query Parameter Authentication (for WebSocket)', () => {
    test('should authenticate valid bearer token via query parameters', () => {
      // Set up environment
      process.env.DASHBOARD_AUTH_TOKEN = TEST_TOKEN;

      // Create search params with bearer token
      const searchParams = new URLSearchParams({
        auth_type: 'bearer',
        auth_token: TEST_TOKEN,
      });

      // Create mock headers (no Authorization header)
      const headers = new Headers();

      // Test authentication
      const result = authenticateRequest(headers, searchParams);

      expect(result.authenticated).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    test('should reject invalid bearer token via query parameters', () => {
      // Set up environment
      process.env.DASHBOARD_AUTH_TOKEN = TEST_TOKEN;

      // Create search params with wrong token
      const searchParams = new URLSearchParams({
        auth_type: 'bearer',
        auth_token: 'wrong-token',
      });

      // Create mock headers
      const headers = new Headers();

      // Test authentication
      const result = authenticateRequest(headers, searchParams);

      expect(result.authenticated).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Invalid credentials');
    });

    test('should authenticate valid basic auth via query parameters', () => {
      // Set up environment
      process.env.DASHBOARD_AUTH_USERNAME = TEST_USERNAME;
      process.env.DASHBOARD_AUTH_PASSWORD = TEST_PASSWORD;

      // Encode credentials to base64
      const credentials = Buffer.from(`${TEST_USERNAME}:${TEST_PASSWORD}`).toString('base64');

      // Create search params with basic auth
      const searchParams = new URLSearchParams({
        auth_type: 'basic',
        auth_token: credentials,
      });

      // Create mock headers
      const headers = new Headers();

      // Test authentication
      const result = authenticateRequest(headers, searchParams);

      expect(result.authenticated).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    test('should reject invalid basic auth via query parameters', () => {
      // Set up environment
      process.env.DASHBOARD_AUTH_USERNAME = TEST_USERNAME;
      process.env.DASHBOARD_AUTH_PASSWORD = TEST_PASSWORD;

      // Create search params with wrong credentials
      const searchParams = new URLSearchParams({
        auth_type: 'basic',
        auth_token: Buffer.from('wrong:wrong').toString('base64'),
      });

      // Create mock headers
      const headers = new Headers();

      // Test authentication
      const result = authenticateRequest(headers, searchParams);

      expect(result.authenticated).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Invalid credentials');
    });

    test('should reject query params with invalid auth type', () => {
      // Set up environment
      process.env.DASHBOARD_AUTH_TOKEN = TEST_TOKEN;

      // Create search params with invalid auth type
      const searchParams = new URLSearchParams({
        auth_type: 'invalid',
        auth_token: TEST_TOKEN,
      });

      // Create mock headers
      const headers = new Headers();

      // Test authentication
      const result = authenticateRequest(headers, searchParams);

      expect(result.authenticated).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Invalid credentials');
    });

    test('should allow access when no auth is configured', () => {
      // Clear environment
      delete process.env.DASHBOARD_AUTH_TOKEN;
      delete process.env.DASHBOARD_AUTH_USERNAME;
      delete process.env.DASHBOARD_AUTH_PASSWORD;

      // Create search params (should be ignored when auth is disabled)
      const searchParams = new URLSearchParams({
        auth_type: 'bearer',
        auth_token: TEST_TOKEN,
      });

      // Create mock headers
      const headers = new Headers();

      // Test authentication
      const result = authenticateRequest(headers, searchParams);

      expect(result.authenticated).toBe(true);
      expect(result.statusCode).toBe(200);
    });
  });

  describe('Header Authentication (fallback for WebSocket)', () => {
    test('should prefer query params over headers for WebSocket', () => {
      // Set up environment
      process.env.DASHBOARD_AUTH_TOKEN = TEST_TOKEN;

      // Create search params with valid token
      const searchParams = new URLSearchParams({
        auth_type: 'bearer',
        auth_token: TEST_TOKEN,
      });

      // Create mock headers with different token
      const headers = new Headers({
        Authorization: 'Bearer wrong-token',
      });

      // Test authentication - should use query params
      const result = authenticateRequest(headers, searchParams);

      expect(result.authenticated).toBe(true);
      expect(result.statusCode).toBe(200);
    });

    test('should fall back to header auth when query params missing', () => {
      // Set up environment
      process.env.DASHBOARD_AUTH_TOKEN = TEST_TOKEN;

      // Create empty search params
      const searchParams = new URLSearchParams();

      // Create mock headers with valid token
      const headers = new Headers({
        Authorization: `Bearer ${TEST_TOKEN}`,
      });

      // Test authentication - should use header
      const result = authenticateRequest(headers, searchParams);

      expect(result.authenticated).toBe(true);
      expect(result.statusCode).toBe(200);
    });
  });

  describe('createUnauthorizedResponse', () => {
    test('should create proper 401 response with WWW-Authenticate header', () => {
      const response = createUnauthorizedResponse('Test error message');

      expect(response.status).toBe(401);

      // Check headers
      const wwwAuthenticate = response.headers.get('WWW-Authenticate');
      expect(wwwAuthenticate).toBe('Bearer realm="Dashboard", Basic realm="Dashboard"');

      const contentType = response.headers.get('Content-Type');
      expect(contentType).toBe('application/json');
    });

    test('should include error message in response body', async () => {
      const errorMessage = 'Custom error message';
      const response = createUnauthorizedResponse(errorMessage);

      const body = await response.json();
      expect(body).toEqual({
        error: 'Unauthorized',
        message: errorMessage,
      });
    });
  });
});
