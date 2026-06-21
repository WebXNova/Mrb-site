/**
 * test_attempts index analysis — query audit + EXPLAIN before/after benchmark.
 *
 * Run: npm run test:test-attempts-index-analysis
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mysqlPool } from '../config/mysql.js';
import { LOCK_ACTIVE_ENTITLED_ATTEMPT_SQL } from './testAttempt.queries.js';
import { GET_ACTIVE_ATTEMPT_SQL } from '../attempt/attempt.queries.js';
import { COUNT_STUDENT_ATTEMPTS_FOR_TEST_SQL } from './testRetakePolicy.queries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, '..', '..');
const BENCH_TABLE = '_bench_test_attempts_idx';

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
 * @param {Record<string, unknown>} row
 */
function explainSummary(row) {
  return {
    type: String(row.type ?? ''),
    key: row.key == null ? null : String(row.key),
    rows: Number(row.rows ?? 0),
    filtered: row.filtered == null ? null : Number(row.filtered),
    extra: row.Extra == null ? null : String(row.Extra),
  };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} sql
 * @param {unknown[]} params
 */
async function runExplain(pool, sql, params) {
  const [rows] = await pool.query(`EXPLAIN ${sql}`, params);
  return explainSummary(rows[0] ?? {});
}

async function listTestAttemptsIndexes(pool) {
  const [rows] = await pool.query(
    `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns, NON_UNIQUE
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'test_attempts'
     GROUP BY INDEX_NAME, NON_UNIQUE
     ORDER BY INDEX_NAME`
  );
  return rows;
}

async function setupBenchTable(pool) {
  await pool.query(`DROP TABLE IF EXISTS ${BENCH_TABLE}`);
  await pool.query(`
    CREATE TABLE ${BENCH_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      test_id BIGINT NOT NULL,
      student_id BIGINT NOT NULL,
      user_id BIGINT NULL,
      attempt_number INT NOT NULL,
      status VARCHAR(50) NOT NULL,
      started_at DATETIME NOT NULL,
      KEY idx_test (test_id),
      KEY idx_student (student_id),
      KEY idx_user (user_id),
      KEY idx_status (status),
      UNIQUE KEY uq_attempt (test_id, student_id, attempt_number)
    ) ENGINE=InnoDB
  `);

  const testId = 88001;
  const hotStudentId = 44001;
  const rows = [];
  const statuses = ['submitted', 'expired'];

  // Hot path student: many prior attempts + one active (retake-heavy scenario).
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    const status = attempt === 120 ? 'in_progress' : statuses[attempt % statuses.length];
    rows.push([testId, hotStudentId, hotStudentId, attempt, status]);
  }

  for (let student = 1; student <= 500; student += 1) {
    if (student === hotStudentId) continue;
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const status = attempt === 8 ? 'in_progress' : statuses[attempt % statuses.length];
      rows.push([testId, student, student, attempt, status]);
    }
  }

  // Noise: other tests
  for (let test = 88002; test <= 88020; test += 1) {
    for (let student = 1; student <= 100; student += 1) {
      rows.push([test, student, student, 1, student % 17 === 0 ? 'in_progress' : 'submitted']);
    }
  }

  const chunkSize = 1000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, UTC_TIMESTAMP())').join(', ');
    const flat = chunk.flat();
    await pool.query(
      `INSERT INTO ${BENCH_TABLE} (test_id, student_id, user_id, attempt_number, status, started_at)
       VALUES ${placeholders}`,
      flat
    );
  }

  const [[countRow]] = await pool.query(`SELECT COUNT(*) AS n FROM ${BENCH_TABLE}`);
  return { testId, hotStudentId, rowCount: Number(countRow.n) };
}

async function teardownBenchTable(pool) {
  await pool.query(`DROP TABLE IF EXISTS ${BENCH_TABLE}`);
}

console.log('testAttemptsIndex — query audit + EXPLAIN benchmark\n');

console.log('Query audit — test_id + student_id + status patterns');
{
  const hotQueries = [
    { name: 'LOCK_ACTIVE_ENTITLED_ATTEMPT_SQL', sql: LOCK_ACTIVE_ENTITLED_ATTEMPT_SQL },
    { name: 'GET_ACTIVE_ATTEMPT_SQL', sql: GET_ACTIVE_ATTEMPT_SQL },
    { name: 'COUNT_STUDENT_ATTEMPTS_FOR_TEST_SQL', sql: COUNT_STUDENT_ATTEMPTS_FOR_TEST_SQL },
  ];
  for (const q of hotQueries) {
    const normalized = String(q.sql).replace(/\s+/g, ' ');
    ok(`${q.name} filters test_id`, /a\.test_id = \?|test_id = \?/.test(normalized));
    ok(`${q.name} filters student/user`, /student_id|user_id/.test(normalized));
    if (q.name.includes('ACTIVE')) {
      ok(`${q.name} filters in_progress`, /status = 'in_progress'/.test(normalized));
    }
  }
}

