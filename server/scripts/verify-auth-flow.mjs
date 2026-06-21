/**
 * Integration checks for auth refresh, logout, and session stability.
 * Run from server directory: npm run test:auth
 * Requires .env (MySQL, JWT secrets). Set TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD (or TEST_ADMIN_PASSWORD + ADMIN_EMAIL).
 */
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import { mysqlPool } from '../src/config/mysql.js';
import { loginAdmin } from '../src/services/adminAuth.service.js';
import {
  revokeAuthSessionByRefreshToken,
  rotateAuthSessionByRefreshToken,
} from '../src/services/authSession.service.js';
import { verifyEmailByToken } from '../src/services/emailVerification.service.js';
import { ApiError } from '../src/utils/apiError.js';
import { env } from '../src/config/env.js';
import { parseJwtDurationMs } from '../src/utils/jwtDuration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function revokeAllAndBumpTokenVersion(userId) {
  await mysqlPool.query(
    `UPDATE users SET token_version = token_version + 1 WHERE id = ?`,
    [userId]
  );
  await mysqlPool.query(
    `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE user_id = ?`,
    [userId]
  );
}

async function main() {
  const controllerPath = path.resolve(__dirname, '../src/controllers/auth.controller.js');
  const controllerSource = await fs.readFile(controllerPath, 'utf8');
  const sendSuccessCalls = controllerSource.match(/sendSuccess\s*\([\s\S]*?\);/g) ?? [];
  assert(sendSuccessCalls.length > 0, 'auth.controller must use sendSuccess for auth responses');
  for (const call of sendSuccessCalls) {
    assert(!/\baccessToken\b/.test(call), 'auth sendSuccess responses must not expose accessToken');
  }
  assert(!/res\.json\s*\([\s\S]*?\baccessToken\b/.test(controllerSource), 'auth responses must not expose accessToken via res.json');
  const testsRoutesPath = path.resolve(__dirname, '../src/routes/tests.routes.js');
  const testsRoutesSource = await fs.readFile(testsRoutesPath, 'utf8');
  assert(
    /router\.post\('\/:slug\/verify-code',\s*postVerifyTestCode\)/.test(testsRoutesSource),
    'tests verify-code route must be registered'
  );
  const { matchProtectionRule } = await import('../src/security/cee/protectionGrid.js');
  const verifyCodeRule = matchProtectionRule('/api/tests/demo-slug/verify-code');
  assert(
    verifyCodeRule?.policy === 'entitlement' && verifyCodeRule?.label === 'tests',
    'tests verify-code route must be protected by CEE entitlement grid rule'
  );
  const entitlementGuardPath = path.resolve(__dirname, '../src/security/cee/entitlementGuard.js');
  const entitlementGuardSource = await fs.readFile(entitlementGuardPath, 'utf8');
  assert(
    /assertStudentIdentity\([\s\S]*requireVerified:\s*true/.test(entitlementGuardSource),
    'entitlement guard must require verified student identity'
  );
  const authRoutesPath = path.resolve(__dirname, '../src/routes/auth.routes.js');
  const authRoutesSource = await fs.readFile(authRoutesPath, 'utf8');
  assert(!/student\/verify-mrb-enrollment/.test(authRoutesSource), 'student verify-mrb-enrollment route must be removed');
  assert(
    /student\/register',\s*authRateLimit,\s*signupAbuseRateLimit,\s*studentRegister/.test(authRoutesSource),
    'student register route must enforce signup abuse limiter'
  );
  assert(!/router\.get\('\/verify-email'/.test(authRoutesSource), 'verify-email GET route must be removed');
  const rateLimitPath = path.resolve(__dirname, '../src/middleware/rateLimit.js');
  const rateLimitSource = await fs.readFile(rateLimitPath, 'utf8');
  assert(/verify:subnet:/.test(rateLimitSource), 'verify endpoint must include subnet limiter');
  assert(
    /isProductionRateLimitRedisUnavailable\(\)/.test(rateLimitSource) &&
      /forgotPasswordRateLimit[\s\S]*isProductionRateLimitRedisUnavailable/.test(rateLimitSource) &&
      /resetPasswordRateLimit[\s\S]*isProductionRateLimitRedisUnavailable/.test(rateLimitSource),
    'critical auth writes must fail closed when production redis is unavailable'
  );
  const emailProviderRoutePath = path.resolve(__dirname, '../src/routes/emailProvider.routes.js');
  const emailProviderRouteSource = await fs.readFile(emailProviderRoutePath, 'utf8');
  assert(/provider-feedback/.test(emailProviderRouteSource), 'provider feedback route must exist');
  const studentApiPath = path.resolve(__dirname, '../../client/src/api/studentApi.js');
  const studentApiSource = await fs.readFile(studentApiPath, 'utf8');
  assert(
    /verifyEmail:\s*\(token\)\s*=>\s*[\s\S]*studentRequest\('\/auth\/verify-email',\s*\{\s*method:\s*'POST'/m.test(studentApiSource),
    'frontend verifyEmail must POST token in body'
  );
  assert(
    !/verify-email\?token=/.test(studentApiSource),
    'frontend verifyEmail must not send token in query string'
  );
  const envSource = await fs.readFile(path.resolve(__dirname, '../src/config/env.js'), 'utf8');
  assert(/refreshExpiresIn: process\.env\.JWT_REFRESH_EXPIRES_IN \|\| '90d'/.test(envSource), 'refresh JWT default must be 90d');
  const authControllerSource = await fs.readFile(controllerPath, 'utf8');
  assert(
    /maxAge: env\.security\.refreshCookieMaxAgeMs/.test(authControllerSource),
    'CSRF cookie maxAge must align with refresh lifetime'
  );
  assert(env.jwt.refreshExpiresIn === '90d' || env.jwt.refreshExpiresIn.endsWith('d'), 'refresh JWT env must be configured');
  assert(
    env.security.refreshCookieMaxAgeMs === parseJwtDurationMs(env.jwt.refreshExpiresIn),
    'refresh cookie maxAge must match JWT_REFRESH_EXPIRES_IN'
  );

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
  const refreshExp = jwt.decode(rt).exp;
  const expectedRefreshMs = parseJwtDurationMs(env.jwt.refreshExpiresIn);
  const refreshTtlMs = refreshExp * 1000 - Date.now();
  assert(refreshTtlMs > expectedRefreshMs - 5 * 60 * 1000, 'refresh JWT TTL must match configured lifetime');
  const [sessionRows] = await mysqlPool.query(
    `SELECT expires_at FROM auth_sessions WHERE id = ? LIMIT 1`,
    [sid]
  );
  const sessionExpMs = new Date(sessionRows[0].expires_at).getTime();
  assert(Math.abs(sessionExpMs - refreshExp * 1000) < 5000, 'auth_sessions.expires_at must match refresh JWT exp');
  results.push(['Refresh lifetime: JWT + auth_sessions aligned', 'pass']);

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
  assert(fulfilled.length >= 1, 'parallel refresh: at least one success');
  assert((await getActiveSessionCount(userId)) === 1, 'parallel must not revoke all sessions');
  const parallelRt =
    fulfilled.map((x) => x.value?.refreshToken).find((token) => typeof token === 'string' && token.length > 0) ??
    rtCurrent;
  if (rejected.length === 1) {
    const failReason = rejected[0].reason;
    assert(failReason instanceof ApiError && failReason.statusCode === 401, 'parallel loser is 401 when not grace-handled');
  }
  results.push(['Parallel double refresh: session survives, no mass revoke', 'pass']);

  const graceReplay = await rotateAuthSessionByRefreshToken(rtCurrent);
  assert(graceReplay.graceReplay === true, 'stale token within grace replays idempotently');
  assert(graceReplay.skipRefreshCookie === true, 'grace replay keeps current refresh cookie');
  assert((await getActiveSessionCount(userId)) === 1, 'grace replay must not revoke session');
  results.push(['Grace replay with stale refresh: idempotent access re-issue', 'pass']);

  try {
    await rotateAuthSessionByRefreshToken(rtCurrent);
    throw new Error('expected stale rotate outside grace to throw or grace again');
  } catch (e) {
    if (!(e instanceof ApiError && e.statusCode === 401)) {
      const again = await rotateAuthSessionByRefreshToken(rtCurrent);
      assert(again.graceReplay === true, 'repeated grace replay remains idempotent within window');
    }
  }
  assert((await getActiveSessionCount(userId)) === 1, 'stale attempt must not nuke sessions');
  results.push(['Stale refresh after winner: session remains active', 'pass']);

  const replayLogin = await loginAdmin(email, password);
  const replayUserId = replayLogin.admin.id;
  const stableCtx = { clientIp: '127.0.0.1', userAgent: 'Mozilla/5.0 TestBrowser' };
  const replaySeed = replayLogin.refreshToken;
  await rotateAuthSessionByRefreshToken(replaySeed, stableCtx);
  const tvReplayBefore = await getTokenVersion(replayUserId);
  try {
    await rotateAuthSessionByRefreshToken(replaySeed, {
      clientIp: '127.0.0.1',
      userAgent: 'curl/8.0 stolen-token',
    });
    throw new Error('expected high-risk replay to throw');
  } catch (e) {
    assert(e instanceof ApiError && e.statusCode === 401, 'high-risk replay is 401');
    assert(e.code === 'REFRESH_REPLAY_REJECTED', 'high-risk replay error code');
  }
  assert((await getActiveSessionCount(replayUserId)) === 0, 'high-risk replay revokes session');
  assert((await getTokenVersion(replayUserId)) === tvReplayBefore + 1, 'high-risk replay bumps token_version');
  results.push(['High-risk replay (UA mismatch): session revoked', 'pass']);

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

  // Simulate verification-time security transition:
  // token_version bump + revoke all sessions should invalidate stale refresh immediately.
  const login3 = await loginAdmin(email, password);
  const userId3 = login3.admin.id;
  const staleRefresh = login3.refreshToken;
  await revokeAllAndBumpTokenVersion(userId3);
  try {
    await rotateAuthSessionByRefreshToken(staleRefresh);
    throw new Error('expected stale refresh after revoke-all+bump to fail');
  } catch (e) {
    assert(e instanceof ApiError && e.statusCode === 401, 'stale refresh after revoke-all+bump is 401');
  }
  assert((await getActiveSessionCount(userId3)) === 0, 'no active sessions after revoke-all+bump');
  results.push(['Stale session invalidation (revoke-all+bump) blocks refresh', 'pass']);

  // Token replay/race simulation: one verify succeeds, one fails.
  const replayToken = crypto.randomBytes(32).toString('hex');
  const replayHash = crypto.createHash('sha256').update(replayToken).digest('hex');
  await mysqlPool.query(
    `INSERT INTO email_verifications (user_id, token_hash, expires_at, used_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), NULL)`,
    [userId, replayHash]
  );
  const [v1, v2] = await Promise.allSettled([
    verifyEmailByToken({ rawToken: replayToken, ipAddress: '127.0.0.1', userAgent: 'test-agent-a' }),
    verifyEmailByToken({ rawToken: replayToken, ipAddress: '127.0.0.2', userAgent: 'test-agent-b' }),
  ]);
  const verifyPass = [v1, v2].filter((x) => x.status === 'fulfilled').length;
  const verifyFail = [v1, v2].filter((x) => x.status === 'rejected').length;
  assert(verifyPass === 1 && verifyFail === 1, 'parallel verify consumes token exactly once');
  results.push(['Parallel verify replay: one success, one failure', 'pass']);

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
