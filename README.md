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
- **In-Memory Caching**: LRU cache with TTL for API key lookups (eliminates 95%+ file I/O)

## Quick Setup

### 1. Environment Configuration

```bash
# Copy example env file
cp .env.example .env

# Edit .env
ZAI_API_KEY=your_zai_api_key_here    # Required: Master API key from Z.AI
DEFAULT_MODEL=glm-4.7                 # Optional: Default model (fallback)
PORT=3030                             # Optional: Service port

# Cache Configuration (Optional)
CACHE_ENABLED=true                    # Enable/disable in-memory cache (default: true)
CACHE_TTL_MS=300000                   # Cache TTL in milliseconds (default: 300000 = 5 minutes)
CACHE_MAX_SIZE=1000                   # Maximum cache entries (default: 1000)
CACHE_WARMUP_ON_START=false           # Pre-load all keys on startup (default: false)
CACHE_LOG_LEVEL=none                  # Cache logging: none, info, or debug (default: none)
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
| GET | `/cache-stats` | Cache statistics | Yes |
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
    "window_ends_at": "2026-01-18T05:00:00.000Z",
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

## Cache Architecture

### Overview

The proxy implements an **in-memory LRU (Least Recently Used) cache** to dramatically reduce file I/O overhead. Every API request requires an authentication check that looks up the API key from `data/apikeys.json`. Without caching, each request triggers a disk read with file locking, creating a bottleneck under load.

### How It Works

```
Request → Auth Middleware → findApiKey()
                              ↓
                    ┌─────────────────┐
                    │  Cache Enabled? │
                    └─────────────────┘
                              ↓
                    ┌─────────────────┐
                    │ Check Cache     │─── Hit? → Return Cached API Key (<1ms)
                    └─────────────────┘
                              ↓ Miss
                    ┌─────────────────┐
                    │ Read from File  │─── Populate Cache → Return API Key (5-50ms)
                    └─────────────────┘
```

### Cache Features

- **TTL Expiration**: Entries expire after 5 minutes (configurable via `CACHE_TTL_MS`)
- **LRU Eviction**: When cache is full, least recently used entries are evicted
- **Negative Caching**: Non-existent keys are cached as `null` to prevent repeated lookups
- **Automatic Updates**: Cache is updated when API key usage is recorded (e.g., token counts)
- **Optional Warm-up**: Pre-load all keys on startup to eliminate cold starts

### Performance Benefits

| Metric | Without Cache | With Cache | Improvement |
|--------|---------------|------------|-------------|
| API key lookup latency | 5-50ms | <1ms | **>10x faster** |
| File I/O operations | 1 per request | ~0.05 per request | **95% reduction** |
| Concurrent request capacity | Limited by file locking | 100+ requests | **No contention** |

### Configuration Options

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `CACHE_ENABLED` | `true` | Enable or disable the cache entirely |
| `CACHE_TTL_MS` | `300000` | Time-to-live in milliseconds (300000 = 5 minutes) |
| `CACHE_MAX_SIZE` | `1000` | Maximum number of API keys to cache |
| `CACHE_WARMUP_ON_START` | `false` | Pre-load all API keys on application startup |
| `CACHE_LOG_LEVEL` | `none` | Logging verbosity: `none`, `info`, or `debug` |

### Cache Monitoring

Check cache performance and statistics:

```bash
curl -H "Authorization: Bearer pk_your_key" http://localhost:3030/cache-stats
```

Response:
```json
{
  "hits": 1523,
  "misses": 12,
  "hitRate": 99.22,
  "size": 45,
  "maxSize": 1000,
  "enabled": true
}
```

**Metrics Explained:**
- `hits`: Number of successful cache retrievals
- `misses`: Number of cache misses (required file read)
- `hitRate`: Percentage of requests served from cache (target: >95%)
- `size`: Current number of entries in cache
- `maxSize`: Maximum cache capacity
- `enabled`: Whether cache is currently enabled

### Cache Coherency

The cache maintains data consistency through:

1. **TTL Expiration**: Entries auto-expire after 5 minutes, ensuring fresh data
2. **Write-Through Updates**: When token usage is recorded, the cache is immediately updated
3. **Selective Invalidation**: Only the affected key is updated, not the entire cache
4. **Fail-Safe Design**: If the cache is disabled, all operations fall back to file-based storage

### Logging

Debug cache operations by setting `CACHE_LOG_LEVEL`:

```bash
# Enable debug logging (shows every cache hit/miss)
CACHE_LOG_LEVEL=debug

# Enable info logging (shows cache updates and warm-up)
CACHE_LOG_LEVEL=info

