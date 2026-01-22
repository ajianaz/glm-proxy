# Benchmarking Guide

Comprehensive guide to benchmarking GLM Proxy performance, including methodology, tools, and best practices.

## Table of Contents

- [Overview](#overview)
- [Benchmarking Methodology](#benchmarking-methodology)
- [Benchmark Framework](#benchmark-framework)
- [Load Testing](#load-testing)
- [Metrics and Analysis](#metrics-and-analysis)
- [CI/CD Integration](#cicd-integration)
- [Best Practices](#best-practices)

## Overview

Benchmarking is essential for tracking performance improvements and ensuring GLM Proxy meets its latency targets. This guide covers the complete benchmarking approach used to validate optimizations.

### Benchmarking Goals

1. **Validate Latency Targets**: Confirm < 10ms mean overhead
2. **Measure Resource Usage**: Track memory, CPU, and scaling
3. **Identify Bottlenecks**: Find performance hotspots
4. **Compare Optimizations**: Measure impact of each optimization
5. **Regression Testing**: Catch performance regressions early

### Benchmark Types

- **Microbenchmarks**: Individual component performance
- **Macrobenchmarks**: End-to-end request latency
- **Load Tests**: Sustained performance under load
- **Stress Tests**: Breaking point identification
- **Comparison Tests**: vs direct API and competitors

## Benchmarking Methodology

### 1. Baseline Establishment

**Purpose**: Establish starting point for optimization measurements.

**Command**:
```bash
bun run test/benchmark/run-baseline.ts
```

**Baseline Metrics**:
```
Mean Latency: 67.27ms (Target: < 10ms)
Throughput: 12,621 RPS peak
Memory: 6.30MB base
CPU: 0.000387s average
Scaling: 0.7% efficiency
```

**Baseline Report**: `test/benchmark/results/BASELINE_REPORT.md`

### 2. Optimization Validation

After implementing each optimization phase:

```bash
# Run comparison benchmark
bun run benchmark:comparison

# View results
bun run scripts/view-charts.ts
```

**Expected Improvements**:
- Connection pooling: 20-30% latency reduction
- Caching: 90%+ latency reduction for cached requests
- Streaming: Constant memory regardless of payload size
- Object pooling: Reduced GC pauses

### 3. Load Testing

Validate performance under sustained load:

```bash
# Run smoke test (quick validation)
bun run test/load/index.ts --scenario smoke

# Run full validation suite
bun run test/load/index.ts --scenario validation

# Run sustained load test
bun run test/load/index.ts --scenario sustained --duration 15m
```

### 4. Resource Validation

Ensure resource usage stays within targets:

```bash
# Validate latency targets
bun run scripts/validate-latency.ts

# Validate memory and CPU usage
bun run scripts/validate-resources.ts
```

## Benchmark Framework

### Quick Start

```bash
# Run complete benchmark suite
bun run benchmark

# Run with custom configuration
bun run test/benchmark/index.ts \
  --iterations 500 \
  --concurrency 50 \
  --endpoint http://localhost:3000/v1/chat/completions
```

### Command-Line Options

| Option | Default | Description |
|--------|---------|-------------|
| `--iterations <n>` | 100 | Number of iterations per benchmark |
| `--concurrency <n>` | 10 | Concurrency level for throughput tests |
| `--warmup <n>` | 10 | Number of warmup iterations |
| `--endpoint <url>` | localhost:3000/v1/... | API endpoint to benchmark |
| `--api-key <key>` | pk_test_benchmark_key | API key to use |
| `--output <dir>` | ./test/benchmark/results | Output directory for results |

### Benchmark Types

#### Latency Benchmark

Measures end-to-end request latency:

```typescript
import { runLatencyBenchmark } from './test/benchmark/index.js';

const results = await runLatencyBenchmark({
  iterations: 1000,
  warmupIterations: 100,
  endpoint: 'http://localhost:3000/v1/chat/completions',
  apiKey: 'your-api-key',
});

console.log(`P50: ${results.stats.p50}ms`);
console.log(`P95: ${results.stats.p95}ms`);
console.log(`P99: ${results.stats.p99}ms`);
```

#### Throughput Benchmark

Tests performance under various concurrency levels:

```typescript
import { runThroughputBenchmark } from './test/benchmark/index.js';

const results = await runThroughputBenchmark({
  concurrencyLevels: [1, 10, 50, 100, 500],
  iterationsPerLevel: 100,
  endpoint: 'http://localhost:3000/v1/chat/completions',
});

results.forEach(result => {
  console.log(`${result.concurrency} concurrent: ${result.rps} RPS`);
});
```

#### Memory Benchmark

Tracks memory usage over time:

```typescript
import { runMemoryBenchmark } from './test/benchmark/index.js';

const results = await runMemoryBenchmark({
  duration: 60000, // 1 minute
  sampleInterval: 1000, // 1 second
  endpoint: 'http://localhost:3000/v1/chat/completions',
});

console.log(`Base memory: ${results.baseMemory}MB`);
console.log(`Peak memory: ${results.peakMemory}MB`);
console.log(`Memory growth: ${results.memoryGrowth}MB`);
```

#### Comparison Benchmark

Side-by-side comparison with direct API:

```bash
bun run test/benchmark/comparison.ts
```

Output formats:
- JSON: `test/benchmark/results/comparison-{timestamp}.json`
- HTML: `test/benchmark/results/comparison-{timestamp}.html`
- Markdown: `test/benchmark/results/comparison-{timestamp}.md`

## Load Testing

### Load Testing Framework

Comprehensive load testing for production readiness.

```bash
# Quick smoke test
bun run test/load/index.ts --scenario smoke

# Validation suite (all scenarios)
bun run test/load/index.ts --scenario validation

# Specific scenarios
bun run test/load/index.ts --scenario constant --concurrency 100
bun run test/load/index.ts --scenario ramp --min-concurrency 10 --max-concurrency 500
bun run test/load/index.ts --scenario sustained --duration 1h
```

### Load Test Scenarios

#### Constant Load

Sustained load at fixed concurrency:

```bash
bun run test/load/index.ts \
  --scenario constant \
  --concurrency 100 \
  --duration 5m
```

**Metrics**:
- Requests per second (RPS)
- Latency percentiles (p50, p95, p99)
- Error rate
- Memory usage over time

#### Ramp-Up Test

Gradual increase in concurrency:

```bash
bun run test/load/index.ts \
  --scenario ramp \
  --min-concurrency 10 \
  --max-concurrency 500 \
  --ramp-duration 10m
```

**Purpose**: Identify scaling characteristics and bottlenecks.

#### Spike Test

Sudden traffic surge:

```bash
bun run test/load/index.ts \
  --scenario spike \
  --baseline-concurrency 10 \
  --spike-concurrency 1000 \
  --spike-duration 30s
```

**Purpose**: Test resilience to traffic spikes.

#### Sustained Load

Long-running load test:

```bash
bun run test/load/index.ts \
  --scenario sustained \
  --concurrency 100 \
  --duration 1h
```

**Purpose**: Identify memory leaks and performance degradation.

### Load Test Results

Results are saved with detailed metrics:

```json
{
  "scenario": "constant-100",
  "timestamp": "2026-01-22T10:30:00.000Z",
  "duration": 300000,
  "requests": {
    "total": 3000000,
    "successful": 2985000,
    "failed": 15000,
    "successRate": 0.995
  },
  "latency": {
    "p50": 8.5,
    "p95": 12.3,
    "p99": 15.7,
    "min": 5.1,
    "max": 18.2
  },
  "throughput": {
    "requestsPerSecond": 10000,
    "bytesPerSecond": 512000000
  },
  "resources": {
    "memory": {
      "base": 50,
      "peak": 75,
      "average": 60
    },
    "cpu": {
      "average": 0.45,
      "peak": 0.80
    }
  }
}
```

## Metrics and Analysis

### Key Metrics

#### Latency Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| **P50** | < 10ms | 50th percentile (median) |
| **P95** | < 15ms | 95th percentile |
| **P99** | < 25ms | 99th percentile |
| **Mean** | < 10ms | Average latency |
| **Min** | - | Fastest request |
| **Max** | < 50ms | Slowest request |

#### Throughput Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| **RPS** | - | Requests per second |
| **Peak RPS** | > 10,000 | Maximum throughput |
| **Scaling** | Linear | Proportional to concurrency |

#### Resource Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| **Base Memory** | < 100MB | Memory at startup |
| **Peak Memory** | < 200MB | Maximum during load |
| **Memory Growth** | < 10MB/hr | Growth rate |
| **CPU Usage** | < 80% | Under high load |
| **Event Loop Lag** | < 10ms | Under high load |

### Performance Targets Validation

#### Latency Validation

```bash
bun run scripts/validate-latency.ts
```

**Validation Rules**:
- P50 < 10ms ✅
- P95 < 15ms ✅
- P99 < 25ms ✅
- No spikes > 50ms ✅
- Stable under load ✅

**Sample Output**:
```
✅ P50 Latency: 8.5ms (Target: < 10ms)
✅ P95 Latency: 12.3ms (Target: < 15ms)
✅ P99 Latency: 15.7ms (Target: < 25ms)
✅ No Latency Spikes: Max 18.2ms (Threshold: 50ms)
✅ Stability: 1.2x variance (Threshold: 1.5x)

Overall: PASS
```

#### Resource Validation

```bash
bun run scripts/validate-resources.ts
```

**Validation Rules**:
- Base memory < 100MB ✅
- Memory growth < 10MB/hr ✅
- No memory leaks ✅
- CPU scales linearly (correlation > 0.8) ✅
- Graceful degradation (failure rate < 10%) ✅

### Performance Analysis

#### Latency Distribution

```
0-10ms:   ████████████████████ 60% (P50 target)
10-15ms:  ████████████ 30% (P95 target)
15-25ms:  ████ 8% (P99 target)
25-50ms:  ██ 2%
> 50ms:   █ 0% (spikes)
```

#### Scaling Analysis

```
Concurrency | RPS     | P50    | P95    | P99    | Efficiency
------------|---------|--------|--------|--------|------------
1           | 1,000   | 8.5ms  | 12ms   | 15ms   | 100%
10          | 10,000  | 9.0ms  | 13ms   | 17ms   | 100%
50          | 45,000  | 9.5ms  | 14ms   | 20ms   | 90%
100         | 80,000  | 10ms   | 15ms   | 25ms   | 80%
500         | 200,000 | 15ms   | 25ms   | 40ms   | 40%
```

## CI/CD Integration

### Automated Performance Tests

Add to your CI/CD pipeline:

```yaml
# .github/workflows/performance.yml
name: Performance Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Start proxy server
        run: bun run start &

      - name: Wait for server
        run: sleep 5

      - name: Run benchmarks
        run: bun run benchmark

      - name: Validate latency
        run: bun run scripts/validate-latency.ts

      - name: Validate resources
        run: bun run scripts/validate-resources.ts

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: benchmark-results
          path: test/benchmark/results/
```

### Performance Regression Detection

Automatically detect performance regressions:

```typescript
// scripts/check-regression.ts
import fs from 'fs';

interface BenchmarkResults {
  timestamp: string;
  results: {
    latency: { stats: { p50: number; p95: number; p99: number } };
  };
}

const current = JSON.parse(
  fs.readFileSync('test/benchmark/results/latest.json', 'utf-8')
) as BenchmarkResults;

const baseline = JSON.parse(
  fs.readFileSync('test/benchmark/results/baseline.json', 'utf-8')
) as BenchmarkResults;

const p50Regression = current.results.latency.stats.p50 /
                       baseline.results.latency.stats.p50;

if (p50Regression > 1.2) {
  console.error(`❌ P50 latency regression: ${p50Regression}x`);
  process.exit(1);
}

console.log(`✅ No performance regression detected`);
```

### Performance Gates

Set performance thresholds in CI/CD:

```bash
# Fail if P50 > 12ms (20% over target)
bun run benchmark | jq '.results.latency.stats.p50' | \
  awk '{ if ($1 > 12) exit 1 }'

# Fail if memory growth > 15MB/hr
bun run scripts/validate-resources.ts | \
  grep "Memory Growth" | \
  awk '{ if ($3 > 15) exit 1 }'
```

## Best Practices

### Benchmarking Environment

1. **Isolated Environment**: Run benchmarks on dedicated hardware
2. **Consistent Configuration**: Use same settings across runs
3. **Warm-Up Period**: Allow JIT compilation (10-100 iterations)
4. **Multiple Runs**: Run 3-5 times and average results
5. **Resource Monitoring**: Track CPU, memory, network during tests

### Benchmark Execution

1. **Baseline First**: Always establish baseline before optimizations
2. **One Change at a Time**: Measure impact of each optimization separately
3. **Control Variables**: Keep configuration constant across runs
4. **Sufficient Duration**: Run long enough for stable results (5-10 min minimum)
5. **Document Everything**: Record system configuration, software versions, etc.

### Result Analysis

1. **Compare Apples to Apples**: Use same methodology across comparisons
2. **Look at Percentiles**: Mean can be misleading; focus on P95/P99
3. **Check Scaling**: Verify performance scales with concurrency
4. **Monitor Resources**: High CPU/memory may indicate bottlenecks
5. **Trend Analysis**: Track performance over time to catch regressions

### Common Pitfalls

1. **Too Few Iterations**: < 100 iterations can give noisy results
2. **Ignoring Warm-Up**: First few requests are always slower
3. **No GC Control**: Run with `--expose-gc` for consistent memory tests
4. **Network Variability**: Use local mock server for stable results
5. **Wrong Metrics**: Don't focus solely on throughput; latency matters

### Benchmarking Checklist

Before publishing benchmark results:

- [ ] Run benchmark at least 3 times
- [ ] Results are reproducible (within 5% variance)
- [ ] Warm-up iterations included
- [ ] Environment documented (hardware, OS, runtime versions)
- [ ] Configuration documented (pool sizes, cache settings, etc.)
- [ ] Metrics compared to baseline
- [ ] Results validated against targets
- [ ] Outliers investigated and explained
- [ ] Full results saved (not just averages)
- [ ] Methodology documented

## Summary

Benchmarking GLM Proxy involves:

1. **Baseline Establishment**: Measure before optimizations
2. **Component Benchmarking**: Test individual optimizations
3. **Load Testing**: Validate under sustained load
4. **Comparison Testing**: vs direct API and competitors
5. **CI/CD Integration**: Automate regression detection
6. **Best Practices**: Ensure reliable, reproducible results

By following this methodology, you can confidently validate that GLM Proxy meets its **< 10ms latency target** and outperforms competing solutions.

## Additional Resources

- [Performance Guide](./performance.md) - Performance optimization details
- [Tuning Guide](./tuning.md) - Configuration tuning recommendations
- [Load Testing README](../test/load/README.md) - Load testing framework docs
- [Benchmark Framework README](../test/benchmark/README.md) - Benchmark framework docs
- [Performance Comparison](./performance-comparison.md) - Comparison with LiteLLM
