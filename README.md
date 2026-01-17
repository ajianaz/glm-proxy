# GLM Proxy

API Gateway dengan rate limiting yang proxy request ke Z.AI API (glm-4.7). Support streaming, REST API, dan multi-user dengan token-based quota.

Created by [ajianaz](https://github.com/ajianaz)

## Fitur

- **OpenAI-Compatible**: Proxy endpoint `/v1/*` ke Z.AI API
- **Anthropic-Compatible**: Proxy endpoint `/v1/messages` ke Z.AI Anthropic API
- **Streaming Support**: Full support untuk Server-Sent Events (SSE)
- **Rate Limiting**: Token-based quota dengan rolling 5-hour window
- **Multi-User**: Multiple API keys dengan limit per-key
- **Usage Tracking**: Monitor penggunaan token per key
- **Model Override**: Set model spesifik per API key

## Setup Cepat

### 1. Environment Configuration

```bash
# Copy example env file
cp .env.example .env

# Edit .env
ZAI_API_KEY=your_zai_api_key_here    # Required: Master API key dari Z.AI
DEFAULT_MODEL=glm-4.7                 # Optional: Default model (fallback)
PORT=3030                             # Optional: Port untuk service
```

### 2. Start Service

**Docker (Recommended):**
```bash
docker-compose up -d
```

**Local dengan Bun:**
```bash
bun install
bun start
```

## API Documentation

### Endpoints

| Method | Endpoint | Deskripsi | Auth Required |
|--------|----------|-----------|---------------|
| GET | `/health` | Health check | No |
| GET | `/stats` | Usage statistics | Yes |
| POST | `/v1/chat/completions` | Chat completion (OpenAI-compatible) | Yes |
| POST | `/v1/completions` | Text completion (OpenAI-compatible) | Yes |
| POST | `/v1/messages` | Messages API (Anthropic-compatible) | Yes |
| ALL | `/v1/*` | Proxy lainnya ke Z.AI (OpenAI-compatible) | Yes |

### Authentication

Gunakan API key via header:
```bash
Authorization: Bearer pk_your_api_key
```

atau query parameter:
```bash
?api_key=pk_your_api_key
```

---

## Penggunaan

### 1. Cek Health

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

### 2. Cek Usage/Quota

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

### 3. Chat Completion (Non-Streaming)

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

### 4. Chat Completion (Streaming)

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

### Menggunakan Anthropic SDK (TypeScript/JavaScript)

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: 'pk_your_key',  // Gunakan API key dari proxy
  baseURL: 'http://localhost:3030',  // Base URL proxy (tanpa /v1/messages)
});

const msg = await anthropic.messages.create({
  model: 'glm-4.7',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello, GLM Proxy!' }],
});

console.log(msg.content);
```

### Menggunakan Anthropic SDK (Python)

```python
import anthropic

