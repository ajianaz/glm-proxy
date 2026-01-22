# Test Environment

This directory contains all tests for the Admin API feature.

## Running Tests

### Run all tests
```bash
bun test
```

### Run specific test file
```bash
bun test test/unit/apiKey.test.ts
```

### Run tests in watch mode
```bash
bun test --watch
```

## Test Environment Setup

The test environment uses the following configuration:

- **Test Framework**: Bun's built-in test runner (`bun:test`)
- **Database**: SQLite in-memory database (`:memory:`) for isolated tests
- **Environment**: Test-specific environment variables configured in `fixtures.ts`

### Test Database

Each test uses a fresh in-memory SQLite database that is:
- Initialized before each test in `beforeEach`
- Reset to clean state using `resetDatabase()`
- Automatically cleaned up after the test completes

For tests that require a file-based database, use the `cleanupTestDatabase()` helper.

## Test Fixtures

Centralized test utilities are available in `test/fixtures.ts`:

### setupTestEnvironment()

Sets up a clean test environment before each test:

```typescript
import { setupTestEnvironment } from './fixtures';

beforeEach(() => {
  setupTestEnvironment();
});
```

#### Custom Environment Variables

You can override default environment variables:

```typescript
beforeEach(() => {
  setupTestEnvironment({
    ADMIN_API_ENABLED: 'false',
    DATABASE_PATH: './custom-test.db',
  });
});
```

### createTestApiKey()

Creates a test API key object with valid defaults:

```typescript
import { createTestApiKey } from './fixtures';

const apiKey = createTestApiKey({
  name: 'Custom Name',
  rate_limit: 100,
});
```

### createTestRequest()

Creates a Request object for testing endpoints:

```typescript
import { createTestRequest } from './fixtures';

const request = createTestRequest({
  method: 'POST',
  path: '/',
  body: { key: 'sk-test', name: 'Test' },
  authToken: 'test-admin-key',
});
```

### delay()

Delays execution for testing time-based behavior:

```typescript
import { delay } from './fixtures';

await delay(100); // Wait 100ms
```

### cleanupTestDatabase()

Cleans up test database files:

```typescript
import { cleanupTestDatabase } from './fixtures';

afterEach(() => {
  cleanupTestDatabase('./test.db');
});
```

## Test Organization

```
test/
├── fixtures.ts           # Centralized test utilities and helpers
├── README.md            # This file
├── unit/                # Unit tests for individual modules
│   ├── apiKey.test.ts
│   ├── adminAuth.test.ts
│   ├── adminToken.test.ts
│   ├── errors.test.ts
│   ├── requestLogger.test.ts
│   ├── schema.test.ts
│   └── validation.test.ts
└── integration/         # Integration tests for API endpoints
    ├── adminApiKeys.test.ts
    ├── concurrency.test.ts
    └── globalErrorHandler.test.ts
```

## Writing New Tests

### Unit Tests

Unit tests should test individual functions and classes in isolation:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { setupTestEnvironment } from '../fixtures';

describe('MyModule', () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  it('should do something', () => {
    const result = myFunction();
    expect(result).toBe('expected');
  });
});
```

### Integration Tests

Integration tests should test API endpoints and their interactions:

```typescript
import { describe, it, expect, beforeEach } from 'bun:test';
import { setupTestEnvironment, createTestRequest } from '../fixtures';
import { generateAdminToken } from '../src/utils/adminToken';

describe('POST /admin/api/keys', () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  it('should create an API key', async () => {
    const token = await generateAdminToken();
    const request = createTestRequest({
      method: 'POST',
      body: { key: 'sk-test', name: 'Test' },
      authToken: token,
    });

    const response = await app.fetch(request);
    expect(response.status).toBe(201);
  });
});
```

## Test Constants

Default test environment values are defined in `fixtures.ts`:

- `ADMIN_API_KEY`: `'test-admin-key-12345'`
- `ZAI_API_KEY`: `'test-zai-key'`
- `ADMIN_API_ENABLED`: `'true'`
- `DATABASE_PATH`: `':memory:'`
- `PORT`: `'3000'`
- `DEFAULT_MODEL`: `'glm-4.7'`
- `DEFAULT_RATE_LIMIT`: `'60'`
- `CORS_ORIGINS`: `'*'`

## Best Practices

1. **Always call `setupTestEnvironment()` in `beforeEach`**
   - Ensures a clean state for each test
   - Prevents test interference

2. **Use the fixtures helpers**
   - Reduces code duplication
   - Ensures consistent test patterns

3. **Test both success and failure cases**
   - Include tests for error conditions
   - Test edge cases and boundary conditions

4. **Keep tests isolated**
   - Each test should be independent
   - Don't rely on test execution order

5. **Use descriptive test names**
   - Test names should clearly describe what is being tested
   - Follow the pattern: "should [expected behavior] when [condition]"

## Coverage

The test suite currently covers:
- ✅ Database schema and models
- ✅ Authentication middleware (API key and token)
- ✅ Request validation
- ✅ Error handling and response formatting
- ✅ CRUD API endpoints (POST, GET, PUT, DELETE)
- ✅ Pagination and filtering
- ✅ Concurrency and atomic operations
- ✅ Request logging

Total: 393+ passing tests