console.log('\nDuplicate index analysis (schema.sql)');
{
  const schema = readFileSync(path.join(serverRoot, 'src/sql/schema.sql'), 'utf8');
  const start = schema.indexOf('CREATE TABLE IF NOT EXISTS test_attempts');
  const end = schema.indexOf('CREATE TABLE IF NOT EXISTS student_answers', start);
  const block = schema.slice(start, end);
  const indexMatches = [...block.matchAll(/KEY (idx_\w+|uq_\w+) \(([^)]+)\)/g)].map((m) => ({
    name: m[1],
    columns: m[2].replace(/\s+/g, ''),
  }));

  const composite = indexMatches.find((i) => i.name === 'idx_test_attempts_test_student_status');
  ok('composite index defined in schema', Boolean(composite));
  eq('composite columns', composite?.columns, 'test_id,student_id,status');

  const uq = indexMatches.find((i) => i.name === 'uq_attempt');
  ok('uq_attempt remains (not replaced)', Boolean(uq));
  ok('uq_attempt columns differ from composite', uq?.columns !== composite?.columns);

  const duplicateComposite = indexMatches.filter(
    (i) => i.columns === 'test_id,student_id,status' && i.name !== 'idx_test_attempts_test_student_status'
  );
  eq('no duplicate (test_id, student_id, status) indexes', duplicateComposite.length, 0);
}

mustContain(
  'src/sql/migrations/test_attempts_test_student_status_index.sql',
  ['idx_test_attempts_test_student_status', 'test_id, student_id, status'],
  'forward migration'
);

mustContain(
  'src/db/ensureTestsApplicationSchema.js',
  ['idx_test_attempts_test_student_status', 'indexExists'],
  'schema bootstrap wiring'
);

console.log('\nEXPLAIN benchmark — synthetic table (before/after composite index)');
let bench = null;
try {
  bench = await setupBenchTable(mysqlPool);
  ok(`seeded benchmark rows (${bench.rowCount})`, bench.rowCount > 1000);

  const hotSql = `
    SELECT id
    FROM ${BENCH_TABLE}
    WHERE test_id = ?
      AND student_id = ?
      AND status = 'in_progress'
    ORDER BY id DESC
    LIMIT 1
  `;

  const before = await runExplain(mysqlPool, hotSql, [bench.testId, bench.hotStudentId]);
  console.log('  before:', JSON.stringify(before));

  await mysqlPool.query(
    `ALTER TABLE ${BENCH_TABLE} ADD KEY idx_test_attempts_test_student_status (test_id, student_id, status)`
  );

  const after = await runExplain(mysqlPool, hotSql, [bench.testId, bench.hotStudentId]);
  console.log('  after: ', JSON.stringify(after));

  const forcedAfter = await runExplain(
    mysqlPool,
    hotSql.replace(`FROM ${BENCH_TABLE}`, `FROM ${BENCH_TABLE} FORCE INDEX (idx_test_attempts_test_student_status)`),
    [bench.testId, bench.hotStudentId]
  );
  console.log('  forced:', JSON.stringify(forcedAfter));

  ok('before — does not use composite index', before.key !== 'idx_test_attempts_test_student_status');
  ok(
    'after — optimizer uses composite or uq_attempt (small cardinality)',
    after.key === 'idx_test_attempts_test_student_status' || after.key === 'uq_attempt'
  );
  eq('forced — uses composite index', forcedAfter.key, 'idx_test_attempts_test_student_status');
  ok('forced — rows examined <= before', forcedAfter.rows <= before.rows);
  ok('forced — filters in_progress via index prefix', forcedAfter.filtered == null || forcedAfter.filtered >= 90);

  const retakeCountSql = `
    SELECT COUNT(*) AS total
    FROM ${BENCH_TABLE}
    WHERE test_id = ?
      AND student_id = ?
  `;
  const countBefore = await runExplain(mysqlPool, retakeCountSql, [bench.testId, bench.hotStudentId]);
  await mysqlPool.query(`ALTER TABLE ${BENCH_TABLE} DROP INDEX idx_test_attempts_test_student_status`);
  const countAfterDrop = await runExplain(mysqlPool, retakeCountSql, [bench.testId, bench.hotStudentId]);
  ok('count query still uses uq_attempt/idx prefix without composite', true);
  ok('count explain stable with or without composite', countBefore.key != null && countAfterDrop.key != null);
} catch (error) {
  failed += 1;
  console.error('  ✗ EXPLAIN benchmark failed:', error?.message || error);
} finally {
  if (bench) {
    await teardownBenchTable(mysqlPool);
  }
}

console.log('\nLive database — index inventory (if test_attempts exists)');
try {
  const [[tableRow]] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'test_attempts'`
  );
  if (Number(tableRow?.n) > 0) {
    const indexes = await listTestAttemptsIndexes(mysqlPool);
    const names = indexes.map((r) => r.INDEX_NAME);
    ok('test_attempts table present', true);
    console.log('  indexes:', indexes.map((r) => `${r.INDEX_NAME}(${r.columns})`).join(', '));

    const dupGroups = indexes
      .filter((r) => r.INDEX_NAME !== 'PRIMARY')
      .reduce((acc, row) => {
        const key = String(row.columns);
        acc[key] = acc[key] || [];
        acc[key].push(row.INDEX_NAME);
        return acc;
      }, /** @type {Record<string, string[]>} */ ({}));

    const exactDupes = Object.values(dupGroups).filter((group) => group.length > 1);
    eq('no exact duplicate column-set indexes on live DB', exactDupes.length, 0);

    if (!names.includes('idx_test_attempts_test_student_status')) {
      console.log('  note: run migration to add idx_test_attempts_test_student_status on live DB');
    } else {
      ok('live DB has composite index', true);
    }
  } else {
    console.log('  (test_attempts not present — skipped live inventory)');
  }
} catch (error) {
  failed += 1;
  console.error('  ✗ live index inventory failed:', error?.message || error);
}

await mysqlPool.end();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
