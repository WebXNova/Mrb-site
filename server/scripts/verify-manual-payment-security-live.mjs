/**
 * Live HTTP security verification for manual payments (Issues 1, 3, 4).
 * Run: node scripts/verify-manual-payment-security-live.mjs
 * Requires: server running on PORT (default 4000), MySQL reachable.
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { mysqlPool, verifyMySqlConnection } from '../src/config/mysql.js';
import { scopedQueryBypass } from '../src/security/cee/db/scopedQuery.js';
import { ensureManualPaymentsSchema } from '../src/db/ensureManualPaymentsSchema.js';
import { resetSlidingWindowMemoryForTests } from '../src/services/slidingWindowRateLimit.service.js';
import { insertManualPaymentForTests, deleteManualPaymentsForTests } from '../src/services/manualPayments.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = `http://127.0.0.1:${process.env.PORT || 4000}`;
const ORIGIN = process.env.LIVE_TEST_ORIGIN || 'http://localhost:5173';
const ADMIN_MOUNT = `/api/admin/${process.env.ADMIN_SECRET_PATH || '0itMow1FhXWgW0BzTVc0VbMq'}`;
const TEMP_PASSWORD = 'LiveTest!Sec2026';

const logs = [];
let passed = 0;
let failed = 0;

function logSection(title) {
  console.log(`\n=== ${title} ===`);
  logs.push(`\n=== ${title} ===`);
}

function logHttp(label, req, res, body) {
  const block = [
    `--- ${label} ---`,
    `REQUEST: ${req.method} ${req.url}`,
    req.headers ? `  Headers: ${JSON.stringify(req.headers)}` : '',
    req.bodySummary ? `  Body: ${req.bodySummary}` : '',
    `RESPONSE: ${res.status} ${res.statusText || ''}`.trim(),
    `  Body: ${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`,
  ]
    .filter(Boolean)
    .join('\n');
  console.log(block);
  logs.push(block);
}

function ok(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
    logs.push(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
    logs.push(`  ✗ ${label}`);
  }
}

function parseSetCookie(setCookie) {
  const jar = {};
  const parts = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const raw of parts) {
    const [pair] = String(raw).split(';');
    const idx = pair.indexOf('=');
    if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return jar;
}

function mergeCookies(jar, setCookieHeader) {
  return { ...jar, ...parseSetCookie(setCookieHeader) };
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function http(method, urlPath, { cookies = {}, csrf = null, body = null, multipart = null } = {}) {
  const headers = {
    Origin: ORIGIN,
    Accept: 'application/json',
  };
  const cookieJar = { ...cookies };
  if (csrf === null) {
    delete headers['x-csrf-token'];
  } else if (cookieJar.csrf_token && csrf) {
    headers['x-csrf-token'] = csrf;
  } else if (cookieJar.csrf_token) {
    headers['x-csrf-token'] = cookieJar.csrf_token;
  }

  if (cookieHeader(cookieJar)) headers.Cookie = cookieHeader(cookieJar);

  let fetchBody = body;
  let bodySummary = null;
  if (multipart) {
    fetchBody = multipart;
    bodySummary = '[multipart form-data]';
  } else if (body != null) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
    bodySummary = fetchBody;
  }

  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body: fetchBody });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  const setCookie = res.headers.getSetCookie?.() ?? [];
  const nextCookies = mergeCookies(cookieJar, setCookie.length ? setCookie : res.headers.get('set-cookie'));

  return {
    status: res.status,
    statusText: res.statusText,
    body: parsed,
    rawBody: text,
    cookies: nextCookies,
    retryAfter: res.headers.get('retry-after'),
    req: { method, url: urlPath, headers, bodySummary },
    res: { status: res.status, statusText: res.statusText },
  };
}

async function fetchCsrf() {
  const r = await http('GET', '/api/auth/csrf-session');
  return r;
}

async function loginStudent(identifier, password) {
  let r = await fetchCsrf();
  r = await http('POST', '/api/auth/student/login', {
    cookies: r.cookies,
    csrf: r.cookies.csrf_token,
    body: { identifier, password },
  });
  return r;
}

async function loginAdmin(email, password) {
  let r = await fetchCsrf();
  r = await http('GET', `${ADMIN_MOUNT}/auth/csrf-session`, { cookies: r.cookies });
  r = await http('POST', `${ADMIN_MOUNT}/auth/login`, {
    cookies: r.cookies,
    csrf: r.cookies.csrf_token,
    body: { email, password },
  });
  return r;
}

async function waitForServer(maxMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (r.ok || r.status < 500) return true;
    } catch {
      /* retry */
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function insertableEnrollmentColumns() {
  const [cols] = await mysqlPool.query(
    `SELECT COLUMN_NAME AS name, EXTRA AS extra
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrollments'`
  );
  return cols.filter((col) => !String(col.extra || '').toUpperCase().includes('GENERATED') && col.name !== 'id');
}

