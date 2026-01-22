# Hot-Reload Functionality Verification

## Overview

This document describes how the API key management system implements hot-reload functionality, ensuring that changes to API keys take effect immediately without requiring server restart.

## Architecture

The system is designed to read API keys from the data file on every operation, rather than caching them in memory. This ensures that any changes made through the dashboard are immediately reflected in the proxy.

### Data Flow

```
┌─────────────┐
│  Dashboard  │
│   (Web UI)  │
└──────┬──────┘
       │
       │ 1. Create/Update/Delete
       ▼
┌─────────────────┐
│ Dashboard API   │
│   /api/keys/*   │
└────────┬────────┘
         │
         │ 2. Write to apikeys.json
         ▼
┌──────────────────┐
│  apikeys.json    │
│  (Data File)     │
└────────┬─────────┘
         │
         │ 3. Read on every request
         ▼
┌─────────────────┐
│ Auth Middleware │
│  (validator.ts) │
└────────┬────────┘
         │
         │ 4. Validate API key
         ▼
┌─────────────────┐
│   Proxy Handler │
│  (proxy.ts)     │
└─────────────────┘
```

### Key Design Decisions

1. **No In-Memory Caching**: API keys are read from the file system on every request
2. **Atomic File Operations**: Use of file locking ensures data consistency
3. **Direct File Access**: Both dashboard API and proxy read from the same data file

## How It Works

### 1. Creating a New API Key

**Step 1: Dashboard creates the key**
```typescript
// Dashboard API: POST /api/keys
const newKey = await createApiKey({
  key: "test-key-123",
  name: "Test Key",
  token_limit_per_5h: 100000,
  expiry_date: "2025-12-31T23:59:59Z"
});
```

**Step 2: Key is written to apikeys.json**
```json
{
  "keys": [
    {
      "key": "test-key-123",
      "name": "Test Key",
      "token_limit_per_5h": 100000,
      "expiry_date": "2025-12-31T23:59:59Z",
      ...
    }
  ]
}
```

**Step 3: Proxy immediately validates the key**
```typescript
// On next proxy request:
const apiKey = await findApiKey("test-key-123"); // Reads from file
if (apiKey) {
  // Key exists - allow request
}
```

✅ **Result**: Key is usable immediately without server restart

### 2. Updating an API Key

**Step 1: Dashboard updates the key**
```typescript
// Dashboard API: PUT /api/keys/test-key-123
const updatedKey = await updateApiKey("test-key-123", {
  token_limit_per_5h: 250000  // Increased quota
});
```

**Step 2: Changes are written to apikeys.json**
```json
{
  "keys": [
    {
      "key": "test-key-123",
      "token_limit_per_5h": 250000,  // ← Updated value
      ...
    }
  ]
}
```

**Step 3: Next request reads updated quota**
```typescript
// On next proxy request:
const apiKey = await findApiKey("test-key-123");
console.log(apiKey.token_limit_per_5h); // 250000
```

✅ **Result**: New quota is enforced immediately

### 3. Deleting an API Key

**Step 1: Dashboard deletes the key**
```typescript
// Dashboard API: DELETE /api/keys/test-key-123
await deleteApiKey("test-key-123");
```

**Step 2: Key is removed from apikeys.json**
```json
{
  "keys": [
    // test-key-123 has been removed
  ]
}
```

**Step 3: Next request is rejected**
```typescript
// On next proxy request:
const apiKey = await findApiKey("test-key-123");
if (!apiKey) {
  return { error: "Invalid API key" };  // ← Key rejected
}
```

✅ **Result**: Key is immediately rejected

## Implementation Details

### Dashboard API (index.ts)

The dashboard API provides CRUD operations:

- `POST /api/keys` - Create new key
- `GET /api/keys` - List all keys
- `PUT /api/keys/:id` - Update key
- `DELETE /api/keys/:id` - Delete key

All operations use `api-key-manager.ts` which reads/writes to `apikeys.json`.

### API Key Manager (api-key-manager.ts)

Key functions:

