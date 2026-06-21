/**
 * H-03 payment checkout rate limit tests (in-memory Redis fallback).
 *
 * Run: node src/services/paymentCheckoutRateLimit.test.examples.mjs
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPaymentCheckoutRateLimitConfig } from '../config/paymentCheckoutRateLimit.config.js';
import {
  buildPaymentCheckoutEnrollmentKey,
  buildPaymentCheckoutGlobalBurstKey,
  buildPaymentCheckoutUserKey,
  checkPaymentCheckoutRateLimits,
  PAYMENT_CHECKOUT_RATE_LIMIT_CODES,
} from './paymentCheckoutRateLimit.service.js';
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

console.log('paymentCheckoutRateLimit — abuse protection tests\n');

const config = getPaymentCheckoutRateLimitConfig();
ok('user limit is 3/min', config.user.max === 3 && config.user.windowMs === 60_000);
ok('enrollment limit is 10/hour', config.enrollment.max === 10 && config.enrollment.windowMs === 3_600_000);
ok('global burst is 50/10s', config.globalBurst.max === 50 && config.globalBurst.windowMs === 10_000);

console.log('\nUser limit — 10 sequential requests');
{
  resetSlidingWindowMemoryForTests();
  const userId = 501;
  let allowed = 0;
  let blocked = 0;
  for (let i = 0; i < 10; i += 1) {
    const result = await checkPaymentCheckoutRateLimits({ userId, enrollmentId: 9001 + i });
    if (result.allowed) allowed += 1;
    else blocked += 1;
  }
  eq('allows first 3 user requests', allowed, 3);
  eq('blocks requests 4-10', blocked, 7);
}

console.log('\nEnrollment limit — 10 requests same enrollment');
{
  resetSlidingWindowMemoryForTests();
  const userId = 502;
  const enrollmentId = 8001;
  let allowed = 0;
  for (let i = 0; i < 10; i += 1) {
    const result = await checkPaymentCheckoutRateLimits({ userId: userId + i, enrollmentId });
    if (result.allowed) allowed += 1;
  }
  eq('allows 10 enrollment-scoped requests (distinct users)', allowed, 10);
}

console.log('\nEnrollment limit — 11 distinct users, same enrollment');
{
  resetSlidingWindowMemoryForTests();
  const enrollmentId = 8003;
  let allowed = 0;
  let lastCode = null;
  for (let i = 0; i < 11; i += 1) {
    const result = await checkPaymentCheckoutRateLimits({ userId: 1000 + i, enrollmentId });
    if (result.allowed) allowed += 1;
    else lastCode = result.errorCode;
  }
  eq('allows 10 enrollment requests per hour', allowed, 10);
  eq('blocks 11th enrollment request', lastCode, PAYMENT_CHECKOUT_RATE_LIMIT_CODES.ENROLLMENT);
}

console.log('\nEnrollment limit — same user + enrollment (user cap wins first)');
{
  resetSlidingWindowMemoryForTests();
  const userId = 503;
  const enrollmentId = 8002;
  let allowed = 0;
  let lastCode = null;
  for (let i = 0; i < 12; i += 1) {
    const result = await checkPaymentCheckoutRateLimits({ userId, enrollmentId });
    if (result.allowed) allowed += 1;
    else lastCode = result.errorCode;
  }
  eq('allows up to user cap (3) before block', allowed, 3);
  eq('blocks with user limit code', lastCode, PAYMENT_CHECKOUT_RATE_LIMIT_CODES.USER);
}

console.log('\nGlobal burst — 50 requests');
{
  resetSlidingWindowMemoryForTests();
  let allowed = 0;
  for (let i = 0; i < 50; i += 1) {
    const result = await checkPaymentCheckoutRateLimits({ userId: 600 + i, enrollmentId: 7000 + i });
    if (result.allowed) allowed += 1;
  }
  eq('allows 50 global burst requests', allowed, 50);
  const blocked = await checkPaymentCheckoutRateLimits({ userId: 9999, enrollmentId: 9999 });
  eq('blocks request 51', blocked.allowed, false);
  eq('global burst error code', blocked.errorCode, PAYMENT_CHECKOUT_RATE_LIMIT_CODES.GLOBAL_BURST);
  ok('retry_after present on block', blocked.retryAfterMs > 0);
}

console.log('\nGlobal burst — 100 concurrent requests');
{
  resetSlidingWindowMemoryForTests();
  let seq = 0;
  const results = await runConcurrent(100, () => {
    const n = seq++;
    return checkPaymentCheckoutRateLimits({ userId: 10_000 + n, enrollmentId: 20_000 + n });
  });
  const allowed = results.filter((r) => r.allowed).length;
  const blocked = results.filter((r) => !r.allowed).length;
  eq('exactly 50 concurrent requests allowed', allowed, 50);
  eq('exactly 50 concurrent requests blocked', blocked, 50);
}

console.log('\nConcurrent same user — multi-tab bypass attempt');
{
  resetSlidingWindowMemoryForTests();
  const userId = 777;
  const results = await runConcurrent(20, () =>
    checkPaymentCheckoutRateLimits({ userId, enrollmentId: 555 })
  );
  const allowed = results.filter((r) => r.allowed).length;
  eq('only 3 concurrent tabs succeed for same user', allowed, 3);
}

console.log('\nRedis key patterns');
{
  eq('global key', buildPaymentCheckoutGlobalBurstKey(), 'rl:payments:checkout:global:burst');
  eq('user key', buildPaymentCheckoutUserKey(12), 'rl:payments:checkout:user:12:min');
  eq('enrollment key', buildPaymentCheckoutEnrollmentKey(34), 'rl:payments:checkout:enrollment:34:hour');
}

mustContain(
  'src/routes/payments.routes.js',
  [
    'requireRedisForPaymentCheckout',
    'paymentCheckoutRateLimit',
    'authMiddleware',
    '/create-session',
  ],
  'payments route wiring'
);

mustContain(
  'src/middleware/paymentCheckoutRateLimit.js',
  ['Retry-After', 'logPaymentCheckoutRateLimitViolation', 'trigger_reason', 'retryAfter', 'RATE_LIMIT_EXCEEDED'],
  'checkout rate limit middleware'
);

mustContain(
  'src/services/paymentSecurityEvents.js',
  ['PAYMENT_CHECKOUT_RATE_LIMITED'],
  'payment security events'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
