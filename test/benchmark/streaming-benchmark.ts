/**
 * Stream Buffer Size Benchmark
 *
 * Benchmarks different buffer sizes to find optimal configuration
 * for streaming operations. Tests memory allocations and throughput.
 */

interface BenchmarkResult {
  bufferSize: number;
  avgLatency: number;
  throughput: number;
  totalAllocations: number;
  allocationRate: number;
}

interface BenchmarkConfig {
  dataSize: number;
  iterations: number;
  bufferSizes: number[];
}

/**
 * Measure memory allocations during a function execution
 */
async function measureAllocations<T>(
  fn: () => Promise<T>
): Promise<{ result: T; allocations: number }> {
  // Force GC before measurement for more accurate results
  if (global.gc) {
    global.gc();
  }

  const before = process.memoryUsage();
  const result = await fn();
  const after = process.memoryUsage();

  // Calculate approximate allocations (heapUsed difference)
  const allocations = Math.max(0, after.heapUsed - before.heapUsed);

  return { result, allocations };
}

/**
 * Benchmark streaming with a specific buffer size
 */
async function benchmarkBufferSize(
  bufferSize: number,
  dataSize: number
): Promise<BenchmarkResult> {
  const iterations = 10;
  const latencies: number[] = [];
  let totalAllocations = 0;

  // Create test data
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const chunkSize = bufferSize;

  // Create data in chunks
  for (let i = 0; i < dataSize; i += chunkSize) {
    const size = Math.min(chunkSize, dataSize - i);
    const chunk = new Uint8Array(size);
    chunks.push(chunk);
  }

  // Run benchmark iterations
  for (let i = 0; i < iterations; i++) {
    // Create a stream
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    // Measure performance
    const { result, allocations } = await measureAllocations(async () => {
      const startTime = performance.now();

      // Simulate streaming operation
      const reader = stream.getReader();
      let totalBytes = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Simulate processing
          totalBytes += value.length;
        }
      } finally {
        reader.releaseLock();
      }

      const endTime = performance.now();
      const latency = endTime - startTime;

      return { latency, totalBytes };
    });

    latencies.push(result.latency);
    totalAllocations += allocations;
  }

  // Calculate statistics
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const throughput = (dataSize / avgLatency / 1024 / 1024) * 1000; // MB/s
  const avgAllocations = totalAllocations / iterations;
  const allocationRate = (avgAllocations / dataSize) * 100; // bytes per KB

  return {
    bufferSize,
    avgLatency,
    throughput,
    totalAllocations: avgAllocations,
    allocationRate,
  };
}

/**
 * Run comprehensive buffer size benchmark
 */
export async function runBufferBenchmark(
  config: Partial<BenchmarkConfig> = {}
): Promise<{
  results: BenchmarkResult[];
  recommendations: {
    bestLatency: number;
    bestThroughput: number;
    bestMemory: number;
    overall: number;
  };
}> {
  const fullConfig: BenchmarkConfig = {
    dataSize: 1024 * 1024, // 1MB test data
    iterations: 10,
    bufferSizes: [
      1024,      // 1KB
      2048,      // 2KB
      4096,      // 4KB
      8192,      // 8KB
      16384,     // 16KB
      32768,     // 32KB
      65536,     // 64KB
      131072,    // 128KB
    ],
    ...config,
  };

  console.log('Running buffer size benchmark...');
  console.log(`Data size: ${fullConfig.dataSize / 1024 / 1024}MB`);
  console.log(`Iterations: ${fullConfig.iterations}`);
  console.log(`Buffer sizes: ${fullConfig.bufferSizes.join(', ')}\n`);

  const results: BenchmarkResult[] = [];

  for (const bufferSize of fullConfig.bufferSizes) {
    process.stdout.write(`Benchmarking ${bufferSize} bytes... `);
    const result = await benchmarkBufferSize(bufferSize, fullConfig.dataSize);
    results.push(result);
    console.log(`✓ Latency: ${result.avgLatency.toFixed(2)}ms, Throughput: ${result.throughput.toFixed(2)} MB/s, Allocations: ${(result.totalAllocations / 1024).toFixed(2)}KB`);
  }

  // Find optimal buffer sizes
  const bestLatency = results.reduce((best, r) =>
    r.avgLatency < best.avgLatency ? r : best
  );
  const bestThroughput = results.reduce((best, r) =>
    r.throughput > best.throughput ? r : best
  );
  const bestMemory = results.reduce((best, r) =>
    r.totalAllocations < best.totalAllocations ? r : best
  );

  // Calculate overall score (weighted average)
  const scored = results.map(r => ({
    ...r,
    score:
      (r.avgLatency / bestLatency.avgLatency) * 0.3 +
      (bestThroughput.throughput / r.throughput) * 0.4 +
      (r.totalAllocations / bestMemory.totalAllocations) * 0.3,
  }));

  const overall = scored.reduce((best, r) => (r.score < best.score ? r : best));

  return {
    results,
    recommendations: {
      bestLatency: bestLatency.bufferSize,
      bestThroughput: bestThroughput.bufferSize,
      bestMemory: bestMemory.bufferSize,
      overall: overall.bufferSize,
    },
  };
}

