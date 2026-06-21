/**
 * Required startup migrations — fail closed before accepting traffic.
 *
 * These integrity migrations must run on every boot (idempotent). Silent skip or
 * step failure blocks server startup.
 */

import { ensureEnrollmentUserCourseUniqueSchema } from './ensureEnrollmentUserCourseUniqueSchema.js';
import { ensureEnrollmentOneActivePerUserSchema } from './ensureEnrollmentOneActivePerUserSchema.js';
import { ensureOrderCheckoutIntegritySchema } from './ensureOrderCheckoutIntegritySchema.js';

/** @typedef {{ migration?: string, skipped?: boolean, reason?: string, steps?: Array<{ name: string, ok?: boolean }> }} MigrationResult */

export const REQUIRED_STARTUP_MIGRATIONS = Object.freeze([
  Object.freeze({
    id: 'enrollment_user_course_unique',
    label: 'Enrollment unique constraint (user_id + course_id)',
    run: ensureEnrollmentUserCourseUniqueSchema,
  }),
  Object.freeze({
    id: 'enrollment_one_active_per_user',
    label: 'Enrollment one active access_status per user (DB constraint)',
    run: ensureEnrollmentOneActivePerUserSchema,
  }),
  Object.freeze({
    id: 'order_checkout_integrity',
    label: 'Order checkout integrity constraint',
    run: ensureOrderCheckoutIntegritySchema,
  }),
]);

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {string} table
 * @param {string} indexName
 */
async function uniqueIndexExists(mysqlPool, table, indexName) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?
       AND NON_UNIQUE = 0`,
    [table, indexName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ id: string, label: string, run: Function }} migration
 */
async function verifyRequiredMigrationOutcome(mysqlPool, migration) {
  if (migration.id === 'enrollment_user_course_unique') {
    const present = await uniqueIndexExists(mysqlPool, 'enrollments', 'uq_enrollments_user_course');
    if (!present) {
      throw new Error(
        'Post-migration verification failed: unique index uq_enrollments_user_course is missing on enrollments'
      );
    }
    return { verified: 'uq_enrollments_user_course' };
  }

  if (migration.id === 'enrollment_one_active_per_user') {
    const present = await uniqueIndexExists(
      mysqlPool,
      'enrollments',
      'uq_enrollments_one_active_per_user'
    );
    if (!present) {
      throw new Error(
        'Post-migration verification failed: unique index uq_enrollments_one_active_per_user is missing on enrollments'
      );
    }
    return { verified: 'uq_enrollments_one_active_per_user' };
  }

  if (migration.id === 'order_checkout_integrity') {
    const present = await uniqueIndexExists(
      mysqlPool,
      'orders',
      'uq_orders_one_pending_per_enrollment'
    );
    if (!present) {
      throw new Error(
        'Post-migration verification failed: unique index uq_orders_one_pending_per_enrollment is missing on orders'
      );
    }
    return { verified: 'uq_orders_one_pending_per_enrollment' };
  }

  return { verified: null };
}

/**
 * Run required integrity migrations with explicit logging and fail-fast semantics.
 *
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{
 *   migrations?: typeof REQUIRED_STARTUP_MIGRATIONS,
 *   log?: typeof console.log,
 *   errorLog?: typeof console.error,
 * }} [options]
 */
export async function runRequiredStartupMigrations(mysqlPool, options = {}) {
  const migrations = options.migrations ?? REQUIRED_STARTUP_MIGRATIONS;
  const log = options.log ?? console.log;
  const errorLog = options.errorLog ?? console.error;

  log('[migration] Required startup migrations — begin', {
    count: migrations.length,
    migrations: migrations.map((m) => m.id),
  });

  for (const migration of migrations) {
    log(`[migration] ${migration.id} — starting`, { label: migration.label });

    /** @type {MigrationResult} */
    let result;
    try {
      result = await migration.run(mysqlPool);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errorLog(`[migration] ${migration.id} — FAILED`, { error: message });
      throw new Error(`Startup migration failed (${migration.id}): ${message}`, { cause: error });
    }

    if (result?.skipped) {
      errorLog(`[migration] ${migration.id} — BLOCKED`, { reason: result.reason });
      throw new Error(
        `Startup migration blocked (${migration.id}): ${result.reason || 'skipped without reason'}`
      );
    }

    const steps = Array.isArray(result?.steps) ? result.steps : [];
    if (steps.length === 0) {
      log(`[migration] ${migration.id} — no schema changes required (already satisfied)`);
    } else {
      log(`[migration] ${migration.id} — applied`, {
        stepCount: steps.length,
        steps: steps.map((step) => step.name),
      });
    }

    try {
      const verification = await verifyRequiredMigrationOutcome(mysqlPool, migration);
      log(`[migration] ${migration.id} — verified`, verification);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errorLog(`[migration] ${migration.id} — verification FAILED`, { error: message });
      throw new Error(`Startup migration verification failed (${migration.id}): ${message}`, {
        cause: error,
      });
    }

    log(`[migration] ${migration.id} — complete`);
  }

  log('[migration] Required startup migrations — complete');
}
