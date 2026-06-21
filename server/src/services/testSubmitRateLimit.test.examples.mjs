/**
 * Test submit rate limit — spam / loop / bot abuse protection tests.
 *
 * Run: npm run test:test-submit-rate-limit
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTestSubmitRateLimitConfig } from '../config/testSubmitRateLimit.config.js';
import {
  buildTestSubmitUserMinuteKey,
  checkTestSubmitRateLimits,
  TEST_SUBMIT_RATE_LIMIT_CODES,
} from './testSubmitRateLimit.service.js';
import { resetSlidingWindowMemoryForTests } from './slidingWindowRateLimit.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

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

function eq(label, actual, expected) {
  ok(label, actual === expected);
}

function mustContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: "${needle}"`, text.includes(needle));
  }
}

async function runConcurrent(count, fn) {
  return Promise.all(Array.from({ length: count }, () => fn()));
}

console.log('testSubmitRateLimit — submit spam protection tests\n');

const config = getTestSubmitRateLimitConfig();
ok('per-minute limit is 10/min', config.perMinute.max === 10 && config.perMinute.windowMs === 60_000);
ok('requireRedis defaults from NODE_ENV', typeof config.requireRedis === 'boolean');

console.log('\nPer-minute — 15 sequential requests (same user)');
{
  resetSlidingWindowMemoryForTests();
  const userId = 1001;
  let allowed = 0;
  let blocked = 0;
  let lastCode = null;
  for (let i = 0; i < 15; i += 1) {
    const result = await checkTestSubmitRateLimits({ userId });
    if (result.allowed) allowed += 1;
    else {
      blocked += 1;
      lastCode = result.errorCode;
    }
  }
  eq('allows first 10 requests', allowed, 10);
  eq('blocks requests 11-15', blocked, 5);
  eq('minute cap error code', lastCode, TEST_SUBMIT_RATE_LIMIT_CODES.USER_PER_MINUTE);
}

console.log('\nLegitimate usage — single submit allowed');
{
  resetSlidingWindowMemoryForTests();
  const result = await checkTestSubmitRateLimits({ userId: 1002 });
  ok('one submit per attempt is allowed', result.allowed === true);
}

console.log('\nAttack simulation — 100 concurrent submit requests (same user)');
{
  resetSlidingWindowMemoryForTests();
  const userId = 1003;
  const results = await runConcurrent(100, () => checkTestSubmitRateLimits({ userId }));
  const allowed = results.filter((r) => r.allowed).length;
  const blocked = results.filter((r) => !r.allowed).length;
  const minuteBlocks = results.filter(
    (r) => !r.allowed && r.errorCode === TEST_SUBMIT_RATE_LIMIT_CODES.USER_PER_MINUTE
  ).length;

  eq('exactly 10 concurrent requests allowed', allowed, 10);
  eq('exactly 90 concurrent requests blocked (429 path)', blocked, 90);
  eq('blocked requests use minute limit code', minuteBlocks, 90);
  ok('all blocked have retryAfterMs > 0', results.every((r) => r.allowed || r.retryAfterMs > 0));
}

console.log('\nRedis key patterns');
{
  eq('minute key', buildTestSubmitUserMinuteKey(42), 'rl:tests:submit:user:42:min');
}

mustContain(
  'src/routes/tests.routes.js',
  [
    'requireRedisForTestSubmit',
    'testSubmitRateLimit',
    'postSubmitAttempt',
    '/submit',
  ],
  'canonical submit routes wiring'
);

mustContain(
  'src/submit/submit.routes.js',
  [
    'requireRedisForTestSubmit',
    'testSubmitRateLimit',
    'submitTest',
    '/submit',
  ],
  'legacy submit routes wiring'
);

mustContain(
  'src/middleware/testSubmitRateLimit.js',
  [
    'Retry-After',
    'logTestSubmitRateLimitViolation',
    'RATE_LIMIT_EXCEEDED',
    'TEST_SUBMIT_REDIS_REQUIRED',
  ],
  'test submit rate limit middleware'
);

mustContain(
  'src/config/testSubmitRateLimit.config.js',
  ['TEST_SUBMIT_REQUIRE_REDIS', 'TEST_SUBMIT_USER_PER_MINUTE_MAX'],
  'test submit rate limit config'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
