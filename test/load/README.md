# Load Testing Framework

Comprehensive load testing framework for validating GLM Proxy performance under various scenarios.

## Features

- **Multiple Test Scenarios**: Constant load, ramp-up, ramp-down, spike, sustained, stress, and failure tests
- **Concurrency Levels**: Test from 1 to 1000+ concurrent users
- **Performance Targets**: Validates against < 10ms P50 latency, < 15ms P95, < 25ms P99
- **Resource Monitoring**: Tracks memory usage, CPU usage, and request metrics
- **Automated Reporting**: Generates JSON and Markdown reports with recommendations
- **Progress Tracking**: Real-time progress updates during long-running tests

## Quick Start

### Run Smoke Tests (Quick validation)

```bash
bun run test/load/index.ts --scenario smoke
```

### Run Full Validation Tests

```bash
bun run test/load/index.ts --scenario validation
```

### Run All Test Scenarios

```bash
bun run test/load/index.ts --scenario all
```

## Test Scenarios

### Constant Load Tests

Maintains steady concurrency throughout the test duration.

```bash
bun run test/load/index.ts --scenario constant --concurrency 100 --duration 60000
```

**Concurrency Levels**: 1, 10, 50, 100, 500, 1000 users

### Ramp-Up Tests

Gradually increases concurrency from min to max over the test duration.

```bash
bun run test/load/index.ts --scenario ramp --concurrency 500 --duration 300000
```

**Tests**: 1→100, 1→500, 1→1000 users

### Spike Tests

Simulates sudden traffic spikes to test system resilience.

```bash
bun run test/load/index.ts --scenario spike --concurrency 500
```

**Tests**: Sudden jumps from baseline to 500/1000 users

### Sustained Load Tests

Maintains high load over extended periods to test for memory leaks and degradation.

```bash
bun run test/load/index.ts --scenario sustained --duration 3600000
```

**Durations**: 5 min, 15 min, 1 hour

### Stress Tests

Progressively increases load until system breaks or degrades significantly.

```bash
bun run test/load/index.ts --scenario stress --concurrency 2000
```

**Tests**: Progressive load to 2000 users

### Failure Tests

Tests system behavior under various failure conditions.

```bash
bun run test/load/index.ts --scenario failure
```

**Tests**: Invalid API keys, request timeouts, invalid endpoints

## Configuration Options

| Option | Description | Default |
|--------|-------------|---------|
| `--scenario` | Test scenario type | `smoke` |
| `--duration` | Test duration in milliseconds | `300000` (5 min) |
| `--concurrency` | Max concurrent users | `100` |
| `--endpoint` | API endpoint to test | `http://localhost:3000/v1/chat/completions` |
| `--api-key` | API key to use | `pk_test_benchmark_key` |
| `--timeout` | Request timeout in ms | `30000` (30s) |
| `--output` | Output directory for results | `./test/load/results` |
| `--verbose` | Enable verbose output | `false` |

## Performance Targets

The load testing framework validates against the following performance targets:

- **P50 Latency**: < 10ms (median)
- **P95 Latency**: < 15ms (95th percentile)
- **P99 Latency**: < 25ms (99th percentile)
- **Memory Usage**: < 100MB peak
- **Error Rate**: < 5%

## Output

### Console Output

The framework provides real-time progress updates:

```
===============================================================================
GLM Proxy Load Testing Framework
===============================================================================

Scenario: smoke
Tests to run: 2
Output directory: ./test/load/results

Starting load test: Smoke Test - 10 Concurrent Users
Scenario: constant_load
Duration: 30s
Concurrency: 10 -> 10
```

### JSON Results

Detailed results saved to `./test/load/results/load-test-results-{timestamp}.json`:

