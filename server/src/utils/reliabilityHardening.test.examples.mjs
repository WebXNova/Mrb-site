/**
 * Production reliability regression tests — crash/timeout elimination.
 *
 * Run: node src/utils/reliabilityHardening.test.examples.mjs
 */

import assert from 'node:assert/strict';
import { asyncHandler, isAsyncHandlerWrapped } from './asyncHandler.js';
import {
  classifyUnhandledRejection,
  classifyUncaughtException,
  isOperationalProcessError,
} from './fatalErrorPolicy.js';
import { withDeadline, fetchWithDeadline } from './withDeadline.js';
import { RedisCommandTimeoutError } from '../errors/redis/RedisCommandTimeoutError.js';
import { RedisUnavailableError } from '../errors/redis/RedisUnavailableError.js';
import { ExternalRequestTimeoutError } from '../errors/external/ExternalRequestTimeoutError.js';
import { MySqlAcquireTimeoutError } from '../errors/mysql/MySqlAcquireTimeoutError.js';
import { installRedisCommandTimeouts } from '../config/redisCommandTimeout.js';
import { getHttpServerTimeoutConfig } from '../config/reliabilityTimeouts.js';
import { authRateLimit } from '../middleware/rateLimit.js';
import { autosaveRateLimit, requireRedisForAutosave } from '../middleware/autosaveRateLimit.js';
import { testSubmitRateLimit, requireRedisForTestSubmit } from '../middleware/testSubmitRateLimit.js';
import {
  paymentCheckoutRateLimit,
  requireRedisForPaymentCheckout,
} from '../middleware/paymentCheckoutRateLimit.js';
import { entitlementGuard, identityOnlyGuard } from '../security/cee/entitlementGuard.js';
import { requireAdmin, authMiddleware } from '../middleware/auth.js';
import { optionalAdminContext } from '../middleware/observabilityAccess.js';
import { normalizeError } from '../errors/middleware/normalizeError.js';

let failed = 0;

function ok(name, condition) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.error(`  ✗ ${name}`);
}

function eq(name, actual, expected) {
  try {
    assert.equal(actual, expected);
    console.log(`  ✓ ${name}`);
  } catch {
    failed += 1;
    console.error(`  ✗ ${name} (got ${actual}, expected ${expected})`);
  }
}

console.log('\n1) asyncHandler wraps student-critical middleware');
for (const [name, fn] of [
  ['authRateLimit', authRateLimit],
  ['autosaveRateLimit', autosaveRateLimit],
  ['requireRedisForAutosave', requireRedisForAutosave],
  ['testSubmitRateLimit', testSubmitRateLimit],
  ['requireRedisForTestSubmit', requireRedisForTestSubmit],
  ['paymentCheckoutRateLimit', paymentCheckoutRateLimit],
  ['requireRedisForPaymentCheckout', requireRedisForPaymentCheckout],
  ['entitlementGuard', entitlementGuard],
  ['identityOnlyGuard', identityOnlyGuard],
  ['requireAdmin', requireAdmin],
  ['authMiddleware', authMiddleware],
  ['optionalAdminContext', optionalAdminContext],
]) {
  ok(`${name} wrapped`, isAsyncHandlerWrapped(fn));
}

console.log('\n2) async middleware rejection reaches next(err) — not unhandledRejection');
{
  let nextErr = null;
  let unhandled = 0;
  const onUnhandled = () => {
    unhandled += 1;
  };
  process.on('unhandledRejection', onUnhandled);

  const boom = asyncHandler(async () => {
    throw new RedisCommandTimeoutError({ timeoutMs: 100, command: 'incr' });
  });

  await new Promise((resolve) => {
    boom({}, {}, (err) => {
      nextErr = err;
      resolve();
    });
  });

  await new Promise((r) => setTimeout(r, 30));
  process.off('unhandledRejection', onUnhandled);

  ok('next received RedisCommandTimeoutError', nextErr instanceof RedisCommandTimeoutError);
  eq('no unhandledRejection fired', unhandled, 0);
}

