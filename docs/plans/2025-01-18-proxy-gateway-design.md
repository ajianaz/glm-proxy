# Proxy Gateway Design

## Overview
API Gateway dengan rate limiting yang proxy request ke Z.AI API (glm-4.7). Menggunakan Hono + Bun, Docker containerized.

## Tech Stack
- **Runtime**: Bun 1.x
- **Framework**: Hono 4.x
- **Container**: Docker + docker-compose
- **Storage**: JSON file (volume mounted)

## Architecture

```
User (dengan API key gateway)
    ↓
Gateway Server (validasi & track user key)
    ↓
Z.AI API (pakai ZAI_API_KEY dari env)
    ↓
Kembali ke User (catat transaksi)
```

## Project Structure

```
proxy-gateway/
├── src/
│   ├── index.ts          # Main Hono app
│   ├── proxy.ts          # Proxy ke Z.AI
│   ├── ratelimit.ts      # Token bucket & 5-hour window logic
│   ├── validator.ts      # API key validation & expiry check
│   └── storage.ts        # JSON file operations with locking
├── data/
│   └── apikeys.json      # API keys storage (volume mount)
├── docs/
│   └── plans/            # Design documents
├── Dockerfile
├── docker-compose.yml
├── package.json
└── bun.lockb
```

## API Keys Configuration

### apikeys.json Structure
```json
{
  "keys": [
    {
      "key": "pk_user_xxx",
      "name": "User Display Name",
      "model": "glm-4.7",
      "token_limit_per_5h": 100000,
      "expiry_date": "2025-12-31T23:59:59Z",
      "created_at": "2025-01-01T00:00:00Z",
      "last_used": "2025-01-18T10:30:00Z",
      "total_lifetime_tokens": 1500000,
      "usage_windows": [
        {
          "window_start": "2025-01-18T08:00:00Z",
          "tokens_used": 45000
        }
      ]
    }
  ]
}
```

### Fields
| Field | Description |
|-------|-------------|
| `key` | Unique API key for gateway access |
| `name` | Display name for identification |
| `model` | Override model (optional, falls back to env) |
| `token_limit_per_5h` | Token limit per rolling 5-hour window |
| `expiry_date` | Fixed expiry date (ISO 8601) |
| `created_at` | Creation timestamp |
| `last_used` | Last successful request timestamp |
| `total_lifetime_tokens` | Total tokens used (all time) |
| `usage_windows` | Array of 5-hour usage windows |

## Rate Limiting Logic

### 5-Hour Rolling Window
1. Find active windows (within 5 hours from now)
2. Create new window if none exists
3. Cleanup windows older than 5 hours
4. Sum tokens from all active windows
5. Reject if total > `token_limit_per_5h`
6. Update window with request tokens
7. Update `last_used` timestamp

### Limit Behavior
- **On limit exceeded**: Return 429 Too Many Requests with `Retry-After` header
- **On expired key**: Return 403 Forbidden
- **On invalid key**: Return 401 Unauthorized

## Endpoints

### Proxy: `/v1/*`
Proxies all requests to `https://api.z.ai/api/coding/paas/v4`

**Authentication:**
- `Authorization: Bearer <key>`
- `x-api-key: <key>`

**Request Flow:**
1. Extract API key from headers
2. Validate key exists & not expired
3. Check token limit
4. Forward to Z.AI with env `ZAI_API_KEY`
5. Capture usage from response
6. Update JSON atomically
7. Return response to client

### Stats: `GET /stats`
Get usage statistics for the authenticated key.

**Response:**
```json
{
  "key": "pk_user_xxx",
  "name": "User Display Name",
  "model": "glm-4.7",
  "token_limit_per_5h": 100000,
  "expiry_date": "2025-12-31T23:59:59Z",
  "created_at": "2025-01-01T00:00:00Z",
  "last_used": "2025-01-18T10:30:00Z",
  "is_expired": false,
  "current_usage": {
    "tokens_used_in_current_window": 45000,
    "window_started_at": "2025-01-18T08:00:00Z",
    "window_ends_at": "2025-01-18T13:00:00Z",
    "remaining_tokens": 55000
  },
  "total_lifetime_tokens": 1500000
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ZAI_API_KEY` | Master Z.AI API key | *required* |
| `DEFAULT_MODEL` | Default model if key has no override | `glm-4.7` |
| `PORT` | Server port | `3000` |

## Docker Setup

### Dockerfile
```dockerfile
FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY src/ ./src/
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["bun", "src/index.ts"]
```

### docker-compose.yml
```yaml
services:
  proxy-gateway:
    build: .
    ports:
      - "3000:3000"
    environment:
      ZAI_API_KEY: ${ZAI_API_KEY}
      DEFAULT_MODEL: glm-4.7
      PORT: 3000
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

## Key Management

### Manual JSON Editing
1. Edit `data/apikeys.json`
2. Restart container or send SIGHUP for reload
3. No API endpoints for CRUD (simplified approach)

### Generating API Keys
- Use any random string generator
- Recommended format: `pk_<identifier>_<random>`
- Example: `pk_user_budi_a1b2c3d4`

## Model Selection Hierarchy
1. Key-specific `model` field (highest priority)
2. `DEFAULT_MODEL` environment variable
3. Fallback to `glm-4.7`

## File Locking
- Use atomic write pattern: read → modify → write temp → rename
- Prevents race conditions from concurrent requests
- Ensures data consistency

## Error Responses

| Code | Description |
|------|-------------|
| 401 | API key not found |
| 403 | API key expired |
| 429 | Token limit exceeded (includes Retry-After) |
| 502 | Z.AI upstream error |

## Usage
```bash
# Start
docker-compose up -d

# View logs
docker-compose logs -f

# Check stats
curl -H "x-api-key: pk_user_xxx" http://localhost:3000/stats

# Make request
curl -H "Authorization: Bearer pk_user_xxx" \
  http://localhost:3000/v1/chat/completions \
  -d '{"model":"glm-4.7","messages":[{"role":"user","content":"hello"}]}'
```
