/**
 * DB integrity: at most one enrollment per user with access_status = 'active'.
 *
 * Mirrors enrollmentLifecycle.service.js business rule using a partial unique index
 * via generated column (no triggers — safe on managed MySQL).
 */

const MIGRATION_NAME = 'enrollment_one_active_per_user';

async function columnExists(mysqlPool, db, table, column) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column]
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

async function tableExists(mysqlPool, db, table) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureEnrollmentOneActivePerUserSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  if (!(await tableExists(mysqlPool, db, 'enrollments'))) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'enrollments_missing' };
  }

  const steps = [];

  steps.push({
    name: 'deactivate_duplicate_active_enrollments_per_user',
    sql: `UPDATE enrollments e
      INNER JOIN (
        SELECT id
        FROM (
          SELECT id,
                 ROW_NUMBER() OVER (
                   PARTITION BY user_id
                   ORDER BY updated_at DESC, id DESC
                 ) AS rn
          FROM enrollments
          WHERE access_status = 'active'
        ) ranked
        WHERE rn > 1
      ) dup ON dup.id = e.id
      SET e.access_status = 'inactive',
          e.updated_at = CURRENT_TIMESTAMP`,
  });

  if (!(await columnExists(mysqlPool, db, 'enrollments', 'active_user_id'))) {
    steps.push({
      name: 'add_active_user_id_generated',
      sql: `ALTER TABLE enrollments
        ADD COLUMN active_user_id BIGINT
          GENERATED ALWAYS AS (IF(access_status = 'active', user_id, NULL)) VIRTUAL
          AFTER access_status`,
    });
  }

  if (!(await indexExists(mysqlPool, db, 'enrollments', 'uq_enrollments_one_active_per_user'))) {
    steps.push({
      name: 'add_uq_enrollments_one_active_per_user',
      sql: `ALTER TABLE enrollments
        ADD UNIQUE KEY uq_enrollments_one_active_per_user (active_user_id)`,
    });
  }

  const executed = [];
  for (const step of steps) {
    if (dryRun) {
      executed.push({ ...step, dryRun: true });
      continue;
    }
    console.log(`[migration] ${MIGRATION_NAME}: step "${step.name}" — running`);
    await mysqlPool.query(step.sql);
    console.log(`[migration] ${MIGRATION_NAME}: step "${step.name}" — ok`);
    executed.push({ name: step.name, ok: true });
  }

  return { migration: MIGRATION_NAME, dryRun, steps: executed };
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 */
export async function analyzeEnrollmentOneActivePerUser(mysqlPool) {
  const [multiActiveUsers] = await mysqlPool.query(
    `SELECT user_id, COUNT(*) AS active_count, GROUP_CONCAT(id ORDER BY updated_at DESC, id DESC) AS ids
     FROM enrollments
     WHERE access_status = 'active'
     GROUP BY user_id
     HAVING COUNT(*) > 1`
  );
  const [[{ indexPresent }]] = await mysqlPool.query(
    `SELECT COUNT(*) AS indexPresent
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'enrollments'
       AND INDEX_NAME = 'uq_enrollments_one_active_per_user'`
  );
  const [[{ columnPresent }]] = await mysqlPool.query(
    `SELECT COUNT(*) AS columnPresent
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'enrollments'
       AND COLUMN_NAME = 'active_user_id'`
  );
  return {
    usersWithMultipleActive: multiActiveUsers.length,
    violations: multiActiveUsers,
    generatedColumnPresent: Number(columnPresent) > 0,
    uniqueIndexPresent: Number(indexPresent) > 0,
    migrationReady: multiActiveUsers.length === 0,
  };
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function rollbackEnrollmentOneActivePerUserSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, rollback: true, skipped: true, reason: 'no_database' };

  const steps = [];
  if (await indexExists(mysqlPool, db, 'enrollments', 'uq_enrollments_one_active_per_user')) {
    steps.push({
      name: 'drop_uq_enrollments_one_active_per_user',
      sql: 'ALTER TABLE enrollments DROP INDEX uq_enrollments_one_active_per_user',
    });
  }
  if (await columnExists(mysqlPool, db, 'enrollments', 'active_user_id')) {
    steps.push({
      name: 'drop_active_user_id',
      sql: 'ALTER TABLE enrollments DROP COLUMN active_user_id',
    });
  }

  const executed = [];
  for (const step of steps) {
    if (dryRun) {
      executed.push({ ...step, dryRun: true });
      continue;
    }
    console.log(`[migration] ${MIGRATION_NAME}: rollback step "${step.name}" — running`);
    await mysqlPool.query(step.sql);
    console.log(`[migration] ${MIGRATION_NAME}: rollback step "${step.name}" — ok`);
    executed.push({ name: step.name, ok: true });
  }

  return { migration: MIGRATION_NAME, rollback: true, dryRun, steps: executed };
}