/**
 * Print benchmark results in a formatted table
 */
export function printBenchmarkResults(
  results: BenchmarkResult[],
  recommendations: {
    bestLatency: number;
    bestThroughput: number;
    bestMemory: number;
    overall: number;
  }
): void {
  console.log('\n=== Stream Buffer Size Benchmark Results ===\n');

  // Print table
  console.log(
    'Buffer Size | Latency (ms) | Throughput (MB/s) | Allocations (KB) | Alloc Rate (%)'
  );
  console.log('-'.repeat(85));

  for (const result of results) {
    const sizeKB = (result.bufferSize / 1024).toFixed(1).padStart(10);
    const latency = result.avgLatency.toFixed(2).padStart(12);
    const throughput = result.throughput.toFixed(2).padStart(17);
    const allocKB = (result.totalAllocations / 1024).toFixed(2).padStart(16);
    const allocRate = result.allocationRate.toFixed(2).padStart(14);

    const markers = [];
    if (result.bufferSize === recommendations.bestLatency) markers.push('★latency');
    if (result.bufferSize === recommendations.bestThroughput) markers.push('★throughput');
    if (result.bufferSize === recommendations.bestMemory) markers.push('★memory');
    if (result.bufferSize === recommendations.overall) markers.push('★overall');

    const marker = markers.length > 0 ? ` ${markers.join(', ')}` : '';

    console.log(`${sizeKB} | ${latency} | ${throughput} | ${allocKB} | ${allocRate}${marker}`);
  }

  console.log('\n★ = Best in category\n');

  // Print recommendations
  console.log('=== Recommendations ===');
  console.log(`Best Latency:        ${recommendations.bestLatency / 1024}KB (${recommendations.bestLatency} bytes)`);
  console.log(`Best Throughput:     ${recommendations.bestThroughput / 1024}KB (${recommendations.bestThroughput} bytes)`);
  console.log(`Best Memory Usage:   ${recommendations.bestMemory / 1024}KB (${recommendations.bestMemory} bytes)`);
  console.log(`Overall Best:        ${recommendations.overall / 1024}KB (${recommendations.overall} bytes)`);
  console.log();

  // Print configuration recommendation
  console.log('=== Environment Variable Configuration ===');
  console.log(`STREAM_REQUEST_CHUNK_SIZE=${recommendations.overall}`);
  console.log(`STREAM_RESPONSE_CHUNK_SIZE=${recommendations.overall}`);
  console.log();
}

/**
 * Main entry point for running the benchmark
 */
export async function main(): Promise<void> {
  const { results, recommendations } = await runBufferBenchmark();
  printBenchmarkResults(results, recommendations);

  // Export results as JSON
  const exportPath = 'test/benchmark/streaming-buffer-results.json';
  await Bun.write(
    exportPath,
    JSON.stringify({ results, recommendations }, null, 2)
  );
  console.log(`Results exported to: ${exportPath}`);
}

// Run benchmark if executed directly
if (import.meta.main) {
  main().catch(console.error);
}