```json
{
  "timestamp": "2025-01-22T12:00:00.000Z",
  "results": [
    {
      "testName": "Constant Load - 100 Concurrent Users",
      "scenario": "constant_load",
      "stats": {
        "totalRequests": 5000,
        "successfulRequests": 4975,
        "failedRequests": 25,
        "p50Latency": 8.5,
        "p95Latency": 12.3,
        "p99Latency": 18.7,
        "peakMemory": 52428800,
        "errorRate": 0.5
      }
    }
  ],
  "summary": {
    "totalTests": 10,
    "passed": 8,
    "failed": 2,
    "recommendations": [
      "✅ All performance targets met!"
    ]
  }
}
```

### Markdown Report

Human-readable report saved to `./test/load/results/load-test-report-{timestamp}.md`:

```markdown
# Load Test Report

**Generated:** 2025-01-22T12:00:00.000Z
**Total Tests:** 10

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | 10 |
| Passed | 8 |
| Failed | 2 |

## Test Results

### Constant Load - 100 Concurrent Users

| Metric | Value |
|--------|-------|
| Duration | 5m 0s |
| Total Requests | 5000 |
| Success Rate | 99.50% |
| P50 Latency | 8.50ms |
| P95 Latency | 12.30ms |
```

## Programmatic Usage

You can also use the load testing framework programmatically:

```typescript
import { runLoadTest, runLoadTests } from './test/load/index.js';
import { LoadTestScenario } from './test/load/types.js';

// Run a single test
const result = await runLoadTest({
  testName: 'Custom Test',
  duration: 60000,
  minConcurrency: 50,
  maxConcurrency: 50,
  concurrencyStep: 0,
  endpoint: 'http://localhost:3000/v1/chat/completions',
  apiKey: 'pk_test_key',
  timeout: 30000,
  scenario: LoadTestScenario.CONSTANT_LOAD,
  outputDir: './test/load/results',
});

// Run multiple tests
const results = await runLoadTests([
  {
    testName: 'Test 1',
    // ... config
  },
  {
    testName: 'Test 2',
    // ... config
  },
]);
```

## Recommendations

The framework automatically generates recommendations based on test results:

- **High P50 latency**: Consider enabling connection pooling
- **High P95 latency**: Consider optimizing middleware pipeline
- **High P99 latency**: Check for GC pauses and optimize memory usage
- **High error rate**: Check rate limits and API key validation
- **High memory usage**: Consider enabling object pooling
- **Poor scaling**: Consider enabling request batching

## CI/CD Integration

Add load testing to your CI/CD pipeline:

```yaml
# .github/workflows/load-test.yml
name: Load Tests

on: [push, pull_request]

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - name: Start server
        run: bun start &
      - name: Wait for server
        run: sleep 5
      - name: Run load tests
        run: bun run test/load/index.ts --scenario validation
```

## Troubleshooting

### Tests Fail with Connection Errors

- Ensure the proxy server is running: `bun start`
- Check the endpoint URL is correct
- Verify the API key is valid

### High Latency Results

- Check if connection pooling is enabled (should be by default)
- Verify caching is enabled
- Check system resources (CPU, memory)

### Memory Leaks Detected

- Run sustained load tests for longer durations
- Check for unclosed connections or file handles
- Verify object pooling is enabled

## Best Practices

1. **Start with smoke tests** before running comprehensive tests
2. **Run tests in isolation** - avoid running other services during load tests
3. **Monitor system resources** - use `top` or `htop` to track CPU/memory
4. **Use realistic payloads** - test with actual production-like request sizes
5. **Test during off-peak hours** - avoid running load tests on production during high traffic
6. **Automate in CI/CD** - catch performance regressions early
7. **Track trends over time** - compare results across commits to identify regressions

## Contributing

When adding new test scenarios:

1. Add scenario type to `types.ts` (LoadTestScenario enum)
2. Create scenario generator in `scenarios.ts`
3. Implement test runner in `load-test.ts` (if needed)
4. Add tests in `load.test.ts`
5. Update this README

## License

MIT
