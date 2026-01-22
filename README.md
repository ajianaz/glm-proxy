# GLM Proxy

An API Gateway with rate limiting that proxies requests to Z.AI API (glm-4.7). Supports streaming, REST API, multi-user token-based quota management, and a web dashboard for API key management.

Created by [ajianaz](https://github.com/ajianaz)

## Features

- **OpenAI-Compatible**: Proxy endpoint `/v1/*` to Z.AI API
- **Anthropic-Compatible**: Proxy endpoint `/v1/messages` to Z.AI Anthropic API
- **Streaming Support**: Full support for Server-Sent Events (SSE)
- **Rate Limiting**: Token-based quota with rolling 5-hour window
- **Multi-User**: Multiple API keys with per-key limits
- **Usage Tracking**: Monitor token usage per key
- **Model Override**: Set specific model per API key
- **Web Dashboard**: User-friendly UI for managing API keys with real-time usage visualization

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

---

## Web Dashboard

The GLM Proxy includes a responsive web dashboard for managing API keys without manual JSON editing. Features include:

- **Create, View, Edit, Delete API Keys**: Simple form-based management
- **Real-time Usage Visualization**: Live updates of token consumption
- **Quota Monitoring**: Track remaining quota per key
- **Sortable & Filterable Table**: Easy navigation of multiple keys
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Authentication**: Optional bearer token or basic auth protection
- **Hot Reload**: Changes take effect immediately without server restart

### Dashboard Setup

#### 1. Environment Configuration

Add the following variables to your `.env` file:

```bash
# Dashboard Port (default: 3001)
DASHBOARD_PORT=3001

# Optional: Dashboard Authentication
# Choose one of the following methods:

# Method 1: Bearer Token
DASHBOARD_AUTH_TOKEN=your_secret_token_here

# Method 2: Basic Auth (Username & Password)
DASHBOARD_AUTH_USERNAME=admin
DASHBOARD_AUTH_PASSWORD=secure_password_here

# If none are set, the dashboard is publicly accessible
```

#### 2. Start the Dashboard

**Development Mode (with hot reload):**
```bash
bun dashboard
```

**Production Mode:**
```bash
bun dashboard
```

The dashboard will be available at `http://localhost:3001` (or your configured `DASHBOARD_PORT`).

#### 3. Accessing the Dashboard

Open your browser and navigate to:
```
http://localhost:3001
```

If authentication is configured, you'll see a login page:

- **Bearer Token Auth**: Enter your token in the login form
- **Basic Auth**: Enter your username and password

### Dashboard Features

#### Creating an API Key

1. Click the "Create New Key" button
2. Fill in the form:
   - **Key**: Auto-generated or enter custom (format: `pk_*`)
   - **Name**: Display name for the key
   - **Model**: Model to use (e.g., `glm-4.7`, `glm-4.5-air`)
   - **Token Limit**: Quota per 5-hour window (e.g., `100000`)
   - **Expiry Date**: When the key expires (ISO 8601 format)
3. Click "Create Key"

#### Viewing API Keys

The table displays all keys with:
- **Key ID**: Unique identifier
- **Name**: Display name
- **Model**: Assigned model
- **Quota**: Token limit per 5h window
- **Usage**: Current usage with progress bar
- **Expiry**: Expiration date

#### Editing an API Key

1. Click the edit icon (✏️) in the Actions column
2. Modify the desired fields
3. Click "Update Key"

#### Deleting an API Key

1. Click the delete icon (🗑️) in the Actions column
2. Confirm the deletion in the dialog

#### Real-time Usage Monitoring

- **Overview Cards**: Total keys, active keys, total quota, current usage
- **Top Consumer**: Highest usage key highlighted
- **Usage Charts**: Top keys by usage, quota distribution by model
- **Detailed Stats**: Click the focus button (📊) to see detailed stats for a specific key

#### Filter & Sort

- **Search**: Filter by key ID or name
- **Model Filter**: Show only keys for a specific model
- **Expired Filter**: Show/hide expired keys
- **Sort**: Click column headers to sort by any field

### Dashboard API Endpoints

The dashboard uses RESTful API endpoints that you can also use programmatically:

#### GET /api/keys

List all API keys with optional filtering and sorting.

```bash
curl -H "Authorization: Bearer YOUR_DASHBOARD_TOKEN" \
  "http://localhost:3001/api/keys?sort_by=created_at&sort_order=desc"
```

Query Parameters:
- `sort_by`: Field to sort by (`key`, `name`, `model`, `token_limit_per_5h`, `expiry_date`, `created_at`, `last_used`, `total_lifetime_tokens`)
- `sort_order`: `asc` or `desc`
- `filter_model`: Filter by model name
- `filter_expired`: `true` or `false`
- `search`: Search in key and name fields

Response:
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
      "last_used": "2026-01-18T01:00:00.000Z",
      "total_lifetime_tokens": 150,
      "usage_windows": []
    }
  ],
  "total": 1
}
```

#### POST /api/keys

Create a new API key.

```bash
curl -X POST http://localhost:3001/api/keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_DASHBOARD_TOKEN" \
  -d '{
    "key": "pk_new_user_123",
    "name": "New User",
    "model": "glm-4.7",
    "token_limit_per_5h": 50000,
    "expiry_date": "2026-12-31T23:59:59Z"
  }'
```

#### PUT /api/keys/:id

Update an existing API key.

```bash
curl -X PUT http://localhost:3001/api/keys/pk_user_12345 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_DASHBOARD_TOKEN" \
  -d '{
    "name": "Updated Name",
    "token_limit_per_5h": 75000
  }'
