/**
 * Payment accounts — validation, auth middleware, CSRF, audit, concurrency tests.
 * Run: node tests/payment-accounts.service.test.examples.mjs
 */

import assert from 'node:assert/strict';
import { ApiError } from '../src/utils/apiError.js';
import {
  assertValidPaymentAccountNumber,
  normalizePakistaniMobileAccountNumber,
  parseCreatePaymentAccountBody,
  parseUpdatePaymentAccountBody,
} from '../src/validators/paymentAccount.schema.js';
import { requirePaymentAccountWriteAccess } from '../src/middleware/requirePaymentAccountWriteAccess.js';
import { canWritePaymentAccounts } from '../src/utils/paymentAccountAccess.js';
import { requireCsrf, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../src/middleware/csrf.js';
import { ensurePaymentAccountsSchema } from '../src/db/ensurePaymentAccountsSchema.js';
import { mysqlPool, verifyMySqlConnection } from '../src/config/mysql.js';
import {
  activatePaymentAccount,
  countActivePaymentAccountsForMethod,
  createPaymentAccount,
  deletePaymentAccountForTests,
  listPaymentAccountAuditLog,
} from '../src/services/paymentAccounts.service.js';
import { resetSlidingWindowMemoryForTests } from '../src/services/slidingWindowRateLimit.service.js';

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

function asyncTest(label, fn) {
  return fn()
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${label}`);
    })
    .catch((err) => {
      failed += 1;
      console.error(`  ✗ ${label}`);
      if (err?.message) console.error(`    ${err.message}`);
    });
}

function expectApiError(label, fn, expectedStatus) {
  try {
    fn();
    failed += 1;
    console.error(`  ✗ ${label} (no error thrown)`);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === expectedStatus) {
      passed += 1;
      console.log(`  ✓ ${label}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${label}`);
      console.error(`    expected ApiError ${expectedStatus}, got`, err);
    }
  }
}

async function expectApiErrorAsync(label, fn, expectedStatus) {
  try {
    await fn();
    failed += 1;
    console.error(`  ✗ ${label} (no error thrown)`);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === expectedStatus) {
      passed += 1;
      console.log(`  ✓ ${label}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${label}`);
      console.error(`    expected ApiError ${expectedStatus}, got`, err);
    }
  }
}

console.log('payment-accounts — validation\n');

ok('normalize +92', normalizePakistaniMobileAccountNumber('+923001234567') === '03001234567');
ok('normalize 10-digit', normalizePakistaniMobileAccountNumber('3001234567') === '03001234567');

expectApiError('malformed number returns 400', () => {
  assertValidPaymentAccountNumber('04001234567', 'easypaisa');
}, 400);

expectApiError('invalid jazzcash prefix returns 400', () => {
  assertValidPaymentAccountNumber('03401234567', 'jazzcash');
}, 400);

expectApiError('unknown create field rejected (422 strict)', () => {
  parseCreatePaymentAccountBody({
    method: 'easypaisa',
    account_number: '03001234567',
    account_title: 'Main Wallet',
    extra: 'nope',
  });
}, 422);

expectApiError('empty title rejected', () => {
  parseCreatePaymentAccountBody({
    method: 'easypaisa',
    account_number: '03001234567',
    account_title: '   ',
  });
}, 422);

{
  const dto = parseCreatePaymentAccountBody({
    method: 'easypaisa',
    account_number: '+923001234567',
    account_title: '  Branch A  ',
  });
  ok('easypaisa valid parse', dto.account_number === '03001234567' && dto.account_title === 'Branch A');
}

{
  const dto = parseUpdatePaymentAccountBody(
    { account_number: '03001234567', account_title: 'Updated Title' },
    'jazzcash'
  );
  ok('jazzcash valid update parse', dto.account_number === '03001234567');
}

console.log('\npayment-accounts — write access middleware\n');

await asyncTest('regular admin write blocked with 403', async () => {
  const [[adminRow]] = await mysqlPool.query(
    `SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id ASC LIMIT 1`
  );
  if (!adminRow?.id) {
    console.log('  ⚠ skipped — no active admin user in database');
    return;
  }
  assert.equal(await canWritePaymentAccounts(adminRow.id), false);
  const req = { user: { id: adminRow.id } };
  let nextErr = null;
  await new Promise((resolve) => {
    requirePaymentAccountWriteAccess(req, {}, (err) => {
      nextErr = err;
      resolve();
    });
  });
  assert.ok(nextErr instanceof ApiError);
  assert.equal(nextErr.statusCode, 403);
});

await asyncTest('super_admin write allowed', async () => {
  const [[superRow]] = await mysqlPool.query(
    `SELECT id FROM users WHERE role = 'super_admin' AND status = 'active' ORDER BY id ASC LIMIT 1`
  );
  if (!superRow?.id) {
    console.log('  ⚠ skipped — no active super_admin user in database');
    return;
  }
  assert.equal(await canWritePaymentAccounts(superRow.id), true);
  const req = { user: { id: superRow.id } };
  let nextErr = undefined;
  let called = false;
  await new Promise((resolve) => {
    requirePaymentAccountWriteAccess(req, {}, (err) => {
      nextErr = err;
      called = true;
      resolve();
    });
  });
  assert.ok(called);
  assert.ok(!nextErr);
});

console.log('\npayment-accounts — CSRF middleware\n');

await asyncTest('missing CSRF rejected with 403', async () => {
  const req = { method: 'POST', cookies: {}, get: () => undefined };
  let nextErr = null;
  await new Promise((resolve) => {
    requireCsrf(req, {}, (err) => {
      nextErr = err;
      resolve();
    });
  });
  assert.ok(nextErr instanceof ApiError);
  assert.equal(nextErr.statusCode, 403);
});

await asyncTest('matching CSRF accepted', async () => {
  const token = 'abc123def4567890abc123def4567890abc123def4567890abc123def4567890';
  const req = {
    method: 'POST',
    cookies: { [CSRF_COOKIE_NAME]: token },
    get: (name) => (name === CSRF_HEADER_NAME ? token : undefined),
  };
  let nextErr = undefined;
  let called = false;
  await new Promise((resolve) => {
    requireCsrf(req, {}, (err) => {
      nextErr = err;
      called = true;
      resolve();
    });
  });
  assert.ok(called);
  assert.ok(!nextErr);
});

console.log('\npayment-accounts — database integration\n');

resetSlidingWindowMemoryForTests();

let superAdminId = null;

try {
  await verifyMySqlConnection();
  await ensurePaymentAccountsSchema(mysqlPool);

  const [[superAdminRow]] = await mysqlPool.query(
    `SELECT id FROM users WHERE role = 'super_admin' ORDER BY id ASC LIMIT 1`
  );
  const [[anyUserRow]] = await mysqlPool.query(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
  superAdminId = superAdminRow?.id
    ? Number(superAdminRow.id)
    : anyUserRow?.id
      ? Number(anyUserRow.id)
      : null;

  if (!superAdminId) {
    console.log('  ⚠ skipped DB integration — no users in database');
  } else {
    const createdA = await createPaymentAccount({
      body: {
        method: 'jazzcash',
        account_number: '03001234567',
        account_title: 'Race Account A',
      },
      actorId: superAdminId,
      ipAddress: '127.0.0.1',
    });
    const createdB = await createPaymentAccount({
      body: {
        method: 'jazzcash',
        account_number: '03011234567',
        account_title: 'Race Account B',
      },
      actorId: superAdminId,
      ipAddress: '127.0.0.1',
    });

    await Promise.all([
      activatePaymentAccount({ accountId: createdA.id, actorId: superAdminId, ipAddress: '127.0.0.1' }),
      activatePaymentAccount({ accountId: createdB.id, actorId: superAdminId, ipAddress: '127.0.0.1' }),
    ]);

    const activeCount = await countActivePaymentAccountsForMethod('jazzcash');
    ok('concurrent activate leaves one active jazzcash account', activeCount === 1);

    const auditA = await listPaymentAccountAuditLog(createdA.id);
    const auditB = await listPaymentAccountAuditLog(createdB.id);
    ok('create writes audit row (A)', auditA.some((e) => e.action === 'created'));
    ok('create writes audit row (B)', auditB.some((e) => e.action === 'created'));
    ok(
      'activate writes audit row',
      auditA.some((e) => e.action === 'activated') || auditB.some((e) => e.action === 'activated')
    );

    await deletePaymentAccountForTests(createdA.id);
    await deletePaymentAccountForTests(createdB.id);
  }
} catch (err) {
  failed += 1;
  console.error('  ✗ database integration block');
  console.error(`    ${err.message}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
await mysqlPool.end().catch(() => {});
process.exit(failed > 0 ? 1 : 0);
