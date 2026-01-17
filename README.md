# Proxy Gateway

API Gateway dengan rate limiting yang proxy request ke Z.AI API (glm-4.7).

## Setup

1. Copy environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your Z.AI API key:
   ```bash
   ZAI_API_KEY=your_zai_api_key_here
   ```

3. Start with Docker:
   ```bash
   docker-compose up -d
   ```

   Or run locally with Bun:
   ```bash
   bun install
   bun start
   ```

## Usage

### Check stats
```bash
curl -H "x-api-key: pk_your_key" http://localhost:3000/stats
```

### Chat completion
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pk_your_key" \
  -d '{
    "model": "glm-4.7",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### Create new API key

Edit `data/apikeys.json`:
```json
{
  "keys": [
    {
      "key": "pk_new_user_key",
      "name": "User Name",
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

## Rate Limiting

- Rolling 5-hour window
- Token-based counting
- Returns 429 when exceeded

## Endpoints

- `GET /health` - Health check
- `GET /stats` - Usage statistics (requires API key)
- `ALL /v1/*` - Proxy to Z.AI
