/**
 * Idempotent ALTER — enrollments.hssc_status class-level enum (9th–12th, Bachelor).
 * Replaces legacy Inter Class / First Year Class / Matric Class values.
 */

import { isMysqlQueryTimeoutError } from '../config/mysqlTimeout.util.js';
import { HSSC_STATUS_VALUES } from '../dtos/enrollment.dto.js';

const MIGRATION_NAME = 'enrollment_hssc_status_class_levels';
const MIGRATION_LOCK_NAME = 'mrb:enrollment_hssc_status_class_levels';
const LOCK_WAIT_SECONDS = 5;

const LEGACY_HSSC_VALUES = ['Inter Class', 'First Year Class', 'Matric Class'];

function quoteEnumValue(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildEnumDefinition(values, { notNull = true } = {}) {
  const body = values.map(quoteEnumValue).join(',');
  return notNull ? `ENUM(${body}) NOT NULL` : `ENUM(${body})`;
}

const FINAL_ENUM = buildEnumDefinition(HSSC_STATUS_VALUES);
const WIDEN_ENUM = buildEnumDefinition([...LEGACY_HSSC_VALUES, ...HSSC_STATUS_VALUES]);

/**
 * @param {string} columnType
 * @returns {'complete'|'finalize_pending'|'legacy'|'missing'|'unknown'}
 */
function migrationState(columnType) {
  const type = String(columnType ?? '');
  if (!type) return 'missing';

  const hasNew = HSSC_STATUS_VALUES.some((value) => type.includes(quoteEnumValue(value)));
  const hasLegacy = LEGACY_HSSC_VALUES.some((value) => type.includes(quoteEnumValue(value)));

  if (hasNew && !hasLegacy) return 'complete';
  if (hasNew && hasLegacy) return 'finalize_pending';
  if (!hasNew && hasLegacy) return 'legacy';
  return 'unknown';
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {string} db
 */
async function readHsscColumnType(mysqlPool, db) {
  const [rows] = await mysqlPool.query(
    `SELECT COLUMN_TYPE AS column_type
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'hssc_status'
     LIMIT 1`,
    [db]
  );
  return String(rows[0]?.column_type ?? '');
}

function isMetadataLockContentionError(error) {
  if (!error || typeof error !== 'object') return false;
  if (isMysqlQueryTimeoutError(error)) return true;
  const code = String(error.code || '');
  const errno = Number(error.errno);
  return code === 'ER_LOCK_WAIT_TIMEOUT' || errno === 1205;
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 */
async function releaseMigrationLock(connection) {
  try {
    await connection.query('SELECT RELEASE_LOCK(?) AS released', [MIGRATION_LOCK_NAME]);
  } catch {
    /* connection may already be closed */
  }
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 */
async function migrateLegacyHsscRows(connection) {
  await connection.query(
    `UPDATE enrollments SET hssc_status = '11th' WHERE hssc_status = 'Inter Class'`
  );
  await connection.query(
    `UPDATE enrollments SET hssc_status = '11th' WHERE hssc_status = 'First Year Class'`
  );
  await connection.query(
    `UPDATE enrollments SET hssc_status = '10th' WHERE hssc_status = 'Matric Class'`
  );
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureEnrollmentHsscStatusSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  let columnType = await readHsscColumnType(mysqlPool, db);
  let state = migrationState(columnType);

  if (state === 'missing') {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'column_missing' };
  }
  if (state === 'complete') {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'already_migrated' };
  }
  if (state === 'unknown') {
    console.warn(
      `[schema] ${MIGRATION_NAME} skipped: unrecognized hssc_status column type "${columnType}". ` +
        `Expected legacy or class-level enum values.`
    );
    return { migration: MIGRATION_NAME, skipped: true, reason: 'unknown_column_type' };
  }

  if (dryRun) {
    return {
      migration: MIGRATION_NAME,
      dryRun: true,
      state,
      sql: [
        state === 'legacy'
          ? `ALTER TABLE enrollments MODIFY COLUMN hssc_status ${WIDEN_ENUM}`
          : null,
        'UPDATE enrollments SET hssc_status = \'11th\' WHERE hssc_status = \'Inter Class\'',
        'UPDATE enrollments SET hssc_status = \'11th\' WHERE hssc_status = \'First Year Class\'',
        'UPDATE enrollments SET hssc_status = \'10th\' WHERE hssc_status = \'Matric Class\'',
        `ALTER TABLE enrollments MODIFY COLUMN hssc_status ${FINAL_ENUM}`,
      ].filter(Boolean),
    };
  }

  const connection = await mysqlPool.getConnection();
  let lockAcquired = false;
  try {
    const [lockRows] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [MIGRATION_LOCK_NAME]);
    lockAcquired = Number(lockRows[0]?.acquired) === 1;

    if (!lockAcquired) {
      columnType = await readHsscColumnType(mysqlPool, db);
      state = migrationState(columnType);
      if (state === 'complete') {
        return { migration: MIGRATION_NAME, skipped: true, reason: 'already_migrated' };
      }
      console.warn(
        `[schema] ${MIGRATION_NAME} deferred: another migration session holds the lock. ` +
          'Restart after other server instances stop.'
      );
      return { migration: MIGRATION_NAME, skipped: true, reason: 'migration_in_progress' };
    }

    await connection.query(`SET SESSION lock_wait_timeout = ${LOCK_WAIT_SECONDS}`);

    columnType = await readHsscColumnType(mysqlPool, db);
    state = migrationState(columnType);
    if (state === 'complete') {
      return { migration: MIGRATION_NAME, skipped: true, reason: 'already_migrated' };
    }

    if (state === 'legacy') {
      await connection.query(`ALTER TABLE enrollments MODIFY COLUMN hssc_status ${WIDEN_ENUM}`);
    }

    await migrateLegacyHsscRows(connection);
    await connection.query(`ALTER TABLE enrollments MODIFY COLUMN hssc_status ${FINAL_ENUM}`);

    console.log('[schema] Upgraded enrollments.hssc_status to class-level enum');
    return { migration: MIGRATION_NAME, ok: true };
  } catch (error) {
    columnType = await readHsscColumnType(mysqlPool, db);
    if (migrationState(columnType) === 'complete') {
      return { migration: MIGRATION_NAME, ok: true, reason: 'completed_during_wait' };
    }

    if (isMetadataLockContentionError(error)) {
      console.warn(
        `[schema] ${MIGRATION_NAME} deferred: metadata lock on enrollments ` +
          `(waited ${LOCK_WAIT_SECONDS}s). Close idle DB sessions and restart, or run ` +
          '`src/sql/migrations/hssc_status_class_levels.sql` manually.'
      );
      return { migration: MIGRATION_NAME, skipped: true, reason: 'metadata_lock_contention' };
    }

    throw error;
  } finally {
    if (lockAcquired) {
      await releaseMigrationLock(connection);
    }
    connection.release();
  }
}
