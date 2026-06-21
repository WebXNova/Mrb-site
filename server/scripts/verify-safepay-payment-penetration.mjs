/**
 * CI entry — payment penetration tests (settlement unit + integration + attack simulation).
 * Run: node scripts/verify-safepay-payment-penetration.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

const suites = [
  'src/services/safepayWebhookSettlement.test.examples.mjs',
  'src/services/safepayWebhookSettlement.integration.test.examples.mjs',
  'src/services/safepayWebhookSettlement.attack.test.examples.mjs',
];

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
  console.error(`\nSafepay payment penetration tests FAILED (${failed} suite(s))`);
  process.exit(1);
}

console.log('\nSafepay payment penetration tests PASSED (unit + integration + attack)');
