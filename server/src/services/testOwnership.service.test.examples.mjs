/**
 * Unit test examples for testOwnership.service.js
 *
 * Run: node src/services/testOwnership.service.test.examples.mjs
 */
import { studentOwnsTest, STUDENT_OWNS_TEST_SQL } from './testOwnership.service.js';

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
    query: async () => {
      if (shouldThrow) throw new Error('ECONNREFUSED');
      return [rows, []];
    },
  };
}

console.log('testOwnership.service — unit test examples\n');

assert(STUDENT_OWNS_TEST_SQL.includes('enrollments'), 'SQL uses enrollments ownership join');
assert(STUDENT_OWNS_TEST_SQL.includes("status = ?"), 'published status is parameterized');

{
  const pool = createMockPool([{ owns_test: 1 }]);
  const owns = await studentOwnsTest(10, 5, { executor: pool });
  assert(owns === true, 'owned published test returns true');
}

{
  const pool = createMockPool([{ owns_test: 0 }]);
  const owns = await studentOwnsTest(10, 99, { executor: pool });
  assert(owns === false, 'unowned test returns false');
}

{
  const pool = createMockPool([], { shouldThrow: true });
  const owns = await studentOwnsTest(1, 1, { executor: pool });
  assert(owns === false, 'database error returns false');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
