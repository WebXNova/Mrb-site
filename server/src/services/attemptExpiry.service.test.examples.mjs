/**
 * Unit test examples for attemptExpiry.service.js
 *
 * Run:
 *   node src/services/attemptExpiry.service.test.examples.mjs
 */

import { expireAttemptIfExpired } from './attemptExpiry.service.js';
import { EXPIRE_ATTEMPT_IF_EXPIRED_SQL } from './attemptTimer.queries.js';

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

console.log('attemptExpiry.service — unit test examples\n');

{
  let seen = null;
  const executor = {
    query: async (sql, params) => {
      seen = { sql, params };
      return [{ affectedRows: 1 }];
    },
  };

  const changed = await expireAttemptIfExpired({
    attemptId: 10,
    nowMs: Date.parse('2026-01-01T00:00:00.000Z'),
    executor,
  });

  assert(changed === true, 'expired update returns true');
  assert(seen.sql.includes('UPDATE test_attempts'), 'uses UPDATE statement');
  assert(seen.sql.includes("completion_reason"), 'sets completion_reason');
  assert(seen.params[0] === 10, 'binds attempt id parameter');
}

{
  const executor = {
    query: async () => [{ affectedRows: 0 }],
  };
  const changed = await expireAttemptIfExpired({ attemptId: 1, nowMs: Date.now(), executor });
  assert(changed === false, 'non-expired update returns false');
}

{
  // SQL contract sanity
  assert(EXPIRE_ATTEMPT_IF_EXPIRED_SQL.includes('completion_reason'), 'SQL sets completion_reason');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;

