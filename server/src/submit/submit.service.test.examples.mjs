/**
 * Static checks for submit module wiring (no DB).
 * Run: node src/submit/submit.service.test.examples.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

console.log('submitTest — static verification\n');

const serviceSrc = fs.readFileSync(path.join(root, 'submit.service.js'), 'utf8');
const queriesSrc = fs.readFileSync(path.join(root, 'submit.queries.js'), 'utf8');

ok('uses BEGIN transaction', serviceSrc.includes('beginTransaction'));
ok('uses FOR UPDATE lock', queriesSrc.includes('FOR UPDATE'));
ok('conditional lock UPDATE', queriesSrc.includes("status = 'in_progress'"));
ok('calls gradeAttempt entry point', serviceSrc.includes('gradeAttempt('));
ok('rollback on failure', serviceSrc.includes('rollback'));
ok('does not accept client status fields', !serviceSrc.includes('req.body'));

const routesSrc = fs.readFileSync(path.join(root, 'submit.routes.js'), 'utf8');
ok('route uses attemptGuard', routesSrc.includes('attemptGuard'));
ok('POST submit route registered', routesSrc.includes('/:attempt_id/submit'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
