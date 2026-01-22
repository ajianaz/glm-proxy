# Integration Test Utilities

This directory contains reusable utilities for integration testing of the GLM Proxy Gateway.

## Files

### helpers.ts
Core helper functions for integration testing including:

- **Server Management**: `startTestServer()` - Start and stop test server instances
- **HTTP Requests**: `makeRequest()`, `makeAuthenticatedRequest()`, `makeRequestWithXApiKey()`
- **Request Builders**: Build OpenAI and Anthropic format requests (streaming and non-streaming)
- **Response Validators**: Validate health, stats, error, and streaming responses
- **Mock Data Creators**: `createMockApiKey()`, `createExpiredApiKey()`, `createRateLimitedApiKey()`
- **Utilities**: Test data directory management, file cleanup, retry logic

### fixtures.ts
Comprehensive test fixtures for various scenarios:

- **API Keys**: Valid, expired, expiring soon, low limit, rate-limited, multi-window, custom model
- **Test Messages**: OpenAI and Anthropic format messages
- **Request Bodies**: Pre-built request examples for both formats
- **Invalid Keys**: For testing authentication failures
- **Malformed Requests**: For testing validation

### setup.ts
Test environment setup and teardown:

- `setupTestEnvironment()` - Configure temporary test data and environment variables
- `teardownTestEnvironment()` - Clean up test artifacts
- `setupTestEnvironmentWithKeys()` - Setup with custom API keys
- `createTestSetup()` - Vitest-compatible setup helper
- `setupTestScenario()` - Setup for specific test scenarios

## Usage Example

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startTestServer, makeRequest, makeAuthenticatedRequest } from './helpers';
import { setupTestEnvironment, teardownTestEnvironment } from './setup';
import { VALID_API_KEY } from './fixtures';

describe('My Integration Test', () => {
  let server;
  let testEnv;

  beforeEach(() => {
    testEnv = setupTestEnvironment();
  });

  afterEach(async () => {
    if (server) await server.stop();
    teardownTestEnvironment(testEnv);
  });

  it('should handle requests', async () => {
    server = await startTestServer();
    const response = await makeAuthenticatedRequest(
      `${server.url}/health`,
      VALID_API_KEY.key
    );
    expect(response.status).toBe(200);
  });
});
```

## Test Verification

All helper utilities have been verified with passing tests:

```bash
bun test test/integration/helpers.test.ts
# 18 pass, 0 fail
```

## Design Principles

1. **Isolation**: Each test gets a temporary data directory
2. **Cleanup**: Automatic cleanup of test artifacts
3. **Determinism**: Tests are order-independent
4. **Simplicity**: Easy-to-use helper functions
5. **Coverage**: Utilities cover all common test scenarios

## Next Steps

The utilities are ready for use in integration tests for:
- API endpoints (/health, /stats, /v1/*)
- Authentication and authorization
- Rate limiting behavior
- Streaming responses
- Error handling
- Concurrent requests
