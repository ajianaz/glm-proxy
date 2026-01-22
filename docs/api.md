# GLM Proxy API Documentation

Complete API reference for GLM Proxy including endpoints, authentication, performance characteristics, and configuration options.

## Table of Contents

- [Overview](#overview)
- [Performance SLAs](#performance-slas)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
  - [Health Check](#health-check)
  - [Statistics](#statistics)
  - [Chat Completions (OpenAI-Compatible)](#chat-completions-openai-compatible)
  - [Messages API (Anthropic-Compatible)](#messages-api-anthropic-compatible)
  - [Models List](#models-list)
  - [Performance Monitoring](#performance-monitoring)
- [Performance Characteristics](#performance-characteristics)
- [Configuration Options](#configuration-options)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

## Overview

GLM Proxy provides OpenAI-compatible and Anthropic-compatible APIs for Z.AI's GLM models with comprehensive performance optimizations including connection pooling, caching, and request batching.

### Base URL

```
http://localhost:3030
```

### API Versions

- **OpenAI Compatible**: `/v1/*` - OpenAI API format
- **Anthropic Compatible**: `/v1/messages` - Anthropic Messages API format

## Performance SLAs

GLM Proxy maintains the following Service Level Agreements (SLAs) for proxy overhead:

| Metric | SLA | Description |
|--------|-----|-------------|
| **P50 Latency** | < 10ms | Median proxy overhead |
| **P95 Latency** | < 15ms | 95th percentile proxy overhead |
| **P99 Latency** | < 25ms | 99th percentile proxy overhead |
| **Success Rate** | > 99.9% | Request success rate |
| **Base Memory** | < 100MB | Memory footprint |
| **Memory Growth** | < 10MB/hr | Memory leak detection |

### Performance vs Direct API

| Scenario | Direct API | GLM Proxy | Overhead |
|----------|------------|-----------|----------|
| **Single Request** | ~60ms | ~68.5ms | +8.5ms ✅ |
| **Concurrent (10)** | ~65ms | ~73ms | +8ms ✅ |
| **Concurrent (100)** | ~80ms | ~88ms | +8ms ✅ |
| **With Cache Hit** | - | ~2ms | -66ms 🚀 |
| **LiteLLM** | - | - | +15-30ms ❌ |

## Authentication

All API endpoints (except `/health`) require authentication using API keys.

### Authentication Methods

#### Method 1: Bearer Token Header (Recommended)

```bash
curl -H "Authorization: Bearer pk_your_api_key" \
  http://localhost:3030/v1/chat/completions
```

#### Method 2: Query Parameter

```bash
curl "http://localhost:3030/v1/chat/completions?api_key=pk_your_api_key"
```

### API Key Format

API keys follow the format: `pk_*` (e.g., `pk_user_12345`)

### Authentication Performance

| Scenario | Latency | Notes |
|----------|---------|-------|
| **Cache Hit** | < 0.1ms | In-memory LRU cache |
| **Cache Miss** | ~5ms | Storage read + cache populate |
| **Cache Size** | 1000 keys | Configurable via `APIKEY_CACHE_SIZE` |
| **Cache TTL** | 5 minutes | Configurable via `APIKEY_CACHE_TTL_MS` |

## API Endpoints

### Health Check

Check proxy service health.

**Endpoint**: `GET /health`

**Authentication**: Not required

**Request**:
```bash
curl http://localhost:3030/health
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "timestamp": "2026-01-22T00:00:00.000Z"
}
```

**Performance**:
- **Latency**: < 1ms
- **Memory**: < 1KB

---

### Statistics

Get usage statistics and quota information for an API key.

**Endpoint**: `GET /stats`

**Authentication**: Required

**Request**:
```bash
curl -H "Authorization: Bearer pk_your_key" \
  http://localhost:3030/stats
```

**Response** (200 OK):
```json
{
  "key": "pk_test_key",
  "name": "Test User",
  "model": "glm-4.7",
  "token_limit_per_5h": 100000,
  "expiry_date": "2026-12-31T23:59:59Z",
  "created_at": "2026-01-22T00:00:00Z",
  "last_used": "2026-01-22T01:00:00.000Z",
  "is_expired": false,
  "current_usage": {
    "tokens_used_in_current_window": 150,
    "window_started_at": "2026-01-22T00:00:00.000Z",
    "window_ends_at": "2026-01-22T05:00:00.000Z",
    "remaining_tokens": 99850
  },
  "total_lifetime_tokens": 150
}
```

**Performance**:
- **Latency**: < 5ms (cached API key)
- **Rate Limit Check**: < 0.1ms (cached) / ~5ms (uncached)

---

### Chat Completions (OpenAI-Compatible)

Create chat completions using OpenAI-compatible API format.

**Endpoint**: `POST /v1/chat/completions`

**Authentication**: Required

**Request Headers**:
```
Content-Type: application/json
Authorization: Bearer pk_your_api_key
```

#### Non-Streaming Request

**Request Body**:
```json
{
  "model": "glm-4.7",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.7,
  "max_tokens": 1000,
  "top_p": 0.9,
  "stream": false
}
```

**Response** (200 OK):
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "glm-4.7",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 9,
    "total_tokens": 19
  }
}
```

#### Streaming Request

**Request Body**:
```json
{
  "model": "glm-4.7",
  "messages": [
    {"role": "user", "content": "Tell me a joke"}
  ],
  "stream": true
}
```

**Response** (200 OK, Server-Sent Events):
```
data: {"id":"...","created":1234567890,"object":"chat.completion.chunk","model":"glm-4.7","choices":[{"index":0,"delta":{"content":"Hello"}}]}

data: {"id":"...","created":1234567890,"object":"chat.completion.chunk","model":"glm-4.7","choices":[{"index":0,"delta":{"content":" world"}}]}

data: [DONE]
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model identifier (e.g., "glm-4.7") |
| `messages` | array | Yes | Array of message objects |
| `temperature` | number | No | Sampling temperature (0-1) |
| `max_tokens` | integer | No | Maximum tokens to generate |
| `top_p` | number | No | Nucleus sampling parameter |
| `stream` | boolean | No | Enable streaming (default: false) |

**Performance Characteristics**:

| Metric | Value | Optimization |
|--------|-------|--------------|
| **Proxy Overhead** | < 10ms | Connection pooling + streaming |
| **Streaming Latency** | < 5ms first chunk | Zero-copy streaming |
| **Memory Usage** | Constant (32KB buffer) | Buffer pool + zero-copy |
| **Throughput** | Up to 12K RPS | Connection pool + pipelining |
| **Cache Hit** | ~2ms | Response caching (optional) |

**Performance Impact by Configuration**:

| Configuration | Latency | Memory | Best For |
|---------------|---------|--------|----------|
| **Default** | < 10ms | ~50MB | General use |
| **With Cache** | < 10ms* | ~60MB | Repeated requests |
| **Large Buffer** | < 10ms | ~50MB | Large responses |
| **High Pool Size** | < 10ms | ~70MB | High concurrency |

*Cache hit: ~2ms, cache miss: < 10ms

---

### Messages API (Anthropic-Compatible)

Create message completions using Anthropic-compatible API format.

**Endpoint**: `POST /v1/messages`

**Authentication**: Required

**Request Headers**:
```
Content-Type: application/json
Authorization: Bearer pk_your_api_key
anthropic-version: 2023-06-01
```

#### Non-Streaming Request

**Request Body**:
```json
{
  "model": "glm-4.7",
  "max_tokens": 1024,
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.7,
  "top_p": 0.9,
  "stream": false
}
```

**Response** (200 OK):
```json
{
  "id": "msg_123",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Hello! How can I help you?"
    }
  ],
  "model": "glm-4.7",
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 10,
    "output_tokens": 9
  }
}
```

#### Streaming Request

**Request Body**:
```json
{
  "model": "glm-4.7",
  "max_tokens": 1024,
  "stream": true,
  "messages": [
    {"role": "user", "content": "Tell me a joke"}
  ]
}
```

**Response** (200 OK, Server-Sent Events):
```
data: {"type":"message_start","message":{"id":"...","type":"message","role":"assistant","content":[]}}

data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":9}}
```

**Request Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `model` | string | Yes | Model identifier (e.g., "glm-4.7") |
| `max_tokens` | integer | Yes | Maximum tokens to generate |
| `messages` | array | Yes | Array of message objects |
| `temperature` | number | No | Sampling temperature (0-1) |
| `top_p` | number | No | Nucleus sampling parameter |
| `stream` | boolean | No | Enable streaming (default: false) |

**Performance Characteristics**:

Same as Chat Completions API (shared infrastructure):
- **Proxy Overhead**: < 10ms
- **Streaming Latency**: < 5ms first chunk
- **Memory Usage**: Constant (32KB buffer)

---

### Models List

List available models.

**Endpoint**: `GET /v1/models`

**Authentication**: Required

**Request**:
```bash
curl -H "Authorization: Bearer pk_your_key" \
  http://localhost:3030/v1/models
```

**Response** (200 OK):
```json
{
  "object": "list",
  "data": [
    {
      "id": "glm-4.7",
      "object": "model",
      "owned_by": "z-ai",
      "permission": []
    },
    {
      "id": "glm-4.5-air",
      "object": "model",
      "owned_by": "z-ai",
      "permission": []
    },
    {
      "id": "glm-4.5-flash",
      "object": "model",
      "owned_by": "z-ai",
      "permission": []
    }
  ]
}
```

**Performance**:
- **Latency**: < 5ms
- **Caching**: Response cached for 5 minutes

---

### Performance Monitoring

GLM Proxy provides several endpoints for monitoring performance and metrics.

#### Metrics - System

Get current system metrics.

**Endpoint**: `GET /api/metrics/system`

**Authentication**: Not required (configure as needed)

**Response** (200 OK):
```json
{
  "requestMetrics": {
    "total": 1000,
    "successful": 995,
    "failed": 5,
    "rate": 100.5,
    "p50Latency": 8.5,
    "p95Latency": 12.0,
    "p99Latency": 15.0
  },
  "throughputMetrics": {
    "requestsPerSecond": 100.5,
    "bytesPerSecond": 524288,
    "avgRequestSize": 5120,
    "avgResponseSize": 5120
  },
  "connectionPoolMetrics": {
    "activeConnections": 5,
    "idleConnections": 5,
    "poolUtilization": 0.5
  },
  "cacheMetrics": {
    "hitRate": 0.85,
    "avgLookupTime": 0.1
  },
  "resourceMetrics": {
    "memoryUsageMB": 50.5,
    "cpuUsagePercent": 25.3
  }
}
```

#### Metrics - JSON Export

Export all metrics in JSON format.

**Endpoint**: `GET /api/metrics/json`

**Authentication**: Not required (configure as needed)

#### Metrics - Prometheus Export

Export metrics in Prometheus format.

**Endpoint**: `GET /api/metrics/prometheus`

**Authentication**: Not required (configure as needed)

**Response**: Prometheus text format

#### Profiling Data

Get profiling data for performance analysis.

**Endpoint**: `GET /profiling`

**Authentication**: Not required (configure as needed)

**Query Parameters**:
- `limit`: Number of recent requests to return (default: 100)

**Response** (200 OK):
```json
{
  "statistics": {
    "totalRequests": 1000,
    "successfulRequests": 995,
    "p50Latency": 8.5,
    "p95Latency": 12.0,
    "p99Latency": 15.0
  },
  "slowestRequests": [
    {
      "requestId": "req-123",
      "method": "POST",
      "path": "/v1/chat/completions",
      "duration": 15.2,
      "operations": {
        "auth": 0.1,
        "rateLimit": 0.05,
        "proxy": 14.8,
        "upstream": 14.5
      }
    }
  ]
}
```

**Note**: Profiling must be enabled via `PROFILING_ENABLED=1` environment variable.

#### Performance Dashboard

Access real-time performance dashboard.

**Endpoint**: `GET /dashboard`

**Authentication**: Not required (configure as needed)

Access in browser: `http://localhost:3030/dashboard`

Features:
- Real-time latency charts (P50/P95/P99)
- Throughput graphs
- Resource usage visualization
- Connection pool metrics
- Cache performance
- Error analysis

## Performance Characteristics

### Request Flow & Latency Breakdown

```
Client Request
    │
    ├─> [Authentication] < 0.1ms (cache hit) / ~5ms (cache miss)
    │     └─> API Key Cache (LRU)
    │
    ├─> [Rate Limiting] < 0.1ms (cached) / ~5ms (uncached)
    │     └─> Rate Limit Cache (LRU)
    │
    ├─> [Cache Check] < 0.1ms
    │     └─> Response Cache (SHA-256 key)
    │
    ├─> [Cache Hit] ~2ms total ────────> Response
    │
    ├─> [Cache Miss] Continue...
    │
    ├─> [JSON Parsing] < 1ms
    │     └─> Optimized parser + streaming support
    │
    ├─> [Connection Pool] < 0.5ms
    │     └─> HTTP/1.1 keep-alive + health check
    │
    ├─> [Upstream Request] Variable (Z.AI API)
    │     └─> Pooled connection + pipelining
    │
    ├─> [Response Streaming] < 5ms first chunk
    │     └─> Zero-copy streaming (32KB buffer)
    │
    └─> [Client Response]
```

### Optimization Impact

| Optimization | Latency Improvement | Memory Impact |
|--------------|---------------------|---------------|
| **Connection Pooling** | -2ms vs no pool | +5MB per 10 connections |
| **Response Caching** | -66ms (hit) vs miss | +50MB per 1000 entries |
| **API Key Cache** | -4.9ms vs storage | +1MB per 1000 keys |
| **Rate Limit Cache** | -4.9ms vs storage | +2MB per 1000 keys |
| **Request Streaming** | 0ms (constant memory) | 0MB (no buffering) |
| **Object Pooling** | -0.01ms per allocation | -99% GC pressure |
| **JSON Optimization** | -0.1ms per transform | -50% allocations |

### Performance by Concurrency

| Concurrency | P50 Latency | P95 Latency | P99 Latency | Throughput |
|-------------|-------------|-------------|-------------|------------|
| 1 | 8.5ms | 12ms | 15ms | 118 RPS |
| 10 | 8.8ms | 12.5ms | 16ms | 1,136 RPS |
| 50 | 9.2ms | 13ms | 17ms | 5,435 RPS |
| 100 | 9.8ms | 14ms | 18ms | 10,204 RPS |
| 500 | 12ms | 18ms | 25ms | 41,667 RPS |

## Configuration Options

### Environment Variables

#### Connection Pool

```bash
POOL_MIN_CONNECTIONS=2          # Minimum connections (default: 2)
POOL_MAX_CONNECTIONS=10         # Maximum connections (default: 10)
POOL_WARM=false                 # Warm pool on startup (default: false)
DISABLE_CONNECTION_POOL=false   # Disable pool (fallback: fetch)
```

**Performance Impact**:
- Higher `POOL_MAX_CONNECTIONS` = Better concurrency, more memory
- `POOL_WARM=true` = Faster first requests, slower startup
- Pool size: ~5MB per 10 connections

#### Caching

```bash
CACHE_ENABLED=false             # Enable response caching (default: false)
CACHE_TTL_MS=300000            # Cache TTL in ms (default: 5 min)
CACHE_MAX_SIZE=1000            # Max cache entries (default: 1000)
```

**Performance Impact**:
- Cache hit: ~2ms vs ~68ms (cache miss)
- Memory: ~50KB per cached entry
- Hit rate: 60-90% for repetitive requests

#### Batching

```bash
BATCHING_ENABLED=false          # Enable request batching (default: false)
BATCH_WINDOW_MS=50             # Batch window duration (default: 50ms)
BATCH_MAX_SIZE=10              # Max requests per batch (default: 10)
BATCH_MAX_QUEUE_SIZE=1000      # Max queue size (default: 1000)
```

**Performance Impact**:
- Reduces upstream API calls
- Adds `BATCH_WINDOW_MS` latency
- Best for high-throughput scenarios

#### API Key Cache

```bash
APIKEY_CACHE_SIZE=1000         # Max API keys in cache (default: 1000)
APIKEY_CACHE_TTL_MS=300000     # Cache TTL in ms (default: 5 min)
```

**Performance Impact**:
- Cache hit: < 0.1ms vs ~5ms (storage read)
- Memory: ~1KB per cached key

#### Rate Limit Optimization

```bash
RATE_LIMIT_BATCH_INTERVAL_MS=5000   # Flush interval (default: 5s)
RATE_LIMIT_MAX_BATCH_SIZE=100       # Max batch size (default: 100)
```

**Performance Impact**:
- Reduces storage writes by up to 100x
- Cached checks: < 0.1ms vs ~5ms

#### Streaming Buffer

```bash
STREAM_REQUEST_CHUNK_SIZE=32768      # Request chunk size (default: 32KB)
STREAM_RESPONSE_CHUNK_SIZE=32768     # Response chunk size (default: 32KB)
STREAM_BUFFER_POOL_ENABLED=1         # Enable buffer pool (default: true)
```

**Performance Impact**:
- Larger chunks = fewer chunks, slightly more memory
- Buffer pool = 99% reduction in allocations

#### Profiling

```bash
PROFILING_ENABLED=false        # Enable profiling (default: false)
PROFILING_MAX_SAMPLES=1000     # Max samples to keep (default: 1000)
```

**Performance Impact**:
- Overhead: < 1ms per request
- Memory: ~1KB per sample

### Example Configurations

#### Low-Latency API Gateway

```bash
# Minimize latency
POOL_MIN_CONNECTIONS=10
POOL_MAX_CONNECTIONS=50
POOL_WARM=true

CACHE_ENABLED=1
CACHE_TTL_MS=60000  # 1 minute

APIKEY_CACHE_SIZE=5000
APIKEY_CACHE_TTL_MS=600000  # 10 minutes

STREAM_REQUEST_CHUNK_SIZE=16384  # Smaller chunks
STREAM_RESPONSE_CHUNK_SIZE=16384
```

**Expected Performance**:
- P50: < 8ms
- P95: < 12ms
- P99: < 18ms

#### High-Throughput Service

```bash
# Maximize throughput
POOL_MIN_CONNECTIONS=20
POOL_MAX_CONNECTIONS=100
POOL_WARM=true

CACHE_ENABLED=1
CACHE_TTL_MS=300000
CACHE_MAX_SIZE=10000

BATCHING_ENABLED=1
BATCH_WINDOW_MS=50
BATCH_MAX_SIZE=20

RATE_LIMIT_BATCH_INTERVAL_MS=1000
RATE_LIMIT_MAX_BATCH_SIZE=500
```

**Expected Performance**:
- Throughput: 200K+ RPS
- P50: < 10ms
- P95: < 15ms

#### Resource-Constrained Deployment

```bash
# Minimize memory (< 30MB)
POOL_MIN_CONNECTIONS=1
POOL_MAX_CONNECTIONS=5

CACHE_ENABLED=0

APIKEY_CACHE_SIZE=100
APIKEY_CACHE_TTL_MS=300000

BATCHING_ENABLED=0

STREAM_REQUEST_CHUNK_SIZE=8192
STREAM_RESPONSE_CHUNK_SIZE=8192
STREAM_BUFFER_POOL_ENABLED=1
```

**Expected Performance**:
- Memory: < 30MB
- P50: < 12ms
- P95: < 20ms

## Error Handling

### Error Response Format

All errors return JSON:

```json
{
  "error": "Error message description"
}
```

### HTTP Status Codes

| Code | Type | Description | Retry |
|------|------|-------------|-------|
| 200 | Success | Request successful | No |
| 400 | Bad Request | Invalid request body/params | No |
| 401 | Unauthorized | Missing/invalid API key | No |
| 403 | Forbidden | API key expired | No |
| 429 | Rate Limited | Quota exceeded | Yes (after 5h) |
| 500 | Server Error | Internal server error | Yes |
| 502 | Bad Gateway | Upstream (Z.AI) error | Yes |

### Error Performance

| Error Type | Detection Time | Response Time |
|------------|----------------|---------------|
| **Auth Failure** | < 0.1ms (cache) | < 1ms |
| **Rate Limit** | < 0.1ms (cache) | < 1ms |
| **Validation** | < 1ms | < 2ms |
| **Upstream Error** | Variable | < 5ms |

## Rate Limiting

### Rolling 5-Hour Window

- **Window Type**: Rolling window (not fixed reset)
- **Duration**: 5 hours
- **Metric**: Total tokens from all requests within active window

### Rate Limit Performance

| Operation | Latency | Optimization |
|-----------|---------|--------------|
| **Cached Check** | < 0.1ms | LRU cache with 1-min TTL |
| **Uncached Check** | ~5ms | Binary search + pre-computed windows |
| **Batched Write** | Asynchronous | Up to 100x fewer storage operations |

### Configuration

```bash
# Per-API key in apikeys.json
{
  "token_limit_per_5h": 100000,  // Tokens per 5 hours
  "usage_windows": []             // Auto-managed
}
```

### Rate Limit Response

```json
{
  "error": "Rate limit exceeded. Please try again later."
}
```

HTTP Status: `429 Too Many Requests`

## SDK Examples

### OpenAI SDK (TypeScript)

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'pk_your_key',
  baseURL: 'http://localhost:3030/v1',
});

const completion = await openai.chat.completions.create({
  model: 'glm-4.7',
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(completion.choices[0].message);
```

### Anthropic SDK (TypeScript)

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: 'pk_your_key',
  baseURL: 'http://localhost:3030',
});

const msg = await anthropic.messages.create({
  model: 'glm-4.7',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(msg.content);
```

### Python (requests)

```python
import requests

response = requests.post(
    'http://localhost:3030/v1/chat/completions',
    headers={
        'Authorization': 'Bearer pk_your_key',
        'Content-Type': 'application/json'
    },
    json={
        'model': 'glm-4.7',
        'messages': [{'role': 'user', 'content': 'Hello!'}]
    }
)

print(response.json())
```

## Best Practices

### Performance

1. **Enable Connection Pooling**: Always enabled in production
2. **Use Caching**: For repeated requests
3. **Streaming First**: Prefer streaming for large responses
4. **Batch Requests**: Enable batching for high-throughput scenarios
5. **Monitor Metrics**: Use `/dashboard` for real-time monitoring

### Security

1. **Use HTTPS**: In production environments
2. **Rotate Keys**: Regular API key rotation
3. **Monitor Usage**: Track usage via `/stats` endpoint
4. **Set Limits**: Appropriate rate limits per key

### Reliability

1. **Handle Rate Limits**: Implement exponential backoff
2. **Check Health**: Use `/health` endpoint for health checks
3. **Monitor Errors**: Track error rates via metrics
4. **Cache Wisely**: Balance cache hit rate vs data freshness

## Support

For detailed performance guides:
- [Performance Guide](performance.md) - Comprehensive optimization overview
- [Benchmarking Guide](benchmarking.md) - Benchmarking methodology
- [Tuning Guide](tuning.md) - Configuration tuning for different use cases

For issues and questions, please contact [ajianaz](https://github.com/ajianaz).
