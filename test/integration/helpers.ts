/**
 * Integration Test Helpers
 *
 * Provides utilities for setting up test servers, making HTTP requests,
 * and validating responses in integration tests.
 */

import { serve } from 'bun';
import app from '../../src/index';
import fs from 'fs';
import path from 'path';
import type { ApiKey, UsageWindow } from '../../src/types';

/**
 * Test server interface
 */
export interface TestServer {
  url: string;
  port: number;
  stop: () => Promise<void>;
}

/**
 * HTTP response wrapper
 */
export interface TestResponse {
  status: number;
  headers: Headers;
  body: string;
  json: () => any;
}

/**
 * Rate limit info for validation
 */
export interface RateLimitInfo {
  allowed: boolean;
  tokensUsed: number;
  tokensLimit: number;
  windowStart?: string;
  windowEnd?: string;
  reason?: string;
  retryAfter?: number;
}

/**
 * Starts a test server instance
 *
 * @param port - Optional port number (defaults to random available port)
 * @returns Test server instance with URL and stop function
 */
export async function startTestServer(port?: number): Promise<TestServer> {
  // Find available port if not specified
  const actualPort = port || (await findAvailablePort());

  // Start the server
  const server = serve({
    fetch: app.fetch,
    port: actualPort,
  });

  return {
    url: `http://localhost:${actualPort}`,
    port: actualPort,
    stop: async () => {
      server.stop();
    },
  };
}

/**
 * Finds an available port for testing
 */
async function findAvailablePort(): Promise<number> {
  // Try ports starting from 3001
  for (let port = 3001; port < 4000; port++) {
    try {
      const server = serve({ port, fetch: () => new Response('ok') });
      server.stop();
      return port;
    } catch (e) {
      // Port in use, try next
      continue;
    }
  }
  throw new Error('No available port found for test server');
}

/**
 * Makes an HTTP request to the test server
 *
 * @param url - Request URL
 * @param options - Request options
 * @returns Test response wrapper
 */
export async function makeRequest(
  url: string,
  options: RequestInit = {}
): Promise<TestResponse> {
  const response = await fetch(url, options);

  const body = await response.text();

  return {
    status: response.status,
    headers: response.headers,
    body,
    json: () => JSON.parse(body),
  };
}

/**
 * Makes an authenticated request with API key
 *
 * @param url - Request URL
 * @param apiKey - API key for authentication
 * @param options - Request options
 * @returns Test response wrapper
 */
export async function makeAuthenticatedRequest(
  url: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<TestResponse> {
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${apiKey}`,
  };

  return makeRequest(url, { ...options, headers });
}

/**
 * Makes an authenticated request with x-api-key header
 *
 * @param url - Request URL
 * @param apiKey - API key for authentication
 * @param options - Request options
 * @returns Test response wrapper
 */
export async function makeRequestWithXApiKey(
  url: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<TestResponse> {
  const headers = {
    ...options.headers,
    'x-api-key': apiKey,
  };

  return makeRequest(url, { ...options, headers });
}

// ==================== Request Builders ====================

/**
 * Builds a request body for OpenAI chat completions
 */
export function buildOpenAIChatRequest(messages: Array<{role: string; content: string}>, model?: string): string {
  return JSON.stringify({
    model: model || 'glm-4',
    messages,
    stream: false,
  });
}

/**
 * Builds a streaming request body for OpenAI chat completions
 */
export function buildOpenAIStreamingRequest(messages: Array<{role: string; content: string}>, model?: string): string {
  return JSON.stringify({
    model: model || 'glm-4',
    messages,
    stream: true,
  });
}

/**
 * Builds a request body for Anthropic messages
 */
export function buildAnthropicMessagesRequest(messages: Array<{role: string; content: string}>, model?: string): string {
  return JSON.stringify({
    model: model || 'claude-3-5-sonnet-20241022',
    messages,
    max_tokens: 1024,
    stream: false,
  });
}

/**
 * Builds a streaming request body for Anthropic messages
 */
export function buildAnthropicStreamingRequest(messages: Array<{role: string; content: string}>, model?: string): string {
  return JSON.stringify({
    model: model || 'claude-3-5-sonnet-20241022',
    messages,
    max_tokens: 1024,
    stream: true,
  });
}

// ==================== Response Validators ====================

/**
 * Validates that a response has the expected status code
 */
export function expectStatus(response: TestResponse, expectedStatus: number): void {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status}\nBody: ${response.body}`
    );
  }
}

/**
 * Validates that a response contains expected JSON properties
 */
export function expectJsonProperties(response: TestResponse, properties: string[]): void {
  const json = response.json();
  for (const prop of properties) {
    if (!(prop in json)) {
      throw new Error(`Expected property "${prop}" not found in response JSON`);
    }
  }
}

