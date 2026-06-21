/**
 * H-06/H-07 authentication hardening tests.
 *
 * Run: node src/services/authHardening.test.examples.mjs
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import {
  readAccessToken,
  readMultiRealmAccessToken,
  assertRealmBearerAllowedInProduction,
} from './authDecisionEngine.js';
import {
  rejectStudentBearerInProduction,
  rejectTeacherBearerInProduction,
  rejectAuthHeaderInProduction,
} from '../middleware/auth.js';
import { classifyFingerprintRisk } from './authSession.service.js';
import {
  getAuthSecurityMetrics,
  resetAuthSecurityMetricsForTests,
} from './authSecurity.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

let passed = 0;
let failed = 0;
const originalNodeEnv = process.env.NODE_ENV;

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

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function networkFingerprint(ipAddress) {
  const raw = String(ipAddress || '').trim();
  if (!raw) return '';
  const normalized = raw.includes(':') ? raw.split(':').slice(0, 4).join(':') : raw.split('.').slice(0, 3).join('.');
  return normalized;
}

function sessionIpHash(ip) {
  return hashValue(networkFingerprint(ip));
}

function mockReq({ cookies = {}, authorization = null, originalUrl = '/api/student/me' } = {}) {
  return {
    cookies,
    headers: authorization ? { authorization } : {},
    originalUrl,
    path: originalUrl,
  };
}

async function invokeMiddleware(middleware, req) {
  let error = null;
  await new Promise((resolve) => {
    middleware(req, {}, (err) => {
      error = err ?? null;
      resolve();
    });
  });
  return error;
}

function withProductionEnv(fn) {
  process.env.NODE_ENV = 'production';
  try {
    return fn();
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }
}

async function withProductionEnvAsync(fn) {
  process.env.NODE_ENV = 'production';
  try {
    await fn();
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }
}

async function main() {
console.log('authHardening — security tests\n');

console.log('Production bearer rejection — student');
withProductionEnv(() => {
  try {
    readAccessToken(mockReq({ authorization: 'Bearer stolen-token' }), 'student');
    ok('bearer alone rejected', false);
  } catch (error) {
    ok('bearer alone rejected', error?.details?.code === 'BEARER_REJECTED_IN_PRODUCTION');
  }

  try {
    readAccessToken(
      mockReq({
        authorization: 'Bearer stolen-token',
        cookies: { student_access_token: 'cookie-token' },
      }),
      'student'
    );
    ok('bearer rejected even when cookie present', false);
  } catch (error) {
    ok('bearer rejected even when cookie present', error?.details?.code === 'BEARER_REJECTED_IN_PRODUCTION');
  }

  const cookieOnly = readAccessToken(
    mockReq({ cookies: { student_access_token: 'cookie-token' } }),
    'student'
  );
  eq('cookie-only accepted in production', cookieOnly, 'cookie-token');
});

console.log('\nProduction bearer rejection — teacher');
withProductionEnv(() => {
  try {
    readAccessToken(mockReq({ authorization: 'Bearer stolen-teacher-token', originalUrl: '/api/teacher/me' }), 'teacher');
    ok('teacher bearer alone rejected', false);
  } catch (error) {
    ok('teacher bearer alone rejected', error?.details?.code === 'BEARER_REJECTED_IN_PRODUCTION');
  }

  try {
    readAccessToken(
      mockReq({
        authorization: 'Bearer stolen-teacher-token',
        cookies: { teacher_access_token: 'teacher-cookie-token' },
        originalUrl: '/api/teacher/me',
      }),
      'teacher'
    );
    ok('teacher bearer rejected even when cookie present', false);
  } catch (error) {
    ok('teacher bearer rejected even when cookie present', error?.details?.code === 'BEARER_REJECTED_IN_PRODUCTION');
  }

  const teacherCookieOnly = readAccessToken(
    mockReq({
      cookies: { teacher_access_token: 'teacher-cookie-token' },
      originalUrl: '/api/teacher/me',
    }),
    'teacher'
  );
  eq('teacher cookie-only accepted in production', teacherCookieOnly, 'teacher-cookie-token');

  try {
    assertRealmBearerAllowedInProduction(
      mockReq({ authorization: 'Bearer stolen-teacher-token', originalUrl: '/api/uploads/student-qa/x' }),
      'bearer',
      'teacher'
    );
    ok('multi-realm guard rejects teacher bearer', false);
  } catch (error) {
    ok('multi-realm guard rejects teacher bearer', error?.details?.code === 'BEARER_REJECTED_IN_PRODUCTION');
  }

  const multiRealmCookie = readMultiRealmAccessToken(
    mockReq({
      cookies: { teacher_access_token: 'teacher-cookie-token' },
      originalUrl: '/api/uploads/question-bank/x',
    })
  );
  eq('multi-realm teacher cookie accepted', multiRealmCookie.token, 'teacher-cookie-token');
  eq('multi-realm teacher cookie source', multiRealmCookie.source, 'cookie');
});

console.log('\nProduction bearer middleware — teacher and student surfaces');
await withProductionEnvAsync(async () => {
  const teacherError = await invokeMiddleware(
    rejectTeacherBearerInProduction,
    mockReq({ authorization: 'Bearer stolen-token', originalUrl: '/api/teacher/questions' })
  );
  ok('rejectTeacherBearerInProduction blocks bearer', teacherError?.details?.code === 'BEARER_REJECTED_IN_PRODUCTION');

  const teacherCookiePass = await invokeMiddleware(
    rejectTeacherBearerInProduction,
    mockReq({ cookies: { teacher_access_token: 'cookie' }, originalUrl: '/api/teacher/me' })
  );
  ok('rejectTeacherBearerInProduction allows cookie-only request', teacherCookiePass === null);

  const studentError = await invokeMiddleware(
    rejectStudentBearerInProduction,
    mockReq({ authorization: 'Bearer stolen-token', originalUrl: '/api/student/me' })
  );
  ok('rejectStudentBearerInProduction still blocks student bearer', studentError?.details?.code === 'BEARER_REJECTED_IN_PRODUCTION');

  const authTeacherError = await invokeMiddleware(
    rejectAuthHeaderInProduction,
    mockReq({ authorization: 'Bearer stolen-token', originalUrl: '/api/auth/teacher/me' })
  );
  ok('auth router rejects teacher bearer on /teacher/me', authTeacherError?.details?.code === 'BEARER_REJECTED_IN_PRODUCTION');
});

console.log('\nDevelopment bearer allowed');
{
  process.env.NODE_ENV = 'development';
  const studentToken = readAccessToken(mockReq({ authorization: 'Bearer dev-token' }), 'student');
  eq('student bearer allowed in development', studentToken, 'dev-token');
  const teacherToken = readAccessToken(
    mockReq({ authorization: 'Bearer dev-teacher-token', originalUrl: '/api/teacher/me' }),
    'teacher'
  );
  eq('teacher bearer allowed in development', teacherToken, 'dev-teacher-token');
  process.env.NODE_ENV = originalNodeEnv;
}

console.log('\nRefresh fingerprint enforcement');
{
  const sessionId = 'sess-1';
  const boundIp = sessionIpHash('192.168.1.10');
  const boundUa = hashValue('Mozilla/5.0 OriginalDevice');

  const sameDevice = await classifyFingerprintRisk({
    sessionId,
    lastIpHash: boundIp,
    lastUaHash: boundUa,
    clientIp: '192.168.1.10',
    userAgent: 'Mozilla/5.0 OriginalDevice',
    lastUsedAt: new Date(),
  });
  eq('same device refresh allowed', sameDevice.level, 'low');

  const stolen = await classifyFingerprintRisk({
    sessionId,
    lastIpHash: boundIp,
    lastUaHash: boundUa,
    clientIp: '203.0.113.50',
    userAgent: 'Mozilla/5.0 AttackerBrowser',
    lastUsedAt: new Date(Date.now() - 60_000),
  });
  eq('stolen refresh token on new device is high risk', stolen.level, 'high');

  const newDeviceFirst = await classifyFingerprintRisk({
    sessionId,
    lastIpHash: boundIp,
    lastUaHash: boundUa,
    clientIp: '203.0.113.99',
    userAgent: 'Mozilla/5.0 OriginalDevice',
    lastUsedAt: new Date(Date.now() - 60_000),
  });
  ok('ip-only change may be medium or low', ['low', 'medium'].includes(newDeviceFirst.level));
}

console.log('\nSecurity metrics');
{
  resetAuthSecurityMetricsForTests();
  const before = getAuthSecurityMetrics();
  ok('metrics start at zero', before.bearerRejected === 0);
}

mustContain(
  'src/services/authSession.service.js',
  ['classifyFingerprintRisk', 'REFRESH_FINGERPRINT_MISMATCH', 'last_ip_hash', 'ua_fingerprint'],
  'refresh fingerprint binding'
);

mustContain(
  'src/middleware/auth.js',
  ['rejectStudentBearerInProduction', 'rejectTeacherBearerInProduction', 'BEARER_REJECTED_IN_PRODUCTION'],
  'bearer rejection middleware'
);

mustContain(
  'src/routes/student.routes.js',
  ['rejectStudentBearerInProduction'],
  'student routes hardened'
);

mustContain(
  'src/routes/teacher.routes.js',
  ['rejectTeacherBearerInProduction'],
  'teacher routes hardened'
);

mustContain(
  'src/services/authDecisionEngine.js',
  ['shouldRejectBearerInProduction', 'teacher_access_token', 'assertRealmBearerAllowedInProduction'],
  'auth decision engine teacher bearer policy'
);

mustContain(
  'src/services/authSecurity.service.js',
  ['auth.refresh_fingerprint_mismatch', 'auth.bearer_rejected', 'getAuthSecurityMetrics'],
  'auth security logging'
);

process.env.NODE_ENV = originalNodeEnv;

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
