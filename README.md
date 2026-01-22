# GLM Proxy

An API Gateway with rate limiting that proxies requests to Z.AI API (glm-4.7). Supports streaming, REST API, and multi-user token-based quota management.

Created by [ajianaz](https://github.com/ajianaz)

## Features

- **OpenAI-Compatible**: Proxy endpoint `/v1/*` to Z.AI API
- **Anthropic-Compatible**: Proxy endpoint `/v1/messages` to Z.AI Anthropic API
- **Streaming Support**: Full support for Server-Sent Events (SSE)
- **Rate Limiting**: Token-based quota with rolling 5-hour window
- **Multi-User**: Multiple API keys with per-key limits
- **Usage Tracking**: Monitor token usage per key
- **Model Override**: Set specific model per API key

## Quick Setup

### 1. Environment Configuration

```bash
# Copy example env file
cp .env.example .env

# Edit .env
ZAI_API_KEY=your_zai_api_key_here    # Required: Master API key from Z.AI
DEFAULT_MODEL=glm-4.7                 # Optional: Default model (fallback)
PORT=3030                             # Optional: Service port
DATABASE_URL=postgresql://user:password@localhost:5432/glm_proxy  # Required: PostgreSQL database
ADMIN_API_KEY=ajianaz_admin_your_admin_key_here  # Required: Admin authentication key
```

### 2. Start Service

**Docker (Recommended):**
```bash
docker-compose up -d
```

**Local with Bun:**
```bash
bun install
bun start
```

## API Documentation

### Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/health` | Health check | No |
| GET | `/stats` | Usage statistics | Yes |
| POST | `/v1/chat/completions` | Chat completion (OpenAI-compatible) | Yes |
| POST | `/v1/messages` | Messages API (Anthropic-compatible) | Yes |
| GET | `/v1/models` | List available models | Yes |

### Authentication

Use API key via header:
```bash
Authorization: Bearer pk_your_api_key
```

or query parameter:
```bash
?api_key=pk_your_api_key
```

---

## Admin API

The Admin API provides endpoints for managing API keys. All admin endpoints require authentication via the `ADMIN_API_KEY`.

### Admin Authentication

Use admin API key via header:
```bash
Authorization: Bearer ajianaz_admin_your_admin_key_here
```

### Admin Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/admin/api-keys` | Create a new API key | Admin API Key |
| GET | `/admin/api-keys` | List all API keys (with pagination) | Admin API Key |
| GET | `/admin/api-keys/:id` | Get API key by ID | Admin API Key |
| GET | `/admin/api-keys/key/:key` | Get API key by key value | Admin API Key |
| PUT | `/admin/api-keys/:id` | Update an API key | Admin API Key |
| DELETE | `/admin/api-keys/:id` | Delete an API key | Admin API Key |
| POST | `/admin/api-keys/:id/regenerate` | Regenerate API key value | Admin API Key |

### Example: Create API Key

```bash
curl -X POST http://localhost:3030/admin/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ajianaz_admin_your_admin_key_here" \
  -d '{
    "name": "John Doe",
    "model": "glm-4.7",
    "tokenLimitPerDay": 100000,
    "expiryDate": "2026-12-31T23:59:59Z"
  }'
```

Response:
```json
{
  "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "key": "pk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "name": "John Doe",
  "model": "glm-4.7",
  "tokenLimitPerDay": 100000,
  "expiryDate": "2026-12-31T23:59:59Z",
  "createdAt": "2026-01-23T00:00:00.000Z",
  "lastUsed": null,
  "totalLifetimeTokens": 0
}
```

### Example: List API Keys

```bash
curl -H "Authorization: Bearer ajianaz_admin_your_admin_key_here" \
  "http://localhost:3030/admin/api-keys?limit=10&offset=0"
```

Response:
```json
{
  "keys": [
    {
      "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "key": "pk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "name": "John Doe",
      "model": "glm-4.7",
      "tokenLimitPerDay": 100000,
      "expiryDate": "2026-12-31T23:59:59Z",
      "createdAt": "2026-01-23T00:00:00.000Z",
      "lastUsed": "2026-01-23T01:00:00.000Z",
      "totalLifetimeTokens": 1500
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

### Example: Get API Key by ID

```bash
curl -H "Authorization: Bearer ajianaz_admin_your_admin_key_here" \
  "http://localhost:3030/admin/api-keys/01ARZ3NDEKTSV4RRFFQ69G5FAV"
```

### Example: Update API Key

```bash
curl -X PUT http://localhost:3030/admin/api-keys/01ARZ3NDEKTSV4RRFFQ69G5FAV \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ajianaz_admin_your_admin_key_here" \
  -d '{
    "name": "John Doe Updated",
    "tokenLimitPerDay": 150000
  }'
```

### Example: Regenerate API Key

```bash
curl -X POST http://localhost:3030/admin/api-keys/01ARZ3NDEKTSV4RRFFQ69G5FAV/regenerate \
  -H "Authorization: Bearer ajianaz_admin_your_admin_key_here"
