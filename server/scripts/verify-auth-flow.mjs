/**
 * Integration checks for auth refresh, logout, and session stability.
 * Run from server directory: npm run test:auth
 * Requires .env (MySQL, JWT secrets). Set TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD (or TEST_ADMIN_PASSWORD + ADMIN_EMAIL).
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { mysqlPool } from '../src/config/mysql.js';
import { loginAdmin } from '../src/services/adminAuth.service.js';
import {
  revokeAuthSessionByRefreshToken,
  rotateAuthSessionByRefreshToken,
} from '../src/services/authSession.service.js';
import { ApiError } from '../src/utils/apiError.js';

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function getActiveSessionCount(userId) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS c FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
  return Number(rows[0]?.c ?? 0);
}

async function getTokenVersion(userId) {
  const [rows] = await mysqlPool.query(`SELECT token_version FROM users WHERE id = ? LIMIT 1`, [userId]);
  return Number(rows[0]?.token_version ?? 0);
}

async function main() {
  const email = process.env.TEST_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('SKIP: set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run integration checks.');
    return;
  }

  const results = [];

  let login1 = await loginAdmin(email, password);
  const userId = login1.admin.id;
  let rt = login1.refreshToken;
  const sid = jwt.decode(rt).sid;
  const jti0 = jwt.decode(rt).jti;

  const r1 = await rotateAuthSessionByRefreshToken(rt);
  assert(jwt.decode(r1.refreshToken).sid === sid, 'sid same after first rotate');
  assert(jwt.decode(r1.refreshToken).jti !== jti0, 'jti changes after first rotate');
  results.push(['Refresh #1: sid stable, jti rotates', 'pass']);

  const jti1 = jwt.decode(r1.refreshToken).jti;
  const r2 = await rotateAuthSessionByRefreshToken(r1.refreshToken);
  assert(jwt.decode(r2.refreshToken).sid === sid, 'sid same after second rotate');
  assert(jwt.decode(r2.refreshToken).jti !== jti1, 'jti changes after second rotate');
  results.push(['Refresh #2: sid stable, jti rotates', 'pass']);

  const rtCurrent = r2.refreshToken;
  const c0 = await getActiveSessionCount(userId);
  assert(c0 === 1, `expected 1 active session, got ${c0}`);

  const [a, b] = await Promise.allSettled([
    rotateAuthSessionByRefreshToken(rtCurrent),
    rotateAuthSessionByRefreshToken(rtCurrent),
  ]);
  const fulfilled = [a, b].filter((x) => x.status === 'fulfilled');
  const rejected = [a, b].filter((x) => x.status === 'rejected');
  assert(fulfilled.length === 1, 'parallel refresh: exactly one success');
  assert(rejected.length === 1, 'parallel refresh: exactly one failure');
  const parallelRt = fulfilled[0].value.refreshToken;
  const failReason = rejected[0].reason;
  assert(failReason instanceof ApiError && failReason.statusCode === 401, 'parallel loser is 401');
  assert((await getActiveSessionCount(userId)) === 1, 'parallel must not revoke all sessions');
  results.push(['Parallel double refresh: one 401, session survives', 'pass']);

  try {
    await rotateAuthSessionByRefreshToken(rtCurrent);
    throw new Error('expected stale rotate to throw');
  } catch (e) {
    assert(e instanceof ApiError && e.statusCode === 401, 'stale refresh is 401');
  }
  assert((await getActiveSessionCount(userId)) === 1, 'stale attempt must not nuke sessions');
  results.push(['Stale refresh after winner: 401, one active session', 'pass']);

  const tvBefore = await getTokenVersion(userId);
  await revokeAuthSessionByRefreshToken(parallelRt);
  const tvAfter = await getTokenVersion(userId);
  assert(tvAfter === tvBefore + 1, 'logout increments token_version');
  assert((await getActiveSessionCount(userId)) === 0, 'no active row after logout');
  results.push(['Logout: token_version +1, session deleted', 'pass']);

  const accessPayload = jwt.decode(r2.accessToken);
  const [sessRows] = await mysqlPool.query(
    `SELECT id FROM auth_sessions WHERE id = ? AND user_id = ? AND revoked_at IS NULL LIMIT 1`,
    [accessPayload.sid, accessPayload.id]
  );
  assert(!sessRows[0], 'access sid must not resolve after logout');
  assert(Number(accessPayload.tokenVersion) === tvBefore && tvBefore !== tvAfter, 'access tv stale vs user');
  results.push(['Access token invalidated (session row + token_version)', 'pass']);

  login1 = await loginAdmin(email, password);
  const sidA = jwt.decode(login1.refreshToken).sid;
  const login2 = await loginAdmin(email, password);
  const sidB = jwt.decode(login2.refreshToken).sid;
  assert(sidA !== sidB, 'second login issues new sid');
  try {
    await rotateAuthSessionByRefreshToken(login1.refreshToken);
    throw new Error('expected superseded');
  } catch (e) {
    assert(e instanceof ApiError && e.statusCode === 401, 'superseded refresh is 401');
  }
  await revokeAuthSessionByRefreshToken(login2.refreshToken);
  results.push(['Re-login supersedes old refresh; cleanup logout', 'pass']);

  const [delSample] = await mysqlPool.query(
    `SELECT COUNT(*) AS c FROM auth_sessions WHERE expires_at < NOW() OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL 400 DAY)`
  );
  results.push([`DB retention query runnable (sample rows: ${delSample[0]?.c})`, 'pass']);

  for (const [name, status] of results) {
    console.log(`${status.toUpperCase()}: ${name}`);
  }
  console.log('\nCookie / browser refresh: verify manually (Set-Cookie on POST /api/auth/refresh).');
  console.log('All automated integration checks passed.');
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exit(1);
} finally {
  await mysqlPool.end().catch(() => {});
}
