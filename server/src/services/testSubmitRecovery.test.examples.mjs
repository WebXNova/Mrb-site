/**
 * Partial test submission recovery — crash simulation + idempotency tests.
 *
 * Run: npm run test:test-submit-recovery
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  finalizeAttemptAfterResult,
  finalizeLegacyAttemptAfterResult,
  loadAttemptSubmissionState,
  loadLegacyAttemptSubmissionState,
  resolveLegacySubmitAttemptOutcome,
  resolveSubmitAttemptOutcome,
  SUBMIT_RECOVERY_OUTCOMES,
} from './testSubmitRecovery.service.js';

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

/**
 * In-memory partial submission simulator.
 */
function createSubmissionCrashStore(initial = {}) {
  const state = {
    attempt: {
      id: initial.attemptId ?? 501,
      user_id: initial.userId ?? 77,
      student_id: initial.studentId ?? 77,
      status: initial.status ?? 'in_progress',
      result_id: initial.resultId ?? null,
      submitted_at: initial.submittedAt ?? null,
      completion_reason: initial.completionReason ?? null,
    },
    results: initial.results ? [...initial.results] : [],
    nextResultId: initial.nextResultId ?? 9001,
    courseId: initial.courseId ?? 3,
  };

  const db = {
    async rows(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (/SELECT a\.status/i.test(normalized)) {
        const result = state.results.find((r) => r.attempt_id === state.attempt.id);
        const row = {
          status: state.attempt.status,
          attempt_result_id: state.attempt.result_id,
          result_id: result?.id ?? null,
          existing_result_id: result?.id ?? null,
        };

        if (/a\.student_id = \?/i.test(normalized) && !/a\.user_id = \?/i.test(normalized)) {
          const attemptId = Number(params[0]);
          const studentId = Number(params[1]);
          if (attemptId !== state.attempt.id || studentId !== state.attempt.student_id) {
            return [];
          }
          return [row];
        }

        const courseId = Number(params[0]);
        const attemptId = Number(params[1]);
        const userId = Number(params[2]);
        if (
          courseId !== state.courseId ||
          attemptId !== state.attempt.id ||
          userId !== state.attempt.user_id
        ) {
          return [];
        }
        return [row];
      }
      if (/SELECT r\.id AS result_id/i.test(normalized)) {
        const result = state.results
          .filter((r) => r.attempt_id === state.attempt.id)
          .sort((a, b) => b.id - a.id)[0];
        return result ? [{ result_id: result.id }] : [];
      }
      throw new Error(`unexpected rows sql: ${normalized.slice(0, 100)}`);
    },
    async execute(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (/^UPDATE test_attempts a/i.test(normalized)) {
        const resultId = Number(params[2]);
        const attemptId = Number(params[3]);
        if (attemptId !== state.attempt.id) {
          return [{ affectedRows: 0 }, []];
        }
        const canUpdate =
          state.attempt.status === 'in_progress' ||
          (state.attempt.status === 'submitted' &&
            (state.attempt.result_id == null || state.attempt.result_id === resultId));
        if (!canUpdate) {
          return [{ affectedRows: 0 }, []];
        }
        state.attempt.status = 'submitted';
        state.attempt.result_id = resultId;
        state.attempt.submitted_at = state.attempt.submitted_at ?? new Date();
        state.attempt.completion_reason = state.attempt.completion_reason ?? 'submitted';
        return [{ affectedRows: 1 }, []];
      }
      if (/^UPDATE test_attempts SET result_id = \?/i.test(normalized)) {
        const resultId = Number(params[0]);
        const attemptId = Number(params[1]);
        if (attemptId !== state.attempt.id || state.attempt.status !== 'submitted') {
          return [{ affectedRows: 0 }, []];
        }
        state.attempt.result_id = resultId;
        return [{ affectedRows: 1 }, []];
      }
      if (/^UPDATE test_attempts SET status = 'submitted'/i.test(normalized)) {
        const resultId = Number(params[1]);
        const attemptId = Number(params[2]);
        if (attemptId !== state.attempt.id) {
          return [{ affectedRows: 0 }, []];
        }
        const canUpdate =
          state.attempt.status === 'in_progress' ||
          (state.attempt.status === 'submitted' &&
            (state.attempt.result_id == null || state.attempt.result_id === resultId));
        if (!canUpdate) {
          return [{ affectedRows: 0 }, []];
        }
        state.attempt.status = 'submitted';
        state.attempt.result_id = resultId;
        state.attempt.submitted_at = state.attempt.submitted_at ?? new Date();
        state.attempt.completion_reason = state.attempt.completion_reason ?? 'submitted';
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`unexpected execute sql: ${normalized.slice(0, 100)}`);
    },
  };

  return {
    db,
    connection: {
      async query(sql, params = []) {
        const normalized = String(sql).replace(/\s+/g, ' ').trim();
        if (/^SELECT/i.test(normalized)) {
          return [await db.rows(sql, params)];
        }
        if (/^UPDATE/i.test(normalized)) {
          return db.execute(sql, params);
        }
        throw new Error(`unexpected query sql: ${normalized.slice(0, 100)}`);
      },
    },
    insertResultWithoutFinalizingAttempt() {
      const id = state.nextResultId++;
      state.results.push({ id, attempt_id: state.attempt.id });
      return id;
    },
    getSnapshot() {
      return {
        status: state.attempt.status,
        resultId: state.attempt.result_id,
        resultCount: state.results.length,
      };
    },
  };
}

