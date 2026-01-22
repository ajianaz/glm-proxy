# Proxy vs Direct API Comparison Benchmark

This benchmark measures and compares the performance overhead introduced by GLM Proxy versus making direct API calls to Z.AI.

## Overview

The comparison benchmark provides:
- Side-by-side latency comparison (proxy vs direct API)
- Component-level breakdown of where time is spent
- Performance assertions against targets (< 10ms mean overhead)
- Competitive comparison with LiteLLM benchmarks
- Automated report generation (Markdown, HTML, JSON)

## Quick Start

```bash
# Run comparison benchmark with default settings (100 iterations)
bun run benchmark:comparison

# Run with HTML visualization charts
bun run benchmark:comparison --charts

# Run with more iterations for accurate results
bun run benchmark:comparison --iterations 500 --charts

# Specify custom output directory
bun run benchmark:comparison --output ./my-results
```

## Prerequisites

Before running the comparison benchmark, ensure:

1. **GLM Proxy is running**:
   ```bash
   bun run start
   ```

2. **Direct API endpoint is accessible**:
   ```bash
   # Option 1: Use mock upstream server (for testing)
   bun run test/benchmark/mock-upstream.ts

   # Option 2: Use real Z.AI API
   export ZAI_API_BASE=https://api.z.ai/v1/chat/completions
   ```

## Usage

### Command-Line Options

```bash
bun run test/benchmark/comparison.ts [OPTIONS]

Options:
  --iterations <n>       Number of test iterations (default: 100)
  --endpoint <url>       Proxy endpoint to test
                        (default: http://localhost:3000/v1/chat/completions)
  --api-key <key>        API key to use
                        (default: pk_test_benchmark_key)
  --output <path>        Output directory for reports
                        (default: ./test/benchmark/results)
  --charts               Generate HTML visualization charts
  --help                 Show help message
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ZAI_API_BASE` | Direct API endpoint for comparison | `http://localhost:3002/v1/chat/completions` |

## Output

The benchmark generates multiple output files:

### 1. JSON Data (`comparison-{timestamp}.json`)

Raw benchmark data for programmatic analysis:

```json
{
  "name": "Proxy vs Direct API Comparison",
  "timestamp": "2026-01-22T...",
  "proxy": {
    "stats": {
      "mean": 15.0,
      "p95": 18.0,
      "p99": 19.0
    }
  },
  "direct": {
    "stats": {
      "mean": 7.0,
      "p95": 9.0,
      "p99": 10.0
    }
  },
  "overhead": {
    "meanMs": 8.0,
    "p95Ms": 9.0,
    "p99Ms": 9.0,
    "meanPercent": 114.29
  },
  "componentBreakdown": { ... }
}
```

### 2. Markdown Report (`comparison-report-{timestamp}.md`)

Human-readable report with:
- Executive summary
- Latency comparison table
- Component breakdown
- Performance assertions
- LiteLLM comparison

### 3. HTML Charts (`comparison-charts-{timestamp}.html`) *(optional)*

Interactive HTML visualization with:
- Visual bar charts
- Color-coded metrics (green=pass, red=fail)
- Responsive design
- Shareable format

## Understanding the Results

### Key Metrics

#### 1. Latency Overhead

The additional time added by the proxy:

```
Overhead = ProxyLatency - DirectAPILatency
```

**Targets**:
- Mean: < 10ms
- P95: < 15ms
- P99: < 25ms

#### 2. Component Breakdown

Where the overhead is spent:

| Component | Description |
|-----------|-------------|
| **Authentication** | API key lookup and validation |
| **Rate Limiting** | Rate limit checking and enforcement |
| **JSON Processing** | Request/response parsing and transformation |
| **Request Validation** | Schema validation and sanitization |
| **Network Overhead** | Additional network hop |
| **Other** | Unaccounted overhead |

#### 3. Performance Assertions

Automated checks against targets:

```
✅ PASS - Mean Overhead < 10ms:     8.00ms
❌ FAIL - P95 Overhead < 15ms:     18.00ms
❌ FAIL - P99 Overhead < 25ms:     22.00ms
```

### Interpretation

- **✅ All Pass**: Proxy meets performance targets
- **⚠️ Some Fail**: Proxy needs optimization (see [Optimization Guide](../../docs/performance-comparison.md))
- **Exit Code 0**: All assertions passed
- **Exit Code 1**: One or more assertions failed

## Example Results

### Good Performance (Targets Met)

