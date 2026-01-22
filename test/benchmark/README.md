# Benchmark Framework

Comprehensive benchmarking framework for measuring latency, throughput, memory usage, and CPU usage of the GLM Proxy.

## Overview

This benchmark suite provides detailed performance metrics to help identify bottlenecks and track performance improvements over time.

## Features

- **Latency Measurement**: Measures end-to-end request latency and proxy overhead
- **Throughput Testing**: Tests performance under various concurrency levels (1, 10, 50, 100, 500)
- **Memory Profiling**: Tracks memory usage over time and identifies potential leaks
- **CPU Monitoring**: Measures CPU usage during load testing
- **JSON Export**: Results exported to JSON for analysis and comparison

## Usage

### Quick Start

Run the complete benchmark suite with default settings:

```bash
bun run benchmark
```

### Custom Configuration

Run benchmarks with custom settings:

```bash
bun run test/benchmark/index.ts --iterations 500 --concurrency 50 --endpoint http://localhost:3000/v1/chat/completions
```

### Command-Line Options

- `--iterations <n>`: Number of iterations per benchmark (default: 100)
- `--concurrency <n>`: Concurrency level for throughput tests (default: 10)
- `--warmup <n>`: Number of warmup iterations (default: 10)
- `--endpoint <url>`: API endpoint to benchmark (default: http://localhost:3000/v1/chat/completions)
- `--api-key <key>`: API key to use (default: pk_test_benchmark_key)
- `--output <dir>`: Output directory for results (default: ./test/benchmark/results)
- `--help`: Show help message

## Running Tests

Run the benchmark framework tests:

```bash
bun test test/benchmark/benchmark.test.ts
```

## Benchmark Results

Results are saved to `./test/benchmark/results/` as JSON files with timestamps:

```
benchmark-report-2026-01-22T10-30-00-000Z.json
```

### Result Format

Each benchmark report contains:

```json
{
  "suiteName": "GLM Proxy Benchmark 2026-01-22T10:30:00.000Z",
  "timestamp": "2026-01-22T10:30:00.000Z",
  "config": {
    "iterations": 100,
    "concurrency": 10,
    "warmupIterations": 10,
    "timeout": 30000,
    "endpoint": "http://localhost:3000/v1/chat/completions",
    "apiKey": "pk_test_benchmark_key"
  },
  "results": {
    "latency": {
      "stats": {
        "min": 5.2,
        "max": 15.8,
        "mean": 8.4,
        "median": 7.9,
        "p50": 7.9,
        "p95": 12.3,
        "p99": 14.5
      }
    },
    "throughput": [...],
    "memory": {...},
    "cpu": {...}
  },
  "summary": {
    "totalTestsRun": 2,
    "passed": 2,
    "failed": 0,
    "duration": 15000
  }
}
```

## Metrics Explained

### Latency Metrics

- **min**: Minimum latency observed
- **max**: Maximum latency observed
- **mean**: Average latency across all requests
- **median**: Median latency (50th percentile)
- **p50**: 50th percentile latency
- **p95**: 95th percentile latency
- **p99**: 99th percentile latency

### Throughput Metrics

- **requestsPerSecond**: RPS achieved at each measurement point
- **successRate**: Percentage of successful requests
- **totalRequests**: Total number of requests sent
- **totalErrors**: Total number of failed requests

### Memory Metrics

- **baseMemory**: Memory usage before benchmark starts
- **peakMemory**: Maximum memory usage during benchmark
- **memoryGrowth**: Total memory increase from base to peak
- **averageHeapUsed**: Average heap usage across all snapshots

### CPU Metrics

- **averageUsage**: Average CPU time consumed
- **peakUsage**: Peak CPU time consumed

## Programmatic Usage

You can also use the benchmark framework programmatically:

```typescript
import { runBenchmarkSuite } from './test/benchmark/index.js';

const report = await runBenchmarkSuite({
  iterations: 500,
  concurrency: 50,
  endpoint: 'http://localhost:3000/v1/chat/completions',
  apiKey: 'your-api-key',
});

console.log(JSON.stringify(report, null, 2));
```

## Best Practices

1. **Run Multiple Times**: Run benchmarks multiple times to get consistent results
2. **Isolate Environment**: Ensure no other heavy processes are running
3. **Warm Up**: Always include warmup iterations to allow JIT compilation
4. **Compare Baselines**: Save baseline results to compare against future optimizations
5. **Monitor Resources**: Use system monitoring tools alongside benchmarks

## Interpreting Results

### Good Performance

- **Latency**: P95 < 15ms, P99 < 25ms
- **Throughput**: Linear scaling with concurrency
- **Memory**: Stable growth, no leaks
- **CPU**: Efficient usage, no spikes

### Performance Issues

- **Latency Spikes**: Check for GC pauses, network issues
- **Low Throughput**: May indicate connection pool exhaustion
- **Memory Growth**: Potential memory leak
- **High CPU**: Inefficient algorithms or excessive JSON parsing

## Troubleshooting

### Benchmark Fails to Start

- Ensure the proxy server is running
- Check that the endpoint URL is correct
- Verify API key is valid

### Inconsistent Results

- Close other applications
- Run benchmarks multiple times
- Check for network variability
- Ensure consistent system state

### Memory Issues

- Run with `--expose-gc` flag to enable garbage collection
- Check for memory leaks in code
- Monitor heap snapshots over time

## Contributing

When adding new benchmarks:

1. Follow existing patterns in `proxy-benchmark.ts` and `memory-benchmark.ts`
2. Add types to `types.ts`
3. Write tests in `benchmark.test.ts`
4. Update this README

## License

MIT
