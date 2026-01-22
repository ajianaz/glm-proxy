# Health Endpoint Documentation

## Overview

The `/health` endpoint provides comprehensive health status information for the API gateway and its database backend. This endpoint is suitable for load balancer health checks and monitoring systems.

## Endpoint

```
GET /health
```

## Response Format

### Healthy Database (SQLite)

```json
{
  "status": "ok",
  "timestamp": "2026-01-22T06:00:00.000Z",
  "storage": {
    "type": "database",
    "inFallbackMode": false
  },
  "database": {
    "type": "sqlite",
    "connected": true,
    "responseTimeMs": 5.5,
    "status": "healthy"
  },
  "message": "All systems operational"
}
```

### Healthy Database (PostgreSQL)

```json
{
  "status": "ok",
  "timestamp": "2026-01-22T06:00:00.000Z",
  "storage": {
    "type": "database",
    "inFallbackMode": false
  },
  "database": {
    "type": "postgresql",
    "connected": true,
    "responseTimeMs": 12.3,
    "status": "healthy"
  },
  "message": "All systems operational"
}
```

### File Storage (No Database)

```json
{
  "status": "ok",
  "timestamp": "2026-01-22T06:00:00.000Z",
  "storage": {
    "type": "file",
    "inFallbackMode": false
  },
  "message": "Service is running with file storage"
}
```

### Fallback Mode (Database Unavailable)

```json
{
  "status": "degraded",
  "timestamp": "2026-01-22T06:00:00.000Z",
  "storage": {
    "type": "database",
    "inFallbackMode": true,
    "fallback": {
      "retryCount": 5,
      "lastRetryAt": "2026-01-22T06:00:00.000Z"
    }
  },
  "database": {
    "type": "sqlite",
    "connected": false,
    "responseTimeMs": 100.5,
    "status": "unhealthy",
    "error": "Unable to open database file"
  },
  "message": "Service is running in fallback mode using file storage"
}
```

### Unhealthy Database (No Fallback)

```json
{
  "status": "unhealthy",
  "timestamp": "2026-01-22T06:00:00.000Z",
  "storage": {
    "type": "database",
    "inFallbackMode": false
  },
  "database": {
    "type": "postgresql",
    "connected": false,
    "responseTimeMs": 5000,
    "status": "unhealthy",
    "error": "Connection refused"
  },
  "message": "Database connection failed and no fallback available"
}
```

## HTTP Status Codes

- **200 OK**: Service is operational
  - Healthy database
  - Degraded database (slow but working)
  - File storage running
  - Fallback mode active (service running via file storage)

- **503 Service Unavailable**: Service is unhealthy
  - Database connection failed
  - No fallback available
  - Load balancers should stop routing traffic

## Status Values

- **ok**: All systems operational
- **degraded**: Service is running but with limitations
  - Slow database response time
  - Using fallback file storage due to database failure
- **unhealthy**: Service is not operational
  - Database connection failed
  - No fallback available

## Database Status Values

- **healthy**: Database is responding normally (response time < threshold)
- **degraded**: Database is slow but responding (response time > threshold but < 2x threshold)
- **unhealthy**: Database connection failed or response time is very slow (response time > 2x threshold)

## Performance

- Typical response time: < 1ms (local)
- Maximum acceptable response time: < 100ms
- The endpoint does not count API keys by default for faster response times

## Load Balancer Configuration

### Example: Nginx

```nginx
upstream api_gateway {
    server 127.0.0.1:3000 max_fails=3 fail_timeout=30s;

    # Health check
    check interval=5000 rise=2 fall=3 uri=/health match_status=200;
}
```

### Example: HAProxy

```
backend api_gateway
    option httpchk GET /health
    http-check expect status 200
    server api1 127.0.0.1:3000 check inter 5000 rise 2 fall 3
```

### Example: Kubernetes

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
  successThreshold: 1
  failureThreshold: 3

livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 15
  periodSeconds: 20
  successThreshold: 1
  failureThreshold: 3
```

## Monitoring

### Example: Prometheus Alert

```yaml
groups:
  - name: api_gateway
    rules:
      - alert: APIGatewayUnhealthy
        expr: health_status == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "API Gateway is unhealthy"
          description: "Health check failing for {{ $labels.instance }}"

      - alert: APIGatewayDegraded
        expr: health_status == 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API Gateway is degraded"
          description: "Health check showing degraded status for {{ $labels.instance }}"
```

## Testing

Test the endpoint with curl:

```bash
# Basic health check
curl http://localhost:3000/health

# Check HTTP status code
curl -I http://localhost:3000/health

# Pretty print JSON
curl http://localhost:3000/health | jq

# Watch health status
watch -n 5 'curl -s http://localhost:3000/health | jq'
```

## Implementation Details

- **File**: `src/index.ts`
- **Function**: Enhanced `/health` endpoint handler
- **Dependencies**:
  - `checkHealth()` from `src/db/health.ts`
  - `getStorageType()` from `src/storage/index.ts`
  - `isInFallbackMode()` from `src/storage/index.ts`
  - `getFallbackState()` from `src/storage/index.ts`

## Related Files

- `src/db/health.ts`: Database health check implementation
- `src/storage/index.ts`: Storage type and fallback management
- `test/manual-health-endpoint-verification.test.ts`: Manual verification tests
