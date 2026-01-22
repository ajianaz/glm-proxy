# API Tests

This directory contains integration tests for the dashboard API endpoints.

## Running the Tests

### Prerequisites

The API integration tests require the dashboard server to be running on `localhost:3001`.

### Start the Server

In one terminal, start the dashboard server:

```bash
bun run dashboard
```

Or with custom environment variables:

```bash
DATA_FILE=./data/test-apikeys.json bun run dashboard
```

### Run the API Tests

In another terminal, run the tests:

```bash
bun run test:api
```

Or run all tests:

```bash
bun test
```

## Test Files

### `api.test.ts`

Comprehensive integration tests for all API endpoints:

- **GET /api/keys** - List, sort, filter, and search API keys
- **POST /api/keys** - Create new API keys with validation
- **PUT /api/keys/:id** - Update existing API keys
- **DELETE /api/keys/:id** - Delete API keys
- **GET /api/keys/:id/usage** - Get usage statistics
- **CORS headers** - Verify CORS configuration
- **Error handling** - Test various error scenarios

### `websocket.test.ts`

Comprehensive integration tests for WebSocket real-time updates:

- **WebSocket Connection** - Connection establishment and authentication
- **Key Created Events** - Broadcast when API keys are created
- **Key Updated Events** - Broadcast when API keys are updated
- **Key Deleted Events** - Broadcast when API keys are deleted
- **Usage Updated Events** - Broadcast when usage is tracked
- **Multiple Clients** - Broadcasts to all connected clients
- **Event Ordering** - Event ordering for rapid updates
- **Error Handling** - Graceful error handling and recovery
- **Real-time Integration** - End-to-end real-time update scenarios

#### Run WebSocket Tests

```bash
bun run test:websocket
```

## Test Coverage

The API tests cover:

### CRUD Operations
- ✅ Create API keys
- ✅ Read/List API keys with query parameters
- ✅ Update API key properties
- ✅ Delete API keys

### Validation Logic
- ✅ Required field validation (key, name, token_limit, expiry_date)
- ✅ Field format validation (key format, name format)
- ✅ Business logic validation (future expiry dates, non-negative quotas)
- ✅ Duplicate key detection

### Error Handling
- ✅ 400 Bad Request for validation errors
- ✅ 404 Not Found for missing resources
- ✅ 409 Conflict for duplicate keys
- ✅ 500 Internal Server Error handling

### Edge Cases
- ✅ URL-encoded key IDs (special characters)
- ✅ Optional fields (model)
- ✅ Sorting by various fields
- ✅ Filtering by model and expiry status
- ✅ Case-insensitive search

## Test Data

Tests create and clean up their own data. Each test:
1. Creates a test API key with unique identifiers
2. Performs the test operation
3. Cleans up by deleting the test key

Tests use timestamps and random strings to ensure unique test keys and avoid conflicts.

## Known Issues

- Tests require manual server startup (not automated yet)
- Tests may interfere with production data if `DATA_FILE` is not set
- Multiple test runs can accumulate data if cleanup fails

## Future Improvements

- [ ] Add automatic server startup/teardown
- [ ] Add test database isolation
- [ ] Add performance/load testing
- [x] Add WebSocket real-time update tests ✅
- [ ] Add authentication tests