```
Summary:
  Mean Overhead: 8.45ms (12.1%)
  P95 Overhead: 12.30ms (14.5%)
  P99 Overhead: 18.20ms (19.8%)

Performance Assertions:
  [✅ PASS] Mean < 10ms
  [✅ PASS] P95 < 15ms
  [✅ PASS] P99 < 25ms
```

### Needs Optimization (Targets Not Met)

```
Summary:
  Mean Overhead: 25.30ms (36.1%)
  P95 Overhead: 42.10ms (49.5%)
  P99 Overhead: 58.90ms (64.2%)

Performance Assertions:
  [❌ FAIL] Mean < 10ms: 25.30ms
  [❌ FAIL] P95 < 15ms: 42.10ms
  [❌ FAIL] P99 < 25ms: 58.90ms
```

## Comparison with LiteLLM

The benchmark includes competitive data from LiteLLM:

| Solution | Mean | P95 | P99 |
|----------|------|-----|-----|
| **GLM Proxy** | *Your results* | *Your results* | *Your results* |
| **LiteLLM** | 25ms | 40ms | 60ms |

**Goal**: GLM Proxy should be faster than LiteLLM's 25ms mean overhead.

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Performance Tests

on: [push, pull_request]

jobs:
  comparison:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1

      - name: Start proxy
        run: |
          bun run start &
          sleep 5

      - name: Run comparison benchmark
        run: |
          bun run benchmark:comparison --iterations 200 --charts

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: comparison-results
          path: test/benchmark/results/comparison-*
```

### Performance Regression Detection

To detect performance regressions:

```bash
# Run benchmark
bun run benchmark:comparison --iterations 1000

# Compare against baseline
diff test/benchmark/results/baseline-comparison.json \
     test/benchmark/results/comparison-*.json
```

## Best Practices

### For Accurate Results

1. **Warm Up**: Always include warmup iterations (eliminates cold start)
2. **Sample Size**: Use at least 100 iterations, preferably 500-1000
3. **Stable Environment**: Run on dedicated machine with minimal load
4. **Multiple Runs**: Run 3-5 times and take average
5. **Consistent Configuration**: Use same settings across comparisons

### For Production Validation

1. **Load Testing**: Combine with load testing framework
2. **Real Workloads**: Test with production-like payloads
3. **Duration Tests**: Run sustained load (15 min, 1 hour)
4. **Network Conditions**: Test in realistic network environment

## Troubleshooting

### Benchmark fails to start

**Error**: `ECONNREFUSED`

**Solution**:
```bash
# Ensure proxy is running
bun run start

# Verify endpoint
curl http://localhost:3000/health
```

### Inconsistent results

**Symptoms**: High variance between runs

**Solutions**:
- Increase iterations: `--iterations 1000`
- Close other applications
- Use dedicated test machine
- Run multiple times and average

### Component timings show 0ms

**Reason**: Proxy doesn't send timing headers yet (TODO)

**Workaround**: Focus on total overhead for now

## Advanced Usage

### Custom Payloads

To test with custom payloads, modify the test payload in `comparison.ts`:

```typescript
const testPayload = {
  model: 'glm-4-plus',
  messages: [
    {
      role: 'user',
      content: 'Your custom message here',
    },
  ],
  max_tokens: 100, // Adjust as needed
};
```

### Programmatic Usage

Import and use in your own code:

```typescript
import { runComparisonBenchmark } from './test/benchmark/comparison.js';

const result = await runComparisonBenchmark({
  iterations: 1000,
  endpoint: 'http://localhost:3000/v1/chat/completions',
  apiKey: 'your-key',
});

console.log(`Overhead: ${result.overhead.meanMs.toFixed(2)}ms`);
```

## Related Documentation

- [Performance Comparison Guide](../../docs/performance-comparison.md) - Comprehensive guide
- [Baseline Performance Report](./results/BASELINE_REPORT.md) - Pre-optimization baseline
- [Benchmark Framework README](./README.md) - General benchmark documentation

## Files

- `test/benchmark/comparison.ts` - Main benchmark implementation
- `test/benchmark/types.ts` - Type definitions
- `test/benchmark/proxy-benchmark.ts` - Core benchmark functions
- `docs/performance-comparison.md` - Comprehensive documentation
- `scripts/generate-comparison-charts.ts` - Chart generation utilities

## Contributing

To improve the comparison benchmark:

1. Add new component timing measurements
2. Enhance HTML visualization (e.g., time-series charts)
3. Add more competitive benchmarks (e.g., other proxy solutions)
4. Improve statistical analysis (confidence intervals, etc.)

## License

MIT

---

**Last Updated**: 2026-01-22
**Version**: 1.0.0
