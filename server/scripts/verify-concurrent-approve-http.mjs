import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { mysqlPool } from '../src/config/mysql.js';

const BASE = `http://127.0.0.1:${process.env.PORT || 4000}`;
const ORIGIN = 'http://localhost:5173';
const M = `/api/admin/${process.env.ADMIN_SECRET_PATH}`;
const TEMP = 'LiveTest!Sec2026';

function parseCookies(setCookie) {
  const jar = {};
  for (const raw of setCookie || []) {
    const pair = String(raw).split(';')[0];
    const idx = pair.indexOf('=');
    jar[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function loginAdmin() {
  let res = await fetch(`${BASE}/api/auth/csrf-session`, { headers: { Origin: ORIGIN } });
  let jar = parseCookies(res.headers.getSetCookie?.());
  res = await fetch(`${BASE}${M}/auth/csrf-session`, {
    headers: { Origin: ORIGIN, Cookie: cookieHeader(jar) },
  });
  Object.assign(jar, parseCookies(res.headers.getSetCookie?.()));

  const [[admin]] = await mysqlPool.query(
    `SELECT id, email, password_hash FROM users WHERE role IN ('admin','super_admin') ORDER BY id ASC LIMIT 1`
  );
  const originalHash = admin.password_hash;
  await mysqlPool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [
    await bcrypt.hash(TEMP, 10),
    admin.id,
  ]);

  res = await fetch(`${BASE}${M}/auth/login`, {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      'x-csrf-token': jar.csrf_token,
      Cookie: cookieHeader(jar),
    },
    body: JSON.stringify({ email: admin.email, password: TEMP }),
  });
  Object.assign(jar, parseCookies(res.headers.getSetCookie?.()));
  await mysqlPool.query(`UPDATE users SET password_hash = ? WHERE id = ?`, [originalHash, admin.id]);
  if (res.status !== 200) throw new Error(`admin login failed: ${res.status}`);
  return jar;
}

const [[row]] = await mysqlPool.query(
  `SELECT mp.id
   FROM manual_payments mp
   INNER JOIN orders o ON o.id = mp.order_id
   WHERE mp.status = 'pending_review' AND o.status = 'pending'
   ORDER BY mp.id DESC
   LIMIT 1`
);
if (!row) throw new Error('No pending_review submission found — seed one first');
const pendingId = Number(row.id);

const jar = await loginAdmin();
const approve = () =>
  fetch(`${BASE}${M}/payment-submissions/${pendingId}/approve`, {
    method: 'PUT',
    headers: {
      Origin: ORIGIN,
      Accept: 'application/json',
      'x-csrf-token': jar.csrf_token,
      Cookie: cookieHeader(jar),
    },
  });

console.log(`Racing PUT approve on submission #${pendingId} ...`);
const [a, b] = await Promise.all([approve(), approve()]);
const bodyA = await a.json();
const bodyB = await b.json();
console.log('Concurrent approve A:', a.status, JSON.stringify(bodyA, null, 2));
console.log('Concurrent approve B:', b.status, JSON.stringify(bodyB, null, 2));

await mysqlPool.end();
