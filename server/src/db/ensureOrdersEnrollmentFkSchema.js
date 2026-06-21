/**
 * Idempotent schema patch: fk_orders_enrollment (orders.enrollment_id → enrollments.id)
 *
 * BLOCKS apply when orphan orders exist unless { forceRepair: true }.
 */

const MIGRATION_NAME = 'orders_enrollment_fk';
const FK_NAME = 'fk_orders_enrollment';

async function fkExists(mysqlPool, db) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders'
       AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    [db, FK_NAME]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function getEnrollmentIdColumnTypes(mysqlPool, db) {
  const [rows] = await mysqlPool.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND ((TABLE_NAME = 'orders' AND COLUMN_NAME = 'enrollment_id')
         OR (TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'id'))`,
    [db]
  );
  const map = Object.fromEntries(rows.map((r) => [`${r.TABLE_NAME}.${r.COLUMN_NAME}`, r.COLUMN_TYPE]));
  return {
    ordersEnrollmentId: map['orders.enrollment_id'] ?? null,
    enrollmentsId: map['enrollments.id'] ?? null,
  };
}

function typesCompatibleForFk(ordersEnrollmentIdType, enrollmentsIdType) {
  const orderType = String(ordersEnrollmentIdType || '').toLowerCase().replace(/\s+/g, ' ');
  const enrType = String(enrollmentsIdType || '').toLowerCase().replace(/\s+/g, ' ');
  return orderType === enrType;
}

async function ensureEnrollmentIdUnsignedForFk(mysqlPool, db, dryRun) {
  const types = await getEnrollmentIdColumnTypes(mysqlPool, db);
  if (typesCompatibleForFk(types.ordersEnrollmentId, types.enrollmentsId)) {
    return { skipped: true, reason: 'types_already_compatible', types };
  }

  const enrIsUnsigned = String(types.enrollmentsId || '').toLowerCase().includes('unsigned');
  if (enrIsUnsigned) {
    return { skipped: true, reason: 'enrollments_id_already_unsigned', types };
  }

  const [[neg]] = await mysqlPool.query(`SELECT COUNT(*) AS n FROM enrollments WHERE id < 0`);
  if (Number(neg?.n ?? 0) > 0) {
    throw new Error('Cannot promote enrollments.id to UNSIGNED: negative ids exist');
  }

  const sql = `ALTER TABLE enrollments
    MODIFY COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`;

  if (dryRun) {
    return { dryRun: true, sql, types, action: 'modify_enrollments_id_unsigned' };
  }

  await mysqlPool.query(sql);
  const after = await getEnrollmentIdColumnTypes(mysqlPool, db);
  return { ok: true, sql, typesBefore: types, typesAfter: after };
}

/**
 * MySQL forbids FK on base columns of STORED generated columns.
 * pending_enrollment_id must be VIRTUAL (unique index still works).
 */
async function ensurePendingEnrollmentIdVirtual(mysqlPool, db, dryRun) {
  const [rows] = await mysqlPool.query(
    `SELECT EXTRA
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'pending_enrollment_id'`,
    [db]
  );
  const col = rows[0];
  const extra = String(col?.EXTRA || '').toLowerCase();

  if (col && extra.includes('virtual generated')) {
    return { skipped: true, reason: 'already_virtual', extra: col.EXTRA };
  }

  const [idxRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND INDEX_NAME = 'uq_orders_one_pending_per_enrollment'`,
    [db]
  );
  const hasUq = Number(idxRows[0]?.n ?? 0) > 0;

  const steps = [];
  if (hasUq) {
    steps.push({
      name: 'drop_uq_before_virtual',
      sql: 'ALTER TABLE orders DROP INDEX uq_orders_one_pending_per_enrollment',
    });
  }
  if (col) {
    steps.push({
      name: 'drop_pending_enrollment_id_stored',
      sql: 'ALTER TABLE orders DROP COLUMN pending_enrollment_id',
    });
  }
  steps.push({
    name: 'add_pending_enrollment_id_virtual',
    sql: `ALTER TABLE orders
      ADD COLUMN pending_enrollment_id BIGINT UNSIGNED
        GENERATED ALWAYS AS (IF(status = 'pending', enrollment_id, NULL)) VIRTUAL
        AFTER cancelled_at`,
  });
  steps.push({
    name: 'restore_uq_on_virtual',
    sql: `ALTER TABLE orders
      ADD UNIQUE KEY uq_orders_one_pending_per_enrollment (pending_enrollment_id)`,
  });

  if (dryRun) {
    return { dryRun: true, steps };
  }

  const executed = [];
  for (const step of steps) {
    await mysqlPool.query(step.sql);
    executed.push({ name: step.name, ok: true });
  }
  return { ok: true, executed };
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 */
export async function analyzeOrdersEnrollmentOrphans(mysqlPool) {
  const [orphans] = await mysqlPool.query(
    `SELECT o.id, o.status, o.enrollment_id, o.user_id, o.course_id, o.amount, o.paid_at
     FROM orders o
     LEFT JOIN enrollments e ON e.id = o.enrollment_id
     WHERE o.enrollment_id IS NOT NULL AND e.id IS NULL
     ORDER BY o.id`
  );

  const [mismatches] = await mysqlPool.query(
    `SELECT o.id AS order_id, o.user_id, e.user_id AS enrollment_user_id,
            o.course_id, e.course_id AS enrollment_course_id, o.status
     FROM orders o
     INNER JOIN enrollments e ON e.id = o.enrollment_id
     WHERE o.user_id <> e.user_id OR o.course_id <> e.course_id`
  );

  return {
    orphanCount: orphans.length,
    orphans,
    userCourseMismatchCount: mismatches.length,
    mismatches,
    canAddFk: orphans.length === 0 && mismatches.length === 0,
    explanation:
      orphans.length > 0
        ? 'orders.enrollment_id points to enrollments.id values that do not exist in enrollments table (deleted rows or stale dev data). Not a script bug.'
        : undefined,
  };
}