/**
 * Validates health endpoint response format
 */
export function validateHealthResponse(response: TestResponse): void {
  expectStatus(response, 200);
  const json = response.json();
  expectJsonProperties(response, ['status', 'timestamp']);
  expect(json.status).toBe('ok');
}

/**
 * Validates stats endpoint response format
 */
export function validateStatsResponse(response: TestResponse, expectedKey: string): void {
  expectStatus(response, 200);
  const json = response.json();
  expectJsonProperties(response, ['key', 'name', 'model', 'token_limit_per_5h']);
  expect(json.key).toBe(expectedKey);
}

/**
 * Validates error response format
 */
export function validateErrorResponse(
  response: TestResponse,
  expectedStatus: number,
  expectedMessage?: string
): void {
  expectStatus(response, expectedStatus);
  const json = response.json();
  expectJsonProperties(response, ['error']);

  if (expectedMessage) {
    expect(json.error).toContain(expectedMessage);
  }
}

/**
 * Validates rate limit headers
 */
export function validateRateLimitHeaders(
  response: TestResponse,
  expectedInfo: RateLimitInfo
): void {
  const headers = response.headers;

  if (expectedInfo.allowed) {
    // Should have rate limit headers for successful requests
    expect(headers.get('x-ratelimit-remaining')).toBeTruthy();
  } else {
    // Should have retry-after header for rate limited requests
    if (expectedInfo.retryAfter) {
      expect(headers.get('retry-after')).toBe(String(expectedInfo.retryAfter));
    }
  }
}

/**
 * Validates streaming response format
 */
export async function validateOpenAIStreamingResponse(response: Response): Promise<void> {
  expect(response.headers.get('content-type')).toContain('text/event-stream');

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let chunkCount = 0;
  let foundDone = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter(line => line.trim());

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          foundDone = true;
        } else {
          // Validate JSON chunk format
          const parsed = JSON.parse(data);
          expect(parsed).toHaveProperty('choices');
          chunkCount++;
        }
      }
    }
  }

  expect(chunkCount).toBeGreaterThan(0);
  expect(foundDone).toBe(true);
}

/**
 * Validates Anthropic streaming response format
 */
export async function validateAnthropicStreamingResponse(response: Response): Promise<void> {
  expect(response.headers.get('content-type')).toContain('text/event-stream');

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let foundMessageStart = false;
  let foundMessageDelta = false;
  let foundMessageStop = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter(line => line.trim());

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        const eventType = line.slice(7);
        if (eventType === 'message_start') foundMessageStart = true;
        if (eventType === 'message_delta') foundMessageDelta = true;
        if (eventType === 'message_stop') foundMessageStop = true;
      }
    }
  }

  expect(foundMessageStart).toBe(true);
  expect(foundMessageDelta).toBe(true);
  expect(foundMessageStop).toBe(true);
}

// ==================== Utility Functions ====================

/**
 * Creates a temporary test data directory
 */
export function createTestDataDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Cleans up a temporary test data directory
 */
export function cleanupTestDataDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Creates a test API keys file with the given keys
 */
export function createTestApiKeysFile(filePath: string, keys: ApiKey[]): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(
    filePath,
    JSON.stringify({ keys }, null, 2),
    'utf-8'
  );
}

/**
 * Cleans up a test API keys file
 */
export function cleanupTestApiKeysFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  // Clean up lock file if it exists
  const lockFile = filePath + '.lock';
  if (fs.existsSync(lockFile)) {
    fs.rmdirSync(lockFile);
  }
}

/**
 * Creates a mock API key for testing
 */
export function createMockApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    key: 'pk_test_' + Math.random().toString(36).substring(7),
    name: 'Test User',
    model: 'glm-4.7',
    token_limit_per_5h: 100000,
    expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date().toISOString(),
    last_used: new Date().toISOString(),
    total_lifetime_tokens: 0,
    usage_windows: [],
    ...overrides,
  };
}

/**
 * Creates a mock expired API key for testing
 */
export function createExpiredApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return createMockApiKey({
    ...overrides,
    expiry_date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  });
}

/**
 * Creates a mock rate-limited API key for testing
 */
export function createRateLimitedApiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return createMockApiKey({
    ...overrides,
    token_limit_per_5h: 1000,
    usage_windows: [
      {
        window_start: new Date(Date.now() - 3600000).toISOString(),
        tokens_used: 1500,
      },
    ],
  });
}

/**
 * Waits for a specified duration
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 100
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await wait(baseDelay * Math.pow(2, i));
    }
  }
  throw new Error('Retry failed');
}
