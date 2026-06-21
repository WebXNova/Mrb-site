/**
 * Q&A audit logging — security and observability acceptance tests.
 *
 * Run: npm run test:qa-audit-logging-security
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeMetadata } from '../utils/logSanitizer.js';
import {
  QA_AUDIT_CATEGORIES,
  inferQaAuditCategory,
} from '../constants/qaAudit.schema.js';
import {
  recordQaAuditSuccess,
  recordQaAuditFailure,
  recordQaAuditRetry,
  recordQaAuditAlert,
  resetQaAuditMetricsForTests,
  getQaAuditMetricsSnapshot,
  shouldEmitQaAuditAlert,
} from '../observability/qaAuditMetrics.service.js';
import { getQaAuditLogConfig } from '../config/qaAuditLog.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

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

function mustContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  ok(`exists: ${fileRel}`, existsSync(filePath));
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: "${needle}"`, text.includes(needle));
  }
}

function mustNotContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    ok(`${label}: no "${needle}"`, !text.includes(needle));
  }
}

console.log('qaAuditLogging — acceptance tests\n');

{
  const sanitized = sanitizeMetadata({
    password: 'secret123',
    token: 'abc',
    authorization: 'Bearer xyz',
    errorCode: 'QUESTION_NOT_FOUND',
    code: '123456',
    jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature',
  });
  ok('redacts password', sanitized.password === '[REDACTED]');
  ok('redacts token', sanitized.token === '[REDACTED]');
  ok('redacts authorization', sanitized.authorization === '[REDACTED]');
  ok('preserves application errorCode', sanitized.errorCode === 'QUESTION_NOT_FOUND');
  ok('redacts OTP-like code', sanitized.code === '[REDACTED]');
  ok('redacts jwt key', sanitized.jwt === '[REDACTED]');
}

{
  ok('infer upload accepted', inferQaAuditCategory('student.question.upload.success') === QA_AUDIT_CATEGORIES.UPLOAD_ACCEPTED);
  ok('infer upload rejected', inferQaAuditCategory('teacher.question.upload.validation_failed') === QA_AUDIT_CATEGORIES.UPLOAD_REJECTED);
  ok('infer question created', inferQaAuditCategory('student.question.create') === QA_AUDIT_CATEGORIES.QUESTION_CREATED);
  ok('infer question viewed', inferQaAuditCategory('student.question.detail.viewed') === QA_AUDIT_CATEGORIES.QUESTION_VIEWED);
  ok('infer question answered', inferQaAuditCategory('teacher.question.answer.created') === QA_AUDIT_CATEGORIES.QUESTION_ANSWERED);
  ok('infer auth denied', inferQaAuditCategory('teacher.question.access.denied') === QA_AUDIT_CATEGORIES.AUTHORIZATION_DENIED);
  ok('infer suspicious', inferQaAuditCategory('student.question.rate_limit') === QA_AUDIT_CATEGORIES.SUSPICIOUS_ACTIVITY);
}

{
  resetQaAuditMetricsForTests();
  recordQaAuditSuccess('student.question.create', QA_AUDIT_CATEGORIES.QUESTION_CREATED);
  recordQaAuditRetry('student.question.create');
  recordQaAuditFailure('student.question.create', QA_AUDIT_CATEGORIES.QUESTION_CREATED);
  const snap = getQaAuditMetricsSnapshot();
  ok('metrics success', snap.success_total === 1);
  ok('metrics retry', snap.retry_total === 1);
  ok('metrics failure', snap.failure_total === 1);
}

{
  resetQaAuditMetricsForTests();
  for (let i = 0; i < 5; i += 1) {
    recordQaAuditFailure('x', QA_AUDIT_CATEGORIES.SUSPICIOUS_ACTIVITY);
  }
  const config = getQaAuditLogConfig();
  ok('alert threshold triggers', shouldEmitQaAuditAlert(config.alertWindowMs, config.alertThreshold));
  recordQaAuditAlert();
  ok('alert counter', getQaAuditMetricsSnapshot().alert_total === 1);
}

mustContain(
  'src/services/qaAuditLog.service.js',
  [
    'writeQaAuditEvent',
    'writeQaAuditDeadLetter',
    'insertActivityLogRecord',
    'qa_audit_persist_failed',
    'qa_audit_failure_threshold_exceeded',
  ],
  'qaAuditLog pipeline'
);

mustNotContain(
  'src/services/studentQuestionViewAudit.service.js',
  ['catch {', 'Non-blocking', 'logActivity'],
  'student view audit'
);

mustNotContain(
  'src/services/teacherQuestionDetailAudit.service.js',
  ['catch {', 'Non-blocking', 'logActivity'],
  'teacher detail audit'
);

mustNotContain(
  'src/services/studentQuestionSecurityAudit.service.js',
  ['// Non-blocking'],
  'student security audit'
);

mustContain(
  'src/services/qaImageUpload.service.js',
  ['writeQaAuditEventFromReq', 'QA_AUDIT_CATEGORIES'],
  'qa image upload audit'
);

mustContain(
  'src/middleware/studentQuestionRateLimit.js',
  ['writeQaAuditEventFromReq', 'SUSPICIOUS_ACTIVITY'],
  'student rate limit audit'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
