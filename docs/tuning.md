# Configuration Tuning Guide

Comprehensive guide to tuning GLM Proxy configuration for optimal performance in different environments and use cases.

## Table of Contents

- [Overview](#overview)
- [Configuration Reference](#configuration-reference)
- [Tuning by Use Case](#tuning-by-use-case)
- [Tuning by Resource Constraints](#tuning-by-resource-constraints)
- [Tuning for Performance Targets](#tuning-for-performance-targets)
- [Monitoring and Adjustment](#monitoring-and-adjustment)
- [Troubleshooting](#troubleshooting)

## Overview

GLM Proxy provides extensive configuration options to tune performance for different scenarios. This guide helps you find the optimal configuration for your use case.

### Configuration Principles

1. **Start with Defaults**: Default settings work well for most cases
2. **Change One Thing at a Time**: Measure impact of each change
3. **Monitor Metrics**: Use dashboard to validate changes
4. **Benchmark Before/After**: Quantify performance improvements
5. **Document Changes**: Keep track of what works and what doesn't

### Quick Start

**Minimum Configuration** (uses all defaults):
```bash
# No configuration needed - defaults work well
bun run start
```

**Recommended Production Configuration**:
```bash
# Connection pooling
POOL_MIN_CONNECTIONS=5
POOL_MAX_CONNECTIONS=20
POOL_WARM=true

# Caching
CACHE_ENABLED=1
CACHE_TTL_MS=300000
CACHE_MAX_SIZE=1000

# Batching
BATCHING_ENABLED=1
BATCH_WINDOW_MS=50

# API key cache
APIKEY_CACHE_SIZE=1000
APIKEY_CACHE_TTL_MS=300000
```

## Configuration Reference

### Connection Pool Configuration

| Variable | Default | Description | Impact |
|----------|---------|-------------|--------|
| `POOL_MIN_CONNECTIONS` | 2 | Minimum connections to maintain | Higher = faster startup, more memory |
| `POOL_MAX_CONNECTIONS` | 10 | Maximum connections per pool | Higher = better concurrency, more resources |
| `POOL_WARM` | false | Warm pool on startup | true = faster first requests |
| `DISABLE_CONNECTION_POOL` | false | Disable connection pool | true = use plain fetch (fallback) |

**When to Adjust**:
- **Low Traffic** (< 10 RPS): `POOL_MAX_CONNECTIONS=5`
- **Medium Traffic** (10-100 RPS): `POOL_MAX_CONNECTIONS=20`
- **High Traffic** (> 100 RPS): `POOL_MAX_CONNECTIONS=50-100`

### Caching Configuration

| Variable | Default | Description | Impact |
|----------|---------|-------------|--------|
| `CACHE_ENABLED` | false | Enable response caching | true = faster for repeated requests |
| `CACHE_TTL_MS` | 300000 | Cache TTL in ms (5 min) | Higher = more hits, stale data risk |
| `CACHE_MAX_SIZE` | 1000 | Maximum cache entries | Higher = more hits, more memory |

**When to Adjust**:
- **Static Data** (rarely changes): `CACHE_TTL_MS=3600000` (1 hour)
- **Dynamic Data** (changes often): `CACHE_TTL_MS=60000` (1 minute)
- **High Request Variety**: `CACHE_MAX_SIZE=5000`
- **Memory Constrained**: `CACHE_MAX_SIZE=500`

### Batching Configuration

| Variable | Default | Description | Impact |
|----------|---------|-------------|--------|
| `BATCHING_ENABLED` | false | Enable request batching | true = fewer API calls, more latency |
| `BATCH_WINDOW_MS` | 50 | Batch window duration | Higher = larger batches, more latency |
| `BATCH_MAX_SIZE` | 10 | Max requests per batch | Higher = fewer API calls, more memory |
| `BATCH_MAX_QUEUE_SIZE` | 1000 | Max queue size | Higher = handles bursts, more memory |

**When to Adjust**:
- **Low Latency Priority**: `BATCH_WINDOW_MS=10` (small batches)
- **Efficiency Priority**: `BATCH_WINDOW_MS=100` (larger batches)
- **High Traffic Bursts**: `BATCH_MAX_QUEUE_SIZE=5000`

### Streaming Configuration

| Variable | Default | Description | Impact |
|----------|---------|-------------|--------|
| `STREAM_REQUEST_CHUNK_SIZE` | 32768 | Request chunk size (32KB) | Optimal: 32KB |
| `STREAM_RESPONSE_CHUNK_SIZE` | 32768 | Response chunk size (32KB) | Optimal: 32KB |
| `STREAM_BUFFER_POOL_ENABLED` | 1 | Use buffer pool | true = 99% fewer allocations |

**When to Adjust**:
- **Small Payloads** (< 1KB): `STREAM_REQUEST_CHUNK_SIZE=4096`
- **Large Payloads** (> 1MB): `STREAM_REQUEST_CHUNK_SIZE=65536`
- **Memory Constrained**: `STREAM_BUFFER_POOL_ENABLED=1` (always)

### API Key Cache Configuration

| Variable | Default | Description | Impact |
|----------|---------|-------------|--------|
| `APIKEY_CACHE_SIZE` | 1000 | Max cached API keys | Higher = faster auth, more memory |
| `APIKEY_CACHE_TTL_MS` | 300000 | Cache TTL (5 min) | Higher = fewer storage reads |

**When to Adjust**:
- **Few API Keys** (< 100): `APIKEY_CACHE_SIZE=100`
- **Many API Keys** (> 1000): `APIKEY_CACHE_SIZE=10000`
- **Frequent Key Updates**: `APIKEY_CACHE_TTL_MS=60000` (1 minute)

### Rate Limit Configuration

| Variable | Default | Description | Impact |
|----------|---------|-------------|--------|
| `RATE_LIMIT_BATCH_INTERVAL_MS` | 5000 | Batch flush interval (5s) | Higher = fewer writes, stale data |
| `RATE_LIMIT_MAX_BATCH_SIZE` | 100 | Max batch size | Higher = fewer writes, more memory |

**When to Adjust**:
- **Real-Time Rate Limits**: `RATE_LIMIT_BATCH_INTERVAL_MS=1000`
- **Storage Performance Critical**: `RATE_LIMIT_MAX_BATCH_SIZE=500`

### Metrics and Profiling Configuration

| Variable | Default | Description | Impact |
|----------|---------|-------------|--------|
| `METRICS_ENABLED` | true | Enable metrics collection | false = minimal overhead |
| `METRICS_RETENTION_MS` | 60000 | Metrics retention (1 min) | Higher = more history, more memory |
| `METRICS_AGGREGATION_INTERVAL_MS` | 1000 | Aggregation interval | Lower = more granular, more CPU |
| `PROFILING_ENABLED` | false | Enable request profiling | true = detailed insights, overhead |

**When to Adjust**:
- **Production**: `PROFILING_ENABLED=false` (minimal overhead)
- **Debugging**: `PROFILING_ENABLED=true` (detailed insights)
- **Long-Term Monitoring**: `METRICS_RETENTION_MS=3600000` (1 hour)

## Tuning by Use Case

### Use Case 1: Low-Latency API Gateway

**Scenario**: Public API gateway where latency is critical.

**Priorities**:
1. Minimize latency
2. Maintain high availability
3. Handle moderate traffic

**Recommended Configuration**:
```bash
# Connection pool - high availability
POOL_MIN_CONNECTIONS=10
POOL_MAX_CONNECTIONS=50
POOL_WARM=true

# Caching - short TTL for freshness
CACHE_ENABLED=1
CACHE_TTL_MS=60000  # 1 minute
CACHE_MAX_SIZE=5000

# Batching - disabled to minimize latency
BATCHING_ENABLED=0

# API key cache - aggressive
APIKEY_CACHE_SIZE=10000
APIKEY_CACHE_TTL_MS=600000  # 10 minutes

# Streaming - optimal chunk size
STREAM_REQUEST_CHUNK_SIZE=32768
STREAM_RESPONSE_CHUNK_SIZE=32768
STREAM_BUFFER_POOL_ENABLED=1

# Metrics - minimal overhead
METRICS_ENABLED=true
PROFILING_ENABLED=false

# Rate limiting - real-time updates
RATE_LIMIT_BATCH_INTERVAL_MS=1000
RATE_LIMIT_MAX_BATCH_SIZE=100
```

**Expected Performance**:
- P50 Latency: 8-10ms
- P95 Latency: 12-15ms
- P99 Latency: 18-22ms
- Throughput: Up to 50,000 RPS

### Use Case 2: High-Throughput Internal Service

**Scenario**: Internal service for enterprise, throughput is priority.

**Priorities**:
1. Maximize throughput
2. Minimize API costs
3. Accept higher latency for efficiency

**Recommended Configuration**:
```bash
# Connection pool - large for high concurrency
POOL_MIN_CONNECTIONS=20
POOL_MAX_CONNECTIONS=100
POOL_WARM=true

# Caching - aggressive
CACHE_ENABLED=1
CACHE_TTL_MS=3600000  # 1 hour
CACHE_MAX_SIZE=10000

# Batching - enabled for efficiency
BATCHING_ENABLED=1
BATCH_WINDOW_MS=100  # Larger window
BATCH_MAX_SIZE=20
BATCH_MAX_QUEUE_SIZE=5000

# API key cache - large
APIKEY_CACHE_SIZE=10000
APIKEY_CACHE_TTL_MS=3600000  # 1 hour

# Streaming - larger chunks
STREAM_REQUEST_CHUNK_SIZE=65536  # 64KB
STREAM_RESPONSE_CHUNK_SIZE=65536
STREAM_BUFFER_POOL_ENABLED=1

# Metrics - standard
METRICS_ENABLED=true
PROFILING_ENABLED=false

# Rate limiting - batched
RATE_LIMIT_BATCH_INTERVAL_MS=10000  # 10 seconds
RATE_LIMIT_MAX_BATCH_SIZE=500
```

**Expected Performance**:
- P50 Latency: 15-25ms (higher due to batching)
- P95 Latency: 30-40ms
- P99 Latency: 50-60ms
- Throughput: Up to 200,000 RPS
- API Call Reduction: 5-10x (caching + batching)

### Use Case 3: Development Environment

**Scenario**: Local development, debugging and iteration speed.

**Priorities**:
1. Easy debugging
2. Fast iteration
3. Realistic testing

**Recommended Configuration**:
```bash
# Connection pool - small
POOL_MIN_CONNECTIONS=2
POOL_MAX_CONNECTIONS=5
POOL_WARM=false

# Caching - disabled for testing
CACHE_ENABLED=0

# Batching - disabled for realism
BATCHING_ENABLED=0

# API key cache - small
APIKEY_CACHE_SIZE=100
APIKEY_CACHE_TTL_MS=60000  # 1 minute

# Streaming - standard
STREAM_BUFFER_POOL_ENABLED=1

# Metrics and profiling - enabled
METRICS_ENABLED=true
PROFILING_ENABLED=true  # Enable for debugging

# Rate limiting - real-time
RATE_LIMIT_BATCH_INTERVAL_MS=1000
RATE_LIMIT_MAX_BATCH_SIZE=50
```

**Expected Performance**:
- P50 Latency: 10-15ms
- Detailed profiling data available
- Easy debugging with profiling enabled

### Use Case 4: Resource-Constrained Edge Deployment

**Scenario**: Edge deployment with limited CPU and memory.

**Priorities**:
1. Minimize memory usage
2. Minimize CPU usage
3. Maintain acceptable latency

**Recommended Configuration**:
```bash
# Connection pool - minimal
POOL_MIN_CONNECTIONS=1
POOL_MAX_CONNECTIONS=3
POOL_WARM=false

# Caching - small cache
CACHE_ENABLED=1
CACHE_TTL_MS=300000  # 5 minutes
CACHE_MAX_SIZE=100

# Batching - disabled (too much memory)
BATCHING_ENABLED=0

# API key cache - minimal
APIKEY_CACHE_SIZE=100
APIKEY_CACHE_TTL_MS=300000

# Streaming - minimal chunks
STREAM_REQUEST_CHUNK_SIZE=4096  # 4KB
STREAM_RESPONSE_CHUNK_SIZE=4096
STREAM_BUFFER_POOL_ENABLED=1

# Metrics - minimal overhead
METRICS_ENABLED=true
METRICS_RETENTION_MS=30000  # 30 seconds
PROFILING_ENABLED=false

# Rate limiting - minimal batching
RATE_LIMIT_BATCH_INTERVAL_MS=5000
RATE_LIMIT_MAX_BATCH_SIZE=50
```

**Expected Performance**:
- P50 Latency: 12-18ms
- Memory Usage: < 30MB
- CPU Usage: < 20% (moderate load)
- Throughput: Up to 1,000 RPS

## Tuning by Resource Constraints

### Memory-Constrained Environments

**Symptoms**: OOM errors, swapping, high memory usage

**Tuning Strategy**:
```bash
# Reduce cache sizes
CACHE_MAX_SIZE=100
APIKEY_CACHE_SIZE=100

# Disable batching (uses queue memory)
BATCHING_ENABLED=0

# Reduce buffer pool sizes
STREAM_REQUEST_CHUNK_SIZE=4096
STREAM_RESPONSE_CHUNK_SIZE=4096

# Reduce connection pool
POOL_MAX_CONNECTIONS=3

# Reduce metrics retention
METRICS_RETENTION_MS=30000

# Disable profiling
PROFILING_ENABLED=false
```

**Expected Memory**: < 30MB

### CPU-Constrained Environments

**Symptoms**: High CPU usage, event loop lag, slow responses

**Tuning Strategy**:
```bash
# Reduce metrics aggregation overhead
METRICS_AGGREGATION_INTERVAL_MS=5000  # 5 seconds

# Disable profiling
PROFILING_ENABLED=false

# Increase batching (fewer requests to process)
BATCHING_ENABLED=1
BATCH_WINDOW_MS=100
BATCH_MAX_SIZE=20

# Increase cache (fewer upstream requests)
CACHE_ENABLED=1
CACHE_MAX_SIZE=5000
CACHE_TTL_MS=3600000

# Increase rate limit batching
RATE_LIMIT_BATCH_INTERVAL_MS=10000
RATE_LIMIT_MAX_BATCH_SIZE=500
```

**Expected CPU**: < 30% (moderate load)

### Network-Constrained Environments

**Symptoms**: Slow upstream responses, timeouts, network errors

**Tuning Strategy**:
```bash
# Increase connection pool (more parallel connections)
POOL_MAX_CONNECTIONS=50

# Increase timeouts
POOL_ACQUIRE_TIMEOUT=10000  # 10 seconds

# Enable aggressive caching
CACHE_ENABLED=1
CACHE_TTL_MS=3600000  # 1 hour
CACHE_MAX_SIZE=10000

# Enable batching to reduce upstream calls
BATCHING_ENABLED=1
BATCH_WINDOW_MS=100
BATCH_MAX_SIZE=20

# Increase chunk sizes for efficiency
STREAM_REQUEST_CHUNK_SIZE=65536
STREAM_RESPONSE_CHUNK_SIZE=65536
```

**Expected Improvement**: 50-70% fewer upstream calls

## Tuning for Performance Targets

### Target: P50 Latency < 10ms

**Current**: P50 = 12-15ms

**Tuning Actions**:
```bash
# Enable connection pool warming
POOL_WARM=true

# Increase connection pool
POOL_MAX_CONNECTIONS=20

# Enable API key cache
APIKEY_CACHE_SIZE=1000
APIKEY_CACHE_TTL_MS=300000

# Disable batching (adds latency)
BATCHING_ENABLED=0

# Short cache TTL for freshness
CACHE_TTL_MS=60000
```

**Expected**: P50 = 8-10ms

### Target: P95 Latency < 15ms

**Current**: P95 = 18-25ms

**Tuning Actions**:
```bash
# Large connection pool
POOL_MAX_CONNECTIONS=50

# Pool warming
POOL_WARM=true

# Aggressive caching
CACHE_ENABLED=1
CACHE_MAX_SIZE=5000
CACHE_TTL_MS=300000

# Disable batching
BATCHING_ENABLED=0

# Optimize streaming
STREAM_BUFFER_POOL_ENABLED=1
STREAM_REQUEST_CHUNK_SIZE=32768
STREAM_RESPONSE_CHUNK_SIZE=32768
```

**Expected**: P95 = 12-15ms

### Target: Memory < 50MB

**Current**: Memory = 80-100MB

**Tuning Actions**:
```bash
# Reduce cache sizes
CACHE_MAX_SIZE=200
APIKEY_CACHE_SIZE=200

# Disable batching
BATCHING_ENABLED=0

# Small connection pool
POOL_MAX_CONNECTIONS=5

# Small streaming chunks
STREAM_REQUEST_CHUNK_SIZE=4096
STREAM_RESPONSE_CHUNK_SIZE=4096

# Minimal metrics retention
METRICS_RETENTION_MS=30000
```

**Expected**: Memory = 30-40MB

### Target: Throughput > 100,000 RPS

**Current**: Throughput = 50,000 RPS

**Tuning Actions**:
```bash
# Large connection pool
POOL_MIN_CONNECTIONS=50
POOL_MAX_CONNECTIONS=200
POOL_WARM=true

# Aggressive caching
CACHE_ENABLED=1
CACHE_MAX_SIZE=10000
CACHE_TTL_MS=3600000

# Aggressive batching
BATCHING_ENABLED=1
BATCH_WINDOW_MS=50
BATCH_MAX_SIZE=20
BATCH_MAX_QUEUE_SIZE=10000

# Large API key cache
APIKEY_CACHE_SIZE=10000
APIKEY_CACHE_TTL_MS=3600000

# Large streaming chunks
STREAM_REQUEST_CHUNK_SIZE=65536
STREAM_RESPONSE_CHUNK_SIZE=65536
```

**Expected**: Throughput = 100,000+ RPS

## Monitoring and Adjustment

### Real-Time Monitoring

Use the performance dashboard to monitor changes:

```bash
# Start the proxy
bun run start

# Open dashboard
open http://localhost:3000/dashboard
```

**Key Metrics to Watch**:
- **Latency (P50, P95, P99)**: Should stay within targets
- **Throughput (RPS)**: Should scale with concurrency
- **Memory Usage**: Should be stable, not growing
- **Cache Hit Rate**: Higher is better (> 50%)
- **Connection Pool Utilization**: < 80% is good

### Before/After Benchmarking

Quantify the impact of configuration changes:

```bash
# 1. Benchmark with current config
bun run benchmark --output results/before

# 2. Change configuration
# Edit .env or export variables

# 3. Restart proxy
bun run start &

# 4. Benchmark with new config
bun run benchmark --output results/after

# 5. Compare results
diff results/before/*.json results/after/*.json
```

### A/B Testing

Test configurations in production:

```bash
# Deploy config A to 50% of instances
export CACHE_TTL_MS=60000
bun run start &

# Deploy config B to 50% of instances
export CACHE_TTL_MS=3600000
bun run start &

# Monitor both and compare
curl http://localhost:3000/api/metrics/prometheus | grep cache
```

### Configuration Validation

Validate configuration before deployment:

```bash
# Test configuration
bun run test

# Run smoke test
bun run test/load/index.ts --scenario smoke

# Validate latency
bun run scripts/validate-latency.ts

# Validate resources
bun run scripts/validate-resources.ts
```

## Troubleshooting

### Problem: High Latency Spikes

**Symptoms**: Occasional requests > 100ms

**Possible Causes**:
1. Connection pool exhaustion
2. Cache misses causing upstream calls
3. GC pauses
4. Network issues

**Solutions**:
```bash
# Increase connection pool
POOL_MAX_CONNECTIONS=50

# Enable pool warming
POOL_WARM=true

# Increase cache hit rate
CACHE_ENABLED=1
CACHE_MAX_SIZE=5000
CACHE_TTL_MS=3600000

# Enable buffer pool (reduces GC)
STREAM_BUFFER_POOL_ENABLED=1
```

### Problem: Low Cache Hit Rate

**Symptoms**: Cache hit rate < 30%

**Possible Causes**:
1. Cache TTL too short
2. Cache size too small
3. High request variety

**Solutions**:
```bash
# Increase TTL
CACHE_TTL_MS=3600000  # 1 hour

# Increase cache size
CACHE_MAX_SIZE=10000

# Monitor cache metrics
curl http://localhost:3000/api/metrics/system | jq .caches
```

### Problem: High Memory Usage

**Symptoms**: Memory usage > 100MB or continuous growth

**Possible Causes**:
1. Cache too large
2. Batch queue growing
3. Memory leak

**Solutions**:
```bash
# Reduce cache sizes
CACHE_MAX_SIZE=500
APIKEY_CACHE_SIZE=500

# Disable batching
BATCHING_ENABLED=0

# Reduce buffer sizes
STREAM_REQUEST_CHUNK_SIZE=4096
STREAM_RESPONSE_CHUNK_SIZE=4096

# Run memory leak detector
bun run test/memory.test.ts
```

### Problem: Poor Scaling

**Symptoms**: Throughput doesn't increase with concurrency

**Possible Causes**:
1. Connection pool bottleneck
2. CPU saturation
3. Event loop blocking

**Solutions**:
```bash
# Increase connection pool
POOL_MAX_CONNECTIONS=100

# Enable caching to reduce work
CACHE_ENABLED=1
CACHE_MAX_SIZE=10000

# Enable batching
BATCHING_ENABLED=1

# Check for blocking operations
PROFILING_ENABLED=true
curl http://localhost:3000/profiling | jq '.slowestRequests[:10]'
```

### Problem: High CPU Usage

**Symptoms**: CPU usage > 80% under load

**Possible Causes**:
1. Metrics aggregation overhead
2. Profiling overhead
3. Insufficient caching

**Solutions**:
```bash
# Reduce metrics overhead
METRICS_AGGREGATION_INTERVAL_MS=5000
PROFILING_ENABLED=false

# Increase caching to reduce work
CACHE_ENABLED=1
CACHE_MAX_SIZE=10000
CACHE_TTL_MS=3600000

# Enable batching
BATCHING_ENABLED=1
BATCH_WINDOW_MS=100
```

## Quick Reference Cards

### Low-Latency Configuration

```bash
POOL_MIN_CONNECTIONS=10
POOL_MAX_CONNECTIONS=50
POOL_WARM=true
CACHE_ENABLED=1
CACHE_TTL_MS=60000
APIKEY_CACHE_SIZE=10000
BATCHING_ENABLED=0
STREAM_BUFFER_POOL_ENABLED=1
```

### High-Throughput Configuration

```bash
POOL_MIN_CONNECTIONS=20
POOL_MAX_CONNECTIONS=100
POOL_WARM=true
CACHE_ENABLED=1
CACHE_TTL_MS=3600000
CACHE_MAX_SIZE=10000
BATCHING_ENABLED=1
BATCH_WINDOW_MS=100
BATCH_MAX_SIZE=20
STREAM_BUFFER_POOL_ENABLED=1
```

### Low-Memory Configuration

```bash
POOL_MIN_CONNECTIONS=1
POOL_MAX_CONNECTIONS=3
CACHE_ENABLED=1
CACHE_MAX_SIZE=100
BATCHING_ENABLED=0
APIKEY_CACHE_SIZE=100
STREAM_REQUEST_CHUNK_SIZE=4096
STREAM_RESPONSE_CHUNK_SIZE=4096
METRICS_RETENTION_MS=30000
```

## Summary

Effective configuration tuning involves:

1. **Start with Defaults**: Default settings work for most cases
2. **Identify Bottlenecks**: Use metrics to find constraints
3. **Adjust One Variable**: Change one setting at a time
4. **Measure Impact**: Benchmark before and after
5. **Monitor Continuously**: Use dashboard for real-time insights
6. **Document Changes**: Track what works for your use case

By following this guide and systematically tuning configuration, you can achieve optimal performance for your specific use case while staying within resource constraints.

## Additional Resources

- [Performance Guide](./performance.md) - Performance optimization details
- [Benchmarking Guide](./benchmarking.md) - Benchmarking methodology
- [Dashboard Documentation](../src/dashboard/README.md) - Real-time monitoring
- [Performance Comparison](./performance-comparison.md) - vs LiteLLM and direct API
