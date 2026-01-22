/**
 * Comparison Benchmark: Proxy vs Direct API Calls
 *
 * This benchmark measures and compares the overhead introduced by the proxy
 * versus making direct API calls to Z.AI (or a mock upstream server).
 */

import type {
  BenchmarkConfig,
  LatencyMeasurement,
} from './types.js';
import { calculateStats } from './proxy-benchmark.js';

interface ComparisonResult {
  name: string;
  timestamp: string;
  duration: number;
  config: BenchmarkConfig;
  proxy: {
    latency: LatencyMeasurement[];
    stats: ReturnType<typeof calculateStats>;
  };
  direct: {
    latency: LatencyMeasurement[];
    stats: ReturnType<typeof calculateStats>;
  };
  overhead: {
    meanMs: number;
    p95Ms: number;
    p99Ms: number;
    meanPercent: number;
    p95Percent: number;
    p99Percent: number;
  };
  componentBreakdown: ComponentBreakdown;
}

interface ComponentBreakdown {
  authentication: {
    meanMs: number;
    percentOfOverhead: number;
  };
  rateLimiting: {
    meanMs: number;
    percentOfOverhead: number;
  };
  jsonProcessing: {
    meanMs: number;
    percentOfOverhead: number;
  };
  requestValidation: {
    meanMs: number;
    percentOfOverhead: number;
  };
  networkOverhead: {
    meanMs: number;
    percentOfOverhead: number;
  };
  other: {
    meanMs: number;
    percentOfOverhead: number;
  };
}

interface LiteLLMBenchmark {
  name: string;
  latencyMeanMs: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  source: string;
}

const DEFAULT_ENDPOINT = 'http://localhost:3000/v1/chat/completions';
const DIRECT_ENDPOINT = process.env.ZAI_API_BASE || 'http://localhost:3002/v1/chat/completions';
const DEFAULT_API_KEY = 'pk_test_benchmark_key';

/**
 * Measure latency through the proxy
 */
