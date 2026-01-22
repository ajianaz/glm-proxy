# Resource Usage Validation Guide

## Overview

The resource validation framework validates memory and CPU usage under load to ensure resource efficiency and detect potential issues like memory leaks or poor CPU scaling.

## Features

### Memory Validation

- **Base Memory Check**: Validates that base memory usage is < 100MB
- **Memory Growth Detection**: Monitors memory growth rate (target: < 10MB/hour)
- **Memory Leak Detection**: Uses linear regression analysis with R-squared confidence scoring
- **Trend Analysis**: Identifies memory trends (increasing/decreasing/stable)

### CPU Validation

- **Linear Scaling Detection**: Analyzes CPU scaling correlation with load (target: >= 0.8)
- **Efficiency Measurement**: Compares expected vs actual CPU usage at different load levels
- **Graceful Degradation**: Checks that failure rate stays < 10% under high load
- **Recovery Detection**: Measures system recovery time after high load periods

## Usage

### Running Resource Validation

```bash
# Run full validation suite
bun run scripts/validate-resources.ts

# Or programmatically
import { validateResourceUsage } from './test/load/resource-validation.js';
const report = await validateResourceUsage();
```

### CLI Script

```bash
bun run scripts/validate-resources.ts
```

This will:
1. Run validation tests across multiple scenarios
2. Display real-time progress
3. Save JSON report to `./test/load/results/resource-validation-{timestamp}.json`
4. Save Markdown report to `./test/load/results/resource-validation-report-{timestamp}.md`

### Programmatic Usage

```typescript
import {
  validateResourceUsage,
  validateSingleResourceTest,
  RESOURCE_TARGETS
} from './test/load/resource-validation.js';

// Run full validation suite
const report = await validateResourceUsage();
console.log(`Overall: ${report.summary.overallPass ? 'PASS' : 'FAIL'}`);

// Validate single test
import { LoadTestConfig } from './test/load/types.js';
const config: LoadTestConfig = {
  testName: 'Custom Test',
  scenario: LoadTestScenario.CONSTANT_LOAD,
  duration: 60000,
  minConcurrency: 1,
  maxConcurrency: 100,
  concurrencyStep: 10,
  endpoint: 'http://localhost:3000/v1/chat/completions',
  apiKey: 'test-key',
  timeout: 30000,
  outputDir: './test/load/results',
};

const result = await validateSingleResourceTest(config);
console.log(`Memory: ${result.memory.baseMemory / 1024 / 1024}MB`);
console.log(`CPU Scaling: ${result.cpu.scaling.correlation}`);
```

## Resource Targets

| Metric | Target | Description |
|--------|--------|-------------|
| BASE_MEMORY_MB | 100MB | Maximum base memory usage |
| MEMORY_GROWTH_MB_PER_HOUR | 10MB | Maximum memory growth rate under sustained load |
| CPU_LINEARITY_THRESHOLD | 0.8 | Minimum correlation for linear CPU scaling |
| DEGRADATION_FAILURE_RATE_THRESHOLD | 10% | Maximum failure rate under high load |

## Validation Report

### JSON Report Structure

```typescript
interface ResourceValidationReport {
  timestamp: string;
  targets: {
    BASE_MEMORY_MB: number;
    MEMORY_GROWTH_MB_PER_HOUR: number;
    CPU_LINEARITY_THRESHOLD: number;
    DEGRADATION_FAILURE_RATE_THRESHOLD: number;
  };
  results: ResourceValidationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    overallPass: boolean;
    memory: {
      avgBaseMemory: number; // MB
      avgMemoryGrowth: number; // MB/hour
      leaksDetected: number;
    };
    cpu: {
      avgCpuUsage: number; // percentage
      avgScalingEfficiency: number; // percentage
      gracefulDegradation: number; // count
    };
  };
}
```

### Understanding Results

#### Memory Validation