```typescript
export async function getAllApiKeys(): Promise<ApiKey[]>
export async function getApiKey(key: string): Promise<ApiKey | null>
export async function createApiKey(apiKey: ApiKey): Promise<ApiKey>
export async function updateApiKey(key: string, updates: Partial<ApiKey>): Promise<ApiKey>
export async function deleteApiKey(key: string): Promise<void>
```

Each function:
1. Acquires file lock (for thread safety)
2. Reads current data from file
3. Performs operation
4. Writes updated data to file
5. Releases lock

**Important**: No caching - every operation reads from disk.

### Auth Middleware (middleware/auth.ts)

The proxy validates API keys on every request:

```typescript
export async function authMiddleware(c: Context, next: Next) {
  const apiKeyHeader = extractApiKey(c.req.raw.headers);
  const validation = await validateApiKey(apiKeyHeader);
  if (!validation.valid) {
    return c.json({ error: validation.error }, 401);
  }
  c.set('apiKey', validation.apiKey!);
  await next();
}
```

### Validator (validator.ts)

```typescript
export async function validateApiKey(keyHeader: string | undefined): Promise<ValidationResult> {
  const apiKey = await findApiKey(key); // ← Reads from file every time

  if (!apiKey) {
    return { valid: false, error: 'Invalid API key' };
  }

  if (isKeyExpired(apiKey)) {
    return { valid: false, error: 'API key expired' };
  }

  return { valid: true, apiKey };
}
```

## Testing

### Automated Tests

Run the automated test suite:

```bash
bun test tests/test-hot-reload-functionality.ts
```

This verifies:
- Created keys are immediately usable
- Updated keys reflect changes immediately
- Deleted keys are rejected immediately

### Manual Verification

Run the manual verification script:

```bash
bun run tests/manual-hot-reload-verify.ts
```

This provides detailed console output showing each step.

### Browser Testing

1. Start the dashboard server:
   ```bash
   bun --hot index.ts
   ```

2. Open the dashboard in two browser tabs:
   - http://localhost:3001

3. In Tab 1: Create a new API key
4. In Tab 2: Refresh the page
5. **Result**: The new key appears immediately

6. In Tab 1: Update the key's quota
7. In Tab 2: Refresh the page
8. **Result**: The updated quota is shown immediately

9. In Tab 1: Delete the key
10. In Tab 2: Refresh the page
11. **Result**: The key is gone immediately

## Performance Considerations

### Why No Caching?

While caching would improve performance, it would break hot-reload functionality. The current design prioritizes:

1. **Immediate consistency**: Changes take effect instantly
2. **Simplicity**: No cache invalidation logic needed
3. **Reliability**: No stale cache issues

### Optimization Opportunities

If performance becomes an issue, consider:

1. **File system cache**: The OS already caches frequently accessed files
2. **Lazy loading**: Only read when needed (already implemented)
3. **Periodic reloading**: Cache with 1-2 second TTL (would add slight delay)

For most use cases, the current implementation is sufficient. File I/O is fast enough for typical API key validation loads.

## Troubleshooting

### Issue: Changes don't take effect immediately

**Possible causes**:

1. **Different data files**: Dashboard and proxy using different `DATA_FILE` paths
   - Check: `DATA_FILE` environment variable
   - Solution: Ensure both use the same path

2. **File permissions**: Write issues preventing file updates
   - Check: Write permissions on data directory
   - Solution: Fix permissions with `chmod`

3. **File locking**: Lock files not being released
   - Check: Stale `.lock` files
   - Solution: Remove lock files manually

### Issue: High disk I/O

**Symptoms**: Slow performance, high disk usage

**Solutions**:
1. Move data file to RAM disk (tmpfs)
2. Use SSD instead of HDD
3. Implement cache with short TTL (1-2 seconds)

## Conclusion

The hot-reload functionality is a core feature of the API key management system, enabled by:

- ✅ Direct file reads on every request
- ✅ No in-memory caching
- ✅ Atomic file operations
- ✅ Shared data file between dashboard and proxy

This ensures that administrators can manage API keys in real-time without service interruption, meeting the acceptance criteria: "API key changes take effect immediately without service restart."
