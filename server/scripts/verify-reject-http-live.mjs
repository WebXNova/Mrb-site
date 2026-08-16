/**
 * Live HTTP test: PUT /admin/payment-submissions/:id/reject
 * Run: node scripts/verify-reject-http-live.mjs
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { mysqlPool } from '../src/config/mysql.js';
import { scopedQueryBypass } from '../src/security/cee/db/scopedQuery.js';
import { insertManualPaymentForTests, deleteManualPaymentsForTests } from '../src/services/manualPayments.service.js';

const BASE = `http://127.0.0.1:${process.env.PORT || 4000}`;
const ORIGIN = process.env.LIVE_TEST_ORIGIN || 'http://localhost:5173';
const ADMIN_MOUNT = `/api/admin/${process.env.ADMIN_SECRET_PATH || '0itMow1FhXWgW0BzTVc0VbMq'}`;
const TEMP_PASSWORD = 'LiveTest!Reject2026';

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

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function http(method, urlPath, { cookies = {}, csrf = null, body = null } = {}) {
  const headers = { Origin: ORIGIN, Accept: 'application/json' };
  if (cookieHeader(cookies)) headers.Cookie = cookieHeader(cookies);
  if (csrf && cookies.csrf_token) headers['x-csrf-token'] = csrf;

  let fetchBody;
  if (body != null) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
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
  const nextCookies = { ...cookies, ...parseSetCookie(setCookie.length ? setCookie : res.headers.get('set-cookie')) };

  return { status: res.status, body: parsed, rawBody: text, cookies: nextCookies };
}

async function loginAdmin(email, password) {
  let r = await http('GET', '/api/auth/csrf-session');
  r = await http('GET', `${ADMIN_MOUNT}/auth/csrf-session`, { cookies: r.cookies });
  r = await http('POST', `${ADMIN_MOUNT}/auth/login`, {
    cookies: r.cookies,
    csrf: r.cookies.csrf_token,
    body: { email, password },
  });
  return r;
}

async function loginStudent(identifier, password) {
  let r = await http('GET', '/api/auth/csrf-session');
  r = await http('POST', '/api/auth/student/login', {
    cookies: r.cookies,
    csrf: r.cookies.csrf_token,
    body: { identifier, password },
  });
  return r;
}

const [[admin]] = await mysqlPool.query(
  `SELECT id, email, password_hash FROM users WHERE role IN ('admin','super_admin') ORDER BY id ASC LIMIT 1`
);
const [[student]] = await mysqlPool.query(
  `SELECT id, email FROM users WHERE role = 'student' ORDER BY id ASC LIMIT 1`
);
const [[template]] = await mysqlPool.query(`SELECT * FROM enrollments ORDER BY id DESC LIMIT 1`);
const seedDb = scopedQueryBypass({
  reason: 'admin_job:live_test_seed_v1',
  context: 'admin.scripts.verifyManualPaymentReject',
});
const [courses] = await seedDb.execute(`SELECT id FROM courses ORDER BY id ASC`);
const [existing] = await mysqlPool.query(`SELECT course_id FROM enrollments WHERE user_id = ?`, [student.id]);
const taken = new Set(existing.map((row) => Number(row.course_id)));
const course = courses.find((row) => !taken.has(Number(row.id)));

if (!admin || !student || !template || !course) {
  console.error('missing seed data');
  process.exit(1);
}

const originalHash = admin.password_hash;
const studentTempPassword = 'LiveTest!Student2026';
const [[studentPwRow]] = await mysqlPool.query(`SELECT password_hash FROM users WHERE id = ?`, [student.id]);
const studentOriginalHash = studentPwRow?.password_hash ?? null;
await mysqlPool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [
  await bcrypt.hash(TEMP_PASSWORD, 10),
  admin.id,
]);
await mysqlPool.query(`UPDATE users SET password_hash = ?, is_verified = 1, status = 'active' WHERE id = ?`, [
  await bcrypt.hash(studentTempPassword, 10),
  student.id,
]);

const stamp = Date.now();
const [enR] = await mysqlPool.query(
  `INSERT INTO enrollments (user_id, course_id, email, status, access_status, enrollment_source, province_id, district_id, city_id, applicant_full_name, father_name, gender, whatsapp_number, hssc_status, mdcat_attempt_type)
   VALUES (?, ?, ?, 'pending', 'inactive', 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [
    student.id,
    course.id,
    `rej-http-${stamp}@test.com`,
    template.province_id,
    template.district_id,
    template.city_id,
    template.applicant_full_name || 'Test',
    template.father_name || 'Test',
    template.gender || 'male',
    template.whatsapp_number || '03001234567',
    template.hssc_status || 'completed',
    template.mdcat_attempt_type || 'first',
  ]
);
const enrollmentId = Number(enR.insertId);
const [ordR] = await mysqlPool.query(
  `INSERT INTO orders (user_id, course_id, enrollment_id, gateway, amount, currency, status) VALUES (?, ?, ?, 'manual', 5000, 'PKR', 'pending')`,
  [student.id, course.id, enrollmentId]
);
const orderId = Number(ordR.insertId);
const submissionId = await insertManualPaymentForTests({
  orderId,
  enrollmentId,
  studentId: student.id,
  paymentMethod: 'easypaisa',
  senderPhone: '03001234567',
  senderTitle: 'Reject HTTP Test',
  transactionId: `REJHTTP${stamp}`,
  amountClaimed: 5000,
  status: 'pending_review',
  riskLevel: 'low',
});

try {
  const login = await loginAdmin(admin.email, TEMP_PASSWORD);
  if (login.status !== 200) {
    console.error('Admin login failed:', login.status, login.body);
    process.exit(1);
  }

  const reason = 'Screenshot unclear — please resubmit with full transaction details.';
  const reject = await http('PUT', `${ADMIN_MOUNT}/payment-submissions/${submissionId}/reject`, {
    cookies: login.cookies,
    csrf: login.cookies.csrf_token,
    body: { admin_note: reason },
  });

  console.log('PUT reject HTTP test');
  console.log('  Request:', `PUT ${ADMIN_MOUNT}/payment-submissions/${submissionId}/reject`);
  console.log('  Body:', JSON.stringify({ admin_note: reason }));
  console.log('  Status:', reject.status);
  console.log('  Response:', JSON.stringify(reject.body, null, 2));

  const [[row]] = await mysqlPool.query(`SELECT status, admin_note FROM manual_payments WHERE id = ?`, [submissionId]);
  console.log('  DB manual_payments.status:', row?.status, '| admin_note:', row?.admin_note);

  const [[orderRow]] = await mysqlPool.query(`SELECT status FROM orders WHERE id = ?`, [orderId]);
  console.log('  DB orders.status:', orderRow?.status);

  const studentLogin = await loginStudent(student.email, studentTempPassword);
  console.log('  Student login status:', studentLogin.status);
  const studentStatus = await http('GET', `/api/payments/manual/${orderId}/status`, {
    cookies: studentLogin.cookies,
  });
  console.log('  GET student status:', studentStatus.status);
  console.log('  Student status body:', JSON.stringify(studentStatus.body, null, 2));

  if (reject.status !== 200) process.exit(1);
  if (row?.status !== 'rejected') process.exit(1);
  if (row?.admin_note !== reason) process.exit(1);
  if (orderRow?.status !== 'pending') process.exit(1);
  if (studentStatus.status !== 200) process.exit(1);
  if (studentStatus.body?.data?.status !== 'rejected') process.exit(1);
  if (studentStatus.body?.data?.adminNote !== reason) process.exit(1);
  console.log('\n✓ Reject HTTP endpoint OK (DB + order pending + student status)');
} finally {
  await deleteManualPaymentsForTests([submissionId]);
  await mysqlPool.query(`DELETE FROM orders WHERE id = ?`, [orderId]);
  await mysqlPool.query(`DELETE FROM enrollments WHERE id = ?`, [enrollmentId]);
  await mysqlPool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [originalHash, admin.id]);
  if (studentOriginalHash) {
    await mysqlPool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [studentOriginalHash, student.id]);
  }
  await mysqlPool.end();
}
