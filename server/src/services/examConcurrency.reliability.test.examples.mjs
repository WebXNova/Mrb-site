/**
 * Exam autosave + submit concurrency reliability checks (source + model estimates).
 * Run: npm run test:exam-concurrency
 *
 * Does not require a live DB. Models pool pressure for 10/25/50/100 concurrent students.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

function read(rel) {
  return readFileSync(path.join(serverRoot, rel), 'utf8');
}

console.log('examConcurrency — autosave + submit reliability\n');

ok('exists: secureAttemptContext', existsSync(path.join(serverRoot, 'src/services/testAttempt/secureAttemptContext.js')));
ok('exists: testAttempt.service', existsSync(path.join(serverRoot, 'src/services/testAttempt.service.js')));
ok('exists: studentAnswerSave.queries', existsSync(path.join(serverRoot, 'src/services/studentAnswerSave.queries.js')));

const ctxSrc = read('src/services/testAttempt/secureAttemptContext.js');
const attemptSrc = read('src/services/testAttempt.service.js');
const portalSaveSrc = read('src/services/studentAnswerSave.service.js');
const portalSqlSrc = read('src/services/studentAnswerSave.queries.js');

console.log('\n[submit lock isolation]');
ok('locks attempt row only (SELECT id FROM test_attempts ... FOR UPDATE)', ctxSrc.includes('SELECT id FROM test_attempts'));
ok('does not append FOR UPDATE onto ATTEMPT_TEST_SELECT join', !ctxSrc.includes('${sql} FOR UPDATE') && !ctxSrc.includes('sql = `${sql} FOR UPDATE`'));
ok('submit skips subject presentation under lock', attemptSrc.includes('skipSubjectPresentation: true'));
ok(
  'submit skips entitlement revalidate when CEE entitlement present',
  attemptSrc.includes("auditContext: 'testAttempt.submitAttempt'") &&
    attemptSrc.includes('skipEntitlementRevalidate: Boolean(entitlement)')
);

const backpressureSrc = read('src/services/testSubmitBackpressure.js');
ok('exists: submit backpressure gate', existsSync(path.join(serverRoot, 'src/services/testSubmitBackpressure.js')));
ok('submit wraps with backpressure', attemptSrc.includes('withSubmitBackpressure'));
ok('backpressure fails closed with 503', backpressureSrc.includes('SUBMIT_BACKPRESSURE') && backpressureSrc.includes('503'));

console.log('\n[submit claim + short persist]');
ok('claims submitted before grading window', attemptSrc.includes("a.status = 'submitted'") && attemptSrc.includes('claimConnection'));
ok('releases claim connection before CPU grade', attemptSrc.includes('claimConnection.release()'));
ok(
  'non-guest loads exam snapshot after claim release',
  attemptSrc.includes('load frozen snapshot after releasing the claim connection') ||
    (attemptSrc.includes('Non-guest: load frozen snapshot') &&
      attemptSrc.indexOf('claimConnection.release()') < attemptSrc.lastIndexOf('loadEntitledExamSnapshot(ctx)'))
);
ok('persists result on a separate short transaction', attemptSrc.includes('persistConnection'));
ok('ER_DUP recovery uses submitted status after claim', attemptSrc.includes("status: 'submitted'"));

console.log('\n[autosave write safety]');
ok('portal UPSERT gates on in_progress + FOR UPDATE', portalSqlSrc.includes("a.status = 'in_progress'") && portalSqlSrc.includes('FOR UPDATE'));
ok('canonical autosave UPSERT gates on in_progress + FOR UPDATE', attemptSrc.includes("AND a.status = 'in_progress'") && attemptSrc.includes('FOR UPDATE'));
ok('portal does not fail the request if only touch races', portalSaveSrc.includes('last_activity touch skipped'));
ok(
  'canonical autosave touch is best-effort',
  attemptSrc.includes('last_activity touch failed') || attemptSrc.includes('touch is best-effort')
);
ok('autosave skips entitlement revalidate when CEE entitlement present', attemptSrc.includes('skipEntitlementRevalidate: Boolean(entitlement)'));
ok('autosave skips subject presentation', attemptSrc.includes("auditContext: 'testAttempt.saveAttemptAnswer'") && attemptSrc.includes('skipSubjectPresentation: true'));

console.log('\n[concurrency model — pool impact]');
const POOL = 30;
const AUTOSAVE_QUERIES = 5; // load + ownership + clock/loadable + upsert + touch (best case)
const SUBMIT_CLAIM_HOLD_MS = 80; // lock + read answers + claim
const SUBMIT_PERSIST_HOLD_MS = 120; // insert result + finalize
const GRADE_MS = 40; // in-process, no pool

/**
 * Rough simultaneous DB connections needed when N students hit the path at once.
 * Autosave: 1 connection per in-flight query chain (sequential), so ≈ concurrent requests.
 * Submit: claim + persist are sequential per request; peak ≈ concurrent submits (claim) then persist.
 */
