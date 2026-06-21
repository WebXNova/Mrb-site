/**
 * CI entry — H-02 payment session eligibility tests.
 * Run: node scripts/verify-payment-session-eligibility.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

const suites = ['src/services/paymentEligibility.test.examples.mjs'];

let failed = 0;

for (const rel of suites) {
  const file = path.join(serverRoot, rel);
  console.log(`\n>>> ${rel}`);
  const result = spawnSync(process.execPath, [file], {
    cwd: serverRoot,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) failed += 1;
}

if (failed > 0) {
  console.error(`\nPayment session eligibility tests FAILED (${failed} suite(s))`);
  process.exit(1);
}

console.log('\nPayment session eligibility tests PASSED');