- **baseMemory**: Peak memory usage during test (in bytes)
- **baseMemoryPass**: Whether base memory is < 100MB
- **memoryGrowthMBPerHour**: Memory growth rate over test duration
- **memoryGrowthPass**: Whether growth rate is < 10MB/hour
- **leakDetection.hasLeak**: Whether a memory leak was detected
- **leakDetection.confidence**: Confidence level (low/medium/high)
- **leakDetection.trend.rSquared**: Confidence score (0-1, higher is more confident)

#### CPU Validation

- **avgCpuUsage**: Average CPU usage during test (percentage)
- **peakCpuUsage**: Peak CPU usage during test (percentage)
- **scaling.isLinear**: Whether CPU scales linearly with load
- **scaling.correlation**: Correlation coefficient (0-1, higher is better)
- **scaling.slope**: CPU increase per concurrent request
- **scaling.details.efficiency**: Scaling efficiency percentage
- **degradation.degradesGracefully**: Whether system degrades gracefully under load
- **degradation.failureRateAtHighLoad**: Failure rate percentage at high load

## Algorithm Details

### Memory Leak Detection

Uses linear regression on memory snapshots over time:

1. Collects memory usage snapshots throughout test
2. Calculates linear regression: `memory = slope * time + intercept`
3. Computes R-squared value for confidence scoring
4. Determines leak if:
   - Trend is increasing (slope > 10KB/s)
   - High confidence (R² > 0.7)
   - Growth rate exceeds threshold (> 10MB/hour for high confidence)

**Confidence Levels:**
- **High**: R² > 0.9 AND growth > 20MB/hour
- **Medium**: R² > 0.8 AND growth > 10MB/hour
- **Low**: R² > 0.7 AND growth detected

### CPU Scaling Analysis

Uses correlation analysis between concurrency and CPU usage:

1. Collects (concurrency, CPU) pairs from snapshots
2. Calculates Pearson correlation coefficient
3. Performs linear regression to determine scaling slope
4. Measures efficiency as: `1 - |actual - expected| / expected`

**Linear Scaling Criteria:**
- Correlation >= 0.8 (configurable)
- CPU increases monotonically with concurrency

### Graceful Degradation

Compares low load and high load phases:

1. Identifies low and high load phases from test results
2. Compares error rates between phases
3. Checks for recovery in subsequent phases
4. Measures latency increase percentage

**Graceful Degradation Criteria:**
- Error rate at high load < 10%
- No exponential error rate increase
- Recovery detected if error rate drops by 20%+ after high load

## Testing

Run the resource validation test suite:

```bash
bun test test/resource-validation.test.ts
```

The test suite includes:
- Memory validation tests (base memory, growth, leak detection)
- CPU validation tests (scaling, efficiency)
- Graceful degradation tests
- Integration tests

## Best Practices

1. **Run validation regularly**: Integrate into CI/CD pipeline
2. **Compare with baseline**: Track changes over time
3. **Investigate leaks early**: High confidence leaks need immediate attention
4. **Monitor CPU efficiency**: Degradation may indicate bottlenecks
5. **Use sustained load tests**: Best for leak detection (15+ minutes)

## Troubleshooting

### High Memory Growth Detected

- Check for unbounded caches or buffers
- Verify connection pool limits
- Look for event listener leaks
- Review snapshot cleanup logic

### Poor CPU Scaling

- Profile hot code paths
- Check for lock contention
- Verify connection pool efficiency
- Review middleware overhead

### Poor Graceful Degradation

- Check rate limiting effectiveness
- Verify queue size limits
- Test timeout handling
- Review backpressure implementation

## Integration with Load Testing

Resource validation integrates seamlessly with the load testing framework:

```typescript
import { runLoadTests, validateResourceUsage } from './test/load/index.js';

// Run load tests
const results = await runLoadTests(configs);

// Validate resource usage from results
const report = await validateResourceUsage(configs);
```

## See Also

- [Load Testing Guide](./README.md) - Load testing framework overview
- [Latency Validation](./latency-validation.ts) - Latency target validation
- [Memory Profiling](../../test/memory/) - Memory profiling tools