client = anthropic.Anthropic(
    api_key='pk_your_key',  # Gunakan API key dari proxy
    base_url='http://localhost:3030',  # Base URL proxy
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

## Manajemen API Key

API keys disimpan di `data/apikeys.json`. Edit manual untuk add/remove/modify keys.

### Struktur API Key

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

| Field | Tipe | Deskripsi |
|-------|------|-----------|
| `key` | string | Unique API key identifier (format: `pk_*`) |
| `name` | string | Nama user/owner |
| `model` | string | Model untuk key ini (glm-4.7, glm-4.5-air, dll) |
| `token_limit_per_5h` | number | Token quota per 5-hour rolling window |
| `expiry_date` | string | ISO 8601 timestamp untuk expiry |
| `created_at` | string | ISO 8601 timestamp pembuatan |
| `last_used` | string | ISO 8601 timestamp last usage (auto-updated) |
| `total_lifetime_tokens` | number | Total semua token yang pernah digunakan |
| `usage_windows` | array | Internal tracking array (auto-managed) |

### Contoh: Create New API Key

```bash
# Edit file
nano data/apikeys.json

# Atau dengan jq
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

- **Window Type**: Rolling window (bukan fixed reset)
- **Duration**: 5 jam
- **Metric**: Total tokens dari semua request dalam window aktif

### Contoh Perhitungan

Jika `token_limit_per_5h = 100,000`:

| Waktu | Tokens | Active Windows (5h) | Total Used | Status |
|-------|--------|---------------------|------------|--------|
| 00:00 | 10,000 | [(00:00-05:00, 10K)] | 10,000 | OK |
| 02:00 | 20,000 | [(00:00-05:00, 10K), (02:00-07:00, 20K)] | 30,000 | OK |
| 04:00 | 50,000 | [(00:00-05:00, 10K), (02:00-07:00, 20K), (04:00-09:00, 50K)] | 80,000 | OK |
| 04:30 | 30,000 | [(00:00-05:00, 10K), (02:00-07:00, 20K), (04:00-09:00, 50K), (04:30-09:30, 30K)] | 110,000 | **RATE LIMITED** |

### Response saat Rate Limited

```json
{
  "error": "Rate limit exceeded. Please try again later."
}
```

HTTP Status: `429 Too Many Requests`

---

## Kapasitas & Scaling

### Single Instance Capacity

Dengan setup default (Docker, 1 CPU, 512MB RAM):
- **Concurrent Requests**: ~50-100
- **Requests/second**: ~100-500 (tergantung response size)
- **Throughput**: Terbatas oleh Z.AI rate limit

### Bottleneck

1. **Z.AI Rate Limit**: Cek dokumentasi Z.AI untuk limit per API key
2. **Network**: Bandwidth server <-> Z.AI
3. **CPU/JSON parsing**: Untuk high-throughput scenarios

### Scaling Options

**Horizontal Scaling (Recommended):**
```bash
# Multiple instances behind load balancer
docker-compose up --scale proxy-gateway=3
```

**Vertical Scaling:**
- Increase CPU/RAM di docker-compose.yml
- Add Redis untuk distributed rate limiting

---

## Error Codes

| HTTP Code | Error Type | Deskripsi |
|-----------|------------|-----------|
| 200 | Success | Request berhasil |
| 400 | Bad Request | Invalid request body/params |
| 401 | Unauthorized | Missing/invalid API key |
| 403 | Forbidden | API key expired |
| 429 | Rate Limited | Quota exceeded |
| 500 | Server Error | Internal server error |
| 502 | Bad Gateway | Upstream (Z.AI) error |

---

## Information untuk User

### Share ke User

Berikan informasi berikut ke setiap user:

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

Cek quota: http://your-domain.com/stats
Documentation: http://your-domain.com/docs

Contoh Request:
curl -X POST http://your-domain.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "glm-4.7", "messages": [{"role": "user", "content": "Hello"}]}'
```

### FAQ

**Q: Apakah support streaming?**
A: Ya, set `"stream": true` di request body untuk streaming response (baik OpenAI maupun Anthropic format).

**Q: Apakah support Anthropic Messages API?**
A: Ya! Gunakan endpoint `/v1/messages` dengan format Anthropic. Proxy akan auto-forward ke Z.AI Anthropic-compatible API.

**Q: Apakah support model lain selain glm-4.7?**
A: Ya, glm-4.5-air, glm-4.7, glm-4.5-flash, dll. Check Z.AI docs untuk full list.

**Q: Bagaimana jika quota habis?**
A: Tunggu sampai 5-hour window berakhir, atau request admin untuk increase limit.

**Q: Apakah data saya disimpan?**
A: Tidak ada logging request/response. Hanya token usage yang di-track.

**Q: Bedanya OpenAI-compatible vs Anthropic-compatible?**
A: OpenAI-compatible (`/v1/chat/completions`) menggunakan format OpenAI. Anthropic-compatible (`/v1/messages`) menggunakan format Anthropic Messages API. Keduanya di-proxy ke Z.AI glm-4.7.

---

## Troubleshooting

### Container tidak start
```bash
# Check logs
docker-compose logs -f

# Rebuild
docker-compose up --build -d
```

### Port conflict
```bash
# Ganti PORT di .env
PORT=3031

# Atau kill process yang pakai port
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
# Check Z.AI_API_KEY valid
curl -H "Authorization: Bearer YOUR_ZAI_KEY" https://api.z.ai/api/coding/paas/v4/models

# Check rate limit Z.AI
# (Perlu dicek di dashboard Z.AI)
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
bun x tsc --noEmit
```
