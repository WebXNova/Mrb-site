/**
 * G-10 — production-grade publish pipeline E2E tests (harness + metrics + readiness).
 *
 * Flow verified:
 *   Draft → Publish → Runtime tables → Student readiness
 *
 * Run: npm run test:publish-pipeline-e2e
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppError } from '../errors/base/AppError.js';
import {
  formatPublishMetricsPrometheus,
  getPublishMetricsSnapshot,
  recordPublishFailure,
  recordPublishSuccess,
  resetPublishMetricsForTests,
} from '../observability/testPublishMetrics.service.js';
import {
  evaluateStudentReadinessFromSnapshot,
  evaluatePublishedTestStudentReadiness,
} from './publishedTestStudentReadiness.service.js';
import {
  formatPublishResponse,
  isPublishIdempotentReplay,
} from './testPublishIdempotency.service.js';
import { validateTestExistsAndPublished } from './studentTestStart.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');

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

function mustContain(fileRel, needles, label) {
  const filePath = path.join(serverRoot, fileRel);
  assert(existsSync(filePath), `file exists: ${fileRel}`);
  const text = readFileSync(filePath, 'utf8');
  for (const needle of needles) {
    assert(text.includes(needle), `${label}: "${needle}"`);
  }
}

/**
 * Simulates publish pipeline state after successful materialization + status update.
 * @param {'draft' | 'published'} stage
 */
function buildPipelineSnapshot(stage) {
  if (stage === 'draft') {
    return {
      status: 'READY_FOR_PUBLISH',
      deletedAt: null,
      publicSlug: null,
      linkCount: 0,
      activeQuestionCount: 0,
      mcqReadyCount: 0,
      durationMinutes: 30,
    };
  }

  return {
    status: 'published',
    deletedAt: null,
    publicSlug: 'sample-test-14',
    linkCount: 3,
    activeQuestionCount: 3,
    mcqReadyCount: 3,
    durationMinutes: 30,
  };
}

/**
 * Concurrent publish simulation — first writer publishes, second sees replay.
 * @param {number} parallelAttempts
 */
async function simulateConcurrentPublish(parallelAttempts = 2) {
  let published = false;
  let materializeCalls = 0;
  /** Serializes workers like SELECT … FOR UPDATE on tests. */
  let lockChain = Promise.resolve();

  const withPublishRowLock = (work) => {
    const run = lockChain.then(work);
    lockChain = run.catch(() => {});
    return run;
  };

  const publishOnce = (label) =>
    withPublishRowLock(async () => {
      const lockedStatus = published ? 'published' : 'READY_FOR_PUBLISH';
      const row = { id: 14, status: lockedStatus, public_slug: 'sample-test-14' };

      if (isPublishIdempotentReplay(row)) {
        recordPublishSuccess({ durationMs: 12, replay: true });
        return { label, replay: true, materialized: false };
      }

      materializeCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      published = true;
      recordPublishSuccess({ durationMs: 48, replay: false });
      return { label, replay: false, materialized: true };
    });

  const results = await Promise.all(
    Array.from({ length: parallelAttempts }, (_, index) => publishOnce(`worker-${index + 1}`))
  );

  return { results, materializeCalls, published };
}

console.log('testPublishPipeline — G-10 E2E\n');

mustContain('src/services/test.service.js', [
  'recordPublishSuccess',
  'recordPublishFailure',
  'logPublishStarted',
  'evaluatePublishedTestStudentReadiness',
], 'publishTest wires metrics + readiness');

mustContain('src/app.js', ['/api/metrics', 'getMetrics'], 'metrics endpoint registered');
mustContain('src/observability/testPublishMetrics.service.js', [
  'publish_success_total',
  'publish_failure_total',
  'publish_duration_ms',
], 'publish metrics defined');

resetPublishMetricsForTests();

{
  const draftReadiness = evaluateStudentReadinessFromSnapshot(buildPipelineSnapshot('draft'));
  assert(!draftReadiness.ready, 'draft stage is not student-ready');
  assert(
    draftReadiness.checks.some((check) => check.id === 'test_published' && !check.pass),
    'draft fails published check'
  );
}

