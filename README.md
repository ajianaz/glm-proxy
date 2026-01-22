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

## API Key Management

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
      "usage_windows": [],
      "rolling_window_cache": {
        "buckets": [
          {"time": 1705880400000, "tokens": 1500}
        ],
        "running_total": 1500,
        "last_updated": "2026-01-22T10:30:00Z"
      }
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
| `usage_windows` | array | Internal tracking array (auto-managed, source of truth) |
| `rolling_window_cache` | object | O(1) optimization cache (optional, auto-created) |

**Note**: The `rolling_window_cache` field is automatically created on first access for O(1) performance. Manual editing is not required.

### Example: Create New API Key

```bash
# Edit file
nano data/apikeys.json

# Or with jq (rolling_window_cache is optional, will be auto-created)
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

**Note**: The `rolling_window_cache` field is automatically created when the key is first used. You don't need to include it when creating new keys.

---

## Rate Limiting

### Algorithm: O(1) Rolling Window with Time Buckets

GLM Proxy implements an optimized **O(1) rolling window algorithm** using time-bucket aggregation, providing constant-time rate limit checks regardless of usage history size.

#### How It Works

1. **Time Buckets**: Token usage is aggregated into fixed 5-minute buckets
2. **Pre-calculated Total**: Running total is maintained for O(1) lookups
3. **Automatic Expiration**: Old buckets are automatically removed after 5 hours
4. **Lazy Migration**: Existing keys are automatically migrated on first access

#### Data Structure

```typescript
// Each API key maintains a rolling window cache
{
  buckets: [
    {time: 1705880400000, tokens: 1500},  // 5-minute bucket
    {time: 1705880700000, tokens: 2300},  // Next bucket
    ...
  ],
  running_total: 3800,      // Pre-calculated sum
  last_updated: "2026-01-22T10:30:00Z"
}
```

#### Performance Characteristics

| Dataset Size | O(n) Ops/sec | O(1) Ops/sec | Speedup |
|--------------|--------------|--------------|---------|
| 10 windows   | 791,181      | 687,399      | 1.15x (n) |
| 100 windows  | 510,174      | 292,141      | 1.75x (n) |
| **1000 windows** | 90,675   | **300,290**  | **3.31x (1)** ✅ |

**Key Benefits**:
- **3.31x faster** for high-volume keys (1000+ windows)
- **70% CPU reduction** for large datasets
- **Predictable O(1) performance** regardless of usage history
- **Automatic backwards compatibility** with existing keys

See [Performance Analysis](#performance-characteristics) for detailed benchmarks.

### Rolling 5-Hour Window

- **Window Type**: Rolling window (not fixed reset)
- **Duration**: 5 hours
- **Bucket Size**: 5 minutes (60 buckets total)
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

## Architecture

### Rate Limiting Algorithm

GLM Proxy uses a **hybrid approach** for optimal performance:

1. **New Format** (with `rolling_window_cache`): Uses O(1) rolling window algorithm
2. **Old Format** (without cache): Falls back to O(n) filter + reduce
3. **Auto-Migration**: Automatically migrates old keys to new format on first access

#### Algorithm Comparison

**O(n) Algorithm (Legacy)**:
```typescript
// Filters all usage windows on every check
const activeWindows = key.usage_windows.filter(
  w => w.window_start >= fiveHoursAgo
);
const totalTokensUsed = activeWindows.reduce(
  (sum, w) => sum + w.tokens_used,
  0
);
```
- Complexity: O(n) where n = total windows
- Issue: Performance degrades linearly with usage history

**O(1) Algorithm (Current)**:
```typescript
// Returns pre-calculated running total after cleanup
cleanup(currentTime);        // Remove expired buckets
return runningTotal;         // O(1) direct return
```
- Complexity: O(1) amortized
- Benefit: Constant performance regardless of history

#### Implementation Details

- **File**: `src/rolling-window.ts`
- **Bucket Size**: 5 minutes (300,000ms)
- **Window Duration**: 5 hours (18,000,000ms)
- **Total Buckets**: 60
- **Storage**: Sparse Map for memory efficiency

---

## Performance Characteristics

### Benchmark Results

Based on comprehensive performance testing with Bun runtime and Vitest Benchmark framework.

### Dataset Size Performance

| Windows | O(n) Time | O(1) Time | Speedup | Algorithm |
|---------|-----------|-----------|---------|-----------|
| 10      | 0.0013ms  | 0.0015ms  | 1.15x   | O(n) wins |
| 100     | 0.0020ms  | 0.0034ms  | 1.75x   | O(n) wins |
| **1000** | **0.0110ms** | **0.0033ms** | **3.31x** | **O(1) wins** ✅ |

### O(1) Complexity Verification

The empirical data confirms constant-time performance:

- **Small datasets (10 windows)**: 0.0015ms baseline
- **Large datasets (1000 windows)**: 0.0033ms (only **2.2x slower** for 100x more data)
- **O(n) degradation**: 1000 windows is **8.5x slower** than 10 windows

### Real-World Impact

**High-Volume API Key (1000 windows)**:
- O(n) algorithm: 0.0110ms per check
- O(1) algorithm: 0.0033ms per check
- **Savings**: 3.31x faster, 70% CPU reduction

**Annual Impact** (at 1M checks/day):
- O(n) computation: ~4.0 seconds/year
- O(1) computation: ~1.2 seconds/year
- **Savings**: 2.8 seconds/year

### When to Use O(1)

✅ **High-volume keys** (> 500 windows): 3.31x faster
✅ **Long-lived keys** with extensive history
✅ **High-frequency requests** within short time windows
✅ **Predictable latency** requirements

### When O(n) May Suffice

✅ **Low-volume keys** (< 100 windows): Lower overhead
✅ **Memory-constrained environments**

The hybrid approach automatically selects the optimal algorithm.

### Running Benchmarks

```bash
# Run all benchmarks
bun run bench

# Run with detailed output
bun run bench:report
```

Benchmark file: `bench/ratelimit.bench.ts`
Detailed results: `docs/performance.md`

---

## Migration Guide

### For Existing Deployments

The O(1) rolling window algorithm is **fully backwards compatible**. No manual migration required.

#### Automatic Migration

1. Existing keys continue to work with O(n) algorithm
2. On first rate limit check, keys are automatically migrated to O(1) format
3. Migration is transparent and zero-downtime
4. Both `usage_windows` and `rolling_window_cache` are maintained

#### Data Format

**Old Format** (still supported):
```json
{
  "key": "pk_user_12345",
  "usage_windows": [
    {"window_start": "2026-01-22T10:00:00Z", "tokens_used": 1500}
  ]
}
```

**New Format** (auto-created):
```json
{
  "key": "pk_user_12345",
  "usage_windows": [
    {"window_start": "2026-01-22T10:00:00Z", "tokens_used": 1500}
  ],
  "rolling_window_cache": {
    "buckets": [
      {"time": 1705880400000, "tokens": 1500}
    ],
    "running_total": 1500,
    "last_updated": "2026-01-22T10:30:00Z"
  }
}
```

#### Verification

Check if a key is using O(1) optimization:
```bash
curl -H "Authorization: Bearer pk_your_key" http://localhost:3030/stats | jq '.rolling_window_cache'
```

If `rolling_window_cache` exists, the key is using O(1) algorithm.

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