# Disable cache logging (default)
CACHE_LOG_LEVEL=none
```

Example log output:
```
[cache] Cache hit {"key":"pk_user_1...","found":true}
[cache] Cache miss - fallback to file {"key":"pk_user_2..."}
[cache] Cache populated after file read {"key":"pk_user_2...","found":true}
[cache] Cache updated after usage update {"key":"pk_user_1...","tokensUsed":150,"totalTokens":5000}
```

---

API keys are stored in `data/apikeys.json`. Edit manually to add/remove/modify keys.

### API Key Structure

```json
{
  "keys": [
    {
      "key": "pk_user_12345",
      "name": "User Full Name",
      "model": "glm-4.7",
      "token_limit_per_5h": 100000,
      "expiry_date": "2026-12-31T23:59:59Z",
      "created_at": "2026-01-18T00:00:00Z",
      "last_used": "2026-01-18T00:00:00Z",
      "total_lifetime_tokens": 0,
      "usage_windows": []
    }
  ]
}
```

### Field Configuration

| Field | Type | Description |
|-------|------|-------------|
| `key` | string | Unique API key identifier (format: `pk_*`) |
| `name` | string | User/owner name |
| `model` | string | Model for this key (glm-4.7, glm-4.5-air, etc.) |
| `token_limit_per_5h` | number | Token quota per 5-hour rolling window |
| `expiry_date` | string | ISO 8601 timestamp for expiry |
| `created_at` | string | ISO 8601 creation timestamp |
| `last_used` | string | ISO 8601 last usage timestamp (auto-updated) |
| `total_lifetime_tokens` | number | Total all tokens ever used |
| `usage_windows` | array | Internal tracking array (auto-managed) |

### Example: Create New API Key

```bash
# Edit file
nano data/apikeys.json

# Or with jq
jq '.keys += [{
  "key": "pk_new_user_'"$(date +%s)"'",
  "name": "New User",
  "model": "glm-4.7",
  "token_limit_per_5h": 50000,
  "expiry_date": "2026-12-31T23:59:59Z",
  "created_at": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
  "last_used": "2026-01-18T00:00:00Z",
  "total_lifetime_tokens": 0,
  "usage_windows": []
}]' data/apikeys.json > tmp.json && mv tmp.json data/apikeys.json
```

---

## Rate Limiting

### Rolling 5-Hour Window

- **Window Type**: Rolling window (not fixed reset)
- **Duration**: 5 hours
- **Metric**: Total tokens from all requests within active window

### Calculation Example

If `token_limit_per_5h = 100,000`:

| Time | Tokens | Active Windows (5h) | Total Used | Status |
|------|--------|---------------------|------------|--------|
| 00:00 | 10,000 | [(00:00-05:00, 10K)] | 10,000 | OK |
| 02:00 | 20,000 | [(00:00-05:00, 10K), (02:00-07:00, 20K)] | 30,000 | OK |
| 04:00 | 50,000 | [(00:00-05:00, 10K), (02:00-07:00, 20K), (04:00-09:00, 50K)] | 80,000 | OK |
| 04:30 | 30,000 | [(00:00-05:00, 10K), (02:00-07:00, 20K), (04:00-09:00, 50K), (04:30-09:30, 30K)] | 110,000 | **RATE LIMITED** |

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
Quota: 100,000 tokens per 5 hours
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
A: Wait until the 5-hour window ends, or request admin to increase limit.

**Q: Is my data stored?**
A: No logging of request/response. Only token usage is tracked.

**Q: What's the difference between OpenAI-compatible vs Anthropic-compatible?**
A: OpenAI-compatible (`/v1/chat/completions`) uses OpenAI format. Anthropic-compatible (`/v1/messages`) uses Anthropic Messages API format. Both are proxied to Z.AI glm-4.7.

---

## Troubleshooting

### Cache Issues

**Cache hit rate is low (<95%)**
```bash
# Check cache statistics
curl -H "Authorization: Bearer pk_your_key" http://localhost:3030/cache-stats

# Enable warm-up to pre-load all keys on startup
CACHE_WARMUP_ON_START=true
```

**API key changes not reflected**
```bash
# Cache has 5-minute TTL. Wait for expiration or restart service:
docker-compose restart

# Or disable cache temporarily for testing
CACHE_ENABLED=false
```

**Debug cache behavior**
```bash
# Enable debug logging to see cache operations
CACHE_LOG_LEVEL=debug

# Check logs for cache hits/misses
docker-compose logs -f | grep "\[cache\]"
```

**Cache using too much memory**
```bash
# Reduce maximum cache size
CACHE_MAX_SIZE=500

# Check current cache size
curl -H "Authorization: Bearer pk_your_key" http://localhost:3030/cache-stats
```

**Disable cache entirely**
```bash
# Set environment variable
CACHE_ENABLED=false

# Then restart service
docker-compose restart
```

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
