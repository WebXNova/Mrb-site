/**
 * Autosave rate limit — loop / retry-storm protection tests.
 *
 * Run: npm run test:autosave-rate-limit
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAutosaveRateLimitConfig } from '../config/autosaveRateLimit.config.js';
import {
  buildAutosaveUserMinuteKey,
  checkAutosaveRateLimits,
  AUTOSAVE_RATE_LIMIT_CODES,
} from './autosaveRateLimit.service.js';
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

console.log('autosaveRateLimit — autosave protection tests\n');

const config = getAutosaveRateLimitConfig();
ok('per-minute limit is 30/min', config.perMinute.max === 30 && config.perMinute.windowMs === 60_000);
ok('requireRedis defaults from NODE_ENV', typeof config.requireRedis === 'boolean');

console.log('\nPer-minute — 40 sequential requests (same user)');
{
  resetSlidingWindowMemoryForTests();
  const userId = 2001;
  let allowed = 0;
  let blocked = 0;
  let lastCode = null;
  for (let i = 0; i < 40; i += 1) {
    const result = await checkAutosaveRateLimits({ userId });
    if (result.allowed) allowed += 1;
    else {
      blocked += 1;
      lastCode = result.errorCode;
    }
  }
  eq('allows first 30 requests', allowed, 30);
  eq('blocks requests 31-40', blocked, 10);
  eq('minute cap error code', lastCode, AUTOSAVE_RATE_LIMIT_CODES.USER_PER_MINUTE);
}

console.log('\nLegitimate usage — typical autosave burst (5 in quick succession)');
{
  resetSlidingWindowMemoryForTests();
  const userId = 2002;
  const results = await runConcurrent(5, () => checkAutosaveRateLimits({ userId }));
  const allowed = results.filter((r) => r.allowed).length;
  eq('all 5 legitimate autosaves allowed', allowed, 5);
}

console.log('\nShared bucket — slug + portal autosaves count together');
{
  resetSlidingWindowMemoryForTests();
  const userId = 2004;
  for (let i = 0; i < 29; i += 1) {
    await checkAutosaveRateLimits({ userId });
  }
  const slugResult = await checkAutosaveRateLimits({ userId });
  const portalResult = await checkAutosaveRateLimits({ userId });
  ok('30th autosave allowed', slugResult.allowed === true);
  ok('31st autosave blocked regardless of route', portalResult.allowed === false);
  eq('shared bucket violation code', portalResult.errorCode, AUTOSAVE_RATE_LIMIT_CODES.USER_PER_MINUTE);
}

console.log('\nAttack simulation — 100 concurrent autosave requests (same user)');
{
  resetSlidingWindowMemoryForTests();
  const userId = 2003;
  const results = await runConcurrent(100, () => checkAutosaveRateLimits({ userId }));
  const allowed = results.filter((r) => r.allowed).length;
  const blocked = results.filter((r) => !r.allowed).length;
  const minuteBlocks = results.filter(
    (r) => !r.allowed && r.errorCode === AUTOSAVE_RATE_LIMIT_CODES.USER_PER_MINUTE
  ).length;

  eq('exactly 30 concurrent requests allowed', allowed, 30);
  eq('exactly 70 concurrent requests blocked (429 path)', blocked, 70);
  eq('blocked requests use minute limit code', minuteBlocks, 70);
  ok('all blocked have retryAfterMs > 0', results.every((r) => r.allowed || r.retryAfterMs > 0));
}

console.log('\nRedis key patterns');
{
  eq('minute key', buildAutosaveUserMinuteKey(42), 'rl:tests:autosave:user:42:min');
}

mustContain(
  'src/routes/tests.routes.js',
  [
    'requireRedisForAutosave',
    'autosaveRateLimit',
    'patchSaveAnswer',
    '/answers',
  ],
  'canonical autosave routes wiring'
);

mustContain(
  'src/routes/student.routes.js',
  [
    'requireRedisForAutosave',
    'autosaveRateLimit',
    'postStudentAttemptAnswer',
    '/answer',
  ],
  'portal autosave routes wiring'
);

mustContain(
  'src/answer/answer.routes.js',
  [
    'requireRedisForAutosave',
    'autosaveRateLimit',
    'saveAnswer',
    '/answers',
  ],
  'legacy autosave routes wiring'
);

mustContain(
  'src/middleware/autosaveRateLimit.js',
  [
    'Retry-After',
    'logAutosaveRateLimitViolation',
    'RATE_LIMIT_EXCEEDED',
    'AUTOSAVE_REDIS_REQUIRED',
  ],
  'autosave rate limit middleware'
);

mustContain(
  'src/config/autosaveRateLimit.config.js',
  ['AUTOSAVE_REQUIRE_REDIS', 'AUTOSAVE_USER_PER_MINUTE_MAX'],
  'autosave rate limit config'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
