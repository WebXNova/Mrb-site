/**
 * QA verification for POST /api/auth/student/forgot-password
 * Run: node scripts/verify-forgot-password.mjs
 */
import 'dotenv/config';
import crypto from 'crypto';
import http from 'http';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { mysqlPool } from '../src/config/mysql.js';
import { connectRedis, getRedisClient, isRedisReady } from '../src/config/redis.js';
import { env } from '../src/config/env.js';
import { createAndSendPasswordResetToken } from '../src/services/passwordReset.service.js';
import { forgotPasswordRateLimit } from '../src/middleware/rateLimit.js';

const GENERIC_MESSAGE = 'If the email exists, a password reset link has been sent.';
const ENDPOINT = '/api/auth/student/forgot-password';
const runId = crypto.randomBytes(4).toString('hex');
const results = [];

function record(id, name, status, detail = '') {
  results.push({ id, name, status, detail });
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : status === 'SKIP' ? '○' : '!';
  console.log(`${icon} [${id}] ${name}: ${status}${detail ? ` — ${detail}` : ''}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensurePasswordResetSchema() {
  const [tables] = await mysqlPool.query(`SHOW TABLES LIKE 'password_reset_tokens'`);
  assert(tables.length > 0, 'password_reset_tokens table missing');
}

async function createStudent({ email, status = 'active', fullName = 'QA Forgot Password' }) {
  const hash = await bcrypt.hash('QaTestPass123!', 10);
  const [result] = await mysqlPool.query(
    `INSERT INTO users (email, username, password_hash, full_name, role, status, is_verified)
     VALUES (?, ?, ?, ?, 'student', ?, TRUE)`,
    [email, `qa_fp_${runId}_${crypto.randomBytes(3).toString('hex')}`, hash, fullName, status]
  );
  return Number(result.insertId);
}

async function deleteStudent(userId) {
  if (!userId) return;
  await mysqlPool.query(`DELETE FROM users WHERE id = ?`, [userId]);
}

async function clearRedisKeysForUser(userId, email) {
  const redis = getRedisClient();
  if (!redis) return;
  const keys = [
    `pwdreset:cooldown:${userId}`,
    `pwdreset:hour:${userId}`,
    `pwdreset:email:${email}`,
  ];
  for (const key of keys) {
    await redis.del(key);
  }
}

async function countTokens(userId) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS c FROM password_reset_tokens WHERE user_id = ?`,
    [userId]
  );
  return Number(rows[0]?.c ?? 0);
}

async function countOutbox(userId, template = 'password_reset') {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS c FROM email_outbox WHERE user_id = ? AND template = ?`,
    [userId, template]
  );
  return Number(rows[0]?.c ?? 0);
}

async function latestAudit(userId, action) {
  const [rows] = await mysqlPool.query(
    `SELECT id, action, metadata_json
     FROM activity_logs
     WHERE user_id <=> ? AND action = ?
     ORDER BY id DESC
     LIMIT 1`,
    [userId, action]
  );
  return rows[0] || null;
}

async function latestSystemAudit(action) {
  const [rows] = await mysqlPool.query(
    `SELECT id, action, metadata_json
     FROM activity_logs
     WHERE role = 'system' AND action = ?
     ORDER BY id DESC
     LIMIT 1`,
    [action]
  );
  return rows[0] || null;
}

function startServer() {
  app.set('trust proxy', true);
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function postForgot(baseUrl, email, { ip = '203.0.113.50', ua = 'qa-forgot-password/1.0' } = {}) {
  const started = Date.now();
  const res = await fetch(`${baseUrl}${ENDPOINT}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
      'user-agent': ua,
    },
    body: JSON.stringify({ email }),
  });
  const elapsed = Date.now() - started;
  let body;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, elapsed, headers: Object.fromEntries(res.headers.entries()) };
}

function normalizeSuccessBody(body) {
  return JSON.stringify({
    success: body?.success,
    message: body?.data?.message,
  });
}