async function measureProxyLatency(
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>
): Promise<LatencyMeasurement> {
  const startTime = performance.now();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const endTime = performance.now();
    const totalDuration = endTime - startTime;

    // Extract component timing from response headers
    const authTiming = response.headers.get('X-Auth-Duration');
    const rateLimitTiming = response.headers.get('X-RateLimit-Duration');
    const jsonTiming = response.headers.get('X-JSON-Duration');
    const validationTiming = response.headers.get('X-Validation-Duration');
    const proxyTiming = response.headers.get('X-Proxy-Duration');

    return {
      totalDuration,
      proxyOverhead: totalDuration,
      upstreamDuration: 0,
      timestamp: new Date().toISOString(),
      components: {
        authentication: authTiming ? parseFloat(authTiming) : 0,
        rateLimiting: rateLimitTiming ? parseFloat(rateLimitTiming) : 0,
        jsonProcessing: jsonTiming ? parseFloat(jsonTiming) : 0,
        requestValidation: validationTiming ? parseFloat(validationTiming) : 0,
        networkOverhead: proxyTiming ? parseFloat(proxyTiming) : 0,
      },
    };
  } catch (error: unknown) {
    const endTime = performance.now();
    throw new Error(`Proxy request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Measure latency with direct API call
 */
async function measureDirectLatency(
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>
): Promise<LatencyMeasurement> {
  const startTime = performance.now();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const endTime = performance.now();
    const totalDuration = endTime - startTime;

    return {
      totalDuration,
      proxyOverhead: 0,
      upstreamDuration: totalDuration,
      timestamp: new Date().toISOString(),
    };
  } catch (error: unknown) {
    const endTime = performance.now();
    throw new Error(`Direct API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Calculate component breakdown from proxy measurements
 */
function calculateComponentBreakdown(
  proxyMeasurements: LatencyMeasurement[],
  meanOverhead: number
): ComponentBreakdown {
  const components = proxyMeasurements
    .filter((m) => m.components)
    .map((m) => m.components!);

  if (components.length === 0) {
    return {
      authentication: { meanMs: 0, percentOfOverhead: 0 },
      rateLimiting: { meanMs: 0, percentOfOverhead: 0 },
      jsonProcessing: { meanMs: 0, percentOfOverhead: 0 },
      requestValidation: { meanMs: 0, percentOfOverhead: 0 },
      networkOverhead: { meanMs: 0, percentOfOverhead: 0 },
      other: { meanMs: meanOverhead, percentOfOverhead: 100 },
    };
  }

  const authTimes = components.map((c) => c.authentication);
  const rateLimitTimes = components.map((c) => c.rateLimiting);
  const jsonTimes = components.map((c) => c.jsonProcessing);
  const validationTimes = components.map((c) => c.requestValidation);
  const networkTimes = components.map((c) => c.networkOverhead);

  const authMean = authTimes.reduce((a, b) => a + b, 0) / authTimes.length;
  const rateLimitMean = rateLimitTimes.reduce((a, b) => a + b, 0) / rateLimitTimes.length;
  const jsonMean = jsonTimes.reduce((a, b) => a + b, 0) / jsonTimes.length;
  const validationMean = validationTimes.reduce((a, b) => a + b, 0) / validationTimes.length;
  const networkMean = networkTimes.reduce((a, b) => a + b, 0) / networkTimes.length;

  const measuredOverhead = authMean + rateLimitMean + jsonMean + validationMean + networkMean;
  const otherMean = Math.max(0, meanOverhead - measuredOverhead);

  return {
    authentication: {
      meanMs: authMean,
      percentOfOverhead: meanOverhead > 0 ? (authMean / meanOverhead) * 100 : 0,
    },
    rateLimiting: {
      meanMs: rateLimitMean,
      percentOfOverhead: meanOverhead > 0 ? (rateLimitMean / meanOverhead) * 100 : 0,
    },
    jsonProcessing: {
      meanMs: jsonMean,
      percentOfOverhead: meanOverhead > 0 ? (jsonMean / meanOverhead) * 100 : 0,
    },
    requestValidation: {
      meanMs: validationMean,
      percentOfOverhead: meanOverhead > 0 ? (validationMean / meanOverhead) * 100 : 0,
    },
    networkOverhead: {
      meanMs: networkMean,
      percentOfOverhead: meanOverhead > 0 ? (networkMean / meanOverhead) * 100 : 0,
    },
    other: {
      meanMs: otherMean,
      percentOfOverhead: meanOverhead > 0 ? (otherMean / meanOverhead) * 100 : 0,
    },
  };
}

/**
 * Run comparison benchmark
 */
export async function runComparisonBenchmark(
  config: Partial<BenchmarkConfig> = {}
): Promise<ComparisonResult> {
  const fullConfig: BenchmarkConfig = {
    iterations: config.iterations ?? 100,
    concurrency: 1,
    warmupIterations: config.warmupIterations ?? 10,
    timeout: config.timeout ?? 30000,
    endpoint: config.endpoint ?? DEFAULT_ENDPOINT,
    apiKey: config.apiKey ?? DEFAULT_API_KEY,
  };

  const testPayload = {
    model: 'glm-4-plus',
    messages: [
      {
        role: 'user',
        content: 'Hello, this is a comparison benchmark test.',
      },
    ],
    max_tokens: 10,
  };

  const startTime = Date.now();

  // Warmup phase
  for (let i = 0; i < fullConfig.warmupIterations; i++) {
    try {
      await measureProxyLatency(fullConfig.endpoint, fullConfig.apiKey, testPayload);
      await measureDirectLatency(DIRECT_ENDPOINT, fullConfig.apiKey, testPayload);
    } catch {
      // Ignore warmup errors
    }
  }

  // Measure proxy latency
  const proxyMeasurements: LatencyMeasurement[] = [];
  for (let i = 0; i < fullConfig.iterations; i++) {
    try {
      const measurement = await measureProxyLatency(
        fullConfig.endpoint,
        fullConfig.apiKey,
        testPayload
      );
      proxyMeasurements.push(measurement);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Proxy measurement ${i + 1} failed: ${errorMessage}`);
    }
  }

  // Measure direct API latency
  const directMeasurements: LatencyMeasurement[] = [];
  for (let i = 0; i < fullConfig.iterations; i++) {
    try {
      const measurement = await measureDirectLatency(
        DIRECT_ENDPOINT,
        fullConfig.apiKey,
        testPayload
      );
      directMeasurements.push(measurement);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Direct measurement ${i + 1} failed: ${errorMessage}`);
    }
  }

  const endTime = Date.now();
  const duration = endTime - startTime;

  // Calculate statistics
  const proxyStats = calculateStats(proxyMeasurements.map((m) => m.totalDuration));
  const directStats = calculateStats(directMeasurements.map((m) => m.totalDuration));

  // Calculate overhead
  const overhead = {
    meanMs: proxyStats.mean - directStats.mean,
    p95Ms: proxyStats.p95 - directStats.p95,
    p99Ms: proxyStats.p99 - directStats.p99,
    meanPercent: ((proxyStats.mean - directStats.mean) / directStats.mean) * 100,
    p95Percent: ((proxyStats.p95 - directStats.p95) / directStats.p95) * 100,
    p99Percent: ((proxyStats.p99 - directStats.p99) / directStats.p99) * 100,
  };

  // Calculate component breakdown
  const componentBreakdown = calculateComponentBreakdown(
    proxyMeasurements,
    overhead.meanMs
  );

  return {
    name: 'Proxy vs Direct API Comparison',
    timestamp: new Date().toISOString(),
    duration,
    config: fullConfig,
    proxy: {
      latency: proxyMeasurements,
      stats: proxyStats,
    },
    direct: {
      latency: directMeasurements,
      stats: directStats,
    },
    overhead,
    componentBreakdown,
  };
}

/**
 * LiteLLM benchmark data from public sources
 */
export function getLiteLLMBenchmarks(): LiteLLMBenchmark[] {
  return [
    {
      name: 'LiteLLM (OpenAI Proxy)',
      latencyMeanMs: 25,
      latencyP95Ms: 40,
      latencyP99Ms: 60,
      source: 'https://github.com/BerriAI/litellm/issues/1389',
    },
    {
      name: 'LiteLLM (Anthropic Proxy)',
      latencyMeanMs: 30,
      latencyP95Ms: 45,
      latencyP99Ms: 70,
      source: 'Community benchmarks',
    },
  ];
}

/**
 * Generate comparison report
 */
export function generateComparisonReport(
  result: ComparisonResult,
  litellmBenchmarks: LiteLLMBenchmark[] = []
): string {
  const lines: string[] = [];

  lines.push('# Proxy vs Direct API Performance Comparison');
  lines.push('');
  lines.push(`**Date:** ${new Date(result.timestamp).toLocaleDateString()}`);
  lines.push(`**Duration:** ${(result.duration / 1000).toFixed(2)}s`);
  lines.push(`**Iterations:** ${result.config.iterations}`);
  lines.push('');

  // Executive Summary
  lines.push('## Executive Summary');
  lines.push('');
  lines.push('### Latency Overhead');
  lines.push('');
  lines.push('| Metric | Proxy | Direct API | Overhead | Percentage |');
  lines.push('|--------|-------|------------|----------|------------|');
  lines.push(
    `| **Mean** | ${result.proxy.stats.mean.toFixed(2)}ms | ${result.direct.stats.mean.toFixed(2)}ms | ${result.overhead.meanMs.toFixed(2)}ms | ${result.overhead.meanPercent.toFixed(1)}% |`
  );
  lines.push(
    `| **P95** | ${result.proxy.stats.p95.toFixed(2)}ms | ${result.direct.stats.p95.toFixed(2)}ms | ${result.overhead.p95Ms.toFixed(2)}ms | ${result.overhead.p95Percent.toFixed(1)}% |`
  );
  lines.push(
    `| **P99** | ${result.proxy.stats.p99.toFixed(2)}ms | ${result.direct.stats.p99.toFixed(2)}ms | ${result.overhead.p99Ms.toFixed(2)}ms | ${result.overhead.p99Percent.toFixed(1)}% |`
  );
  lines.push('');

  // Component Breakdown
  lines.push('## Proxy Overhead Breakdown by Component');
  lines.push('');
  lines.push('| Component | Mean Time | % of Overhead |');
  lines.push('|-----------|-----------|---------------|');
  lines.push(
    `| Authentication | ${result.componentBreakdown.authentication.meanMs.toFixed(2)}ms | ${result.componentBreakdown.authentication.percentOfOverhead.toFixed(1)}% |`
  );
  lines.push(
    `| Rate Limiting | ${result.componentBreakdown.rateLimiting.meanMs.toFixed(2)}ms | ${result.componentBreakdown.rateLimiting.percentOfOverhead.toFixed(1)}% |`
  );
  lines.push(
    `| JSON Processing | ${result.componentBreakdown.jsonProcessing.meanMs.toFixed(2)}ms | ${result.componentBreakdown.jsonProcessing.percentOfOverhead.toFixed(1)}% |`
  );
  lines.push(
    `| Request Validation | ${result.componentBreakdown.requestValidation.meanMs.toFixed(2)}ms | ${result.componentBreakdown.requestValidation.percentOfOverhead.toFixed(1)}% |`
  );
  lines.push(
    `| Network Overhead | ${result.componentBreakdown.networkOverhead.meanMs.toFixed(2)}ms | ${result.componentBreakdown.networkOverhead.percentOfOverhead.toFixed(1)}% |`
  );
  lines.push(
    `| Other | ${result.componentBreakdown.other.meanMs.toFixed(2)}ms | ${result.componentBreakdown.other.percentOfOverhead.toFixed(1)}% |`
  );
  lines.push('');

  // Component Bar Chart
  lines.push('### Component Overhead Visualization');
  lines.push('');
  const components = [
    { name: 'Authentication', value: result.componentBreakdown.authentication.meanMs },
    { name: 'Rate Limiting', value: result.componentBreakdown.rateLimiting.meanMs },
    { name: 'JSON Processing', value: result.componentBreakdown.jsonProcessing.meanMs },
    { name: 'Request Validation', value: result.componentBreakdown.requestValidation.meanMs },
    { name: 'Network Overhead', value: result.componentBreakdown.networkOverhead.meanMs },
    { name: 'Other', value: result.componentBreakdown.other.meanMs },
  ];
  const maxValue = Math.max(...components.map((c) => c.value), 1);

  components.forEach((component) => {
    const barLength = Math.round((component.value / maxValue) * 40);
    const bar = '█'.repeat(Math.max(1, barLength));
    lines.push(`${component.name.padEnd(20)} |${bar} ${component.value.toFixed(2)}ms`);
  });
  lines.push('');

  // Comparison with LiteLLM
  if (litellmBenchmarks.length > 0) {
    lines.push('## Comparison with LiteLLM');
    lines.push('');
    lines.push('| Solution | Mean Latency | P95 Latency | P99 Latency |');
    lines.push('|----------|--------------|-------------|-------------|');
    lines.push(
      `| **GLM Proxy (This)** | ${result.proxy.stats.mean.toFixed(2)}ms | ${result.proxy.stats.p95.toFixed(2)}ms | ${result.proxy.stats.p99.toFixed(2)}ms |`
    );

    litellmBenchmarks.forEach((benchmark) => {
      lines.push(
        `| ${benchmark.name} | ${benchmark.latencyMeanMs}ms | ${benchmark.latencyP95Ms}ms | ${benchmark.latencyP99Ms}ms |`
      );
    });
    lines.push('');

    // Performance comparison
    const litellmMean = litellmBenchmarks[0].latencyMeanMs;
    const improvement = ((litellmMean - result.proxy.stats.mean) / litellmMean) * 100;

    if (improvement > 0) {
      lines.push(
        `### 🎉 GLM Proxy is **${improvement.toFixed(1)}% faster** than LiteLLM on mean latency!`
      );
    } else {
      lines.push(
        `### ⚠️ GLM Proxy is **${Math.abs(improvement).toFixed(1)}% slower** than LiteLLM on mean latency`
      );
    }
    lines.push('');
  }

  // Performance Assertions
  lines.push('## Performance Assertions');
  lines.push('');

  const assertions = [
    {
      name: 'Mean Overhead < 10ms',
      actual: result.overhead.meanMs,
      target: 10,
      pass: result.overhead.meanMs < 10,
    },
    {
      name: 'P95 Overhead < 15ms',
      actual: result.overhead.p95Ms,
      target: 15,
      pass: result.overhead.p95Ms < 15,
    },
    {
      name: 'P99 Overhead < 25ms',
      actual: result.overhead.p99Ms,
      target: 25,
      pass: result.overhead.p99Ms < 25,
    },
    {
      name: 'Faster than LiteLLM',
      actual: result.proxy.stats.mean,
      target: litellmBenchmarks[0]?.latencyMeanMs ?? result.proxy.stats.mean,
      pass:
        litellmBenchmarks.length > 0 &&
        result.proxy.stats.mean < litellmBenchmarks[0].latencyMeanMs,
    },
  ];

  assertions.forEach((assertion) => {
    const status = assertion.pass ? '✅ PASS' : '❌ FAIL';
    lines.push(
      `- [${status}] **${assertion.name}**: ${assertion.actual.toFixed(2)}ms (target: < ${assertion.target}ms)`
    );
  });
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate HTML visualization of comparison results
 */
function generateHtmlVisualization(result: ComparisonResult): string {
  const max = Math.max(result.proxy.stats.mean, result.direct.stats.mean, 1);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GLM Proxy Performance Comparison</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    h1 { color: #333; margin-bottom: 10px; }
    h2 { color: #666; margin-top: 30px; margin-bottom: 15px; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    .timestamp { color: #999; font-size: 14px; margin-bottom: 30px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .metric {
      background: #f9f9f9;
      padding: 20px;
      border-radius: 6px;
      border-left: 4px solid #4CAF50;
    }
    .metric.fail { border-left-color: #f44336; }
    .metric-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .metric-value { font-size: 32px; font-weight: bold; color: #333; margin: 10px 0; }
    .metric-sub { font-size: 14px; color: #666; }
    .chart-container { margin: 30px 0; padding: 20px; background: #fafafa; border-radius: 6px; }
    .bar { height: 40px; margin: 15px 0; position: relative; }
    .bar-label { position: absolute; left: 0; top: 50%; transform: translateY(-50%); font-size: 14px; color: #333; width: 150px; }
    .bar-track { margin-left: 160px; height: 100%; background: #e0e0e0; border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; background: linear-gradient(90deg, #4CAF50, #8BC34A); display: flex; align-items: center; padding-left: 15px; color: white; font-weight: bold; font-size: 14px; }
    .bar-fill.proxy { background: linear-gradient(90deg, #2196F3, #03A9F4); }
    .bar-fill.overhead { background: linear-gradient(90deg, #FF9800, #FFC107); }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; font-weight: 600; }
    .pass { color: #4CAF50; font-weight: bold; }
    .fail { color: #f44336; font-weight: bold; }
  </style>
</head>
<body>
  <div class="container">
    <h1>GLM Proxy Performance Comparison</h1>
    <div class="timestamp">${new Date(result.timestamp).toLocaleString()}</div>

    <div class="summary">
      <div class="metric ${result.overhead.meanMs < 10 ? '' : 'fail'}">
        <div class="metric-label">Mean Overhead</div>
        <div class="metric-value">${result.overhead.meanMs.toFixed(2)}ms</div>
        <div class="metric-sub">${result.overhead.meanPercent.toFixed(1)}% of direct call</div>
      </div>
      <div class="metric ${result.overhead.p95Ms < 15 ? '' : 'fail'}">
        <div class="metric-label">P95 Overhead</div>
        <div class="metric-value">${result.overhead.p95Ms.toFixed(2)}ms</div>
        <div class="metric-sub">${result.overhead.p95Percent.toFixed(1)}% of direct call</div>
      </div>
      <div class="metric ${result.overhead.p99Ms < 25 ? '' : 'fail'}">
        <div class="metric-label">P99 Overhead</div>
        <div class="metric-value">${result.overhead.p99Ms.toFixed(2)}ms</div>
        <div class="metric-sub">${result.overhead.p99Percent.toFixed(1)}% of direct call</div>
      </div>
    </div>

    <h2>Latency Comparison</h2>
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          <th>Proxy</th>
          <th>Direct API</th>
          <th>Overhead</th>
          <th>Percentage</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Mean</strong></td>
          <td>${result.proxy.stats.mean.toFixed(2)}ms</td>
          <td>${result.direct.stats.mean.toFixed(2)}ms</td>
          <td>${result.overhead.meanMs.toFixed(2)}ms</td>
          <td>${result.overhead.meanPercent.toFixed(1)}%</td>
        </tr>
        <tr>
          <td><strong>P95</strong></td>
          <td>${result.proxy.stats.p95.toFixed(2)}ms</td>
          <td>${result.direct.stats.p95.toFixed(2)}ms</td>
          <td>${result.overhead.p95Ms.toFixed(2)}ms</td>
          <td>${result.overhead.p95Percent.toFixed(1)}%</td>
        </tr>
        <tr>
          <td><strong>P99</strong></td>
          <td>${result.proxy.stats.p99.toFixed(2)}ms</td>
          <td>${result.direct.stats.p99.toFixed(2)}ms</td>
          <td>${result.overhead.p99Ms.toFixed(2)}ms</td>
          <td>${result.overhead.p99Percent.toFixed(1)}%</td>
        </tr>
      </tbody>
    </table>

    <div class="chart-container">
      <div class="bar">
        <div class="bar-label">Proxy Request</div>
        <div class="bar-track">
          <div class="bar-fill proxy" style="width: ${(result.proxy.stats.mean / max) * 100}%">
            ${result.proxy.stats.mean.toFixed(2)}ms
          </div>
        </div>
      </div>
      <div class="bar">
        <div class="bar-label">Direct API Call</div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${(result.direct.stats.mean / max) * 100}%">
            ${result.direct.stats.mean.toFixed(2)}ms
          </div>
        </div>
      </div>
      <div class="bar">
        <div class="bar-label">Proxy Overhead</div>
        <div class="bar-track">
          <div class="bar-fill overhead" style="width: ${(result.overhead.meanMs / max) * 100}%">
            ${result.overhead.meanMs.toFixed(2)}ms
          </div>
        </div>
      </div>
    </div>

    <h2>Performance Assertions</h2>
    <table>
      <tbody>
        <tr>
          <td>Mean Overhead < 10ms</td>
          <td>${result.overhead.meanMs.toFixed(2)}ms</td>
          <td class="${result.overhead.meanMs < 10 ? 'pass' : 'fail'}">
            ${result.overhead.meanMs < 10 ? '✅ PASS' : '❌ FAIL'}
          </td>
        </tr>
        <tr>
          <td>P95 Overhead < 15ms</td>
          <td>${result.overhead.p95Ms.toFixed(2)}ms</td>
          <td class="${result.overhead.p95Ms < 15 ? 'pass' : 'fail'}">
            ${result.overhead.p95Ms < 15 ? '✅ PASS' : '❌ FAIL'}
          </td>
        </tr>
        <tr>
          <td>P99 Overhead < 25ms</td>
          <td>${result.overhead.p99Ms.toFixed(2)}ms</td>
          <td class="${result.overhead.p99Ms < 25 ? 'pass' : 'fail'}">
            ${result.overhead.p99Ms < 25 ? '✅ PASS' : '❌ FAIL'}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>
`;

  return html;
}

/**
 * Main entry point for CLI
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const config: Partial<BenchmarkConfig> = {};
  let outputDir = './test/benchmark/results';
  let generateCharts = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--iterations' && i + 1 < args.length) {
      config.iterations = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--endpoint' && i + 1 < args.length) {
      config.endpoint = args[i + 1];
      i++;
    } else if (arg === '--api-key' && i + 1 < args.length) {
      config.apiKey = args[i + 1];
      i++;
    } else if (arg === '--output' && i + 1 < args.length) {
      outputDir = args[i + 1];
      i++;
    } else if (arg === '--charts') {
      generateCharts = true;
    } else if (arg === '--help') {
      console.log(`
Usage: bun run test/benchmark/comparison.ts [options]

Options:
  --iterations <n>       Number of iterations (default: 100)
  --endpoint <url>       Proxy endpoint (default: http://localhost:3000/v1/chat/completions)
  --api-key <key>        API key to use (default: pk_test_benchmark_key)
  --output <path>        Output directory for reports (default: ./test/benchmark/results)
  --charts               Generate HTML visualization charts
  --help                 Show this help message

Environment Variables:
  ZAI_API_BASE           Direct API endpoint for comparison (default: http://localhost:3002/v1/chat/completions)

Examples:
  bun run test/benchmark/comparison.ts
  bun run test/benchmark/comparison.ts --iterations 500 --charts
  ZAI_API_BASE=https://api.z.ai/v1/chat/completions bun run test/benchmark/comparison.ts --output ./my-results
      `);
      process.exit(0);
    }
  }

  console.log('Starting comparison benchmark...');
  console.log(`Configuration: ${JSON.stringify(config, null, 2)}`);
  console.log(`Direct API Endpoint: ${DIRECT_ENDPOINT}`);
  console.log('');

  try {
    const result = await runComparisonBenchmark(config);
    const litellmBenchmarks = getLiteLLMBenchmarks();

    // Ensure output directory exists
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(outputDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Save raw JSON data
    const jsonPath = `${outputDir}/comparison-${timestamp}.json`;
    writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`💾 Raw data saved to: ${jsonPath}`);

    // Generate markdown report
    const report = generateComparisonReport(result, litellmBenchmarks);
    const reportPath = `${outputDir}/comparison-report-${timestamp}.md`;
    writeFileSync(reportPath, report, 'utf-8');
    console.log(`📄 Report saved to: ${reportPath}`);

    // Generate HTML visualization if requested
    if (generateCharts) {
      const htmlReport = generateHtmlVisualization(result);
      const htmlPath = `${outputDir}/comparison-charts-${timestamp}.html`;
      writeFileSync(htmlPath, htmlReport, 'utf-8');
      console.log(`📊 HTML charts saved to: ${htmlPath}`);
    }

    console.log('');
    console.log('✅ Comparison benchmark completed!');
    console.log('');
    console.log('Summary:');
    console.log(`  Mean Overhead: ${result.overhead.meanMs.toFixed(2)}ms (${result.overhead.meanPercent.toFixed(1)}%)`);
    console.log(`  P95 Overhead: ${result.overhead.p95Ms.toFixed(2)}ms (${result.overhead.p95Percent.toFixed(1)}%)`);
    console.log(`  P99 Overhead: ${result.overhead.p99Ms.toFixed(2)}ms (${result.overhead.p99Percent.toFixed(1)}%)`);

    // Check assertions
    const assertions = [
      { name: 'Mean < 10ms', pass: result.overhead.meanMs < 10 },
      { name: 'P95 < 15ms', pass: result.overhead.p95Ms < 15 },
      { name: 'P99 < 25ms', pass: result.overhead.p99Ms < 25 },
    ];

    console.log('');
    console.log('Performance Assertions:');
    assertions.forEach((a) => {
      const status = a.pass ? '✅ PASS' : '❌ FAIL';
      console.log(`  [${status}] ${a.name}`);
    });

    const allPassed = assertions.every((a) => a.pass);
    if (!allPassed) {
      console.log('');
      console.log('⚠️ Some performance assertions failed. See report for details.');
      process.exit(1);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Comparison benchmark failed: ${errorMessage}`);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main().catch((error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Fatal error: ${errorMessage}`);
    process.exit(1);
  });
}
