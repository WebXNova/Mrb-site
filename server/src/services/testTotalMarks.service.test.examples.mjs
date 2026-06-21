/**
 * Test total marks service — unit tests (cache + validation, no DB).
 *
 * Run: npm run test:passing-marks-migration
 */
import {
  invalidateTestTotalMarksCache,
  validatePassingMarksAgainstTotal,
  TOTAL_MARKS_SQL,
} from '../services/testTotalMarks.service.js';

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

console.log('testTotalMarks.service — unit tests\n');

ok('TOTAL_MARKS_SQL aggregates effective marks', TOTAL_MARKS_SQL.includes('marks_override, qb.marks'));
ok('invalidateTestTotalMarksCache no throw', (() => {
  invalidateTestTotalMarksCache(1);
  invalidateTestTotalMarksCache('bad');
  return true;
})());

ok('validate boundary equal', validatePassingMarksAgainstTotal(100, 100).ok === true);
ok('validate boundary over', validatePassingMarksAgainstTotal(100.01, 100).ok === false);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
