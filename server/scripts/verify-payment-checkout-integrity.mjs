/**
 * CI entry — order checkout integrity + payment security suites.
 * Run: node scripts/verify-payment-checkout-integrity.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

const suites = [
  'src/services/orderStateMachine.test.examples.mjs',
  'src/services/paymentFulfillmentGate.test.examples.mjs',
  'src/services/payments.checkoutIntegrity.test.examples.mjs',
  'src/services/safepayWebhookSettlement.test.examples.mjs',
  'src/services/safepayWebhookSettlement.integration.test.examples.mjs',
  'src/services/safepayWebhookSettlement.attack.test.examples.mjs',
  'src/services/safepayWebhookEventValidation.test.examples.mjs',
  'src/services/safepayWebhook.integration.test.examples.mjs',
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
  console.error(`\nPayment checkout integrity tests FAILED (${failed} suite(s))`);
  process.exit(1);
}

console.log('\nPayment checkout integrity tests PASSED');
