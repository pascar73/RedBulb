#!/usr/bin/env ts-node
/**
 * RedBulb Parity Test CLI Runner
 * 
 * Usage:
 *   npm run test:parity          # Run core tests
 *   npm run test:parity extended # Run all tests
 *   npm run test:parity --verbose # Detailed output
 */

import { runParityTests } from './parity-test-framework';
import { getTestSuite } from './test-suite';
import * as fs from 'fs';
import * as path from 'path';

// Parse arguments
const args = process.argv.slice(2);
const suiteName = args.includes('extended') ? 'extended' : 'core';
const verbose = args.includes('--verbose') || args.includes('-v');

async function main() {
  console.log('\n🔍 RedBulb Parity Test Runner\n');
  console.log(`Suite: ${suiteName}`);
  console.log(`Verbose: ${verbose}`);
  console.log();
  
  // Load test suite
  const tests = getTestSuite(suiteName);
  
  if (tests.length === 0) {
    console.error('❌ No tests found in suite');
    process.exit(1);
  }
  
  console.log(`Found ${tests.length} tests\n`);
  
  // Run tests
  try {
    const report = await runParityTests(tests);
    
    // Save report
    const reportPath = path.join(__dirname, 'reports', `${Date.now()}.json`);
    await fs.promises.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`📊 Report saved: ${reportPath}\n`);
    
    // Exit with appropriate code
    process.exit(report.overallPass ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Fatal error running tests:');
    console.error(error);
    process.exit(1);
  }
}

main();
