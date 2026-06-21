#!/usr/bin/env node
/**
 * Aiken import load benchmark — isolated runs per question count.
 *
 * Measures: API/service latency, DB query time, memory, CPU, failure rate, event-loop lag.
 *
 * Usage:
 *   node scripts/benchmark-aiken-import-load.mjs
 *   node scripts/benchmark-aiken-import-load.mjs --sizes=10,50,100
 *   node --expose-gc scripts/benchmark-aiken-import-load.mjs
 *
 * Env (optional):
 *   BENCHMARK_COURSE_ID — course FK for imports
 *   BENCHMARK_USER_ID   — admin user id (created_by)
 *   BENCHMARK_OUTPUT_DIR — defaults to benchmark-results/
 */
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { mysqlPool } from '../src/config/mysql.js';
import { importAikenQuestions } from '../src/services/questionImportService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = join(__dirname, '..');

const DEFAULT_SIZES = [10, 50, 100, 250, 500];
const LIMITS_MS = Object.freeze({
  10: 2000,
  50: 2000,
  100: 2000,
  250: 5000,
  500: 10000,
});
/** Event-loop lag above this threshold fails the run (blocking risk). */
const EVENT_LOOP_BLOCK_MS = 500;
const EVENT_LOOP_WARN_MS = 100;

function parseSizesArg() {
  const flag = process.argv.find((arg) => arg.startsWith('--sizes='));
  if (!flag) return DEFAULT_SIZES;
  return flag
    .slice('--sizes='.length)
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

/**
 * @param {number} index
 */
function buildAikenBlock(index) {
  const stem = `Benchmark load question #${index}: what is ${index} + ${index}?`;
  return [
    stem,
    'A) First distractor',
    'B) Second distractor',
    'C) Third distractor',
    `D) Correct answer ${index * 2}`,
    'ANSWER: D',
    '',
  ].join('\n');
}

/**
 * @param {number} count
 */
function buildAikenDocument(count) {
  const blocks = [];
  for (let index = 1; index <= count; index += 1) {
    blocks.push(buildAikenBlock(index));
  }
  return blocks.join('\n');
}

/**
 * Wrap pool + connection queries to accumulate DB timings during a run.
 */
function createDbProbe(pool) {
  const stats = {
    queryCount: 0,
    totalMs: 0,
    maxMs: 0,
  };

  const originalGetConnection = pool.getConnection.bind(pool);
  const originalQuery = pool.query.bind(pool);

  function wrapQuery(queryFn) {
    return async (...args) => {
      const started = performance.now();
      try {
        return await queryFn(...args);
      } finally {
        const elapsed = performance.now() - started;
        stats.queryCount += 1;
        stats.totalMs += elapsed;
        if (elapsed > stats.maxMs) stats.maxMs = elapsed;
      }
    };
  }

  return {
    stats,
    install() {
      pool.query = wrapQuery(originalQuery);
      pool.getConnection = async () => {
        const connection = await originalGetConnection();
        const connectionQuery = connection.query.bind(connection);
        connection.query = wrapQuery(connectionQuery);
        return connection;
      };
    },
    uninstall() {
      pool.query = originalQuery;
      pool.getConnection = originalGetConnection;
    },
  };
}

/**
 * @returns {Promise<{ courseId: number, userId: number }>}
 */
async function resolveBenchmarkFixtures() {
  const envCourseId = Number(process.env.BENCHMARK_COURSE_ID);
  const envUserId = Number(process.env.BENCHMARK_USER_ID);
  if (Number.isFinite(envCourseId) && envCourseId > 0 && Number.isFinite(envUserId) && envUserId > 0) {
    return { courseId: envCourseId, userId: envUserId };
  }

  const [courseRows] = await mysqlPool.query(
    `SELECT id FROM courses
     ORDER BY id ASC
     LIMIT 1`
  );
  const courseId = Number(courseRows[0]?.id);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    throw new Error('No course found. Set BENCHMARK_COURSE_ID or seed a course first.');
  }

  const [userRows] = await mysqlPool.query(
    `SELECT id FROM users
     WHERE role IN ('admin', 'super_admin')
     ORDER BY id ASC
     LIMIT 1`
  );
  const userId = Number(userRows[0]?.id);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error('No admin user found. Set BENCHMARK_USER_ID or seed an admin user first.');
  }

  return { courseId, userId };
}

/**
 * @param {number|null|undefined} batchId
 */
