/**
 * CI entry — H-05 Redis fail-closed webhook protection tests.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

const suites = ['src/services/safepayWebhookRedisFailClosed.test.examples.mjs'];

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
  console.error(`\nSafepay webhook Redis fail-closed tests FAILED (${failed} suite(s))`);
  process.exit(1);
}

console.log('\nSafepay webhook Redis fail-closed tests PASSED');
