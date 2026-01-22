/**
 * JSON Parser Benchmark
 *
 * Compares performance of optimized JSON parser vs native JSON.parse
 */

import { parseJsonWithMetrics, stringifyJsonWithMetrics } from '../../src/json/index.js';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  opsPerSecond: number;
}

/**
 * Benchmark function
 */
function benchmark(
  name: string,
  fn: () => void,
  iterations: number = 10000
): BenchmarkResult {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 100; i++) {
    fn();
  }

  // Benchmark
  const startTime = performance.now();
  for (let i = 0; i < iterations; i++) {
    const iterStart = performance.now();
    fn();
    const iterEnd = performance.now();
    times.push(iterEnd - iterStart);
  }
  const endTime = performance.now();

  const totalTime = endTime - startTime;
  const avgTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const opsPerSecond = (iterations / totalTime) * 1000;

  return {
    name,
    iterations,
    totalTime,
    avgTime,
    minTime,
    maxTime,
    opsPerSecond,
  };
}

/**
 * Benchmark JSON parsing
 */
function benchmarkParsing() {
  console.log('\n=== JSON Parsing Benchmark ===\n');

  // Small JSON
  const smallJson = '{"test":123,"value":"hello"}';
  console.log('Small JSON (34 bytes):');

  const nativeSmall = benchmark('Native JSON.parse (small)', () => {
    JSON.parse(smallJson);
  });

  const optimizedSmall = benchmark('Optimized parser (small)', () => {
    parseJsonWithMetrics(smallJson);
  });

  printResult(nativeSmall);
  printResult(optimizedSmall);
  printImprovement(nativeSmall, optimizedSmall);

  // Medium JSON
  const mediumJson = JSON.stringify({
    id: 1,
    name: 'Test Item',
    description: 'This is a medium-sized JSON object with several fields',
    tags: ['tag1', 'tag2', 'tag3'],
    metadata: {
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      version: '1.0.0',
    },
  });
  console.log('\nMedium JSON (~200 bytes):');

  const nativeMedium = benchmark('Native JSON.parse (medium)', () => {
    JSON.parse(mediumJson);
  });

  const optimizedMedium = benchmark('Optimized parser (medium)', () => {
    parseJsonWithMetrics(mediumJson);
  });

  printResult(nativeMedium);
  printResult(optimizedMedium);
  printImprovement(nativeMedium, optimizedMedium);

  // Large JSON
  const largeJson = JSON.stringify({
    users: Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      roles: ['user', 'admin'],
      metadata: {
        created: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        settings: {
          theme: 'dark',
          notifications: true,
        },
      },
    })),
  });
  console.log('\nLarge JSON (~150KB):');

  const nativeLarge = benchmark('Native JSON.parse (large)', () => {
    JSON.parse(largeJson);
  }, 100); // Fewer iterations for large JSON

  const optimizedLarge = benchmark('Optimized parser (large)', () => {
    parseJsonWithMetrics(largeJson);
  }, 100);

  printResult(nativeLarge);
  printResult(optimizedLarge);
  printImprovement(nativeLarge, optimizedLarge);
}

/**
 * Benchmark JSON serialization
 */
function benchmarkSerialization() {
  console.log('\n\n=== JSON Serialization Benchmark ===\n');

  // Small object
  const smallObj = { test: 123, value: 'hello' };
  console.log('Small object (2 fields):');

  const nativeSmall = benchmark('Native JSON.stringify (small)', () => {
    JSON.stringify(smallObj);
  });

  const optimizedSmall = benchmark('Optimized serializer (small)', () => {
    stringifyJsonWithMetrics(smallObj);
  });

  printResult(nativeSmall);
  printResult(optimizedSmall);
  printImprovement(nativeSmall, optimizedSmall);

  // Medium object
  const mediumObj = {
    id: 1,
    name: 'Test Item',
    description: 'This is a medium-sized JSON object with several fields',
    tags: ['tag1', 'tag2', 'tag3'],
    metadata: {
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      version: '1.0.0',
    },
  };
  console.log('\nMedium object (~10 fields):');

  const nativeMedium = benchmark('Native JSON.stringify (medium)', () => {
    JSON.stringify(mediumObj);
  });

  const optimizedMedium = benchmark('Optimized serializer (medium)', () => {
    stringifyJsonWithMetrics(mediumObj);
  });

  printResult(nativeMedium);
  printResult(optimizedMedium);
  printImprovement(nativeMedium, optimizedMedium);

  // Large object
  const largeObj = {
    users: Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      roles: ['user', 'admin'],
      metadata: {
        created: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        settings: {
          theme: 'dark',
          notifications: true,
        },
      },
    })),
  };
  console.log('\nLarge object (~1000 items):');

  const nativeLarge = benchmark('Native JSON.stringify (large)', () => {
    JSON.stringify(largeObj);
  }, 100);

  const optimizedLarge = benchmark('Optimized serializer (large)', () => {
    stringifyJsonWithMetrics(largeObj);
  }, 100);

  printResult(nativeLarge);
  printResult(optimizedLarge);
  printImprovement(nativeLarge, optimizedLarge);
}

/**
 * Print benchmark result
 */
function printResult(result: BenchmarkResult): void {
  console.log(`  ${result.name}:`);
  console.log(`    Avg: ${result.avgTime.toFixed(4)}ms`);
  console.log(`    Min: ${result.minTime.toFixed(4)}ms`);
  console.log(`    Max: ${result.maxTime.toFixed(4)}ms`);
  console.log(`    Ops/sec: ${result.opsPerSecond.toFixed(0)}`);
}

/**
 * Print improvement percentage
 */
function printImprovement(baseline: BenchmarkResult, optimized: BenchmarkResult): void {
  const avgImprovement = ((baseline.avgTime - optimized.avgTime) / baseline.avgTime) * 100;
  const opsImprovement = ((optimized.opsPerSecond - baseline.opsPerSecond) / baseline.opsPerSecond) * 100;

  console.log(`  Improvement:`);
  console.log(`    Avg time: ${avgImprovement >= 0 ? '+' : ''}${avgImprovement.toFixed(2)}%`);
  console.log(`    Ops/sec: ${opsImprovement >= 0 ? '+' : ''}${opsImprovement.toFixed(2)}%`);
}

/**
 * Run all JSON benchmarks
 */
export function runJsonBenchmarks(): void {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     JSON Parser/Serializer Performance Benchmark     ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  benchmarkParsing();
  benchmarkSerialization();

  console.log('\n=== Summary ===\n');
  console.log('The optimized parser/serializer provides:');
  console.log('✓ Type-safe wrappers');
  console.log('✓ Metrics tracking');
  console.log('✓ Streaming support for large payloads');
  console.log('✓ Graceful error handling');
  console.log('✓ Circular reference detection');
  console.log('\nNote: Native JSON.parse/stringify in V8/Bun is already highly optimized.');
  console.log('The main benefits are the additional features and safety features.');
  console.log('');
}

// Run benchmarks if executed directly
if (import.meta.main) {
  runJsonBenchmarks();
}