console.log('testSubmitRecovery — partial submission recovery tests\n');

console.log('Crash simulation — result inserted, attempt status not updated');
{
  const store = createSubmissionCrashStore();
  const resultId = store.insertResultWithoutFinalizingAttempt();
  ok('orphan result exists after simulated crash', store.getSnapshot().resultCount === 1);
  eq('attempt still in_progress after crash', store.getSnapshot().status, 'in_progress');
  eq('attempt result_id still null after crash', store.getSnapshot().resultId, null);

  const recovery = await resolveSubmitAttemptOutcome(store.db, {
    attemptId: 501,
    courseId: 3,
    userId: 77,
    status: 'in_progress',
    resultId: null,
  });

  eq('recovery completes submit', recovery.action, 'complete');
  eq('recovery uses existing result row', recovery.resultId, resultId);
  ok('recovery marks recovered flag', recovery.recovered === true);
  eq('recovery outcome', recovery.outcome, SUBMIT_RECOVERY_OUTCOMES.RECOVERED_IN_PROGRESS);
  eq('attempt finalized to submitted', store.getSnapshot().status, 'submitted');
  eq('attempt linked to result', store.getSnapshot().resultId, resultId);
}

console.log('\nIdempotent retry — already submitted with linked result');
{
  const store = createSubmissionCrashStore({
    status: 'submitted',
    resultId: 9005,
    results: [{ id: 9005, attempt_id: 501 }],
  });

  const outcome = await resolveSubmitAttemptOutcome(store.db, {
    attemptId: 501,
    courseId: 3,
    userId: 77,
    status: 'submitted',
    resultId: 9005,
  });

  eq('idempotent submit returns complete', outcome.action, 'complete');
  eq('idempotent result id', outcome.resultId, 9005);
  ok('idempotent not marked recovered', outcome.recovered === false);
  eq('idempotent outcome', outcome.outcome, SUBMIT_RECOVERY_OUTCOMES.ALREADY_COMPLETE);
}

console.log('\nER_DUP_ENTRY path — insert fails, recovery finalizes attempt');
{
  const store = createSubmissionCrashStore();
  const resultId = store.insertResultWithoutFinalizingAttempt();

  const dupError = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
  let insertThrew = false;
  try {
    throw dupError;
  } catch (error) {
    insertThrew = error.code === 'ER_DUP_ENTRY';
    if (insertThrew) {
      const recovery = await resolveSubmitAttemptOutcome(store.db, {
        attemptId: 501,
        courseId: 3,
        userId: 77,
        status: 'in_progress',
        resultId: null,
      });
      eq('dup insert recovery completes', recovery.action, 'complete');
      eq('dup insert recovery result id', recovery.resultId, resultId);
      eq('attempt no longer stuck in_progress', store.getSnapshot().status, 'submitted');
    }
  }
  ok('simulated ER_DUP_ENTRY recovery path executed', insertThrew);
}

