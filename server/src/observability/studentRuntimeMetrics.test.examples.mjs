/**
 * Student runtime metrics — unit tests.
 *
 * Run: npm run test:student-runtime-hardening
 */
import {
  formatStudentRuntimeMetricsPrometheus,
  getStudentRuntimeMetricsSnapshot,
  recordAttemptCreation,
  recordAttemptSubmission,
  recordStudentRuntimeFailure,
  recordStudentRuntimeSuccess,
  resetStudentRuntimeMetricsForTests,
} from './studentRuntimeMetrics.service.js';
import { resolveStudentRuntimeOperation } from './studentRuntimeOperationResolver.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

console.log('studentRuntimeMetrics — runtime hardening\n');

resetStudentRuntimeMetricsForTests();

recordStudentRuntimeSuccess({ stack: 'slug', operation: 'loadAttempt', durationMs: 120 });
recordStudentRuntimeSuccess({ stack: 'portal', operation: 'portalResult', durationMs: 80 });
recordStudentRuntimeFailure({
  stack: 'slug',
  operation: 'submitAttempt',
  durationMs: 200,
  errorCode: 'ATTEMPT_EXPIRED',
});
recordAttemptCreation({ stack: 'slug', resumed: false });
recordAttemptCreation({ stack: 'slug', resumed: true });
recordAttemptSubmission({ stack: 'slug' });

const snapshot = getStudentRuntimeMetricsSnapshot();
assert(snapshot.student_runtime_success_total === 2, 'student_runtime_success_total');
assert(snapshot.student_runtime_failure_total === 1, 'student_runtime_failure_total');
assert(snapshot.attempt_creation_total === 2, 'attempt_creation_total');
assert(snapshot.attempt_submission_total === 1, 'attempt_submission_total');
assert(snapshot.runtime_duration_ms.count === 3, 'runtime_duration_ms count');
assert(snapshot.runtime_duration_ms.sum === 400, 'runtime_duration_ms sum');

const prom = formatStudentRuntimeMetricsPrometheus();
assert(prom.includes('student_runtime_success_total'), 'prometheus exports success total');
assert(prom.includes('student_runtime_failure_total'), 'prometheus exports failure total');
assert(prom.includes('attempt_creation_total'), 'prometheus exports creation total');
assert(prom.includes('attempt_submission_total'), 'prometheus exports submission total');
assert(prom.includes('runtime_duration_ms_sum 400'), 'prometheus exports duration sum');

{
  const op = resolveStudentRuntimeOperation({
    method: 'POST',
    path: '/api/tests/demo-slug/verify-code',
  });
  assert(op.stack === 'slug' && op.operation === 'startOrResume', 'resolver — slug start');
}

{
  const op = resolveStudentRuntimeOperation({
    method: 'GET',
    path: '/api/student/results/42',
  });
  assert(op.stack === 'portal' && op.operation === 'portalResult', 'resolver — portal result');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