```

Response:
```json
{
  "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "key": "pk_NEW regenerated key value",
  "name": "John Doe",
  "model": "glm-4.7",
  "tokenLimitPerDay": 100000,
  "expiryDate": "2026-12-31T23:59:59Z",
  "createdAt": "2026-01-23T00:00:00.000Z",
  "lastUsed": "2026-01-23T01:00:00.000Z",
  "totalLifetimeTokens": 1500
}
```

### Example: Delete API Key

```bash
curl -X DELETE http://localhost:3030/admin/api-keys/01ARZ3NDEKTSV4RRFFQ69G5FAV \
  -H "Authorization: Bearer ajianaz_admin_your_admin_key_here"
```

Response: `204 No Content`

---

## Usage

### 1. Check Health

```bash
curl http://localhost:3030/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2026-01-18T00:00:00.000Z"
}
```

### 2. Check Usage/Quota

```bash
curl -H "Authorization: Bearer pk_your_key" http://localhost:3030/stats
```

Response:
```json
{
  "key": "pk_test_key",
  "name": "Test User",
  "model": "glm-4.7",
  "token_limit_per_5h": 100000,
  "expiry_date": "2026-12-31T23:59:59Z",
  "created_at": "2026-01-18T00:00:00Z",
  "last_used": "2026-01-18T01:00:00.000Z",
  "is_expired": false,
  "current_usage": {
    "tokens_used_in_current_window": 150,
    "window_started_at": "2026-01-18T00:00:00.000Z",
    "window_ends_at": "2026-01-19T00:00:00.000Z",
    "remaining_tokens": 99850
  },
  "total_lifetime_tokens": 150
}
```

### 3. Chat Completion (OpenAI-Compatible, Non-Streaming)

```bash
curl -X POST http://localhost:3030/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_your_key" \
  -d '{
    "model": "glm-4.7",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ],
    "temperature": 0.7,
    "max_tokens": 1000
  }'
```

### 4. Chat Completion (OpenAI-Compatible, Streaming)

```bash
curl -X POST http://localhost:3030/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_your_key" \
  -d '{
    "model": "glm-4.7",
    "messages": [{"role": "user", "content": "Tell me a joke"}],
    "stream": true
  }'
```

Streaming response format (SSE):
```
data: {"id":"...","created":1234567890,"object":"chat.completion.chunk","model":"glm-4.7","choices":[{"index":0,"delta":{"content":"Hello"}}]}

data: {"id":"...","created":1234567890,"object":"chat.completion.chunk","model":"glm-4.7","choices":[{"index":0,"delta":{"content":" world"}}]}

data: [DONE]
```

### 5. Anthropic Messages API (Non-Streaming)

```bash
curl -X POST http://localhost:3030/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_your_key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "glm-4.7",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### 6. Anthropic Messages API (Streaming)

```bash
curl -X POST http://localhost:3030/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_your_key" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "glm-4.7",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Tell me a joke"}
    ]
  }'
```

### Using Anthropic SDK (TypeScript/JavaScript)

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: 'pk_your_key',  // Use API key from proxy
  baseURL: 'http://localhost:3030',  // Proxy base URL (without /v1/messages)
});

const msg = await anthropic.messages.create({
  model: 'glm-4.7',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello, GLM Proxy!' }],
});

console.log(msg.content);
```

### Using Anthropic SDK (Python)

```python
import anthropic

client = anthropic.Anthropic(
    api_key='pk_your_key',  # Use API key from proxy
    base_url='http://localhost:3030',  # Proxy base URL
)

message = client.messages.create(
    model='glm-4.7',
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "Hello, GLM Proxy!"}
    ]
)