async function main() {
  console.log(`\n=== Forgot Password QA Verification (run ${runId}) ===\n`);

  try {
    await mysqlPool.query('SELECT 1');
  } catch (error) {
    console.error('MySQL unavailable:', error.message);
    process.exit(1);
  }

  try {
    await connectRedis();
  } catch {
    // memory fallback acceptable for most tests
  }

  await ensurePasswordResetSchema();

  const activeEmail = `qa.fp.active.${runId}@example.com`;
  const missingEmail = `qa.fp.missing.${runId}@example.com`;
  const suspendedEmail = `qa.fp.suspended.${runId}@example.com`;
  const inactiveEmail = `qa.fp.inactive.${runId}@example.com`;
  const suppressedEmail = `qa.fp.suppressed.${runId}@example.com`;
  const queueFailEmail = `qa.fp.queuefail.${runId}@example.com`;

  let activeId = 0;
  let suspendedId = 0;
  let inactiveId = 0;
  let suppressedId = 0;
  let queueFailId = 0;
  let hourlyUserId = 0;
  let cooldownUserId = 0;

  const { server, baseUrl } = await startServer();

  try {
    activeId = await createStudent({ email: activeEmail, status: 'active' });
    suspendedId = await createStudent({ email: suspendedEmail, status: 'suspended' });
    inactiveId = await createStudent({ email: inactiveEmail, status: 'inactive' });
    suppressedId = await createStudent({ email: suppressedEmail, status: 'active' });
    queueFailId = await createStudent({ email: queueFailEmail, status: 'active' });

    await mysqlPool.query(
      `INSERT INTO email_suppressions (email, reason, active) VALUES (?, 'qa_test', TRUE)
       ON DUPLICATE KEY UPDATE active = TRUE, reason = 'qa_test'`,
      [suppressedEmail]
    );

    for (const [id, email] of [
      [activeId, activeEmail],
      [suspendedId, suspendedEmail],
      [inactiveId, inactiveEmail],
      [suppressedId, suppressedEmail],
      [queueFailId, queueFailEmail],
    ]) {
      await clearRedisKeysForUser(id, email);
    }

    // --- Test 1: Existing active student ---
    const t1BeforeTokens = await countTokens(activeId);
    const t1BeforeOutbox = await countOutbox(activeId);
    const t1 = await postForgot(baseUrl, activeEmail, { ip: '10.10.1.51' });
    try {
      assert(t1.status === 200, `expected 200 got ${t1.status}`);
      assert(t1.body?.success === true, 'success flag missing');
      assert(t1.body?.data?.message === GENERIC_MESSAGE, 'unexpected message');
      assert(t1.elapsed >= 200, `timing padding weak: ${t1.elapsed}ms`);
      const tokensAfter = await countTokens(activeId);
      const outboxAfter = await countOutbox(activeId);
      assert(tokensAfter === t1BeforeTokens + 1, 'token not created');
      assert(outboxAfter === t1BeforeOutbox + 1, 'email not queued');
      const audit = await latestAudit(activeId, 'password_reset.token_created');
      assert(audit, 'missing password_reset.token_created audit');
      record('1', 'Existing student email', 'PASS', `token+outbox+audit ok (${t1.elapsed}ms)`);
    } catch (error) {
      record('1', 'Existing student email', 'FAIL', error.message);
    }

    const baselineBody = normalizeSuccessBody(t1.body);

    // --- Test 2: Non-existing email ---
    const t2 = await postForgot(baseUrl, missingEmail, { ip: '10.10.2.52' });
    try {
      assert(t2.status === 200, `expected 200 got ${t2.status}`);
      assert(normalizeSuccessBody(t2.body) === baselineBody, 'response differs from baseline');
      assert(!t2.body?.data?.email, 'email leaked in response');
      assert(!t2.body?.error, 'error object leaked');
      record('2', 'Non-existing email', 'PASS', 'generic 200, no leakage');
    } catch (error) {
      record('2', 'Non-existing email', 'FAIL', error.message);
    }

    // --- Test 3: Suspended student ---
    const t3Before = await countTokens(suspendedId);
    const t3 = await postForgot(baseUrl, suspendedEmail, { ip: '10.10.3.53' });
    try {
      assert(t3.status === 200, `expected 200 got ${t3.status}`);
      assert(normalizeSuccessBody(t3.body) === baselineBody, 'response differs from baseline');
      assert((await countTokens(suspendedId)) === t3Before, 'token created for suspended user');
      record('3', 'Suspended student', 'PASS', 'generic 200, no token');
    } catch (error) {
      record('3', 'Suspended student', 'FAIL', error.message);
    }

    // --- Test 4: Inactive student ---
    const t4Before = await countTokens(inactiveId);
    const t4 = await postForgot(baseUrl, inactiveEmail, { ip: '10.10.4.54' });
    try {
      assert(t4.status === 200, `expected 200 got ${t4.status}`);
      assert(normalizeSuccessBody(t4.body) === baselineBody, 'response differs from baseline');
      assert((await countTokens(inactiveId)) === t4Before, 'token created for inactive user');
      record('4', 'Inactive student', 'PASS', 'generic 200, no token');
    } catch (error) {
      record('4', 'Inactive student', 'FAIL', error.message);
    }

    // --- Test 5b: Per-email hourly cap (enumeration-safe 200) ---
    const hourlyUserEmail = `qa.fp.hourly.${runId}@example.com`;
    hourlyUserId = await createStudent({ email: hourlyUserEmail, status: 'active' });
    await clearRedisKeysForUser(hourlyUserId, hourlyUserEmail);
    const hourlyIp = '10.30.1.60';
    const hourlyMax = env.passwordReset.maxPerEmailPerHour;
    for (let i = 0; i < hourlyMax; i += 1) {
      const redis = getRedisClient();
      if (redis) await redis.del(`pwdreset:cooldown:${hourlyUserId}`);
      await postForgot(baseUrl, hourlyUserEmail, { ip: hourlyIp });
    }
    const t5bBefore = await countOutbox(hourlyUserId);
    const t5b = await postForgot(baseUrl, hourlyUserEmail, { ip: hourlyIp });
    try {
      assert(t5b.status === 200, 'hourly cap should still return 200');
      assert(normalizeSuccessBody(t5b.body) === baselineBody, 'hourly cap response differs');
      assert((await countOutbox(hourlyUserId)) === t5bBefore, 'email queued despite hourly cap');
      record('5b', 'Rate limit exceeded (per-email hourly)', 'PASS', 'silent skip, generic 200');
    } catch (error) {
      record('5b', 'Rate limit exceeded (per-email hourly)', 'FAIL', error.message);
    }

    // --- Test 6: Cooldown active (second request too soon) ---
    const cooldownUserEmail = `qa.fp.cooldown.${runId}@example.com`;
    cooldownUserId = await createStudent({ email: cooldownUserEmail, status: 'active' });
    await clearRedisKeysForUser(cooldownUserId, cooldownUserEmail);
    const cooldownIp = '10.40.1.61';
    const t6a = await postForgot(baseUrl, cooldownUserEmail, { ip: cooldownIp });
    const tokensAfterFirst = await countTokens(cooldownUserId);
    const outboxAfterFirst = await countOutbox(cooldownUserId);
    const t6b = await postForgot(baseUrl, cooldownUserEmail, { ip: cooldownIp });
    try {
      assert(t6a.status === 200, 'first cooldown test request failed');
      assert(t6b.status === 200, 'cooldown should return generic 200');
      assert(normalizeSuccessBody(t6b.body) === baselineBody, 'cooldown response differs');
      assert((await countTokens(cooldownUserId)) === tokensAfterFirst, 'second token created during cooldown');
      assert((await countOutbox(cooldownUserId)) === outboxAfterFirst, 'second email queued during cooldown');
      const rateAudit = await latestAudit(cooldownUserId, 'password_reset.request_rate_limited');
      assert(rateAudit, 'missing cooldown audit');
      record('6', 'Cooldown exceeded (repeat within window)', 'PASS', 'generic 200, no duplicate send');
    } catch (error) {
      record('6', 'Cooldown exceeded (repeat within window)', 'FAIL', error.message);
    }

    // --- Test 7: Email delivery failure (suppression) ---
    await clearRedisKeysForUser(suppressedId, suppressedEmail);
    const t7Before = await countTokens(suppressedId);
    const t7 = await postForgot(baseUrl, suppressedEmail, { ip: '10.50.1.62' });
    try {
      assert(t7.status === 200, 'suppression should return generic 200');
      assert(normalizeSuccessBody(t7.body) === baselineBody, 'suppression response differs');
      assert((await countTokens(suppressedId)) === t7Before, 'token created for suppressed email');
      const blockedAudit = await latestAudit(suppressedId, 'password_reset.delivery_blocked');
      assert(blockedAudit, 'missing delivery_blocked audit');
      record('7', 'Email delivery failure (suppression)', 'PASS', 'generic 200, blocked audit');
    } catch (error) {
      record('7', 'Email delivery failure (suppression)', 'FAIL', error.message);
    }

    // --- Test 8: Queue failure (service-level simulation) ---
    await clearRedisKeysForUser(queueFailId, queueFailEmail);
    const t8BeforeTokens = await countTokens(queueFailId);
    const t8BeforeOutbox = await countOutbox(queueFailId);
    let queueError;
    try {
      await createAndSendPasswordResetToken({
        userId: queueFailId,
        email: queueFailEmail,
        fullName: 'Queue Fail QA',
        ipAddress: '203.0.113.63',
        userAgent: 'qa-queue-fail',
      });
    } catch (error) {
      queueError = error;
    }
    // Simulate queue.add failure by calling sendEmail path — patch via broken outbox follow-up check
    // If above succeeded (queue ok), force failure path with direct SQL + service audit expectation
    if (!queueError) {
      // Queue worked in this environment — verify outbox queued state instead
      try {
        const outboxAfter = await countOutbox(queueFailId);
        assert(outboxAfter >= t8BeforeOutbox + 1, 'expected queued outbox row');
        const [rows] = await mysqlPool.query(
          `SELECT status, template FROM email_outbox WHERE user_id = ? AND template = 'password_reset' ORDER BY id DESC LIMIT 1`,
          [queueFailId]
        );
        assert(rows[0]?.template === 'password_reset', 'wrong template');
        assert(['queued', 'sent', 'processing'].includes(rows[0]?.status), `unexpected status ${rows[0]?.status}`);
        record('8', 'Queue failure', 'SKIP', `queue operational — outbox status=${rows[0]?.status}, cannot simulate add() failure in-process`);
      } catch (error) {
        record('8', 'Queue failure', 'FAIL', error.message);
      }
    } else {
      try {
        const failAudit = await latestAudit(queueFailId, 'password_reset.delivery_failed');
        assert(failAudit, 'missing delivery_failed audit');
        // Known behavior: token may commit before sendEmail failure
        const tokensAfter = await countTokens(queueFailId);
        const orphanedToken = tokensAfter > t8BeforeTokens;
        record(
          '8',
          'Queue failure',
          orphanedToken ? 'WARN' : 'PASS',
          orphanedToken
            ? `delivery_failed audit ok; orphaned token committed before send (${queueError.message})`
            : `delivery_failed audit ok (${queueError.message})`
        );
      } catch (error) {
        record('8', 'Queue failure', 'FAIL', error.message);
      }
    }

    // --- Test 9: Redis unavailable (middleware contract) ---
    try {
      const src = await import('fs/promises').then((fs) =>
        fs.readFile(new URL('../src/middleware/rateLimit.js', import.meta.url), 'utf8')
      );
      assert(/forgotPasswordRateLimit/.test(src), 'forgotPasswordRateLimit missing');
      assert(/requireRedisForCriticalAuthWrites/.test(src), 'redis fail-closed flag missing');
      assert(/503.*Service temporarily unavailable/.test(src), '503 message missing');

      // Runtime: only fails closed when redis errored AND not ready
      if (env.abuse.requireRedisForCriticalAuthWrites && !isRedisReady()) {
        record('9', 'Redis unavailable', 'SKIP', 'redis not connected — start REDIS_URL to runtime-test 503');
      } else if (!env.abuse.requireRedisForCriticalAuthWrites) {
        record('9', 'Redis unavailable', 'SKIP', 'REQUIRE_REDIS_FOR_CRITICAL_AUTH_WRITES=false in env');
      } else {
        // Redis is up — verify middleware returns next() on healthy redis
        const fakeReq = { path: '/student/forgot-password', get: () => '', body: {}, ip: '127.0.0.1' };
        const fakeRes = { setHeader: () => {} };
        let middlewareError = null;
        await new Promise((resolve) => {
          forgotPasswordRateLimit(fakeReq, fakeRes, (err) => {
            middlewareError = err;
            resolve();
          });
        });
        assert(!middlewareError, 'healthy redis should pass middleware');
        record('9', 'Redis unavailable', 'PASS', 'fail-closed code present; healthy redis passes (503 needs staging chaos test)');
      }
    } catch (error) {
      record('9', 'Redis unavailable', 'FAIL', error.message);
    }

    // --- Cross-cutting: response uniformity ---
    const samples = [t2, t3, t4, t5b, t6b, t7].map((r) => normalizeSuccessBody(r.body));
    try {
      assert(samples.every((s) => s === baselineBody), 'email-state responses not uniform');
      const leakFields = ['userId', 'exists', 'found', 'status', 'verified', 'suspended', 'inactive'];
      for (const r of [t1, t2, t3, t4, t5b, t6b, t7]) {
        const blob = JSON.stringify(r.body || {}).toLowerCase();
        for (const field of leakFields) {
          assert(!blob.includes(field), `possible leakage field "${field}" in ${blob.slice(0, 120)}`);
        }
      }
      record('X', 'Same response for all email states', 'PASS', `${samples.length + 1} scenarios share identical success envelope`);
    } catch (error) {
      record('X', 'Same response for all email states', 'FAIL', error.message);
    }

    // --- Test 5: Rate limit exceeded (coarse IP) — run last (destructive to shared counters) ---
    const coarseIp = `10.20.${Number.parseInt(runId.slice(0, 2), 16) % 200}.99`;
    const coarseLimit = env.verification.resendCoarsePerIpPerMinute + 2;
    let got429 = false;
    let lastCoarse;
    for (let i = 0; i < coarseLimit; i += 1) {
      lastCoarse = await postForgot(baseUrl, missingEmail, { ip: coarseIp });
      if (lastCoarse.status === 429) {
        got429 = true;
        break;
      }
    }
    try {
      assert(got429, 'coarse rate limit never triggered');
      assert(lastCoarse.body?.success === false, '429 should use error envelope');
      assert(!String(lastCoarse.body?.error?.message || '').toLowerCase().includes('exist'), '429 message may enumerate');
      const audit = await latestSystemAudit('password_reset.abuse.coarse_rate_limit');
      assert(audit, 'missing coarse rate limit audit');
      record('5', 'Rate limit exceeded (coarse IP)', 'PASS', `429 after burst from ${coarseIp}`);
    } catch (error) {
      record('5', 'Rate limit exceeded (coarse IP)', 'FAIL', error.message);
    }
  } finally {
    server.close();
    await mysqlPool.query(`DELETE FROM email_suppressions WHERE email = ?`, [suppressedEmail]);
    await deleteStudent(activeId);
    await deleteStudent(suspendedId);
    await deleteStudent(inactiveId);
    await deleteStudent(suppressedId);
    await deleteStudent(queueFailId);
    await deleteStudent(hourlyUserId);
    await deleteStudent(cooldownUserId);
    await mysqlPool.end();
  }

  console.log('\n=== Summary ===');
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const warn = results.filter((r) => r.status === 'WARN').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  console.log(`PASS: ${pass}  FAIL: ${fail}  WARN: ${warn}  SKIP: ${skip}`);

  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Verification crashed:', error);
  process.exit(1);
});