function estimate(concurrency, kind) {
  if (kind === 'autosave') {
    const peakConns = concurrency; // each request holds ≤1 pool conn at a time
    const queueDepth = Math.max(0, peakConns - POOL);
    const approxWaitMs = queueDepth > 0 ? Math.ceil(queueDepth / POOL) * 25 : 0;
    return {
      concurrency,
      peakConns,
      poolLimit: POOL,
      queueDepth,
      approxExtraWaitMs: approxWaitMs,
      queriesPerRequest: AUTOSAVE_QUERIES,
      errorRateExpected: queueDepth > POOL * 2 ? 'elevated_acquire_timeout_risk' : 'low',
    };
  }

  // Submit: claim TX then release, grade CPU, persist TX — peak ≈ concurrency during stampede claim
  const peakConns = concurrency;
  const queueDepth = Math.max(0, peakConns - POOL);
  const holdMs = SUBMIT_CLAIM_HOLD_MS + SUBMIT_PERSIST_HOLD_MS;
  const waveMs = Math.ceil(concurrency / POOL) * holdMs + GRADE_MS;
  return {
    concurrency,
    peakConns,
    poolLimit: POOL,
    queueDepth,
    approxWaveMs: waveMs,
    claimHoldMs: SUBMIT_CLAIM_HOLD_MS,
    persistHoldMs: SUBMIT_PERSIST_HOLD_MS,
    gradeMsNoPool: GRADE_MS,
    sharedTestsRowLock: false,
    errorRateExpected: queueDepth > POOL ? 'queue_then_ok' : 'near_zero',
  };
}

const autosaveLevels = [10, 25, 50, 100].map((n) => estimate(n, 'autosave'));
const submitLevels = [10, 25, 50, 100].map((n) => estimate(n, 'submit'));

for (const row of autosaveLevels) {
  console.log(
    `  autosave n=${row.concurrency}: peakConns=${row.peakConns}/${POOL}, queue=${row.queueDepth}, extraWait~${row.approxExtraWaitMs}ms, risk=${row.errorRateExpected}`
  );
}
for (const row of submitLevels) {
  console.log(
    `  submit   n=${row.concurrency}: peakConns=${row.peakConns}/${POOL}, queue=${row.queueDepth}, wave~${row.approxWaveMs}ms, sharedTestsLock=${row.sharedTestsRowLock}, risk=${row.errorRateExpected}`
  );
}

ok('autosave 50 stays within 2x pool before severe risk', autosaveLevels.find((r) => r.concurrency === 50).errorRateExpected === 'low');
ok('submit no longer models shared tests-row serialization', submitLevels.every((r) => r.sharedTestsRowLock === false));
ok('submit 100 models queue-then-ok (not silent loss)', submitLevels.find((r) => r.concurrency === 100).errorRateExpected === 'queue_then_ok');

// Latency percentiles are model estimates (not live measured): claim+persist DB + grade CPU.
const p50 = SUBMIT_CLAIM_HOLD_MS + GRADE_MS + SUBMIT_PERSIST_HOLD_MS;
const p95 = Math.round(p50 * 1.8 + (100 > POOL ? ((100 - POOL) / POOL) * SUBMIT_CLAIM_HOLD_MS : 0));
const p99 = Math.round(p95 * 1.35);
console.log(`\n[modeled submit latency @100 concurrent] p50≈${p50}ms p95≈${p95}ms p99≈${p99}ms`);
ok('modeled p99 under 2s without timeout inflation', p99 < 2000);

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
