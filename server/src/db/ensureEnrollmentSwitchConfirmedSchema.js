/**
 * Ensures `enrollments.switch_confirmed_at` exists for paid-course switch confirmation persistence.
 *
 * Uses metadata-only DDL (ALGORITHM=INSTANT) so startup stays fast on large production tables.
 */

const MIGRATION_NAME = 'enrollment_switch_confirmed';

/**
 * Nullable TIMESTAMP at table end — eligible for instant DDL on MySQL 8.0+ (no table rebuild).
 * Column order is cosmetic; application code references by name only.
 */
export const ADD_SWITCH_CONFIRMED_COLUMN_SQL = `ALTER TABLE enrollments
  ADD COLUMN switch_confirmed_at TIMESTAMP NULL DEFAULT NULL,
  ALGORITHM=INSTANT, LOCK=NONE`;

async function tableExists(pool, db, table) {
  const [rows] = await pool.query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     LIMIT 1`,
    [db, table]
  );
  return rows.length > 0;
}

async function columnExists(pool, db, table, column) {
  const [rows] = await pool.query(
    `SELECT 1 AS ok
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
     LIMIT 1`,
    [db, table, column]
  );
  return rows.length > 0;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureEnrollmentSwitchConfirmedSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  if (!(await tableExists(mysqlPool, db, 'enrollments'))) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'enrollments_missing' };
  }

  if (await columnExists(mysqlPool, db, 'enrollments', 'switch_confirmed_at')) {
    return { migration: MIGRATION_NAME, steps: [] };
  }

  const step = {
    name: 'add_switch_confirmed_at',
    sql: ADD_SWITCH_CONFIRMED_COLUMN_SQL,
  };

  if (dryRun) {
    return { migration: MIGRATION_NAME, dryRun: true, steps: [step] };
  }

  console.log(`[schema] ${MIGRATION_NAME}: adding enrollments.switch_confirmed_at`);
  await mysqlPool.query(step.sql);
  console.log(`[schema] ${MIGRATION_NAME}: added enrollments.switch_confirmed_at`);

  return { migration: MIGRATION_NAME, steps: [{ name: step.name, ok: true }] };
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 */
export async function analyzeEnrollmentSwitchConfirmedSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) {
    return { migration: MIGRATION_NAME, tablePresent: false, columnPresent: false, migrationReady: false };
  }

  const tablePresent = await tableExists(mysqlPool, db, 'enrollments');
  const columnPresent =
    tablePresent && (await columnExists(mysqlPool, db, 'enrollments', 'switch_confirmed_at'));

  return {
    migration: MIGRATION_NAME,
    tablePresent,
    columnPresent,
    migrationReady: !tablePresent || columnPresent,
  };
}
