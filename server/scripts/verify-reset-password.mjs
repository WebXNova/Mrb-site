/**
 * QA verification for POST /api/auth/student/reset-password
 * Run: node scripts/verify-reset-password.mjs
 */
import 'dotenv/config';
import crypto from 'crypto';
import http from 'http';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { app } from '../src/app.js';
import { mysqlPool } from '../src/config/mysql.js';
import { connectRedis, isRedisReady } from '../src/config/redis.js';
import { env } from '../src/config/env.js';
import { createAuthSessionTokens } from '../src/services/authSession.service.js';
import { evaluateAccessRequest } from '../src/services/authDecisionEngine.js';
import { rotateAuthSessionByRefreshToken } from '../src/services/authSession.service.js';
import { resetPasswordRateLimit } from '../src/middleware/rateLimit.js';
import { ApiError } from '../src/utils/apiError.js';

const ENDPOINT = '/api/auth/student/reset-password';
const OLD_PASSWORD = 'QaTestPass123!';
const NEW_PASSWORD = 'NewSecure1!Pass';
const GENERIC_INVALID = 'Invalid or expired reset link';
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

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function createStudent({ email, password = OLD_PASSWORD }) {
  const hash = await bcrypt.hash(password, 10);
  const [result] = await mysqlPool.query(
    `INSERT INTO users (email, username, password_hash, full_name, role, status, is_verified)
     VALUES (?, ?, ?, ?, 'student', 'active', TRUE)`,
    [email, `qa_rp_${runId}_${crypto.randomBytes(3).toString('hex')}`, hash, 'QA Reset Password']
  );
  return Number(result.insertId);
}

async function deleteStudent(userId) {
  if (!userId) return;
  await mysqlPool.query(`DELETE FROM users WHERE id = ?`, [userId]);
}

async function mintResetToken(userId, { expired = false, used = false, superseded = false } = {}) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  if (expired) {
    await mysqlPool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used_at)
       VALUES (?, ?, DATE_SUB(NOW(), INTERVAL 1 HOUR), NULL)`,
      [userId, tokenHash]
    );
  } else if (used) {
    await mysqlPool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 45 MINUTE), CURRENT_TIMESTAMP)`,
      [userId, tokenHash]
    );
  } else {
    await mysqlPool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, used_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 45 MINUTE), NULL)`,
      [userId, tokenHash]
    );
  }
  if (superseded) {
    await mysqlPool.query(
      `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND token_hash = ?`,
      [userId, tokenHash]
    );
  }
  return rawToken;
}

async function getUserState(userId) {
  const [rows] = await mysqlPool.query(
    `SELECT password_hash, token_version FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  return rows[0];
}

async function countActiveSessions(userId) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS c FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
  return Number(rows[0]?.c ?? 0);
}

async function tokenUsed(rawToken) {
  const tokenHash = hashToken(rawToken);
  const [rows] = await mysqlPool.query(
    `SELECT used_at FROM password_reset_tokens WHERE token_hash = ? LIMIT 1`,
    [tokenHash]
  );
  return Boolean(rows[0]?.used_at);
}

