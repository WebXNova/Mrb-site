/**
 * Unit test examples for courseOwnership.service.js
 *
 * Run: node src/services/courseOwnership.service.test.examples.mjs
 *
 * These examples use a mocked executor — no live database required.
 */

import {
  studentOwnsCourse,
  STUDENT_OWNS_COURSE_SQL,
} from './courseOwnership.service.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

/** @type {import('mysql2/promise').Pool} */
function createMockPool(rows, { shouldThrow = false } = {}) {
  return {
    query: async (sql, params) => {
      if (shouldThrow) {
        throw new Error('ECONNREFUSED');
      }
      return [rows, []];
    },
  };
}

console.log('courseOwnership.service — unit test examples\n');

assert(STUDENT_OWNS_COURSE_SQL.includes('enrollments'), 'SQL uses enrollments table');
assert(STUDENT_OWNS_COURSE_SQL.includes('access_status'), 'SQL filters access_status');
assert(!STUDENT_OWNS_COURSE_SQL.includes('${'), 'SQL has no template injection');

// --- invalid ids → false, no query required if we pass mock that throws on call ---
{
  const pool = createMockPool([{ owns_course: 1 }], { shouldThrow: true });
  const r1 = await studentOwnsCourse(null, 5, { executor: pool });
  const r2 = await studentOwnsCourse(1, 'abc', { executor: pool });
  const r3 = await studentOwnsCourse(-1, 2, { executor: pool });
  assert(r1 === false && r2 === false && r3 === false, 'invalid ids return false');
}

// --- active enrollment → true ---
{
  const pool = createMockPool([{ owns_course: 1 }]);
  const owns = await studentOwnsCourse(42, 7, { executor: pool });
  assert(owns === true, 'active enrollment (mock) returns true');
}

// --- no enrollment → false ---
{
  const pool = createMockPool([{ owns_course: 0 }]);
  const owns = await studentOwnsCourse(42, 99, { executor: pool });
  assert(owns === false, 'no enrollment (mock) returns false');
}

// --- database error → false (fail-closed) ---
{
  const pool = createMockPool([], { shouldThrow: true });
  const owns = await studentOwnsCourse(1, 1, { executor: pool });
  assert(owns === false, 'database error returns false');
}

// --- parameterized call shape ---
{
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return [[{ owns_course: 0 }], []];
    },
  };
  await studentOwnsCourse('10', '20', { executor: pool });
  assert(calls.length === 1, 'executes exactly one query');
  assert(calls[0].params[0] === 10 && calls[0].params[1] === 20, 'coerces string ids to numbers');
  assert(calls[0].params.includes('pending') && calls[0].params.includes('rejected'), 'blocks pending/rejected statuses');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
