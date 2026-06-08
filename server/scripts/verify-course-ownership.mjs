/**
 * Static verification for course ownership foundation (Phase 1A).
 */
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;

function ok(msg) {
  passed += 1;
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  failed += 1;
  console.error(`  ✗ ${msg}`);
}

console.log('Course ownership service verification\n');

const { studentOwnsCourse, STUDENT_OWNS_COURSE_SQL } = await import('../src/services/courseOwnership.service.js');

if (typeof studentOwnsCourse === 'function') ok('studentOwnsCourse exported');
else fail('studentOwnsCourse missing');

if (typeof STUDENT_OWNS_COURSE_SQL === 'string' && STUDENT_OWNS_COURSE_SQL.includes('EXISTS')) {
  ok('STUDENT_OWNS_COURSE_SQL exported');
} else {
  fail('STUDENT_OWNS_COURSE_SQL invalid');
}

const src = await fs.readFile(path.join(root, '../src/services/courseOwnership.service.js'), 'utf8');

if (src.includes('mysqlPool.query') || src.includes('executor.query')) {
  ok('uses parameterized executor.query');
} else {
  fail('missing parameterized query');
}

if (!src.match(/\$\{studentId\}|\$\{courseId\}/) && !src.includes('+ studentId') && !src.includes('+ courseId')) {
  ok('no dynamic SQL concatenation for ids');
} else {
  fail('possible SQL injection via concatenation');
}

if (src.includes('return false') && src.includes('catch')) {
  ok('fail-closed on errors');
} else {
  fail('missing fail-closed error handling');
}

if (src.includes('StructuredLogger')) ok('structured logging present');
else fail('structured logging missing');

const entitlementSrc = await fs.readFile(path.join(root, '../src/services/entitlement.service.js'), 'utf8');
if (entitlementSrc.includes('access_status = \'active\'') && src.includes('access_status = \'active\'')) {
  ok('aligned with enrollment access_status source of truth');
} else {
  fail('not aligned with entitlement access_status');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