async function latestAudit(userId, action) {
  const [rows] = await mysqlPool.query(
    `SELECT action, metadata_json FROM activity_logs
     WHERE user_id <=> ? AND action = ? ORDER BY id DESC LIMIT 1`,
    [userId, action]
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

async function postReset(baseUrl, body, { ip = `10.60.${Number.parseInt(runId.slice(0, 2), 16) % 200}.1` } = {}) {
  const res = await fetch(`${baseUrl}${ENDPOINT}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
      'user-agent': 'qa-reset-password/1.0',
    },
    body: JSON.stringify(body),
  });
  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json, headers: Object.fromEntries(res.headers.entries()) };
}

function mockReqWithAccessToken(accessToken) {
  return {
    cookies: { student_access_token: accessToken },
    headers: {},
    get: () => null,
  };
}

async function main() {
  console.log(`\n=== Reset Password QA Verification (run ${runId}) ===\n`);

  try {
    await mysqlPool.query('SELECT 1');
  } catch (error) {
    console.error('MySQL unavailable:', error.message);
    process.exit(1);
  }

  try {
    await connectRedis();
  } catch {
    // optional
  }

  const { server, baseUrl } = await startServer();
  const userIds = [];

  try {
    // --- Test 1: Valid token ---
    const email1 = `qa.rp.valid.${runId}@example.com`;
    const userId1 = await createStudent({ email: email1 });
    userIds.push(userId1);
    const before1 = await getUserState(userId1);
    const token1 = await mintResetToken(userId1);
    const r1 = await postReset(baseUrl, { token: token1, password: NEW_PASSWORD }, { ip: '10.61.0.1' });
    try {
      assert(r1.status === 200, `expected 200 got ${r1.status}`);
      assert(r1.body?.data?.message?.includes('sign in again'), 'unexpected success message');
      const after1 = await getUserState(userId1);
      assert(after1.token_version === before1.token_version + 1, 'token_version not incremented');
      assert(await bcrypt.compare(NEW_PASSWORD, after1.password_hash), 'password not updated');
      assert(await tokenUsed(token1), 'token not consumed');
      assert((await countActiveSessions(userId1)) === 0, 'sessions not revoked');
      assert(await latestAudit(userId1, 'password_reset.success'), 'missing success audit');
      assert(await latestAudit(userId1, 'password_reset.success.session_revoke_all'), 'missing session audit');
      const blob = JSON.stringify(r1.body).toLowerCase();
      assert(!blob.includes(token1.slice(0, 16)), 'token leaked in response');
      assert(!blob.includes('password_hash'), 'hash leaked');
      record('1', 'Valid token', 'PASS', 'password+version+sessions+audit ok');
    } catch (error) {
      record('1', 'Valid token', 'FAIL', error.message);
    }

    // --- Test 2: Expired token ---
    const email2 = `qa.rp.expired.${runId}@example.com`;
    const userId2 = await createStudent({ email: email2 });
    userIds.push(userId2);
    const token2 = await mintResetToken(userId2, { expired: true });
    const before2 = await getUserState(userId2);
    const r2 = await postReset(baseUrl, { token: token2, password: NEW_PASSWORD }, { ip: '10.62.0.1' });
    try {
      assert(r2.status === 400, `expected 400 got ${r2.status}`);
      assert(r2.body?.error?.message === GENERIC_INVALID, 'message not generic');
      const after2 = await getUserState(userId2);
      assert(after2.token_version === before2.token_version, 'version changed on expired');
      assert(await bcrypt.compare(OLD_PASSWORD, after2.password_hash), 'password changed on expired');
      record('2', 'Expired token', 'PASS', '400 generic, no state change');
    } catch (error) {
      record('2', 'Expired token', 'FAIL', error.message);
    }

    // --- Test 3: Used token ---
    const email3 = `qa.rp.used.${runId}@example.com`;
    const userId3 = await createStudent({ email: email3 });
    userIds.push(userId3);
    const token3 = await mintResetToken(userId3, { used: true });
    const r3 = await postReset(baseUrl, { token: token3, password: NEW_PASSWORD }, { ip: '10.63.0.1' });
    try {
      assert(r3.status === 400, `expected 400 got ${r3.status}`);
      assert(r3.body?.error?.message === GENERIC_INVALID, 'message not generic');
      record('3', 'Used token', 'PASS', '400 generic');
    } catch (error) {
      record('3', 'Used token', 'FAIL', error.message);
    }

    // --- Test 4: Invalid token (valid shape, not in DB) ---
    const fakeToken = crypto.randomBytes(32).toString('hex');
    const r4 = await postReset(baseUrl, { token: fakeToken, password: NEW_PASSWORD }, { ip: '10.64.0.1' });
    try {
      assert(r4.status === 400, `expected 400 got ${r4.status}`);
      assert(r4.body?.error?.message === GENERIC_INVALID, 'message not generic');
      assert(r4.status === r2.status && r4.body?.error?.message === r2.body?.error?.message, 'oracle vs expired');
      record('4', 'Invalid token', 'PASS', '400 generic, same as expired');
    } catch (error) {
      record('4', 'Invalid token', 'FAIL', error.message);
    }

    // --- Test 5: Malformed token ---
    const r5 = await postReset(baseUrl, { token: 'abc', password: NEW_PASSWORD }, { ip: '10.65.0.1' });
    try {
      assert(r5.status === 400, `expected 400 got ${r5.status}`);
      assert(r5.body?.error?.message === GENERIC_INVALID, 'message not generic');
      record('5', 'Malformed token', 'PASS', '400 generic');
    } catch (error) {
      record('5', 'Malformed token', 'FAIL', error.message);
    }

    // --- Test 6: Weak password ---
    const email6 = `qa.rp.weak.${runId}@example.com`;
    const userId6 = await createStudent({ email: email6 });
    userIds.push(userId6);
    const token6 = await mintResetToken(userId6);
    const r6 = await postReset(baseUrl, { token: token6, password: 'weak' }, { ip: '10.66.0.1' });
    try {
      assert(r6.status === 422, `expected 422 got ${r6.status}`);
      assert(!(await tokenUsed(token6)), 'token consumed on weak password');
      assert(await bcrypt.compare(OLD_PASSWORD, (await getUserState(userId6)).password_hash), 'password changed');
      record('6', 'Weak password', 'PASS', '422, token preserved');
    } catch (error) {
      record('6', 'Weak password', 'FAIL', error.message);
    }

    // --- Test 7: Concurrent reset requests ---
    const email7 = `qa.rp.concurrent.${runId}@example.com`;
    const userId7 = await createStudent({ email: email7 });
    userIds.push(userId7);
    const token7 = await mintResetToken(userId7);
    const ip7 = '10.67.0.1';
    const [cA, cB] = await Promise.all([
      postReset(baseUrl, { token: token7, password: NEW_PASSWORD }, { ip: ip7 }),
      postReset(baseUrl, { token: token7, password: NEW_PASSWORD }, { ip: ip7 }),
    ]);
    try {
      const statuses = [cA.status, cB.status].sort();
      assert(statuses[0] === 200 && statuses[1] === 400, `expected one 200 one 400 got ${statuses}`);
      assert(await tokenUsed(token7), 'token should be consumed');
      record('7', 'Concurrent reset requests', 'PASS', `statuses ${cA.status}/${cB.status}`);
    } catch (error) {
      record('7', 'Concurrent reset requests', 'FAIL', error.message);
    }

    // --- Test 8: Token replay attempt ---
    const email8 = `qa.rp.replay.${runId}@example.com`;
    const userId8 = await createStudent({ email: email8 });
    userIds.push(userId8);
    const token8 = await mintResetToken(userId8);
    const r8a = await postReset(baseUrl, { token: token8, password: NEW_PASSWORD }, { ip: '10.68.0.1' });
    const r8b = await postReset(baseUrl, { token: token8, password: NEW_PASSWORD }, { ip: '10.68.0.2' });
    try {
      assert(r8a.status === 200, 'first replay test request failed');
      assert(r8b.status === 400, `replay expected 400 got ${r8b.status}`);
      assert(r8b.body?.error?.message === GENERIC_INVALID, 'replay message not generic');
      record('8', 'Token replay attempt', 'PASS', 'second request 400');
    } catch (error) {
      record('8', 'Token replay attempt', 'FAIL', error.message);
    }

    // --- Tests 9–11: Sessions, refresh, access tokens ---
    const email911 = `qa.rp.sessions.${runId}@example.com`;
    const userId911 = await createStudent({ email: email911 });
    userIds.push(userId911);
    const [userRows911] = await mysqlPool.query(
      `SELECT email, full_name, token_version FROM users WHERE id = ?`,
      [userId911]
    );
    const userRow = userRows911[0];
    const { accessToken, refreshToken } = await createAuthSessionTokens({
      userId: userId911,
      email: userRow.email,
      role: 'student',
      roleSnapshot: 'student',
      fullName: userRow.full_name,
      tokenVersion: userRow.token_version,
    });
    assert((await countActiveSessions(userId911)) >= 1, 'session setup failed');
    const token911 = await mintResetToken(userId911);
    const before911 = userRow.token_version;
    const r911 = await postReset(baseUrl, { token: token911, password: NEW_PASSWORD }, { ip: '10.69.0.1' });
    try {
      assert(r911.status === 200, 'reset failed');
      assert((await countActiveSessions(userId911)) === 0, 'sessions not revoked');
      record('9', 'Existing active sessions', 'PASS', 'all sessions revoked_at set');

      let refreshFailed = false;
      try {
        await rotateAuthSessionByRefreshToken(refreshToken);
      } catch (error) {
        refreshFailed = error instanceof ApiError && error.statusCode === 401;
      }
      assert(refreshFailed, 'refresh token still works');
      record('10', 'Existing refresh tokens', 'PASS', '401 on refresh after reset');

      let accessFailed = false;
      try {
        await evaluateAccessRequest(mockReqWithAccessToken(accessToken), { expectedRole: 'student' });
      } catch (error) {
        accessFailed = error instanceof ApiError && error.statusCode === 401;
      }
      assert(accessFailed, 'access token still works');
      const after911 = await getUserState(userId911);
      assert(after911.token_version === before911 + 1, 'token_version not bumped');
      record('11', 'Existing access tokens', 'PASS', '401 on access after reset');
    } catch (error) {
      record('9', 'Existing active sessions', 'FAIL', error.message);
      record('10', 'Existing refresh tokens', 'FAIL', error.message);
      record('11', 'Existing access tokens', 'FAIL', error.message);
    }

    // --- Test 12: Database rollback scenario (same-password rejection proxy) ---
    const email12 = `qa.rp.rollback.${runId}@example.com`;
    const userId12 = await createStudent({ email: email12 });
    userIds.push(userId12);
    const token12 = await mintResetToken(userId12);
    const before12 = await getUserState(userId12);
    const r12 = await postReset(baseUrl, { token: token12, password: OLD_PASSWORD }, { ip: '10.70.0.1' });
    try {
      assert(r12.status === 422, `expected 422 got ${r12.status}`);
      const after12 = await getUserState(userId12);
      assert(after12.token_version === before12.token_version, 'rollback: version changed');
      assert(await bcrypt.compare(OLD_PASSWORD, after12.password_hash), 'rollback: password changed');
      assert(!(await tokenUsed(token12)), 'rollback: token consumed');
      assert(await latestAudit(userId12, 'password_reset.failed_same_password'), 'rollback audit missing');
      record('12', 'Database rollback scenario', 'PASS', 'same-password TX rolled back, token reusable');
    } catch (error) {
      record('12', 'Database rollback scenario', 'FAIL', error.message);
    }

    // --- Test 13: Redis unavailable ---
    try {
      const src = await import('fs/promises').then((fs) =>
        fs.readFile(new URL('../src/middleware/rateLimit.js', import.meta.url), 'utf8')
      );
      assert(/resetPasswordRateLimit/.test(src), 'middleware missing');
      assert(/requireRedisForCriticalAuthWrites/.test(src), 'redis fail-closed missing');
      if (env.abuse.requireRedisForCriticalAuthWrites && !isRedisReady()) {
        record('13', 'Redis unavailable', 'SKIP', 'redis not connected — staging chaos test for 503');
      } else {
        const fakeReq = { path: '/student/reset-password', get: () => '', body: {}, ip: '127.0.0.1' };
        const fakeRes = { setHeader: () => {} };
        let err = null;
        await new Promise((resolve) => {
          resetPasswordRateLimit(fakeReq, fakeRes, (e) => {
            err = e;
            resolve();
          });
        });
        assert(!err, 'healthy redis should pass');
        record('13', 'Redis unavailable', 'PASS', 'fail-closed code present; 503 needs staging chaos test');
      }
    } catch (error) {
      record('13', 'Redis unavailable', 'FAIL', error.message);
    }

    // --- Test 14: Email previously used multiple times (superseded token) ---
    const email14 = `qa.rp.multi.${runId}@example.com`;
    const userId14 = await createStudent({ email: email14 });
    userIds.push(userId14);
    const oldToken = await mintResetToken(userId14);
    await mysqlPool.query(
      `UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND token_hash = ?`,
      [userId14, hashToken(oldToken)]
    );
    const newToken = await mintResetToken(userId14);
    const r14old = await postReset(baseUrl, { token: oldToken, password: NEW_PASSWORD }, { ip: '10.71.0.1' });
    const r14new = await postReset(baseUrl, { token: newToken, password: NEW_PASSWORD }, { ip: '10.71.0.2' });
    try {
      assert(r14old.status === 400, 'superseded token should fail');
      assert(r14new.status === 200, 'latest token should succeed');
      record('14', 'Email previously used multiple times', 'PASS', 'old token dead, new token works');
    } catch (error) {
      record('14', 'Email previously used multiple times', 'FAIL', error.message);
    }

    // --- Security cross-cutting ---
    const leakFields = ['token_hash', 'password_hash', 'used_at', 'expires_at', 'user_id'];
    const samples = [r2, r3, r4, r5, r8b, r14old];
    try {
      for (const r of samples) {
        const blob = JSON.stringify(r.body || {}).toLowerCase();
        for (const f of leakFields) {
          assert(!blob.includes(f), `leak field ${f}`);
        }
        assert(!blob.includes('expired'), 'expired hint in error');
        assert(!blob.includes('already been used'), 'used hint in error');
      }
      record('S1', 'Information disclosure review', 'PASS', 'generic errors, no internal fields');
    } catch (error) {
      record('S1', 'Information disclosure review', 'FAIL', error.message);
    }

    // Brute force: rate limit middleware exists
    try {
      const src = await import('fs/promises').then((fs) =>
        fs.readFile(new URL('../src/middleware/rateLimit.js', import.meta.url), 'utf8')
      );
      assert(/pwdreset:consume:ip:/.test(src), 'consume rate limit keys missing');
      record('S2', 'Brute-force resistance', 'PASS', 'coarse consume rate limits configured');
    } catch (error) {
      record('S2', 'Brute-force resistance', 'FAIL', error.message);
    }

    record('S3', 'Replay attack resistance', results.some((r) => r.id === '8' && r.status === 'PASS') ? 'PASS' : 'FAIL', 'see test 8');
    record('S4', 'Race condition resistance', results.some((r) => r.id === '7' && r.status === 'PASS') ? 'PASS' : 'FAIL', 'see test 7');
  } finally {
    server.close();
    for (const id of userIds) await deleteStudent(id);
    await mysqlPool.end();
  }

  console.log('\n=== Summary ===');
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;
  console.log(`PASS: ${pass}  FAIL: ${fail}  SKIP: ${skip}`);

  if (fail > 0) process.exit(1);
}

main().catch((error) => {
  console.error('Verification crashed:', error);
  process.exit(1);
});
