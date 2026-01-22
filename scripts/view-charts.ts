#!/usr/bin/env bun
/**
 * View the latest comparison benchmark HTML charts
 *
 * Usage:
 *   bun run scripts/view-charts.ts
 *   bun run scripts/view-charts.ts --file ./test/benchmark/results/comparison-charts-2026-01-22T...
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

function findLatestChart(dir: string): string | null {
  try {
    const files = readdirSync(dir);
    const chartFiles = files
      .filter((f) => f.startsWith('comparison-charts-') && f.endsWith('.html'))
      .sort()
      .reverse();

    return chartFiles.length > 0 ? join(dir, chartFiles[0]) : null;
  } catch {
    return null;
  }

  return null;
}

async function main() {
  const args = process.argv.slice(2);
  let chartPath: string | null = null;

  // Check if --file argument provided
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && i + 1 < args.length) {
      chartPath = args[i + 1];
      break;
    }
  }

  // If no file specified, find latest
  if (!chartPath) {
    const resultsDir = './test/benchmark/results';
    chartPath = findLatestChart(resultsDir);

    if (!chartPath) {
      console.error('❌ No chart files found.');
      console.error('Run: bun run benchmark:comparison --charts');
      process.exit(1);
    }

    console.log(`📊 Opening latest chart: ${chartPath}`);
  }

  // Open in default browser
  try {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    execSync(`${command} "${chartPath}"`, { stdio: 'ignore' });
    console.log('✅ Chart opened in browser');
  } catch (error) {
    console.error('❌ Failed to open chart');
    console.error(`You can manually open: file://${join(process.cwd(), chartPath)}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