async function cleanupBenchmarkBatch(batchId) {
  if (!Number.isFinite(batchId) || batchId <= 0) return;

  const [itemRows] = await mysqlPool.query(
    `SELECT question_id
     FROM question_import_batch_items
     WHERE batch_id = ?
       AND question_id IS NOT NULL`,
    [batchId]
  );

  const questionIds = itemRows
    .map((row) => Number(row.question_id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (questionIds.length > 0) {
    await mysqlPool.query(`DELETE FROM question_options WHERE question_id IN (?)`, [questionIds]);
    await mysqlPool.query(`DELETE FROM question_bank WHERE id IN (?)`, [questionIds]);
  }

  await mysqlPool.query(`DELETE FROM question_import_batches WHERE id = ?`, [batchId]);
}

function memorySnapshot() {
  const memory = process.memoryUsage();
  return {
    rssMb: round(memory.rss / 1024 / 1024),
    heapUsedMb: round(memory.heapUsed / 1024 / 1024),
    heapTotalMb: round(memory.heapTotal / 1024 / 1024),
    externalMb: round(memory.external / 1024 / 1024),
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function cpuDeltaMs(before, after) {
  const delta = process.cpuUsage(before);
  return {
    userMs: round(delta.user / 1000),
    systemMs: round(delta.system / 1000),
    totalMs: round((delta.user + delta.system) / 1000),
  };
}

function evaluateRun(size, metrics) {
  const limitMs = LIMITS_MS[size] ?? LIMITS_MS[500];
  const failures = [];

  if (!metrics.success && !metrics.errorMessage) {
    failures.push(`import reported failure (imported=${metrics.imported}, failed=${metrics.failed})`);
  }
  if (metrics.errorMessage) {
    failures.push(`import threw: ${metrics.errorMessage}`);
  }
  if (metrics.imported !== size) {
    failures.push(`expected ${size} imported, got ${metrics.imported} (failed=${metrics.failed})`);
  }
  if (metrics.apiResponseMs > limitMs) {
    failures.push(`apiResponseMs ${metrics.apiResponseMs} exceeded limit ${limitMs}ms`);
  }
  if (metrics.eventLoop.maxLagMs > EVENT_LOOP_BLOCK_MS) {
    failures.push(
      `event loop max lag ${metrics.eventLoop.maxLagMs}ms exceeds block threshold ${EVENT_LOOP_BLOCK_MS}ms`
    );
  }

  const warnings = [];
  if (metrics.eventLoop.maxLagMs > EVENT_LOOP_WARN_MS && metrics.eventLoop.maxLagMs <= EVENT_LOOP_BLOCK_MS) {
    warnings.push(`event loop max lag ${metrics.eventLoop.maxLagMs}ms (warn > ${EVENT_LOOP_WARN_MS}ms)`);
  }

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    limitMs,
  };
}

/**
 * @param {number} size
 * @param {{ courseId: number, userId: number }} fixtures
 */
async function runIsolatedImport(size, fixtures) {
  const runId = `benchmark-${size}-${Date.now()}`;
  const content = buildAikenDocument(size);
  const fileName = `${runId}.aiken`;

  if (typeof global.gc === 'function') {
    global.gc();
  }

  const memoryBefore = memorySnapshot();
  const cpuBefore = process.cpuUsage();

  const eventLoopHistogram = monitorEventLoopDelay({ resolution: 20 });
  eventLoopHistogram.enable();

  let maxImmediateLagMs = 0;
  const immediateProbe = setInterval(() => {
    const started = performance.now();
    setImmediate(() => {
      const lag = performance.now() - started;
      if (lag > maxImmediateLagMs) maxImmediateLagMs = lag;
    });
  }, 5);

  const dbProbe = createDbProbe(mysqlPool);
  dbProbe.install();

  const apiStarted = performance.now();
  /** @type {import('../src/services/questionImportService.js').AikenImportResult | null} */
  let result = null;
  /** @type {Error | null} */
  let error = null;

  try {
    result = await importAikenQuestions({
      course_id: fixtures.courseId,
      subject_id: null,
      topic: 'benchmark-load',
      difficulty: null,
      content,
      created_by: fixtures.userId,
      file_name: fileName,
      marks: 1,
      duplicate_policy: 'allow',
    });
  } catch (err) {
    error = err instanceof Error ? err : new Error(String(err));
  } finally {
    clearInterval(immediateProbe);
    eventLoopHistogram.disable();
    dbProbe.uninstall();
  }

  const apiResponseMs = round(performance.now() - apiStarted);
  const memoryAfter = memorySnapshot();
  const cpu = cpuDeltaMs(cpuBefore, process.cpuUsage());

  const eventLoop = {
    maxLagMs: round(Math.max(eventLoopHistogram.max / 1e6, maxImmediateLagMs)),
    meanLagMs: round(eventLoopHistogram.mean / 1e6),
    p99LagMs: round(eventLoopHistogram.percentile(99) / 1e6),
  };

  const imported = Number(result?.imported ?? 0);
  const failed = Number(result?.failed ?? 0);
  const batchId = result?.batchId ?? null;

  try {
    await cleanupBenchmarkBatch(batchId);
  } catch (cleanupError) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'BENCHMARK_CLEANUP_FAILED',
        batchId,
        message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      })
    );
  }

  const nonDbMs = round(Math.max(apiResponseMs - dbProbe.stats.totalMs, 0));

  const metrics = {
    runId,
    questionCount: size,
    success: error == null && imported === size && failed === 0,
    imported,
    failed,
    failureRate: round(size > 0 ? failed / size : 0),
    batchId,
    apiResponseMs,
    dbInsertMs: round(dbProbe.stats.totalMs),
    nonDbMs,
    dbQueryCount: dbProbe.stats.queryCount,
    dbMaxQueryMs: round(dbProbe.stats.maxMs),
    memoryBefore,
    memoryAfter,
    memoryDeltaMb: round(memoryAfter.heapUsedMb - memoryBefore.heapUsedMb),
    cpu,
    eventLoop,
    errorMessage: error?.message ?? null,
  };

  const evaluation = evaluateRun(size, metrics);

  return {
    ...metrics,
    evaluation,
  };
}

