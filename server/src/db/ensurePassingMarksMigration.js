/**
 * Migration: passing_percentage → passing_marks (DECIMAL 8,2).
 *
 * Backfill: passing_marks = (total_marks × passing_percentage) / 100
 * Safe for production — never drops data until backfill completes.
 */

const MIGRATION_QUERY_TIMEOUT_MS = 120_000;

async function tableExists(pool, db, tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function columnExists(pool, db, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, tableName, columnName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function getColumnMeta(pool, db, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, tableName, columnName]
  );
  return rows[0] ?? null;
}

function normalizeColumnType(meta) {
  return String(meta?.COLUMN_TYPE ?? '').toLowerCase();
}

function isDecimal82(meta) {
  return normalizeColumnType(meta).startsWith('decimal(8,2)');
}

function isFinalPassingMarksColumn(meta) {
  if (!meta || !isDecimal82(meta)) return false;
  return String(meta.IS_NULLABLE ?? '').toUpperCase() === 'NO';
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} sql
 * @param {unknown[]} [values]
 */
async function runMigrationQuery(pool, sql, values) {
  return pool.query({ sql, timeout: MIGRATION_QUERY_TIMEOUT_MS }, values);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
export async function ensurePassingMarksMigration(pool) {
  const [dbRows] = await pool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db || !(await tableExists(pool, db, 'tests'))) {
    return { skipped: true, reason: 'tests table not found' };
  }

  const hasPassingPercentage = await columnExists(pool, db, 'tests', 'passing_percentage');
  const hasPassingMarks = await columnExists(pool, db, 'tests', 'passing_marks');
  const passingMarksMeta = hasPassingMarks ? await getColumnMeta(pool, db, 'tests', 'passing_marks') : null;

  if (!hasPassingPercentage && isFinalPassingMarksColumn(passingMarksMeta)) {
    return { skipped: true, reason: 'already_migrated' };
  }

  const steps = [];

  if (!hasPassingMarks) {
    await runMigrationQuery(
      pool,
      `ALTER TABLE tests ADD COLUMN passing_marks DECIMAL(8,2) NULL AFTER duration_minutes`
    );
    steps.push('added_passing_marks');
  } else if (!isDecimal82(passingMarksMeta)) {
    await runMigrationQuery(pool, `ALTER TABLE tests MODIFY COLUMN passing_marks DECIMAL(8,2) NULL`);
    steps.push('widened_passing_marks_decimal');
  }

  if (hasPassingPercentage) {
    const [backfillResult] = await runMigrationQuery(
      pool,
      `UPDATE tests t
       INNER JOIN (
         SELECT tq.test_id,
                COALESCE(SUM(COALESCE(tq.marks_override, qb.marks, 1)), 0) AS total_marks
         FROM test_questions tq
         INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
         GROUP BY tq.test_id
       ) calc ON calc.test_id = t.id
       SET t.passing_marks = ROUND(calc.total_marks * t.passing_percentage / 100, 2)
       WHERE t.deleted_at IS NULL
         AND t.passing_marks IS NULL
         AND t.passing_percentage IS NOT NULL`
    );
    if (Number(backfillResult?.affectedRows ?? 0) > 0) {
      steps.push(`backfilled_from_percentage:${backfillResult.affectedRows}`);
    }

    await runMigrationQuery(
      pool,
      `UPDATE tests
       SET passing_marks = 0
       WHERE deleted_at IS NULL AND passing_marks IS NULL`
    );
    steps.push('zeroed_remaining_null_passing_marks');
  } else if (!hasPassingMarks) {
    return { steps };
  } else {
    const [zeroResult] = await runMigrationQuery(
      pool,
      `UPDATE tests
       SET passing_marks = 0
       WHERE deleted_at IS NULL AND passing_marks IS NULL`
    );
    if (Number(zeroResult?.affectedRows ?? 0) > 0) {
      steps.push('zeroed_null_passing_marks');
    }
  }

  const [nullCheck] = await pool.query(
    `SELECT COUNT(*) AS n FROM tests WHERE deleted_at IS NULL AND passing_marks IS NULL`
  );
  if (Number(nullCheck[0]?.n ?? 0) > 0) {
    throw new Error(
      `Passing marks migration blocked: ${nullCheck[0].n} tests still have NULL passing_marks`
    );
  }

  const latestPassingMarksMeta = await getColumnMeta(pool, db, 'tests', 'passing_marks');
  if (!isFinalPassingMarksColumn(latestPassingMarksMeta)) {
    await runMigrationQuery(
      pool,
      `ALTER TABLE tests MODIFY COLUMN passing_marks DECIMAL(8,2) NOT NULL DEFAULT 0.00`
    );
    steps.push('passing_marks_not_null');
  }

  if (hasPassingPercentage) {
    await runMigrationQuery(pool, `ALTER TABLE tests DROP COLUMN passing_percentage`);
    steps.push('dropped_passing_percentage');
  }

  return { steps };
}
