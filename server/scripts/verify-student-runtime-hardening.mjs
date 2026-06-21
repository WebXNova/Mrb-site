/**
 * Runtime hardening static verification.
 * Run: node scripts/verify-student-runtime-hardening.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(serverRoot, rel), 'utf8');
}

function ok(label) {
  console.log(`PASS ${label}`);
}

function assertMatch(label, content, pattern) {
  if (!pattern.test(content)) {
    throw new Error(`${label}: missing ${pattern}`);
  }
  ok(label);
}

console.log('Student runtime hardening verification\n');

assertMatch(
  'metrics service',
  read('src/observability/studentRuntimeMetrics.service.js'),
  /student_runtime_success_total/
);

assertMatch(
  'observability audit service',
  read('src/observability/studentRuntimeObservability.service.js'),
  /emitStudentRuntimeAudit/
);

assertMatch(
  'metrics middleware mounted',
  read('src/app.js'),
  /studentRuntimeMetricsMiddleware/
);

assertMatch(
  'metrics endpoint exports runtime',
  read('src/controllers/metrics.controller.js'),
  /formatStudentRuntimeMetricsPrometheus/
);

assertMatch(
  'slug attempt creation metrics',
  read('src/services/testAttempt.service.js'),
  /recordAttemptCreation/
);

assertMatch(
  'slug submit metrics',
  read('src/services/testAttempt.service.js'),
  /recordAttemptSubmission/
);

assertMatch(
  'portal start metrics',
  read('src/services/studentTestStart.service.js'),
  /recordAttemptCreation/
);

assertMatch(
  'hardening documentation',
  read('docs/student-runtime-hardening.md'),
  /HttpOnly/
);

assertMatch(
  'attempt session client storage documented',
  read('../client/src/features/test-instructions/utils/attemptSession.js'),
  /HttpOnly cookie/
);

assertMatch(
  'attempt token cookie service',
  read('src/services/attemptTokenCookie.service.js'),
  /test_attempt_token/
);

assertMatch(
  'attempt bearer rejected in cookie-only mode',
  read('src/services/attemptTokenCookie.service.js'),
  /ATTEMPT_BEARER_FORBIDDEN/
);

assertMatch(
  'attempt cookie cleared on submit',
  read('src/controllers/publicTests.controller.js'),
  /clearAttemptTokenCookie/
);

console.log('\nAll runtime hardening checks passed.');
