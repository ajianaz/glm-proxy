/**
 * JSON Transformation Performance Benchmark
 *
 * Compares optimized vs non-optimized JSON transformation methods
 * to demonstrate the performance gains from subtask 3.3
 */

import { injectModel, extractTokens } from '../../src/json/index.js';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  opsPerSecond: number;
}

function benchmark(name: string, fn: () => void, iterations: number = 10000): BenchmarkResult {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 100; i++) {
    fn();
  }

  // Actual benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  const totalTime = times.reduce((a, b) => a + b, 0);
  const avgTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const opsPerSecond = 1000 / avgTime;

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

function formatResult(result: BenchmarkResult): string {
  return [
    `${result.name}:`,
    `  Average: ${result.avgTime.toFixed(4)}ms`,
    `  Min: ${result.minTime.toFixed(4)}ms`,
    `  Max: ${result.maxTime.toFixed(4)}ms`,
    `  Ops/sec: ${result.opsPerSecond.toFixed(0)}`,
  ].join('\n');
}

function compareResults(old: BenchmarkResult, optimized: BenchmarkResult): void {
  const improvement = ((old.avgTime - optimized.avgTime) / old.avgTime) * 100;
  const speedup = old.avgTime / optimized.avgTime;

  console.log('\n=== Comparison ===');
  console.log(`Performance improvement: ${improvement.toFixed(2)}%`);
  console.log(`Speedup factor: ${speedup.toFixed(2)}x`);
}

// Test data
const smallJson = '{"messages": [{"role": "user", "content": "Hello"}], "model": "gpt-3.5"}';
const mediumJson = JSON.stringify({
  messages: Array.from({ length: 10 }, (_, i) => ({
    role: 'user',
    content: `Message ${i}`.repeat(20),
  })),
  model: 'gpt-3.5',
  temperature: 0.7,
  max_tokens: 2000,
});
const largeJson = JSON.stringify({
  messages: Array.from({ length: 100 }, (_, i) => ({
    role: 'user',
    content: `Message ${i}`.repeat(100),
  })),
  model: 'gpt-3.5',
  temperature: 0.7,
  max_tokens: 2000,
  top_p: 0.9,
  frequency_penalty: 0.5,
  presence_penalty: 0.5,
});

const responseJson = JSON.stringify({
  id: 'chatcmpl-123',
  object: 'chat.completion',
  created: 1234567890,
  model: 'gpt-3.5-turbo',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'Hello! How can I help you today?',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 9,
    total_tokens: 19,
  },
});

console.log('='.repeat(60));
console.log('JSON Transformation Performance Benchmark');
console.log('Subtask 3.3: Optimized JSON Transformation');
console.log('='.repeat(60));

// Benchmark 1: Model injection - Small JSON
console.log('\n### Benchmark 1: Model Injection - Small JSON ###');
const oldSmallModelInject = benchmark(
  'Parse+Stringify (old)',
  () => {
    const parsed = JSON.parse(smallJson);
    parsed.model = 'gpt-4';
    JSON.stringify(parsed);
  },
  10000
);

const optimizedSmallModelInject = benchmark(
  'Direct string replacement (optimized)',
  () => {
    injectModel(smallJson, 'gpt-4');
  },
  10000
);

console.log(formatResult(oldSmallModelInject));
console.log(formatResult(optimizedSmallModelInject));
compareResults(oldSmallModelInject, optimizedSmallModelInject);

// Benchmark 2: Model injection - Medium JSON
console.log('\n### Benchmark 2: Model Injection - Medium JSON ###');
const oldMediumModelInject = benchmark(
  'Parse+Stringify (old)',
  () => {
    const parsed = JSON.parse(mediumJson);
    parsed.model = 'gpt-4';
    JSON.stringify(parsed);
  },
  5000
);

const optimizedMediumModelInject = benchmark(
  'Direct string replacement (optimized)',
  () => {
    injectModel(mediumJson, 'gpt-4');
  },
  5000
);

console.log(formatResult(oldMediumModelInject));
console.log(formatResult(optimizedMediumModelInject));
compareResults(oldMediumModelInject, optimizedMediumModelInject);

// Benchmark 3: Model injection - Large JSON
console.log('\n### Benchmark 3: Model Injection - Large JSON ###');
const oldLargeModelInject = benchmark(
  'Parse+Stringify (old)',
  () => {
    const parsed = JSON.parse(largeJson);
    parsed.model = 'gpt-4';
    JSON.stringify(parsed);
  },
  1000
);

const optimizedLargeModelInject = benchmark(
  'Direct string replacement (optimized)',
  () => {
    injectModel(largeJson, 'gpt-4');
  },
  1000
);

console.log(formatResult(oldLargeModelInject));
console.log(formatResult(optimizedLargeModelInject));
compareResults(oldLargeModelInject, optimizedLargeModelInject);

// Benchmark 4: Token extraction
console.log('\n### Benchmark 4: Token Extraction ###');
const oldTokenExtract = benchmark(
  'Full parse (old)',
  () => {
    const parsed = JSON.parse(responseJson);
    const tokens = parsed.usage?.total_tokens || 0;
  },
  10000
);

const optimizedTokenExtract = benchmark(
  'Regex extraction (optimized)',
  () => {
    extractTokens(responseJson);
  },
  10000
);

console.log(formatResult(oldTokenExtract));
console.log(formatResult(optimizedTokenExtract));
compareResults(oldTokenExtract, optimizedTokenExtract);

// Summary
console.log('\n' + '='.repeat(60));
console.log('Summary');
console.log('='.repeat(60));
console.log('The optimized JSON transformation shows significant performance');
console.log('improvements by avoiding unnecessary parse+stringify cycles:');
console.log('');
console.log('✓ Model injection: Direct string replacement instead of full parse+stringify');
console.log('✓ Token extraction: Regex-based extraction instead of full parse');
console.log('✓ Lazy parsing: Only parse when absolutely necessary');
console.log('');
console.log('These optimizations directly contribute to reducing the proxy');
console.log('latency overhead toward the < 10ms target.');
console.log('='.repeat(60));

// Export results for programmatic use
export const results = {
  smallModelInjection: {
    old: oldSmallModelInject,
    optimized: optimizedSmallModelInject,
  },
  mediumModelInjection: {
    old: oldMediumModelInject,
    optimized: optimizedMediumModelInject,
  },
  largeModelInjection: {
    old: oldLargeModelInject,
    optimized: optimizedLargeModelInject,
  },
  tokenExtraction: {
    old: oldTokenExtract,
    optimized: optimizedTokenExtract,
  },
};
