/**
 * Idempotent performance indexes — additive only (no column/table changes).
 */

const MIGRATION_NAME = 'performance_indexes';

/** @type {ReadonlyArray<{ table: string, name: string, columns: string, ddl: string }>} */
export const PERFORMANCE_INDEX_DEFINITIONS = Object.freeze([
  Object.freeze({
    table: 'test_attempts',
    name: 'idx_test_attempts_test_student_status',
    columns: 'test_id, student_id, status',
    ddl: 'ALTER TABLE test_attempts ADD KEY idx_test_attempts_test_student_status (test_id, student_id, status)',
  }),
  Object.freeze({
    table: 'test_attempts',
    name: 'idx_test_attempts_user_status',
    columns: 'user_id, status',
    ddl: 'ALTER TABLE test_attempts ADD KEY idx_test_attempts_user_status (user_id, status)',
  }),
  Object.freeze({
    table: 'activity_logs',
    name: 'idx_activity_logs_user_created_at',
    columns: 'user_id, created_at',
    ddl: 'ALTER TABLE activity_logs ADD KEY idx_activity_logs_user_created_at (user_id, created_at)',
  }),
]);

async function tableExists(mysqlPool, db, table) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function indexExists(mysqlPool, db, table, indexName) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [db, table, indexName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensurePerformanceIndexesSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  const steps = [];

  for (const index of PERFORMANCE_INDEX_DEFINITIONS) {
    if (!(await tableExists(mysqlPool, db, index.table))) {
      continue;
    }
    if (await indexExists(mysqlPool, db, index.table, index.name)) {
      continue;
    }
    steps.push({
      name: `add_${index.name}`,
      table: index.table,
      index: index.name,
      columns: index.columns,
      sql: index.ddl,
    });
  }

  const executed = [];
  for (const step of steps) {
    if (dryRun) {
      executed.push({ ...step, dryRun: true });
      continue;
    }
    console.log(`[schema] ${MIGRATION_NAME}: adding ${step.table}.${step.index} (${step.columns})`);
    await mysqlPool.query(step.sql);
    console.log(`[schema] ${MIGRATION_NAME}: added ${step.table}.${step.index}`);
    executed.push({ name: step.name, ok: true, table: step.table, index: step.index });
  }

  if (executed.length === 0 && !dryRun) {
    console.log(`[schema] ${MIGRATION_NAME}: all performance indexes already present`);
  }

  return { migration: MIGRATION_NAME, dryRun, steps: executed };
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 */
export async function analyzePerformanceIndexes(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) {
    return { indexes: PERFORMANCE_INDEX_DEFINITIONS.map((def) => ({ ...def, present: false })) };
  }

  const indexes = [];
  for (const def of PERFORMANCE_INDEX_DEFINITIONS) {
    const tablePresent = await tableExists(mysqlPool, db, def.table);
    const present =
      tablePresent && (await indexExists(mysqlPool, db, def.table, def.name));
    indexes.push({
      table: def.table,
      name: def.name,
      columns: def.columns,
      tablePresent,
      present,
    });
  }

  return {
    indexes,
    allPresent: indexes.every((entry) => !entry.tablePresent || entry.present),
  };
}