console.log('\nSubmitted without result — re-enters grading path');
{
  const store = createSubmissionCrashStore({ status: 'submitted', resultId: null });
  const recovery = await resolveSubmitAttemptOutcome(store.db, {
    attemptId: 501,
    courseId: 3,
    userId: 77,
    status: 'submitted',
    resultId: null,
  });
  eq('submitted without result proceeds to grading', recovery.action, 'proceed');
  ok('submitted without result marks recovered', recovery.recovered === true);
  eq(
    'submitted without result outcome',
    recovery.outcome,
    SUBMIT_RECOVERY_OUTCOMES.REGRADED_SUBMITTED_WITHOUT_RESULT
  );
}

console.log('\nfinalizeAttemptAfterResult — links missing result_id on submitted row');
{
  const store = createSubmissionCrashStore({
    status: 'submitted',
    resultId: null,
    results: [{ id: 9010, attempt_id: 501 }],
  });

  const affected = await finalizeAttemptAfterResult(store.db, {
    attemptId: 501,
    courseId: 3,
    userId: 77,
    resultId: 9010,
  });
  eq('finalize updates submitted row missing result_id', affected, 1);
  eq('result_id linked', store.getSnapshot().resultId, 9010);
}

console.log('\nloadAttemptSubmissionState — scoped read');
{
  const store = createSubmissionCrashStore({
    results: [{ id: 9020, attempt_id: 501 }],
  });
  const row = await loadAttemptSubmissionState(store.db, {
    attemptId: 501,
    courseId: 3,
    userId: 77,
  });
  eq('loads existing result id', Number(row.result_id), 9020);
  eq('loads in_progress status', row.status, 'in_progress');
}

console.log('\nLegacy submit path — orphan result recovered on retry');
{
  const store = createSubmissionCrashStore();
  const resultId = store.insertResultWithoutFinalizingAttempt();

  const recovery = await resolveLegacySubmitAttemptOutcome(
    store.connection,
    { attemptId: 501, studentId: 77 },
    null
  );

  eq('legacy recovery completes submit', recovery.action, 'complete');
  eq('legacy recovery uses existing result row', recovery.resultId, resultId);
  ok('legacy recovery marks recovered flag', recovery.recovered === true);
  eq('legacy recovery outcome', recovery.outcome, SUBMIT_RECOVERY_OUTCOMES.RECOVERED_IN_PROGRESS);
  eq('legacy attempt finalized to submitted', store.getSnapshot().status, 'submitted');
  eq('legacy attempt linked to result', store.getSnapshot().resultId, resultId);
}

console.log('\nLegacy finalizeAttemptAfterResult — student scoped link');
{
  const store = createSubmissionCrashStore({
    status: 'submitted',
    resultId: null,
    results: [{ id: 9030, attempt_id: 501 }],
  });

  const affected = await finalizeLegacyAttemptAfterResult(store.connection, {
    attemptId: 501,
    studentId: 77,
    resultId: 9030,
  });
  eq('legacy finalize updates submitted row missing result_id', affected, 1);
  eq('legacy result_id linked', store.getSnapshot().resultId, 9030);
}

console.log('\nloadLegacyAttemptSubmissionState — scoped read');
{
  const store = createSubmissionCrashStore({
    results: [{ id: 9040, attempt_id: 501 }],
  });
  const row = await loadLegacyAttemptSubmissionState(store.connection, {
    attemptId: 501,
    studentId: 77,
  });
  eq('legacy loads existing result id', Number(row.existing_result_id), 9040);
  eq('legacy loads in_progress status', row.status, 'in_progress');
}

mustContain(
  'src/services/testAttempt.service.js',
  [
    'resolveSubmitAttemptOutcome',
    'finalizeAttemptAfterResult',
    'requireInProgress: false',
    'ER_DUP_ENTRY',
  ],
  'canonical submit recovery wiring'
);

mustContain(
  'src/submit/submit.service.js',
  [
    'resolveLegacySubmitAttemptOutcome',
    'recoverLegacySubmittedAttempt',
    'AttemptAlreadySubmittedError',
  ],
  'legacy submit recovery wiring'
);

mustContain(
  'src/services/testSubmitRecovery.service.js',
  [
    'RECOVERED_IN_PROGRESS',
    'COALESCE(a.submitted_at',
    'REGRADED_SUBMITTED_WITHOUT_RESULT',
  ],
  'recovery service'
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
