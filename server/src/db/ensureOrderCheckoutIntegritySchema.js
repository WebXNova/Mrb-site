/**
 * Idempotent schema patch: order checkout integrity (cancellation audit + pending unique guard).
 */

const MIGRATION_NAME = 'order_checkout_integrity';

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
export async function ensureOrderCheckoutIntegritySchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  if (!(await tableExists(mysqlPool, db, 'orders'))) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'orders_missing' };
  }

  const steps = [];

  if (!(await columnExists(mysqlPool, db, 'orders', 'cancellation_reason'))) {
    steps.push({
      name: 'add_cancellation_reason',
      sql: `ALTER TABLE orders
        ADD COLUMN cancellation_reason VARCHAR(64) NULL AFTER status`,
    });
  }

  if (!(await columnExists(mysqlPool, db, 'orders', 'cancelled_at'))) {
    steps.push({
      name: 'add_cancelled_at',
      sql: `ALTER TABLE orders
        ADD COLUMN cancelled_at TIMESTAMP NULL AFTER cancellation_reason`,
    });
  }

  steps.push({
    name: 'dedupe_pending_orders_per_enrollment',
    sql: `UPDATE orders o
      INNER JOIN (
        SELECT enrollment_id, MAX(id) AS keep_id
        FROM orders
        WHERE status = 'pending' AND enrollment_id IS NOT NULL
        GROUP BY enrollment_id
        HAVING COUNT(*) > 1
      ) d ON d.enrollment_id = o.enrollment_id
      SET o.status = 'cancelled',
          o.cancellation_reason = 'superseded',
          o.cancelled_at = COALESCE(o.cancelled_at, CURRENT_TIMESTAMP),
          o.updated_at = CURRENT_TIMESTAMP
      WHERE o.status = 'pending'
        AND o.id <> d.keep_id`,
  });

  if (!(await columnExists(mysqlPool, db, 'orders', 'pending_enrollment_id'))) {
    steps.push({
      name: 'add_pending_enrollment_id_generated',
      sql: `ALTER TABLE orders
        ADD COLUMN pending_enrollment_id BIGINT UNSIGNED
          GENERATED ALWAYS AS (IF(status = 'pending', enrollment_id, NULL)) VIRTUAL
          AFTER cancelled_at`,
    });
  }

  if (!(await indexExists(mysqlPool, db, 'orders', 'uq_orders_one_pending_per_enrollment'))) {
    steps.push({
      name: 'add_uq_orders_one_pending_per_enrollment',
      sql: `ALTER TABLE orders
        ADD UNIQUE KEY uq_orders_one_pending_per_enrollment (pending_enrollment_id)`,
    });
  }

  if (!(await indexExists(mysqlPool, db, 'orders', 'idx_orders_enrollment_status'))) {
    steps.push({
      name: 'add_idx_orders_enrollment_status',
      sql: `ALTER TABLE orders
        ADD INDEX idx_orders_enrollment_status (enrollment_id, status)`,
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
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function rollbackOrderCheckoutIntegritySchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, rollback: true, skipped: true, reason: 'no_database' };

  const steps = [];
  if (await indexExists(mysqlPool, db, 'orders', 'uq_orders_one_pending_per_enrollment')) {
    steps.push({
      name: 'drop_uq_orders_one_pending_per_enrollment',
      sql: 'ALTER TABLE orders DROP INDEX uq_orders_one_pending_per_enrollment',
    });
  }
  if (await columnExists(mysqlPool, db, 'orders', 'pending_enrollment_id')) {
    steps.push({
      name: 'drop_pending_enrollment_id',
      sql: 'ALTER TABLE orders DROP COLUMN pending_enrollment_id',
    });
  }
  if (await indexExists(mysqlPool, db, 'orders', 'idx_orders_enrollment_status')) {
    steps.push({
      name: 'drop_idx_orders_enrollment_status',
      sql: 'ALTER TABLE orders DROP INDEX idx_orders_enrollment_status',
    });
  }
  if (await columnExists(mysqlPool, db, 'orders', 'cancelled_at')) {
    steps.push({ name: 'drop_cancelled_at', sql: 'ALTER TABLE orders DROP COLUMN cancelled_at' });
  }
  if (await columnExists(mysqlPool, db, 'orders', 'cancellation_reason')) {
    steps.push({
      name: 'drop_cancellation_reason',
      sql: 'ALTER TABLE orders DROP COLUMN cancellation_reason',
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

  return { migration: MIGRATION_NAME, rollback: true, dryRun, steps: executed };
}
