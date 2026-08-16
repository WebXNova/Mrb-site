/**
 * Idempotent ALTER — add 'bachelor' to course_categories.class_level enum.
 */

import { isMysqlQueryTimeoutError } from '../config/mysqlTimeout.util.js';

const MIGRATION_NAME = 'course_category_class_level_bachelor';
const MIGRATION_LOCK_NAME = 'mrb:course_category_class_level_bachelor';
const LOCK_WAIT_SECONDS = 5;

const CLASS_LEVEL_ENUM =
  "ENUM('9th','10th','11th','12th','bachelor','o_level','a_level','entry_test','not_applicable') NOT NULL DEFAULT 'not_applicable'";

const ALTER_STATEMENT = `ALTER TABLE course_categories MODIFY COLUMN class_level ${CLASS_LEVEL_ENUM}`;

function hasBachelorClassLevel(columnType) {
  return /\bbachelor\b/i.test(String(columnType ?? ''));
}

/**
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {string} db
 */
async function readClassLevelColumnType(mysqlPool, db) {
  const [rows] = await mysqlPool.query(
    `SELECT COLUMN_TYPE AS column_type
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'course_categories' AND COLUMN_NAME = 'class_level'
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
 * @param {import('mysql2/promise').Pool} mysqlPool
 * @param {{ dryRun?: boolean }} [opts]
 */
export async function ensureCourseCategoryClassLevelBachelorSchema(mysqlPool, { dryRun = false } = {}) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return { migration: MIGRATION_NAME, skipped: true, reason: 'no_database' };

  let columnType = await readClassLevelColumnType(mysqlPool, db);
  if (!columnType) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'column_missing' };
  }
  if (hasBachelorClassLevel(columnType)) {
    return { migration: MIGRATION_NAME, skipped: true, reason: 'already_migrated' };
  }

  if (dryRun) {
    return { migration: MIGRATION_NAME, dryRun: true, sql: ALTER_STATEMENT };
  }

  const connection = await mysqlPool.getConnection();
  let lockAcquired = false;
  try {
    const [lockRows] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [MIGRATION_LOCK_NAME]);
    lockAcquired = Number(lockRows[0]?.acquired) === 1;

    if (!lockAcquired) {
      columnType = await readClassLevelColumnType(mysqlPool, db);
      if (hasBachelorClassLevel(columnType)) {
        return { migration: MIGRATION_NAME, skipped: true, reason: 'already_migrated' };
      }
      console.warn(
        `[schema] ${MIGRATION_NAME} deferred: another migration session holds the lock. ` +
          'Restart after other server instances stop.'
      );
      return { migration: MIGRATION_NAME, skipped: true, reason: 'migration_in_progress' };
    }

    columnType = await readClassLevelColumnType(mysqlPool, db);
    if (hasBachelorClassLevel(columnType)) {
      return { migration: MIGRATION_NAME, skipped: true, reason: 'already_migrated' };
    }

    await connection.query(`SET SESSION lock_wait_timeout = ${LOCK_WAIT_SECONDS}`);
    await connection.query(ALTER_STATEMENT);

    return { migration: MIGRATION_NAME, ok: true };
  } catch (error) {
    columnType = await readClassLevelColumnType(mysqlPool, db);
    if (hasBachelorClassLevel(columnType)) {
      return { migration: MIGRATION_NAME, ok: true, reason: 'completed_during_wait' };
    }

    if (isMetadataLockContentionError(error)) {
      console.warn(
        `[schema] ${MIGRATION_NAME} deferred: metadata lock on course_categories ` +
          `(waited ${LOCK_WAIT_SECONDS}s). Close idle DB sessions and restart, or run manually:\n` +
          `  ${ALTER_STATEMENT};`
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
