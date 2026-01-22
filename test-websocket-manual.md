# WebSocket Real-time Updates - Manual Verification

This document provides instructions for manually verifying that WebSocket broadcasts work correctly when API keys are created/updated/deleted.

## Prerequisites

1. Start the dashboard server:
   ```bash
   bun run dashboard
   ```

2. Ensure the server is running on `localhost:3001`

## Automated Tests

Run the comprehensive WebSocket test suite:

```bash
bun run test:websocket
```

The test suite includes:
- WebSocket connection and authentication
- Key created/updated/deleted events
- Usage updated events
- Multiple client scenarios
- Event ordering and timing
- Error handling

## Manual Verification Steps

### Step 1: Test WebSocket Connection

Open browser console or use a WebSocket client:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onopen = () => {
  console.log('✓ WebSocket connected');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

Expected result:
- Connection established
- Receive `connected` event with message "Connected to dashboard real-time updates"

### Step 2: Test Key Created Event

With WebSocket connected, create a new API key:

```bash
curl -X POST http://localhost:3001/api/keys \
  -H "Content-Type: application/json" \
  -d '{
    "key": "manual-test-key-1",
    "name": "Manual Test Key",
    "token_limit_per_5h": 50000,
    "expiry_date": "2025-12-31T23:59:59Z",
    "model": "glm-4"
  }'
```

Expected result in WebSocket client:
- Receive `key_created` event with:
  - `type`: "key_created"
  - `timestamp`: ISO 8601 timestamp
  - `data`: Complete API key object

### Step 3: Test Key Updated Event

Update the API key:

```bash
curl -X PUT http://localhost:3001/api/keys/manual-test-key-1 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Manual Test Key",
    "token_limit_per_5h": 100000
  }'
```

Expected result in WebSocket client:
- Receive `key_updated` event with:
  - `type`: "key_updated"
  - `timestamp`: ISO 8601 timestamp
  - `data`: Updated API key object

### Step 4: Test Key Deleted Event

Delete the API key:

```bash
curl -X DELETE http://localhost:3001/api/keys/manual-test-key-1
```

Expected result in WebSocket client:
- Receive `key_deleted` event with:
  - `type`: "key_deleted"
  - `timestamp`: ISO 8601 timestamp
  - `data`: Deleted API key object

### Step 5: Test Multiple Clients

1. Open multiple browser tabs or WebSocket clients
2. Connect all clients to `ws://localhost:3001/ws`
3. Create/update/delete an API key
4. Verify all clients receive the same events

Expected result:
- All connected clients receive identical events
- Events are delivered in the same order to all clients

### Step 6: Test Authentication (If configured)

If `DASHBOARD_AUTH_TOKEN` is set:

```javascript
const authToken = 'your-auth-token';
const ws = new WebSocket(`ws://localhost:3001/ws?token=${encodeURIComponent(authToken)}`);

ws.onopen = () => console.log('✓ Authenticated connection established');
ws.onerror = () => console.error('✗ Authentication failed');
```

Expected result:
- Valid token: Connection succeeds
- Invalid token: Connection rejected with 401

## Event Structure Reference

### Key Created/Updated/Deleted Event

```json
{
  "type": "key_created" | "key_updated" | "key_deleted",
  "timestamp": "2025-01-22T12:00:00.000Z",
  "data": {
    "key": "api-key-123",
    "name": "API Key Name",
    "model": "glm-4",
    "token_limit_per_5h": 100000,
    "expiry_date": "2025-12-31T23:59:59Z",
    "created_at": "2025-01-01T00:00:00Z",
    "last_used": "2025-01-22T12:00:00Z",
    "total_lifetime_tokens": 50000,
    "usage_windows": []
  }
}
```

### Usage Updated Event

```json
{
  "type": "usage_updated",
  "timestamp": "2025-01-22T12:00:00.000Z",
  "data": {
    "key": "api-key-123",
    "name": "API Key Name",
    "model": "glm-4",
    "tokens_used": 500,
    "total_lifetime_tokens": 50500,
    "remaining_quota": 99500,
    "window_start": "2025-01-22T07:00:00Z",
    "window_end": "2025-01-22T12:00:00Z",
    "is_expired": false
  }
}
```

### Connected Event

```json
{
  "type": "connected",
  "timestamp": "2025-01-22T12:00:00.000Z",
  "message": "Connected to dashboard real-time updates"
}
```

## Troubleshooting

### Connection Refused

- Ensure server is running: `bun run dashboard`
- Check port is not already in use
- Verify firewall settings

### No Events Received

- Check browser console for errors
- Verify WebSocket URL is correct
- Ensure server has WebSocket support enabled

### Authentication Errors

- Verify `DASHBOARD_AUTH_TOKEN` environment variable is set
- Check token is being passed correctly in query parameter
- Ensure token matches server configuration

### Events Not Received by All Clients

- Check all clients are connected to same endpoint
- Verify network connectivity
- Check server logs for broadcast errors

## Success Criteria

✅ WebSocket connection established successfully
✅ Connection confirmation received
✅ Key created events broadcast correctly
✅ Key updated events broadcast correctly
✅ Key deleted events broadcast correctly
✅ All connected clients receive events
✅ Events contain correct data structure
✅ Timestamps are present and valid
✅ Authentication works (if configured)