console.log('\n3) fatalErrorPolicy classifies operational vs fatal');
ok('Redis timeout is operational', isOperationalProcessError(new RedisCommandTimeoutError({ timeoutMs: 1 })));
ok('Redis unavailable is operational', isOperationalProcessError(new RedisUnavailableError()));
ok('MySQL acquire is operational', isOperationalProcessError(new MySqlAcquireTimeoutError({ timeoutMs: 1 })));
ok('External timeout is operational', isOperationalProcessError(new ExternalRequestTimeoutError({ timeoutMs: 1 })));
eq('operational rejection → log', classifyUnhandledRejection(new RedisUnavailableError()), 'log');
eq(
  'unknown rejection → fatal',
  classifyUnhandledRejection(new TypeError('programmer bug')),
  'fatal'
);
eq('uncaught TypeError → fatal', classifyUncaughtException(new TypeError('x')), 'fatal');
eq('EPIPE → log', classifyUncaughtException(Object.assign(new Error('pipe'), { code: 'EPIPE' })), 'log');

console.log('\n4) withDeadline fails fast');
{
  const started = Date.now();
  let timedOut = false;
  let settle;
  const never = new Promise((resolve) => {
    settle = resolve;
  });
  try {
    await withDeadline(never, 80, { dependency: 'test' });
  } catch (error) {
    timedOut = error instanceof ExternalRequestTimeoutError;
  } finally {
    settle(undefined);
  }
  const elapsed = Date.now() - started;
  ok('deadline throws ExternalRequestTimeoutError', timedOut);
  ok('deadline elapsed < 500ms', elapsed < 500);
}

console.log('\n5) Redis command timeout wrapper');
{
  const fake = {
    async get() {
      return new Promise(() => {});
    },
  };
  installRedisCommandTimeouts(fake, 50);
  let timedOut = false;
  try {
    await fake.get('k');
  } catch (error) {
    timedOut = error instanceof RedisCommandTimeoutError;
  }
  ok('wrapped get times out', timedOut);
}

console.log('\n6) normalizeError maps Redis/external timeouts to 503');
{
  const redisTimeout = normalizeError(new RedisCommandTimeoutError({ timeoutMs: 10 }));
  eq('redis timeout httpStatus', redisTimeout.httpStatus, 503);
  const redisDown = normalizeError(new RedisUnavailableError());
  eq('redis unavailable httpStatus', redisDown.httpStatus, 503);
  const external = normalizeError(new ExternalRequestTimeoutError({ timeoutMs: 10 }));
  eq('external timeout httpStatus', external.httpStatus, 503);
}

console.log('\n7) HTTP keepalive vs Nginx (Node > Nginx idle reuse risk)');
{
  const cfg = getHttpServerTimeoutConfig();
  ok('keepAliveTimeout >= 65000', cfg.keepAliveTimeout >= 65_000);
  ok('headersTimeout > keepAliveTimeout', cfg.headersTimeout > cfg.keepAliveTimeout);
  ok('requestTimeout > nginx read 95s', cfg.requestTimeout > 95_000);
}

console.log('\n8) email worker failed-handler isolation (source contract)');
{
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = await fs.readFile(path.join(here, '../services/emailQueueWorker.service.js'), 'utf8');
  ok('failed handler uses void + catch', src.includes('void handleEmailJobFailed'));
  ok('failed handler has persist catch', src.includes('failed_handler_persist_error'));
}

console.log('\n9) double-wrap asyncHandler is idempotent');
{
  const fn = async () => {};
  const once = asyncHandler(fn);
  const twice = asyncHandler(once);
  ok('same function reference', once === twice);
}

if (failed > 0) {
  console.error(`\n${failed} reliability checks failed`);
  process.exitCode = 1;
} else {
  console.log('\nAll reliability hardening checks passed');
}