print(message.content)
```

---

## API Key Management

API keys are managed through the Admin API (see above). All CRUD operations are available via REST endpoints.

### API Key Structure

```json
{
  "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "key": "pk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "name": "User Full Name",
  "model": "glm-4.7",
  "tokenLimitPerDay": 100000,
  "expiryDate": "2026-12-31T23:59:59Z",
  "createdAt": "2026-01-18T00:00:00.000Z",
  "lastUsed": "2026-01-18T00:00:00.000Z",
  "totalLifetimeTokens": 0
}
```

### Field Configuration

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique ULID identifier |
| `key` | string | API key value (format: `pk_*`, auto-generated) |
| `name` | string | User/owner name |
| `model` | string | Model for this key (glm-4.7, glm-4.5-air, etc.) |
| `tokenLimitPerDay` | number | Token quota per 24-hour period |
| `expiryDate` | string | ISO 8601 timestamp for expiry |
| `createdAt` | string | ISO 8601 creation timestamp |
| `lastUsed` | string | ISO 8601 last usage timestamp (auto-updated) |
| `totalLifetimeTokens` | number | Total all tokens ever used |

---

## Rate Limiting

### Rolling 24-Hour Window

- **Window Type**: Rolling window (not fixed reset)
- **Duration**: 24 hours
- **Metric**: Total tokens from all requests within active window

### Calculation Example

If `tokenLimitPerDay = 100,000`:

| Time | Tokens | Active Windows (24h) | Total Used | Status |
|------|--------|----------------------|------------|--------|
| Day 1 00:00 | 10,000 | [(D1 00:00-D2 00:00, 10K)] | 10,000 | OK |
| Day 1 12:00 | 20,000 | [(D1 00:00-D2 00:00, 10K), (D1 12:00-D2 12:00, 20K)] | 30,000 | OK |
| Day 1 20:00 | 50,000 | [(D1 00:00-D2 00:00, 10K), (D1 12:00-D2 12:00, 20K), (D1 20:00-D2 20:00, 50K)] | 80,000 | OK |
| Day 2 04:00 | 30,000 | [(D1 12:00-D2 12:00, 20K), (D1 20:00-D2 20:00, 50K), (D2 04:00-D3 04:00, 30K)] | 100,000 | **RATE LIMITED** |

### Rate Limited Response

```json
{
  "error": "Rate limit exceeded. Please try again later."
}
```

HTTP Status: `429 Too Many Requests`

---

## Capacity & Scaling

### Single Instance Capacity

With default setup (Docker, 1 CPU, 512MB RAM):
- **Concurrent Requests**: ~50-100
- **Requests/second**: ~100-500 (depending on response size)
- **Throughput**: Limited by Z.AI rate limit

### Bottlenecks

1. **Z.AI Rate Limit**: Check Z.AI documentation for limits per API key
2. **Network**: Bandwidth server <-> Z.AI
3. **CPU/JSON parsing**: For high-throughput scenarios

### Scaling Options

**Horizontal Scaling (Recommended):**
```bash
# Multiple instances behind load balancer
docker-compose up --scale proxy-gateway=3
```

**Vertical Scaling:**
- Increase CPU/RAM in docker-compose.yml
- Add Redis for distributed rate limiting

---

## Error Codes

| HTTP Code | Error Type | Description |
|-----------|------------|-------------|
| 200 | Success | Request successful |
| 400 | Bad Request | Invalid request body/params |
| 401 | Unauthorized | Missing/invalid API key |
| 403 | Forbidden | API key expired |
| 429 | Rate Limited | Quota exceeded |
| 500 | Server Error | Internal server error |
| 502 | Bad Gateway | Upstream (Z.AI) error |

---

## User Information

### Share with Users

Provide the following information to each user:

```
📝 API Access Information

Endpoint: http://your-domain.com/v1/chat/completions
Method: POST
Headers:
  Authorization: Bearer YOUR_API_KEY
  Content-Type: application/json

Your API Key: pk_xxxxx
Quota: 100,000 tokens per 24 hours
Expiry: 2026-12-31

Check quota: http://your-domain.com/stats
Documentation: http://your-domain.com/docs

Example Request:
curl -X POST http://your-domain.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "glm-4.7", "messages": [{"role": "user", "content": "Hello"}]}'
```

### FAQ

**Q: Does it support streaming?**
A: Yes, set `"stream": true` in the request body for streaming response (both OpenAI and Anthropic formats).

**Q: Does it support Anthropic Messages API?**
A: Yes! Use endpoint `/v1/messages` with Anthropic format. The proxy will auto-forward to Z.AI Anthropic-compatible API.

**Q: Does it support models other than glm-4.7?**
A: Yes, glm-4.5-air, glm-4.7, glm-4.5-flash, etc. Check Z.AI docs for full list.

**Q: What if quota runs out?**
A: Wait until the 24-hour window ends, or request admin to increase limit.

**Q: Is my data stored?**
A: No logging of request/response. Only token usage is tracked.

**Q: What's the difference between OpenAI-compatible vs Anthropic-compatible?**
A: OpenAI-compatible (`/v1/chat/completions`) uses OpenAI format. Anthropic-compatible (`/v1/messages`) uses Anthropic Messages API format. Both are proxied to Z.AI glm-4.7.

---

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs -f

# Rebuild
docker-compose up --build -d
```

### Port conflict
```bash
# Change PORT in .env
PORT=3031

# Or kill process using port
lsof -ti:3030 | xargs kill -9
```

### API key invalid/expired
```bash
# Check apikeys.json
cat data/apikeys.json | jq .

# Update expiry date
jq '.keys[0].expiry_date = "2027-12-31T23:59:59Z"' data/apikeys.json > tmp.json && mv tmp.json data/apikeys.json
```

### Z.AI error
```bash
# Check Z.AI_API_KEY is valid
curl -H "Authorization: Bearer YOUR_ZAI_KEY" https://api.z.ai/api/coding/paas/v4/models

# Check Z.AI rate limit
# (Need to check in Z.AI dashboard)
```

---

## Development

### Run tests
```bash
bun test
```

### Build
```bash
bun build src/index.ts --outdir /tmp/build
```

### Type check
```bash
bun run typecheck
```

### Lint
```bash
bun run lint
```

---

## Available Models

| Model | Description | Context | Max Output |
|-------|-------------|---------|------------|
| glm-4.7 | High-intelligence flagship | 200K | 96K |
| glm-4.5-air | High cost-performance | 128K | 96K |
| glm-4.5-flash | Free model | 128K | 96K |

---

## License

MIT

---

## Support

For issues and questions, please contact [ajianaz](https://github.com/ajianaz).