function printSummaryTable(results) {
  console.log('\n=== Aiken import load benchmark summary ===\n');
  console.log(
    '| Questions | API ms | DB ms | Heap Δ MB | CPU ms | Max EL lag ms | Imported | Pass |'
  );
  console.log(
    '|-----------|--------|-------|-----------|--------|---------------|----------|------|'
  );

  for (const row of results) {
    console.log(
      `| ${String(row.questionCount).padStart(9)} | ${String(row.apiResponseMs).padStart(6)} | ${String(row.dbInsertMs).padStart(5)} | ${String(row.memoryDeltaMb).padStart(9)} | ${String(row.cpu.totalMs).padStart(6)} | ${String(row.eventLoop.maxLagMs).padStart(13)} | ${String(row.imported).padStart(8)} | ${row.evaluation.pass ? 'YES' : 'NO '} |`
    );
  }
}

async function main() {
  const sizes = parseSizesArg();
  const startedAt = new Date().toISOString();
  console.log(JSON.stringify({ event: 'BENCHMARK_SUITE_STARTED', startedAt, sizes }));

  await mysqlPool.query('SELECT 1');

  const fixtures = await resolveBenchmarkFixtures();
  console.log(
    JSON.stringify({
      event: 'BENCHMARK_FIXTURES',
      courseId: fixtures.courseId,
      userId: fixtures.userId,
    })
  );

  /** @type {Awaited<ReturnType<typeof runIsolatedImport>>[]} */
  const results = [];

  for (const size of sizes) {
    console.log(JSON.stringify({ event: 'BENCHMARK_RUN_STARTED', questionCount: size }));
    const result = await runIsolatedImport(size, fixtures);
    results.push(result);

    console.log(
      JSON.stringify({
        event: 'BENCHMARK_RUN_COMPLETED',
        questionCount: size,
        pass: result.evaluation.pass,
        apiResponseMs: result.apiResponseMs,
        dbInsertMs: result.dbInsertMs,
        memoryDeltaMb: result.memoryDeltaMb,
        cpuTotalMs: result.cpu.totalMs,
        eventLoopMaxLagMs: result.eventLoop.maxLagMs,
        imported: result.imported,
        failed: result.failed,
        failures: result.evaluation.failures,
        warnings: result.evaluation.warnings,
      })
    );

    if (!result.evaluation.pass) {
      for (const failure of result.evaluation.failures) {
        console.error(`  FAIL [${size}]: ${failure}`);
      }
    }
    for (const warning of result.evaluation.warnings) {
      console.warn(`  WARN [${size}]: ${warning}`);
    }

    // Brief pause between isolated runs.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const outputDir = process.env.BENCHMARK_OUTPUT_DIR || join(SERVER_ROOT, 'benchmark-results');
  mkdirSync(outputDir, { recursive: true });
  const outputPath = join(outputDir, `aiken-import-load-${startedAt.replace(/[:.]/g, '-')}.json`);

  const report = {
    suite: 'aiken-import-load',
    startedAt,
    completedAt: new Date().toISOString(),
    fixtures,
    limitsMs: LIMITS_MS,
    eventLoopBlockThresholdMs: EVENT_LOOP_BLOCK_MS,
    results,
    summary: {
      totalRuns: results.length,
      passedRuns: results.filter((row) => row.evaluation.pass).length,
      failedRuns: results.filter((row) => !row.evaluation.pass).length,
      eventLoopBlocked: results.some((row) => row.eventLoop.maxLagMs > EVENT_LOOP_BLOCK_MS),
    },
  };

  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  printSummaryTable(results);

  console.log(`\nResults written to: ${outputPath}`);
  console.log(
    JSON.stringify({
      event: 'BENCHMARK_SUITE_COMPLETED',
      passed: report.summary.passedRuns,
      failed: report.summary.failedRuns,
      outputPath,
    })
  );

  await mysqlPool.end();

  if (report.summary.failedRuns > 0 || report.summary.eventLoopBlocked) {
    console.error('\nBenchmark suite FAILED — review metrics and consider batch processing refactor.');
    process.exit(1);
  }

  console.log('\nBenchmark suite PASSED.');
}

main().catch(async (error) => {
  console.error(
    JSON.stringify({
      event: 'BENCHMARK_SUITE_ERROR',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
  );
  try {
    await mysqlPool.end();
  } catch {
    // ignore pool shutdown errors
  }
  process.exit(1);
});