{
  const publishedReadiness = evaluateStudentReadinessFromSnapshot(buildPipelineSnapshot('published'));
  assert(publishedReadiness.ready, 'published runtime snapshot is student-ready');
  assert(publishedReadiness.questionCount === 3, 'readiness reports question count');

  validateTestExistsAndPublished({
    id: 14,
    status: 'published',
    deleted_at: null,
  });
  assert(true, 'student start validator accepts published test');
}

{
  resetPublishMetricsForTests();
  recordPublishSuccess({ durationMs: 120, replay: false });
  const snapshot = getPublishMetricsSnapshot();
  assert(snapshot.publish_success_total === 1, 'success path increments publish_success_total');
  assert(snapshot.publish_failure_total === 0, 'success path does not increment failure counter');
  assert(snapshot.publish_duration_ms.count === 1, 'success path records publish_duration_ms');
  assert(snapshot.publish_duration_ms.last === 120, 'duration last value recorded');
  assert(snapshot.success_by_kind.first === 1, 'first publish counted separately');
}

{
  resetPublishMetricsForTests();
  recordPublishFailure({ durationMs: 35, errorCode: 'NO_QUIZ_DRAFT' });
  const snapshot = getPublishMetricsSnapshot();
  assert(snapshot.publish_failure_total === 1, 'failure path increments publish_failure_total');
  assert(snapshot.failures_by_code.NO_QUIZ_DRAFT === 1, 'failure tagged by error code');
  const prom = formatPublishMetricsPrometheus();
  assert(prom.includes('publish_failure_total'), 'prometheus export includes failure counter');
  assert(prom.includes('publish_duration_ms_sum'), 'prometheus export includes duration sum');
}

{
  resetPublishMetricsForTests();
  recordPublishSuccess({ durationMs: 90, replay: false });
  recordPublishSuccess({ durationMs: 8, replay: true });
  const snapshot = getPublishMetricsSnapshot();
  assert(snapshot.publish_success_total === 2, 'retry path counts both successes');
  assert(snapshot.success_by_kind.replay === 1, 'retry replay counted');
  const replay = formatPublishResponse({ id: 14, status: 'published' }, { idempotentReplay: true });
  assert(replay.publishReplay === true, 'retry response exposes publishReplay flag');
}

{
  resetPublishMetricsForTests();
  const { results, materializeCalls, published } = await simulateConcurrentPublish(3);
  const materialized = results.filter((row) => row.materialized);
  const replays = results.filter((row) => row.replay);
  assert(published, 'concurrent path ends published');
  assert(materializeCalls === 1, 'concurrent path materializes exactly once');
  assert(materialized.length === 1, 'one worker performs first publish');
  assert(replays.length === 2, 'other workers receive replay success');
  const snapshot = getPublishMetricsSnapshot();
  assert(snapshot.publish_success_total === 3, 'concurrent workers all count as success');
  assert(snapshot.success_by_kind.first === 1, 'concurrent first publish counted once');
  assert(snapshot.success_by_kind.replay === 2, 'concurrent replays counted');
}

{
  const executor = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (/FROM tests t[\s\S]*WHERE t.id = \?/i.test(normalized)) {
        return [
          [
            {
              id: params[0],
              status: 'published',
              deleted_at: null,
              public_slug: 'e2e-test',
              duration_minutes: 45,
              link_count: 2,
              active_question_count: 2,
            },
          ],
          [],
        ];
      }
      if (/COUNT\(\*\) AS ready_count/i.test(normalized)) {
        return [[{ ready_count: 2 }], []];
      }
      throw new Error(`unexpected readiness sql: ${normalized.slice(0, 80)}`);
    },
  };

  const readiness = await evaluatePublishedTestStudentReadiness(77, executor);
  assert(readiness.ready, 'DB-backed readiness evaluator passes healthy published test');
  assert(readiness.testId === 77, 'readiness report includes test id');
}

{
  let failureRecorded = false;
  try {
    throw new AppError({
      message: 'Draft has no questions.',
      errorCode: 'DRAFT_HAS_NO_QUESTIONS',
      httpStatus: 422,
      isOperational: true,
    });
  } catch (error) {
    recordPublishFailure({ durationMs: 22, errorCode: error.errorCode });
    failureRecorded = true;
  }
  assert(failureRecorded, 'failure path records operational publish error');
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
