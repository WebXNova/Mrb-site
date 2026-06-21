/**
 * Attempt token HttpOnly cookie — security regression tests.
 * Run: node src/services/attemptTokenCookie.service.test.examples.mjs
 */
import { sanitizeAttemptTokenResponse } from './attemptTokenCookie.service.js';

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

const originalMode = process.env.ATTEMPT_TOKEN_MODE;

function withMode(mode, fn) {
  process.env.ATTEMPT_TOKEN_MODE = mode;
  try {
    fn();
  } finally {
    if (originalMode === undefined) delete process.env.ATTEMPT_TOKEN_MODE;
    else process.env.ATTEMPT_TOKEN_MODE = originalMode;
  }
}

console.log('attemptTokenCookie — security tests\n');

withMode('cookie', () => {
  const sanitized = sanitizeAttemptTokenResponse({
    attemptId: 1,
    attemptToken: 'secret-jwt',
    nextAttemptToken: 'rotated-jwt',
    testId: 2,
  });
  assert(!('attemptToken' in sanitized), 'cookie mode strips attemptToken from body');
  assert(!('nextAttemptToken' in sanitized), 'cookie mode strips nextAttemptToken from body');
  assert(sanitized.attemptId === 1, 'cookie mode preserves non-secret fields');
});

withMode('dual', () => {
  const payload = { attemptId: 1, attemptToken: 'jwt', nextAttemptToken: 'jwt2' };
  const sanitized = sanitizeAttemptTokenResponse(payload);
  assert(sanitized.attemptToken === 'jwt', 'dual mode keeps attemptToken for migration');
});

withMode('bearer', () => {
  const payload = { attemptId: 1, attemptToken: 'jwt' };
  const sanitized = sanitizeAttemptTokenResponse(payload);
  assert(sanitized.attemptToken === 'jwt', 'bearer mode keeps attemptToken');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
