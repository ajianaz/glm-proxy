/**
 * Generate visual charts from comparison benchmark results
 *
 * This script reads the comparison report and generates:
 * 1. ASCII charts for terminal display
 * 2. SVG charts for HTML display
 * 3. JSON data for custom visualization
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface ComparisonData {
  name: string;
  timestamp: string;
  proxy: { stats: { mean: number; p95: number; p99: number } };
  direct: { stats: { mean: number; p95: number; p99: number } };
  overhead: {
    meanMs: number;
    p95Ms: number;
    p99Ms: number;
    meanPercent: number;
    p95Percent: number;
    p99Percent: number;
  };
  componentBreakdown: {
    authentication: { meanMs: number };
    rateLimiting: { meanMs: number };
    jsonProcessing: { meanMs: number };
    requestValidation: { meanMs: number };
    networkOverhead: { meanMs: number };
    other: { meanMs: number };
  };
}

function parseComparisonReport(reportPath: string): ComparisonData | null {
  try {
    const content = readFileSync(reportPath, 'utf-8');
    // This is a simplified parser - in reality, you'd want to save the benchmark
    // result as JSON and parse that instead
    return null;
  } catch {
    return null;
  }
}

function generateAsciiBarChart(
  data: Array<{ label: string; value: number; color?: string }>,
  width = 50
): string {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const lines: string[] = [];

  lines.push('');
  data.forEach((item) => {
    const barLength = Math.round((item.value / maxValue) * width);
    const bar = '█'.repeat(Math.max(1, barLength));
    lines.push(`${item.label.padEnd(25)} |${bar} ${item.value.toFixed(2)}ms`);
  });
  lines.push('');

  return lines.join('\n');
}

function generateComponentPieChart(breakdown: ComparisonData['componentBreakdown']): string {
  const components = [
    { name: 'Authentication', value: breakdown.authentication.meanMs },
    { name: 'Rate Limiting', value: breakdown.rateLimiting.meanMs },
    { name: 'JSON Processing', value: breakdown.jsonProcessing.meanMs },
    { name: 'Request Validation', value: breakdown.requestValidation.meanMs },
    { name: 'Network Overhead', value: breakdown.networkOverhead.meanMs },
    { name: 'Other', value: breakdown.other.meanMs },
  ];

  const total = components.reduce((sum, c) => sum + c.value, 0);

  const lines: string[] = [];
  lines.push('');
  lines.push('Component Overhead Distribution:');
  lines.push('');

  components.forEach((component) => {
    const percent = total > 0 ? (component.value / total) * 100 : 0;
    const barLength = Math.round((percent / 100) * 40);
    const bar = '█'.repeat(Math.max(1, barLength));
    lines.push(
      `${component.name.padEnd(20)} |${bar} ${component.value.toFixed(2)}ms (${percent.toFixed(1)}%)`
    );
  });

  lines.push('');
  lines.push(`Total Overhead: ${total.toFixed(2)}ms`);
  lines.push('');

  return lines.join('\n');
}

function generateLatencyComparisonChart(
  proxy: number,
  direct: number,
  overhead: number
): string {
  const max = Math.max(proxy, 1);
  const proxyBar = '█'.repeat(Math.round((proxy / max) * 40));
  const directBar = '█'.repeat(Math.round((direct / max) * 40));
  const overheadBar = '█'.repeat(Math.round((overhead / max) * 40));

  return `
Latency Comparison (Mean)
─────────────────────────────────────────────────────────────
Proxy Request      |${proxyBar.padEnd(40)} ${proxy.toFixed(2)}ms
Direct API Call    |${directBar.padEnd(40)} ${direct.toFixed(2)}ms
Proxy Overhead     |${overheadBar.padEnd(40)} ${overhead.toFixed(2)}ms
                   │                                         0ms
`;
}

function generateAsciiChart(data: ComparisonData): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('              GLM Proxy Performance Comparison');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');

  // Summary
  lines.push('SUMMARY');
  lines.push('───────');
  lines.push(`Mean Overhead:     ${data.overhead.meanMs.toFixed(2)}ms (${data.overhead.meanPercent.toFixed(1)}%)`);
  lines.push(`P95 Overhead:      ${data.overhead.p95Ms.toFixed(2)}ms (${data.overhead.p95Percent.toFixed(1)}%)`);
  lines.push(`P99 Overhead:      ${data.overhead.p99Ms.toFixed(2)}ms (${data.overhead.p99Percent.toFixed(1)}%)`);
  lines.push('');

  // Latency comparison
  lines.push(generateLatencyComparisonChart(
    data.proxy.stats.mean,
    data.direct.stats.mean,
    data.overhead.meanMs
  ));

  // Component breakdown
  lines.push('COMPONENT BREAKDOWN');
  lines.push('────────────────────');
  lines.push(generateComponentPieChart(data.componentBreakdown));

  // Performance targets
  lines.push('PERFORMANCE TARGETS');
  lines.push('────────────────────');
  const meanStatus = data.overhead.meanMs < 10 ? '✅ PASS' : '❌ FAIL';
  const p95Status = data.overhead.p95Ms < 15 ? '✅ PASS' : '❌ FAIL';
  const p99Status = data.overhead.p99Ms < 25 ? '✅ PASS' : '❌ FAIL';

  lines.push(`Mean Overhead  < 10ms    [${meanStatus}] ${data.overhead.meanMs.toFixed(2)}ms`);
  lines.push(`P95 Overhead   < 15ms    [${p95Status}] ${data.overhead.p95Ms.toFixed(2)}ms`);
  lines.push(`P99 Overhead   < 25ms    [${p99Status}] ${data.overhead.p99Ms.toFixed(2)}ms`);
  lines.push('');

  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

function generateHtmlChart(data: ComparisonData): string {
  const max = Math.max(data.proxy.stats.mean, data.direct.stats.mean, 1);

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
    .chart-container {
      margin: 30px 0;
      padding: 20px;
      background: #fafafa;
      border-radius: 6px;
    }
    .bar {
      height: 40px;
      margin: 15px 0;
      position: relative;
    }
    .bar-label {
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      font-size: 14px;
      color: #333;
      width: 150px;
    }
    .bar-track {
      margin-left: 160px;
      height: 100%;
      background: #e0e0e0;
      border-radius: 4px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      background: linear-gradient(90deg, #4CAF50, #8BC34A);
      display: flex;
      align-items: center;
      padding-left: 15px;
      color: white;
      font-weight: bold;
      font-size: 14px;
      transition: width 0.3s ease;
    }
    .bar-fill.proxy { background: linear-gradient(90deg, #2196F3, #03A9F4); }
    .bar-fill.overhead { background: linear-gradient(90deg, #FF9800, #FFC107); }
    .legend {
      display: flex;
      gap: 20px;
      margin-top: 20px;
      font-size: 14px;
    }
    .legend-item { display: flex;
      align-items: center;
      gap: 8px;
    }
    .legend-color {
      width: 20px;
      height: 20px;
      border-radius: 3px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>GLM Proxy Performance Comparison</h1>
    <div class="timestamp">${new Date(data.timestamp).toLocaleString()}</div>

    <div class="summary">
      <div class="metric ${data.overhead.meanMs < 10 ? '' : 'fail'}">
        <div class="metric-label">Mean Overhead</div>
        <div class="metric-value">${data.overhead.meanMs.toFixed(2)}ms</div>
        <div class="metric-sub">${data.overhead.meanPercent.toFixed(1)}% of direct call</div>
      </div>
      <div class="metric ${data.overhead.p95Ms < 15 ? '' : 'fail'}">
        <div class="metric-label">P95 Overhead</div>
        <div class="metric-value">${data.overhead.p95Ms.toFixed(2)}ms</div>
        <div class="metric-sub">${data.overhead.p95Percent.toFixed(1)}% of direct call</div>
      </div>
      <div class="metric ${data.overhead.p99Ms < 25 ? '' : 'fail'}">
        <div class="metric-label">P99 Overhead</div>
        <div class="metric-value">${data.overhead.p99Ms.toFixed(2)}ms</div>
        <div class="metric-sub">${data.overhead.p99Percent.toFixed(1)}% of direct call</div>
      </div>
    </div>

    <h2>Latency Comparison</h2>
    <div class="chart-container">
      <div class="bar">
        <div class="bar-label">Proxy Request</div>
        <div class="bar-track">
          <div class="bar-fill proxy" style="width: ${(data.proxy.stats.mean / max) * 100}%">
            ${data.proxy.stats.mean.toFixed(2)}ms
          </div>
        </div>
      </div>
      <div class="bar">
        <div class="bar-label">Direct API Call</div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${(data.direct.stats.mean / max) * 100}%">
            ${data.direct.stats.mean.toFixed(2)}ms
          </div>
        </div>
      </div>
      <div class="bar">
        <div class="bar-label">Proxy Overhead</div>
        <div class="bar-track">
          <div class="bar-fill overhead" style="width: ${(data.overhead.meanMs / max) * 100}%">
            ${data.overhead.meanMs.toFixed(2)}ms
          </div>
        </div>
      </div>
    </div>

    <h2>Component Breakdown</h2>
    <div class="chart-container">
      ${Object.entries(data.componentBreakdown).map(([key, value]) => {
        const components: Record<string, string> = {
          authentication: 'Authentication',
          rateLimiting: 'Rate Limiting',
          jsonProcessing: 'JSON Processing',
          requestValidation: 'Request Validation',
          networkOverhead: 'Network Overhead',
          other: 'Other'
        };
        return `
      <div class="bar">
        <div class="bar-label">${components[key]}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${Math.min((value.meanMs / data.overhead.meanMs) * 100, 100)}%">
            ${value.meanMs.toFixed(2)}ms
          </div>
        </div>
      </div>`;
      }).join('')}
    </div>

    <div class="legend">
      <div class="legend-item">
        <div class="legend-color" style="background: linear-gradient(90deg, #2196F3, #03A9F4)"></div>
        <span>Proxy Request</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: linear-gradient(90deg, #4CAF50, #8BC34A)"></div>
        <span>Direct API Call</span>
      </div>
      <div class="legend-item">
        <div class="legend-color" style="background: linear-gradient(90deg, #FF9800, #FFC107)"></div>
        <span>Proxy Overhead</span>
      </div>
    </div>
  </div>
</body>
</html>
`;

  return html;
}

export function generateCharts(
  comparisonData: ComparisonData,
  outputPath?: { ascii?: string; html?: string }
): void {
  // Generate ASCII chart
  const asciiChart = generateAsciiChart(comparisonData);
  if (outputPath?.ascii) {
    const { writeFileSync } = require('node:fs');
    writeFileSync(outputPath.ascii, asciiChart, 'utf-8');
    console.log(`ASCII chart saved to: ${outputPath.ascii}`);
  } else {
    console.log(asciiChart);
  }

  // Generate HTML chart
  const htmlChart = generateHtmlChart(comparisonData);
  if (outputPath?.html) {
    const { writeFileSync } = require('node:fs');
    writeFileSync(outputPath.html, htmlChart, 'utf-8');
    console.log(`HTML chart saved to: ${outputPath.html}`);
  }
}

// Example usage
if (import.meta.main) {
  console.log('This script is meant to be imported by the comparison benchmark.');
  console.log('Run: bun run benchmark:comparison');
}