async function listAllCourseIdsForSeed() {
  const db = scopedQueryBypass({
    reason: 'admin_job:live_test_seed_v1',
    context: 'admin.scripts.verifyManualPayment',
  });
  const [rows] = await db.execute(`SELECT id FROM courses ORDER BY id ASC`);
  return rows;
}

async function createPendingOrderForUser(userId, stamp) {
  const [[template]] = await mysqlPool.query(`SELECT * FROM enrollments ORDER BY id DESC LIMIT 1`);
  if (!template) return null;
  const courses = await listAllCourseIdsForSeed();
  const [existing] = await mysqlPool.query(`SELECT course_id FROM enrollments WHERE user_id = ?`, [userId]);
  const taken = new Set(existing.map((row) => Number(row.course_id)));
  const course = courses.find((row) => !taken.has(Number(row.id)));
  if (!course) return null;

  const columns = await insertableEnrollmentColumns();
  const values = columns.map((col) => {
    const name = String(col.name);
    if (name === 'user_id') return userId;
    if (name === 'course_id') return Number(course.id);
    if (name === 'order_id') return null;
    if (name === 'email') return `live-sec-${stamp}-${userId}@example.test`;
    if (name === 'status') return 'pending';
    if (name === 'access_status') return 'inactive';
    if (name === 'enrollment_source') return 'paid';
    if (['admin_note', 'reviewed_by', 'reviewed_at', 'switch_confirmed_at'].includes(name)) return null;
    return template[name] ?? null;
  });

  const [enrollResult] = await mysqlPool.query(
    `INSERT INTO enrollments (${columns.map((c) => `\`${c.name}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    values
  );
  const enrollmentId = Number(enrollResult.insertId);
  const [orderResult] = await mysqlPool.query(
    `INSERT INTO orders (user_id, course_id, enrollment_id, gateway, amount, currency, status)
     VALUES (?, ?, ?, 'manual', 5000, 'PKR', 'pending')`,
    [userId, Number(course.id), enrollmentId]
  );
  const orderId = Number(orderResult.insertId);
  await mysqlPool.query(`UPDATE enrollments SET order_id = ? WHERE id = ?`, [orderId, enrollmentId]);
  return { orderId, enrollmentId, userId };
}

function tinyPngPath() {
  const p = path.join(os.tmpdir(), `mp-live-${Date.now()}.png`);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(p, png);
  return p;
}

async function postSubmitMultipart(cookies, orderId, trxSuffix) {
  const png = tinyPngPath();
  const form = new FormData();
  form.append('payment_method', 'easypaisa');
  form.append('sender_phone_number', '03001234567');
  form.append('sender_account_title', 'Live Test');
  form.append('transaction_id', `LIVE${trxSuffix}${Date.now()}`);
  form.append('amount_claimed', '5000');
  form.append('screenshot', new Blob([fs.readFileSync(png)], { type: 'image/png' }), 'proof.png');
  fs.unlinkSync(png);

  const headers = { Origin: ORIGIN, Cookie: cookieHeader(cookies), 'x-csrf-token': cookies.csrf_token };
  const res = await fetch(`${BASE}/api/payments/manual/${orderId}/submit`, { method: 'POST', headers, body: form });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return {
    status: res.status,
    body,
    rawBody: text,
    retryAfter: res.headers.get('retry-after'),
    req: { method: 'POST', url: `/api/payments/manual/${orderId}/submit`, headers: { Origin: ORIGIN, 'x-csrf-token': '[set]' }, bodySummary: '[multipart]' },
    res: { status: res.status, statusText: res.statusText },
  };
}

async function setTempPassword(userId) {
  const [[row]] = await mysqlPool.query(`SELECT password_hash FROM users WHERE id = ?`, [userId]);
  const originalHash = row?.password_hash ?? null;
  const hash = await bcrypt.hash(TEMP_PASSWORD, 10);
  await mysqlPool.query(`UPDATE users SET password_hash = ?, is_verified = 1, status = 'active' WHERE id = ?`, [
    hash,
    userId,
  ]);
  return originalHash;
}

async function restorePassword(userId, originalHash) {
  if (originalHash) {
    await mysqlPool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [originalHash, userId]);
  }
}

// --- main ---
console.log(`Live manual-payment security verification → ${BASE}`);

if (!(await waitForServer())) {
  console.error(`Server not reachable at ${BASE}. Start with: npm run dev (in server/)`);
  process.exit(1);
}

await verifyMySqlConnection();
await ensureManualPaymentsSchema(mysqlPool);

const createdEnrollmentIds = [];
const createdOrderIds = [];
const createdPaymentIds = [];
const passwordRestore = [];
let adminUser = null;
let adminOriginalHash = null;

try {
  const [students] = await mysqlPool.query(
    `SELECT id, email FROM users WHERE role = 'student' ORDER BY id ASC LIMIT 2`
  );
  if (students.length < 2) throw new Error('Need at least 2 student users in DB');

  const studentA = students[0];
  const studentB = students[1];
  const stamp = `${Date.now()}`.slice(-8);

  passwordRestore.push([studentA.id, await setTempPassword(studentA.id)]);
  passwordRestore.push([studentB.id, await setTempPassword(studentB.id)]);

  const orderA = await createPendingOrderForUser(Number(studentA.id), `${stamp}A`);
  const orderB = await createPendingOrderForUser(Number(studentB.id), `${stamp}B`);
  if (!orderA || !orderB) throw new Error('Could not seed pending orders');
  createdEnrollmentIds.push(orderA.enrollmentId, orderB.enrollmentId);
  createdOrderIds.push(orderA.orderId, orderB.orderId);

  const loginA = await loginStudent(studentA.email, TEMP_PASSWORD);
  ok('Student A login succeeds', loginA.status === 200 && loginA.body?.success === true);

  // --- Issue 4.1: IDOR ---
  logSection('Issue 4.1 — Student A → Student B order (expect 403)');

  for (const [label, pathSuffix] of [
    ['GET checkout-info', `/api/payments/manual/checkout-info?order_id=${orderB.orderId}`],
    ['GET status', `/api/payments/manual/${orderB.orderId}/status`],
  ]) {
    const r = await http('GET', pathSuffix, { cookies: loginA.cookies });
    logHttp(label, r.req, r.res, r.body);
    ok(`${label} → 403`, r.status === 403);
  }

  {
    const r = await postSubmitMultipart(loginA.cookies, orderB.orderId, 'IDOR');
    logHttp('POST submit (foreign order)', r.req, r.res, r.body);
    ok('POST submit foreign order → 403', r.status === 403);
  }

  // --- Issue 1: ownership before rate limit ---
  logSection('Issue 1 — Foreign order spam must not consume victim order rate bucket');

  resetSlidingWindowMemoryForTests();
  for (let i = 0; i < 6; i += 1) {
    await postSubmitMultipart(loginA.cookies, orderB.orderId, `SPAM${i}`);
  }

  const ownSubmit1 = await postSubmitMultipart(loginA.cookies, orderA.orderId, 'OWN1');
  logHttp('POST submit own order after foreign spam', ownSubmit1.req, ownSubmit1.res, ownSubmit1.body);
  ok(
    'Own legitimate submit still allowed after foreign-order spam (not 429 from poisoned bucket)',
    ownSubmit1.status === 201 || ownSubmit1.status === 409
  );
  ok('Own submit not blocked by foreign-order rate poisoning', ownSubmit1.status !== 429);

  // --- Issue 4.2/4.3: Admin auth ---
  logSection('Issue 4.2 — Unauthenticated admin approve → 401');

  const pendingId = await insertManualPaymentForTests({
    orderId: orderA.orderId,
    enrollmentId: orderA.enrollmentId,
    studentId: orderA.userId,
    paymentMethod: 'easypaisa',
    senderPhone: '03001234567',
    senderTitle: 'Live Race',
    transactionId: `RACE${stamp}TRX`,
    amountClaimed: 5000,
    status: 'pending_review',
    riskLevel: 'low',
  });
  createdPaymentIds.push(pendingId);

  {
    const r = await http('PUT', `${ADMIN_MOUNT}/payment-submissions/${pendingId}/approve`, {});
    logHttp('PUT approve no session', r.req, r.res, r.body);
    ok('Unauthenticated approve → 401', r.status === 401);
  }

  logSection('Issue 4.3 — Student role admin approve → 403');

  {
    const r = await http('PUT', `${ADMIN_MOUNT}/payment-submissions/${pendingId}/approve`, {
      cookies: loginA.cookies,
      csrf: loginA.cookies.csrf_token,
    });
    logHttp('PUT approve as student', r.req, r.res, r.body);
  ok('Student approve blocked (401 — no admin token; student cookie not accepted on admin mount)', r.status === 401 || r.status === 403);
  }

  // --- Issue 4.4: CSRF ---
  logSection('Issue 4.4 — Missing CSRF → 403');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@mrb.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Mrb-classes-2026-lr94nr04ng';

  [[adminUser]] = await mysqlPool.query(
    `SELECT id, email, password_hash FROM users WHERE role IN ('admin','super_admin') ORDER BY role='admin' DESC, id ASC LIMIT 1`
  );
  if (!adminUser) throw new Error('No admin user in DB');
  adminOriginalHash = adminUser.password_hash;
  await mysqlPool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [
    await bcrypt.hash(TEMP_PASSWORD, 10),
    adminUser.id,
  ]);

  const loginAdminRes = await loginAdmin(adminUser.email, TEMP_PASSWORD);
  ok('Admin login succeeds', loginAdminRes.status === 200 && loginAdminRes.body?.success === true);

  {
    const cookiesNoCsrf = { ...loginAdminRes.cookies };
    const csrfToken = cookiesNoCsrf.csrf_token;
    delete cookiesNoCsrf.csrf_token;
    const r = await http('PUT', `${ADMIN_MOUNT}/payment-submissions/${pendingId}/approve`, {
      cookies: cookiesNoCsrf,
      csrf: null,
    });
    logHttp('PUT approve without CSRF (admin session, no x-csrf-token)', r.req, r.res, r.body);
    ok('Approve without CSRF → 403', r.status === 403);
    void csrfToken;
  }

  {
    const r = await postSubmitMultipart({ student_access_token: loginA.cookies.student_access_token }, orderA.orderId, 'NOCSRF');
    logHttp('POST submit without CSRF', r.req, r.res, r.body);
    ok('Submit without CSRF → 403', r.status === 403);
  }

  // --- Issue 4.5: Rate limit 429 (fresh student, isolated order-hour bucket) ---
  logSection('Issue 4.5 — 6th submit within window → 429');

  resetSlidingWindowMemoryForTests();
  const [[studentC]] = await mysqlPool.query(
    `SELECT id, email FROM users WHERE role = 'student' AND id NOT IN (?, ?) ORDER BY id ASC LIMIT 1`,
    [studentA.id, studentB.id]
  );
  let rateLogin = loginA;
  if (studentC) {
    passwordRestore.push([studentC.id, await setTempPassword(studentC.id)]);
    rateLogin = await loginStudent(studentC.email, TEMP_PASSWORD);
    ok('Rate-limit student login succeeds', rateLogin.status === 200);
  }

  const orderRate = await createPendingOrderForUser(
    Number(studentC?.id ?? studentA.id),
    `${stamp}RL`
  );
  createdEnrollmentIds.push(orderRate.enrollmentId);
  createdOrderIds.push(orderRate.orderId);

  let sixth;
  for (let i = 1; i <= 6; i += 1) {
    sixth = await postSubmitMultipart(rateLogin.cookies, orderRate.orderId, `RL${i}`);
    if (i <= 5) ok(`submit attempt ${i} not rate-limited`, sixth.status !== 429);
  }
  logHttp('6th submit attempt', sixth.req, sixth.res, sixth.body);
  ok('6th submit → 429', sixth.status === 429);
  ok('6th submit has RATE_LIMITED code', sixth.body?.error?.code === 'RATE_LIMITED' || /429|rate/i.test(JSON.stringify(sixth.body)));

  // --- Issue 4.6: Concurrent HTTP approve race ---
  logSection('Issue 4.6 — Concurrent HTTP double-approve');

  const raceOrder = await createPendingOrderForUser(Number(studentB.id), `${stamp}RC`);
  createdEnrollmentIds.push(raceOrder.enrollmentId);
  createdOrderIds.push(raceOrder.orderId);
  const racePendingId = await insertManualPaymentForTests({
    orderId: raceOrder.orderId,
    enrollmentId: raceOrder.enrollmentId,
    studentId: raceOrder.userId,
    paymentMethod: 'easypaisa',
    senderPhone: '03001234567',
    senderTitle: 'HTTP Race',
    transactionId: `HTTPRACE${stamp}`,
    amountClaimed: 5000,
    status: 'pending_review',
    riskLevel: 'low',
  });
  createdPaymentIds.push(racePendingId);

  const approveOnce = () =>
    http('PUT', `${ADMIN_MOUNT}/payment-submissions/${racePendingId}/approve`, {
      cookies: loginAdminRes.cookies,
      csrf: loginAdminRes.cookies.csrf_token,
    });

  const [raceA, raceB] = await Promise.all([approveOnce(), approveOnce()]);
  logHttp('Concurrent approve A', raceA.req, raceA.res, raceA.body);
  logHttp('Concurrent approve B', raceB.req, raceB.res, raceB.body);

  const statuses = [raceA.status, raceB.status].sort();
  ok('Concurrent approve: one 200-class success', statuses.includes(200) || statuses.includes(201));
  ok(
    'Concurrent approve: one conflict response',
    raceA.status === 409 || raceB.status === 409 || (raceA.status >= 400 && raceB.status >= 400 && raceA.status !== raceB.status)
  );

  // --- Issue 3: Redis-down 503 (production path, subprocess with Redis stopped) ---
  logSection('Issue 3 — Rate limit Redis-down → 503 (production, no Redis)');

  {
    const { spawnSync } = await import('child_process');
    const child = spawnSync(
      process.execPath,
      ['scripts/verify-manual-payment-redis-down.mjs'],
      {
        cwd: path.join(__dirname, '..'),
        env: {
          ...process.env,
          NODE_ENV: 'production',
          REDIS_URL: '',
          MANUAL_PAYMENT_RATE_LIMIT_REQUIRE_REDIS: 'false',
        },
        encoding: 'utf8',
      }
    );
    console.log(child.stdout || '');
    if (child.stderr) console.error(child.stderr);
    let payload = {};
    try {
      payload = JSON.parse(child.stdout || '{}');
    } catch {
      /* parse below */
    }
    logHttp(
      'Subprocess: NODE_ENV=production, REDIS_URL=empty',
      { method: 'SPAWN', url: 'verify-manual-payment-redis-down.mjs', bodySummary: 'Redis stopped / unavailable' },
      { status: payload.normalizedHttpStatus ?? child.status },
      payload
    );
    ok('Redis-down subprocess exits 0', child.status === 0);
    ok('Redis-down middleware → 503', payload.middlewareStatus === 503);
    ok('503 message is user-facing', /temporarily unavailable/i.test(payload.normalizeDirectMessage || payload.middlewareMessage || ''));

    const { normalizeError: norm } = await import('../src/errors/middleware/normalizeError.js');
    const { RateLimitRedisUnavailableError } = await import(
      '../src/services/slidingWindowRateLimit.service.js'
    );
    const direct = norm(new RateLimitRedisUnavailableError());
    ok('normalizeError(RateLimitRedisUnavailableError) → 503', direct.httpStatus === 503);
  }
} finally {
  for (const [userId, hash] of passwordRestore) {
    await restorePassword(userId, hash);
  }
  if (adminOriginalHash != null && adminUser?.id) {
    await mysqlPool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [
      adminOriginalHash,
      adminUser.id,
    ]);
  }
  if (createdOrderIds.length) {
    await mysqlPool.query(`DELETE FROM manual_payments WHERE order_id IN (?)`, [createdOrderIds]);
  }
  await deleteManualPaymentsForTests(createdPaymentIds);
  if (createdOrderIds.length) await mysqlPool.query(`DELETE FROM orders WHERE id IN (?)`, [createdOrderIds]);
  if (createdEnrollmentIds.length) {
    await mysqlPool.query(`UPDATE enrollments SET order_id = NULL WHERE id IN (?)`, [createdEnrollmentIds]);
    await mysqlPool.query(`DELETE FROM enrollments WHERE id IN (?)`, [createdEnrollmentIds]);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
await mysqlPool.end().catch(() => {});
process.exit(failed > 0 ? 1 : 0);
