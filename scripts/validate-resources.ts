#!/usr/bin/env bun
/**
 * Resource validation script
 *
 * Quick script to validate memory and CPU usage targets across all scenarios
 */

import {
  validateResourceUsage,
  saveResourceValidationReport,
  generateResourceValidationReport,
} from '../test/load/resource-validation.js';

async function main() {
  console.log('Running resource usage validation...\n');

  const report = await validateResourceUsage();

  // Save reports
  const outputDir = './test/load/results';
  saveResourceValidationReport(report, outputDir);
  generateResourceValidationReport(report, outputDir);

  // Exit with appropriate code
  process.exit(report.summary.overallPass ? 0 : 1);
}

main().catch((error) => {
  console.error('Validation failed:', error);
  process.exit(1);
});
