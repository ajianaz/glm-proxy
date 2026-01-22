#!/usr/bin/env bun
/**
 * Latency validation script
 *
 * Quick script to validate < 10ms latency target across all scenarios
 */

import { validateLatencyTargets, saveValidationReport, generateValidationReport } from '../test/load/latency-validation.js';

async function main() {
  console.log('Running latency target validation...\n');

  const report = await validateLatencyTargets();

  // Save reports
  const outputDir = './test/load/results';
  saveValidationReport(report, outputDir);
  generateValidationReport(report, outputDir);

  // Exit with appropriate code
  process.exit(report.summary.overallPass ? 0 : 1);
}

main().catch((error) => {
  console.error('Validation failed:', error);
  process.exit(1);
});