```

#### DELETE /api/keys/:id

Delete an API key.

```bash
curl -X DELETE http://localhost:3001/api/keys/pk_user_12345 \
  -H "Authorization: Bearer YOUR_DASHBOARD_TOKEN"
```

#### GET /api/keys/:id/usage

Get usage statistics for a specific key.

```bash
curl -H "Authorization: Bearer YOUR_DASHBOARD_TOKEN" \
  "http://localhost:3001/api/keys/pk_user_12345/usage"
```

Response:
```json
{
  "key": "pk_user_12345",
  "name": "User Full Name",
  "current_usage": {
    "tokens_used_in_current_window": 1500,
    "window_started_at": "2026-01-22T07:00:00.000Z",
    "window_ends_at": "2026-01-22T12:00:00.000Z",
    "remaining_tokens": 98500
  },
  "total_lifetime_tokens": 5000,
  "token_limit_per_5h": 100000,
  "is_expired": false,
  "expiry_date": "2026-12-31T23:59:59Z"
}
```

### WebSocket Events

The dashboard uses WebSocket for real-time updates. Connect to:
```
ws://localhost:3001
```

Include authentication credentials as query parameters:
```
ws://localhost:3001?auth_token=YOUR_TOKEN
```
or
```
ws://localhost:3001?auth_username=USER&auth_password=PASS
```

Event Types:
- `connected`: Connection established
- `key_created`: New API key created
- `key_updated`: API key updated
- `key_deleted`: API key deleted
- `usage_updated`: Usage statistics updated

Example event:
```json
{
  "type": "key_created",
  "timestamp": "2026-01-22T12:00:00.000Z",
  "data": {
    "key": "pk_new_key",
    "name": "New Key",
    "model": "glm-4.7",
    "token_limit_per_5h": 100000
  }
}
```

### Hot Reload

All API key changes made through the dashboard take effect immediately:
- **Created keys**: Immediately available for API requests
- **Updated keys**: New quota/limits apply on next request
- **Deleted keys**: Immediately rejected

No server restart required!

### Running Both Services

To run both the proxy service and dashboard simultaneously:

**Terminal 1 - Proxy:**
```bash
bun start
# Runs on PORT=3000 (or configured port)
```

**Terminal 2 - Dashboard:**
```bash
bun dashboard
# Runs on DASHBOARD_PORT=3001
```

Or use Docker Compose to run both services:
```bash
docker-compose up -d
```

---

## Proxy API Documentation

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

### Recommended: Use the Web Dashboard

**The web dashboard is the recommended method** for managing API keys. It provides:
- User-friendly interface (no manual JSON editing)
- Real-time validation
- Instant updates (hot reload)
- Usage visualization

See [Web Dashboard](#web-dashboard) section above for details.

### Manual API Key Management

API keys are stored in `data/apikeys.json`. You can edit this file directly, but using the dashboard is recommended to avoid errors.

#### API Key Structure

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
A: Wait until the 5-hour window ends, or request admin to increase limit via the dashboard.

**Q: Is my data stored?**
A: No logging of request/response. Only token usage is tracked.

**Q: What's the difference between OpenAI-compatible vs Anthropic-compatible?**
A: OpenAI-compatible (`/v1/chat/completions`) uses OpenAI format. Anthropic-compatible (`/v1/messages`) uses Anthropic Messages API format. Both are proxied to Z.AI glm-4.7.

**Q: How do I manage API keys?**
A: Use the web dashboard at `http://localhost:3001`. You can create, view, edit, and delete keys through the UI without editing JSON manually.

**Q: Is the dashboard secure?**
A: The dashboard supports optional authentication via bearer token or basic auth. Configure `DASHBOARD_AUTH_TOKEN` or `DASHBOARD_AUTH_USERNAME/PASSWORD` in your `.env` file.

**Q: Do I need to restart the server after changing API keys?**
A: No! Changes made through the dashboard take effect immediately. The proxy reads the latest key data on every request.

**Q: Can multiple users access the dashboard simultaneously?**
A: Yes, the dashboard supports multiple concurrent users. Real-time updates are pushed to all connected clients via WebSocket.

**Q: How do I monitor token usage in real-time?**
A: Open the dashboard and view the usage visualization cards. They update automatically as API requests are made.

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

### Dashboard won't start
```bash
# Check if port is already in use
lsof -ti:3001 | xargs kill -9

# Verify .env has DASHBOARD_PORT set
cat .env | grep DASHBOARD_PORT

# Check dashboard logs
bun dashboard
```

### Dashboard authentication not working
```bash
# Verify auth variables are set in .env
cat .env | grep DASHBOARD_AUTH

# Test authentication manually
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3001/api/keys

# Check browser console for errors
# Open DevTools → Console tab
```

### Dashboard not reflecting changes
```bash
# Verify hot reload is working
# 1. Make a change in the dashboard
# 2. Immediately test the API:
curl -H "Authorization: Bearer YOUR_KEY" http://localhost:3000/stats

# 3. Check apikeys.json file
cat data/apikeys.json | jq .

# Changes should be instant - no restart needed
```

### WebSocket connection issues
```bash
# Check if WebSocket is accessible
wscat -c "ws://localhost:3001?auth_token=YOUR_TOKEN"

# Or test in browser console
const ws = new WebSocket("ws://localhost:3001?auth_token=YOUR_TOKEN");
ws.onmessage = (e) => console.log(e.data);
```

---

## Development

### Run tests
```bash
# Run all tests
bun test

# Run API endpoint tests
bun test:api

# Run WebSocket tests
bun test:websocket

# Run hot reload tests
bun test:hot-reload

# Run tests in watch mode
bun test:watch
```

### Build
```bash
# Build proxy service
bun build src/index.ts --outdir dist

# Build dashboard
bun build index.ts --outdir dist
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