/**
 * Remediate orphan orders — preserves paid/refunded rows; cancels orphan pending.
 * @param {import('mysql2/promise').Pool} mysqlPool
 */
export async function repairOrdersEnrollmentOrphans(mysqlPool) {
  const analysis = await analyzeOrdersEnrollmentOrphans(mysqlPool);
  const repaired = [];

  for (const row of analysis.orphans) {
    if (row.status === 'paid' || row.status === 'refunded') {
      const [res] = await mysqlPool.query(
        `UPDATE orders
         SET enrollment_id = NULL,
             cancellation_reason = COALESCE(cancellation_reason, 'orphan_enrollment_unlinked'),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [row.id]
      );
      repaired.push({ orderId: row.id, action: 'unlink_paid', affected: res.affectedRows });
    } else if (row.status === 'pending') {
      const [res] = await mysqlPool.query(
        `UPDATE orders
         SET status = 'cancelled',
             cancellation_reason = 'orphan_enrollment_repair',
             cancelled_at = COALESCE(cancelled_at, CURRENT_TIMESTAMP),
             enrollment_id = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'`,
        [row.id]
      );
      repaired.push({ orderId: row.id, action: 'cancel_pending_orphan', affected: res.affectedRows });
    } else {
      const [res] = await mysqlPool.query(
        `UPDATE orders
         SET enrollment_id = NULL,
             cancellation_reason = COALESCE(cancellation_reason, 'orphan_enrollment_unlinked'),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [row.id]
      );
      repaired.push({ orderId: row.id, action: 'unlink_other', affected: res.affectedRows });
    }
  }

  return { repaired, analysisAfter: await analyzeOrdersEnrollmentOrphans(mysqlPool) };
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean, forceRepair?: boolean }} [opts]
 */
export async function ensureOrdersEnrollmentFk(mysqlPool, { dryRun = false, forceRepair = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  if (await fkExists(mysqlPool, db)) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'fk_already_exists' };
  }

  let analysis = await analyzeOrdersEnrollmentOrphans(mysqlPool);
  let repairResult = null;

  if (!analysis.canAddFk) {
    if (!forceRepair) {
      return {
        migration: MIGRATION_NAME,
        blocked: true,
        reason: 'orphan_or_mismatch_data',
        analysis,
        hint: 'Run analyze script, remediate manually, or re-run with --repair',
      };
    }
    if (dryRun) {
      return {
        migration: MIGRATION_NAME,
        dryRun: true,
        wouldRepair: analysis.orphans,
        wouldBlock: !analysis.canAddFk,
      };
    }
    repairResult = await repairOrdersEnrollmentOrphans(mysqlPool);
    analysis = repairResult.analysisAfter;
    if (!analysis.canAddFk) {
      return {
        migration: MIGRATION_NAME,
        blocked: true,
        reason: 'repair_insufficient',
        repairResult,
        analysis,
      };
    }
  }

  const sql = `ALTER TABLE orders
    ADD CONSTRAINT ${FK_NAME}
    FOREIGN KEY (enrollment_id) REFERENCES enrollments (id)
    ON DELETE SET NULL
    ON UPDATE RESTRICT`;

  const typeAlign = await ensureEnrollmentIdUnsignedForFk(mysqlPool, db, dryRun);
  const virtualAlign = await ensurePendingEnrollmentIdVirtual(mysqlPool, db, dryRun);
  if (!dryRun && typeAlign.ok !== true && typeAlign.skipped !== true) {
    return { migration: MIGRATION_NAME, blocked: true, reason: 'type_alignment_failed', typeAlign };
  }

  if (dryRun) {
    return { migration: MIGRATION_NAME, dryRun: true, sql, analysis, repairResult, typeAlign, virtualAlign };
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query(sql);
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.commit();
  } catch (error) {
    try {
      await connection.query('SET FOREIGN_KEY_CHECKS = 1');
      await connection.rollback();
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    connection.release();
  }

  return { migration: MIGRATION_NAME, ok: true, analysis, repairResult, typeAlign, virtualAlign };
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function rollbackOrdersEnrollmentFk(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, rollback: true, skipped: true, reason: 'no_database' };

  if (!(await fkExists(mysqlPool, db))) {
    return { migration: MIGRATION_NAME, rollback: true, skipped: true, reason: 'fk_not_present' };
  }

  const sql = `ALTER TABLE orders DROP FOREIGN KEY ${FK_NAME}`;
  if (dryRun) return { migration: MIGRATION_NAME, rollback: true, dryRun: true, sql };

  await mysqlPool.query(sql);
  return { migration: MIGRATION_NAME, rollback: true, ok: true };
}
