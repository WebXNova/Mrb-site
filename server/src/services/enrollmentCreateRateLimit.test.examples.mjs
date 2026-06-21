/**
 * Enrollment create rate limit — abuse protection tests.
 *
 * Run: npm run test:enrollment-create-rate-limit
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getEnrollmentCreateRateLimitConfig } from '../config/enrollmentCreateRateLimit.config.js';
import {
  buildEnrollmentCreateUserHourKey,
  buildEnrollmentCreateUserMinuteKey,
  checkEnrollmentCreateRateLimits,
  ENROLLMENT_CREATE_RATE_LIMIT_CODES,
} from './enrollmentCreateRateLimit.service.js';
import { resetSlidingWindowMemoryForTests, checkSlidingWindowLimit } from './slidingWindowRateLimit.service.js';

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

console.log('enrollmentCreateRateLimit — write-storm protection tests\n');

const config = getEnrollmentCreateRateLimitConfig();
ok('per-minute limit is 5/min', config.perMinute.max === 5 && config.perMinute.windowMs === 60_000);
ok('per-hour limit is 20/hour', config.perHour.max === 20 && config.perHour.windowMs === 3_600_000);
ok('requireRedis defaults from NODE_ENV', typeof config.requireRedis === 'boolean');

console.log('\nPer-minute — 10 sequential requests (same user)');
{
  resetSlidingWindowMemoryForTests();
  const userId = 901;
  let allowed = 0;
  let blocked = 0;
  let lastCode = null;
  for (let i = 0; i < 10; i += 1) {
    const result = await checkEnrollmentCreateRateLimits({ userId });
    if (result.allowed) allowed += 1;
    else {
      blocked += 1;
      lastCode = result.errorCode;
    }
  }
  eq('allows first 5 requests', allowed, 5);
  eq('blocks requests 6-10', blocked, 5);
  eq('minute cap error code', lastCode, ENROLLMENT_CREATE_RATE_LIMIT_CODES.USER_PER_MINUTE);
}

console.log('\nPer-hour — blocks when hour bucket is full');
{
  resetSlidingWindowMemoryForTests();
  const userId = 902;
  const hourKey = buildEnrollmentCreateUserHourKey(userId);
  for (let i = 0; i < 20; i += 1) {
    await checkSlidingWindowLimit(hourKey, config.perHour.windowMs, config.perHour.max);
  }
  const result = await checkEnrollmentCreateRateLimits({ userId });
  ok('blocks 21st create attempt when hour cap reached', result.allowed === false);
  eq('hour cap error code', result.errorCode, ENROLLMENT_CREATE_RATE_LIMIT_CODES.USER_PER_HOUR);
}

console.log('\nAttack simulation — 50 concurrent enrollment requests (same user)');
{
  resetSlidingWindowMemoryForTests();
  const userId = 903;
  const results = await runConcurrent(50, () => checkEnrollmentCreateRateLimits({ userId }));
  const allowed = results.filter((r) => r.allowed).length;
  const blocked = results.filter((r) => !r.allowed).length;
  const minuteBlocks = results.filter(
    (r) => !r.allowed && r.errorCode === ENROLLMENT_CREATE_RATE_LIMIT_CODES.USER_PER_MINUTE
  ).length;

  eq('exactly 5 concurrent requests allowed', allowed, 5);
  eq('exactly 45 concurrent requests blocked (429 path)', blocked, 45);
  eq('blocked requests use minute limit code', minuteBlocks, 45);
  ok('all blocked have retryAfterMs > 0', results.every((r) => r.allowed || r.retryAfterMs > 0));
}

console.log('\nRedis key patterns');
{
  eq('minute key', buildEnrollmentCreateUserMinuteKey(42), 'rl:enrollments:create:user:42:min');
  eq('hour key', buildEnrollmentCreateUserHourKey(42), 'rl:enrollments:create:user:42:hour');
}

mustContain(
  'src/routes/enrollment.routes.js',
  [
    'requireRedisForEnrollmentCreate',
    'enrollmentCreateRateLimit',
    'postEnrollment',
    "'/draft'",
  ],
  'enrollment routes wiring'
);

mustContain(
  'src/middleware/enrollmentCreateRateLimit.js',
  [
    'Retry-After',
    'logEnrollmentCreateRateLimitViolation',
    'RATE_LIMIT_EXCEEDED',
    'ENROLLMENT_CREATE_REDIS_REQUIRED',
  ],
  'enrollment rate limit middleware'
);

mustContain(
  'src/config/enrollmentCreateRateLimit.config.js',
  ['ENROLLMENT_CREATE_REQUIRE_REDIS', 'ENROLLMENT_CREATE_USER_PER_MINUTE_MAX'],
  'enrollment rate limit config'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
