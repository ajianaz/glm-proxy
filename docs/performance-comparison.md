# Performance Comparison: GLM Proxy vs Direct API

This document provides a comprehensive comparison between GLM Proxy overhead and direct Z.AI API calls, including benchmarking methodology, results, and competitive analysis against LiteLLM.

## Table of Contents

1. [Overview](#overview)
2. [Running the Comparison](#running-the-comparison)
3. [Benchmark Methodology](#benchmark-methodology)
4. [Performance Results](#performance-results)
5. [Component Breakdown](#component-breakdown)
6. [Comparison with LiteLLM](#comparison-with-litellm)
7. [Performance Assertions](#performance-assertions)
8. [Visualization](#visualization)

---

## Overview

GLM Proxy is designed to provide minimal overhead when proxying requests to Z.AI API. This document quantifies that overhead across multiple dimensions:

- **Latency Overhead**: Additional time added by the proxy
- **Component Analysis**: Breakdown of where time is spent
- **Competitive Comparison**: How we compare to LiteLLM
- **Throughput Impact**: Effect on requests per second

### Performance Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| **Mean Overhead** | < 10ms | 85% reduction from baseline (67.27ms) |
| **P95 Overhead** | < 15ms | Consistent performance for 95% of requests |
| **P99 Overhead** | < 25ms | Tail latency optimization |
| **vs LiteLLM** | Faster | Competitive advantage |

---

## Running the Comparison

### Prerequisites

1. Start the GLM Proxy server:
   ```bash
   bun run start
   ```

2. Ensure the Z.AI API (or mock upstream) is accessible:
   ```bash
   # Using mock upstream (for testing)
   bun run test/benchmark/mock-upstream.ts

   # Or set real Z.AI API endpoint
   export ZAI_API_BASE=https://api.z.ai/v1/chat/completions
   ```

### Basic Usage

```bash
# Run comparison with default settings (100 iterations)
bun run test/benchmark/comparison.ts

# Run with custom iterations
bun run test/benchmark/comparison.ts --iterations 500

# Run with custom endpoint
bun run test/benchmark/comparison.ts --endpoint http://localhost:3000/v1/chat/completions

# Run with custom API key
bun run test/benchmark/comparison.ts --api-key pk_test_my_key

# Specify output path
bun run test/benchmark/comparison.ts --output ./my-comparison-report.md
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ZAI_API_BASE` | Direct API endpoint for comparison | `http://localhost:3002/v1/chat/completions` |
| `PROXY_ENDPOINT` | Proxy endpoint to test | `http://localhost:3000/v1/chat/completions` |

### Output

The benchmark generates:
1. **Console Output**: Real-time progress and summary
2. **Markdown Report**: Detailed comparison report (default: `./test/benchmark/results/comparison-report.md`)
3. **Exit Code**: `0` if all assertions pass, `1` otherwise

---

## Benchmark Methodology

### Test Design

The comparison benchmark measures three scenarios:

1. **Direct API Call**: Call Z.AI API directly without proxy
2. **Proxied Call**: Call Z.AI API through GLM Proxy
3. **Overhead Calculation**: Difference between proxied and direct

### Measurement Approach

```typescript
// Direct API latency
DirectLatency = Time(Request → Z.AI → Response)

// Proxied latency
ProxyLatency = Time(Request → GLM Proxy → Z.AI → GLM Proxy → Response)

// Overhead
Overhead = ProxyLatency - DirectLatency
```

### Test Payload

```json
{
  "model": "glm-4-plus",
  "messages": [
    {
      "role": "user",
      "content": "Hello, this is a comparison benchmark test."
    }
  ],
  "max_tokens": 10
}
```

### Sample Size

- **Default Iterations**: 100 requests per scenario
- **Warmup Iterations**: 10 requests (to eliminate cold start effects)
- **Recommended**: 200-1000 iterations for production-grade results

### Data Collection

For each request, we collect:
- Total duration (end-to-end latency)
- Component timings (if available via response headers):
  - Authentication time
  - Rate limiting check time
  - JSON processing time
  - Request validation time
  - Network overhead time

---

## Performance Results

<!-- UPDATE THIS SECTION WITH ACTUAL BENCHMARK RESULTS -->

### Latest Results

**Date**: *[Run benchmark to update]*
**Configuration**:
- Iterations: 100
- Endpoint: `http://localhost:3000/v1/chat/completions`
- Direct API: `http://localhost:3002/v1/chat/completions`

### Latency Overhead

| Metric | Proxy | Direct API | Overhead | Percentage | Status |
|--------|-------|------------|----------|------------|--------|
| **Mean** | *To be measured* | *To be measured* | *To be measured* | *To be measured* | ⏳ TBD |
| **P95** | *To be measured* | *To be measured* | *To be measured* | *To be measured* | ⏳ TBD |
| **P99** | *To be measured* | *To be measured* | *To be measured* | *To be measured* | ⏳ TBD |
| **Min** | *To be measured* | *To be measured* | *To be measured* | *To be measured* | ⏳ TBD |
| **Max** | *To be measured* | *To be measured* | *To be measured* | *To be measured* | ⏳ TBD |

### Interpretation

- **Mean Overhead**: Average additional latency introduced by proxy
- **P95 Overhead**: 95th percentile - proxy overhead for 95% of requests
- **P99 Overhead**: 99th percentile - worst-case proxy overhead
- **Percentage**: Relative overhead compared to direct API call

---

## Component Breakdown

### Where Does the Overhead Go?

<!-- UPDATE WITH ACTUAL COMPONENT TIMINGS -->

| Component | Mean Time | % of Overhead | Description |
|-----------|-----------|---------------|-------------|
| **Authentication** | *To be measured* | *To be measured* | API key lookup and validation |
| **Rate Limiting** | *To be measured* | *To be measured* | Rate limit check and enforcement |
| **JSON Processing** | *To be measured* | *To be measured* | Request/response parsing and transformation |
| **Request Validation** | *To be measured* | *To be measured* | Schema validation and sanitization |
| **Network Overhead** | *To be measured* | *To be measured* | Additional network hop |
| **Other** | *To be measured* | *To be measured* | Unaccounted overhead |

### Component Optimization Opportunities

Based on the component breakdown, here are potential optimization targets:

1. **Authentication** → Cache API keys (Subtask 5.1 ✅)
2. **Rate Limiting** → Optimize data structures (Subtask 5.2 ✅)
3. **JSON Processing** → Use streaming and optimized parsers (Subtask 3.1, 3.2 ✅)
4. **Network Overhead** → Connection pooling (Subtask 2.1, 2.2 ✅)

---

## Comparison with LiteLLM

### Competitive Benchmark Data

| Solution | Mean Latency | P95 Latency | P99 Latency | Source |
|----------|--------------|-------------|-------------|--------|
| **GLM Proxy** | *To be measured* | *To be measured* | *To be measured* | This benchmark |
| **LiteLLM (OpenAI Proxy)** | 25ms | 40ms | 60ms | [GitHub Issue #1389](https://github.com/BerriAI/litellm/issues/1389) |
| **LiteLLM (Anthropic Proxy)** | 30ms | 45ms | 70ms | Community benchmarks |

### Performance Gap Analysis

<!-- UPDATE AFTER RUNNING BENCHMARK -->

```
Improvement vs LiteLLM: To be calculated

Formula: ((LiteLLM_Mean - GLM_Proxy_Mean) / LiteLLM_Mean) * 100
```

### Key Advantages

1. **Lower Overhead**: Target < 10ms vs LiteLLM's 25-30ms
2. **Better P95**: Consistent performance for 95% of requests
3. **Optimized Stack**: Built on Bun for maximum performance
4. **Connection Pooling**: HTTP/2 support for multiplexing (vs LiteLLM's connection-per-request)

---

## Performance Assertions

### Automated Checks

The comparison benchmark includes automated assertions to validate performance targets:

```typescript
// Performance Assertions
✅ Mean Overhead < 10ms
✅ P95 Overhead < 15ms
✅ P99 Overhead < 25ms
✅ Faster than LiteLLM (mean latency)
```

### CI/CD Integration

To integrate performance assertions into CI/CD:

```yaml
# .github/workflows/performance.yml
name: Performance Tests

on: [push, pull_request]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - name: Start proxy
        run: bun run start &
      - name: Run comparison benchmark
        run: bun run test/benchmark/comparison.ts --iterations 100
      - name: Upload report
        uses: actions/upload-artifact@v3
        with:
          name: comparison-report
          path: test/benchmark/results/comparison-report.md
```

### Performance Regression Detection

To detect performance regressions:

1. **Baseline Comparison**: Compare current results against baseline
2. **Threshold Alerts**: Fail if overhead increases by > 20%
3. **Trend Analysis**: Track overhead over time

```bash
# Example: Regression detection script
bun run test/benchmark/comparison.ts --iterations 1000 > results/current.md
diff results/baseline.md results/current.md
```

---

## Visualization

### Component Overhead Chart

<!-- UPDATE WITH ACTUAL DATA -->

```
Authentication     |████████████████████████████████  XX.XXms
Rate Limiting      |███████████████████████          XX.XXms
JSON Processing    |███████████████████████████████  XX.XXms
Request Validation |█████████████                    XX.XXms
Network Overhead   |████████████████████████████████████████  XX.XXms
Other              |██████████                      XX.XXms
```

### Latency Distribution Chart

```
        Direct API    Proxy
Mean    |--------|    |-------------|  XXms overhead
P95     |-----------| |-----------------| XXms overhead
P99     |-------------|------------------| XXms overhead
        ^            ^ ^
      0ms         XXms XXms
```

### Overhead Percentage

```
Proxy Overhead as % of Direct API Call: XX.X%

┌─────────────────────────────────────┐
│ Direct API                          │ XXms
└─────────────────────────────────────┘
  └─┬─┘
    └──► Proxy Overhead (XX.X%)
```

---

## Historical Results

### Baseline (Pre-optimization)

**Date**: 2026-01-22

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Mean Latency | 67.27ms | < 10ms | ❌ FAIL (6.7x over) |
| P95 Latency | 94.76ms | < 15ms | ❌ FAIL (6.3x over) |
| P99 Latency | 95.40ms | < 25ms | ❌ FAIL (3.8x over) |

### Post-optimization

<!-- UPDATE WITH POST-OPTIMIZATION RESULTS -->

**Date**: *[To be measured after all optimization phases]*

| Metric | Before | After | Improvement | Status |
|--------|--------|-------|-------------|--------|
| Mean Latency | 67.27ms | *To be measured* | *To be calculated* | ⏳ TBD |
| P95 Latency | 94.76ms | *To be measured* | *To be calculated* | ⏳ TBD |
| P99 Latency | 95.40ms | *To be measured* | *To be calculated* | ⏳ TBD |

---

## Troubleshooting

### Common Issues

#### 1. Benchmark Fails to Start

**Symptom**: `ECONNREFUSED` error

**Solution**:
```bash
# Ensure proxy is running
bun run start

# Verify endpoint is accessible
curl http://localhost:3000/health
```

#### 2. Inconsistent Results

**Symptom**: High variance between runs

**Solutions**:
- Increase iterations: `--iterations 1000`
- Close other applications (reduce system load)
- Use dedicated test machine
- Run multiple times and take average

#### 3. Overhead Seems Too High

**Symptom**: Overhead > 50ms

**Checks**:
- Verify connection pooling is enabled (not disabled)
- Check if cold start (first request is always slower)
- Ensure warmup iterations are sufficient
- Verify no debug logging is enabled

#### 4. Component Timings Missing

**Symptom**: All component timings show 0ms

**Reason**: Proxy doesn't send timing headers yet

**Solution**: Enable timing headers in proxy configuration (TODO)

---

## Best Practices

### For Accurate Results

1. **Warm Up**: Always include warmup iterations (default: 10)
2. **Sample Size**: Use at least 100 iterations, preferably 1000+
3. **Stable Environment**: Run on dedicated machine with minimal load
4. **Multiple Runs**: Run 3-5 times and take average
5. **Consistent Configuration**: Use same settings across comparisons

### For Production Validation

1. **Load Testing**: Combine with load testing framework (Subtask 7.1)
2. **Real Workloads**: Test with production-like payloads
3. **Duration Tests**: Run sustained load (15 min, 1 hour)
4. **Network Conditions**: Test in realistic network environment

### For CI/CD

1. **Quick Smoke Test**: 50 iterations, fast feedback
2. **Nightly Benchmarks**: 1000 iterations, detailed analysis
3. **Regression Detection**: Compare against baseline
4. **Alert Thresholds**: Fail if overhead increases > 20%

---

## References

### Related Documentation

- [Baseline Performance Report](../test/benchmark/results/BASELINE_REPORT.md)
- [Benchmark Framework](../test/benchmark/README.md)
- [Performance Optimization Plan](./.auto-claude/specs/005-performance-optimization-and-low-latency-architect/spec.md)
- [Streaming Buffer Optimization](./streaming-buffer-optimization.md)

### External Sources

- [LiteLLM Performance Issues](https://github.com/BerriAI/litellm/issues/1389)
- [Bun Performance](https://bun.sh/docs/benchmarks)
- [HTTP/2 Specification](https://httpwg.org/specs/rfc9113.html)

---

## Appendix

### Raw Benchmark Data

Detailed benchmark results are saved to:
- `./test/benchmark/results/comparison-report.md` (human-readable)
- Can be extended to save JSON for programmatic analysis

### Benchmark Source Code

- `./test/benchmark/comparison.ts` - Comparison benchmark implementation
- `./test/benchmark/types.ts` - Type definitions
- `./test/benchmark/proxy-benchmark.ts` - Core benchmark functions

### Contributing

To improve the comparison benchmark:

1. Add new component timings
2. Enhance visualization (generate actual charts)
3. Add more competitive benchmarks
4. Improve statistical analysis

---

**Last Updated**: 2026-01-22
**Maintained By**: Performance Optimization Team
**Version**: 1.0.0
