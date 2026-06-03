/**
 * Enrollment lifecycle module verification (no DB required for core checks).
 */
import {
  dropLegacyEnrollmentTriggers,
} from '../src/services/enrollmentLifecycle.service.js';

let passed = 0;
let failed = 0;

function ok(msg) {
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function fail(msg, err) {
  failed += 1;
  console.error(`  ✗ ${msg}`, err?.message ?? err);
}

console.log('Enrollment lifecycle verification\n');

if (typeof dropLegacyEnrollmentTriggers === 'function') {
  ok('dropLegacyEnrollmentTriggers exported');
} else {
  fail('dropLegacyEnrollmentTriggers missing');
}

const { activateEnrollment, activateEnrollmentInTransaction, deactivateEnrollment, revokeEnrollment } =
  await import('../src/services/enrollmentLifecycle.service.js');

for (const fn of [
  ['activateEnrollment', activateEnrollment],
  ['activateEnrollmentInTransaction', activateEnrollmentInTransaction],
  ['deactivateEnrollment', deactivateEnrollment],
  ['revokeEnrollment', revokeEnrollment],
]) {
  if (typeof fn[1] === 'function') ok(`${fn[0]} exported`);
  else fail(`${fn[0]} missing`);
}

const ensure = await import('../src/db/ensureCeeDbConstraints.js');
const src = await import('fs/promises').then((fs) =>
  fs.readFile(new URL('../src/db/ensureCeeDbConstraints.js', import.meta.url), 'utf8')
);
if (!src.includes('ensureOneActiveEnrollmentTrigger') && !src.includes('CREATE TRIGGER')) {
  ok('ensureCeeDbConstraints has no trigger CREATE');
} else {
  fail('ensureCeeDbConstraints still references trigger creation');
}

const paymentsSrc = await import('fs/promises').then((fs) =>
  fs.readFile(new URL('../src/services/payments.service.js', import.meta.url), 'utf8')
);
if (paymentsSrc.includes('activateEnrollmentInTransaction')) {
  ok('payments.service uses centralized activation');
} else {
  fail('payments.service missing activateEnrollmentInTransaction');
}

if (!paymentsSrc.includes("SET access_status = 'active'")) {
  ok('payments.service has no inline access_status activation');
} else {
  fail('payments.service still has inline access_status UPDATE');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
