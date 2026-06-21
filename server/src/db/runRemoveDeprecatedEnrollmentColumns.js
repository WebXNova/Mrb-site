/**
 * Remove deprecated enrollment columns after validation period.
 *
 * Usage:
 *   npm run migrate:remove-deprecated-enrollment
 *   node src/db/runRemoveDeprecatedEnrollmentColumns.js --verify
 *   node src/db/runRemoveDeprecatedEnrollmentColumns.js --dry-run
 *   node src/db/runRemoveDeprecatedEnrollmentColumns.js --force
 *
 * Safety:
 *   Requires ENROLLMENT_REFACTOR_DEPLOYED_AT (ISO date) and 7-day wait unless --force
 *   or ENROLLMENT_CLEANUP_ALLOWED=true.
 *
 * SQL reference:
 *   src/db/migrations/20250620_remove_deprecated_columns.sql
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';
import { pathToFileURL } from 'url';
import { env } from '../config/env.js';
import { verifyEnrollmentRefactorMigration } from './runEnrollmentRefactorMigration.js';

const MIGRATION_NAME = '20250620_remove_deprecated_columns';
const VALIDATION_DAYS = 7;

const BATCH_COLUMNS = Object.freeze([
  'enrollment_open_at',
  'enrollment_close_at',
  'allow_enrollment',
]);

const COURSE_LEGACY_COLUMNS = Object.freeze([
  'enrollment_open_at',
  'enrollment_close_at',
  'allow_enrollment',
]);

const BATCH_INDEX = 'idx_course_batches_enrollment_window';

function createMigrationPool() {
  return mysql.createPool({
    host: env.mysql.host,
    port: env.mysql.port,
    user: env.mysql.user,
    password: env.mysql.password,
    database: env.mysql.database,
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 2,
    connectTimeout: 60_000,
    multipleStatements: true,
  });
}

async function getDb(pool) {
  const [rows] = await pool.query('SELECT DATABASE() AS db');
  return rows[0]?.db ?? null;
}

async function columnExists(pool, db, table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function indexExists(pool, db, table, indexName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [db, table, indexName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

function parseDeployedAt() {
  const raw = process.env.ENROLLMENT_REFACTOR_DEPLOYED_AT?.trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function assertValidationPeriod({ force = false } = {}) {
  if (force || process.env.ENROLLMENT_CLEANUP_ALLOWED === 'true') {
    return { skipped: true, reason: force ? 'force' : 'ENROLLMENT_CLEANUP_ALLOWED' };
  }
  const deployedAt = parseDeployedAt();
  if (!deployedAt) {
    throw new Error(
      'Set ENROLLMENT_REFACTOR_DEPLOYED_AT (ISO date of production deploy) or pass --force after validation.'
    );
  }
  const elapsedMs = Date.now() - deployedAt.getTime();
  const requiredMs = VALIDATION_DAYS * 24 * 60 * 60 * 1000;
  if (elapsedMs < requiredMs) {
    const remainingDays = Math.ceil((requiredMs - elapsedMs) / (24 * 60 * 60 * 1000));
    throw new Error(
      `${VALIDATION_DAYS}-day validation period not met (${remainingDays} day(s) remaining). Use --force to override.`
    );
  }
  return { skipped: false, deployedAt: deployedAt.toISOString(), validationDays: VALIDATION_DAYS };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
export async function verifyDeprecatedColumnsRemoved(pool) {
  const db = await getDb(pool);
  if (!db) throw new Error('No database selected');

  const batchRemaining = [];
  for (const col of BATCH_COLUMNS) {
    if (await columnExists(pool, db, 'course_batches', col)) batchRemaining.push(`course_batches.${col}`);
  }

  const courseRemaining = [];
  for (const col of COURSE_LEGACY_COLUMNS) {
    if (await columnExists(pool, db, 'courses', col)) courseRemaining.push(`courses.${col}`);
  }

  const indexRemaining = (await indexExists(pool, db, 'course_batches', BATCH_INDEX))
    ? [BATCH_INDEX]
    : [];

  const [[metrics]] = await pool.query(
    `SELECT
       COUNT(*) AS total_courses,
       SUM(admission_status = 'OPEN') AS open_courses,
       SUM(admission_status = 'CLOSED') AS closed_courses
     FROM courses`
  );

  return {
    ok: batchRemaining.length === 0 && courseRemaining.length === 0 && indexRemaining.length === 0,
    migration: MIGRATION_NAME,
    batchRemaining,
    courseRemaining,
    indexRemaining,
    metrics,
  };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ dryRun?: boolean, force?: boolean }} [options]
 */
export async function runRemoveDeprecatedEnrollmentColumns(pool, options = {}) {
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const validation = assertValidationPeriod({ force });

  const refactorVerify = await verifyEnrollmentRefactorMigration(pool);
  if (!refactorVerify.ok) {
    throw new Error(
      'Enrollment refactor schema not ready. Run migrate:enrollment-refactor first.'
    );
  }

  const db = await getDb(pool);
  if (!db) throw new Error('No database selected');

  const steps = [];

  if (await indexExists(pool, db, 'course_batches', BATCH_INDEX)) {
    const sql = `ALTER TABLE course_batches DROP INDEX ${BATCH_INDEX}`;
    steps.push({ name: 'drop_batch_enrollment_index', sql });
  }

  for (const col of BATCH_COLUMNS) {
    if (await columnExists(pool, db, 'course_batches', col)) {
      steps.push({
        name: `drop_course_batches.${col}`,
        sql: `ALTER TABLE course_batches DROP COLUMN ${col}`,
      });
    }
  }

  for (const col of COURSE_LEGACY_COLUMNS) {
    if (await columnExists(pool, db, 'courses', col)) {
      steps.push({
        name: `drop_courses.${col}`,
        sql: `ALTER TABLE courses DROP COLUMN ${col}`,
      });
    }
  }

  if (steps.length === 0) {
    return {
      migration: MIGRATION_NAME,
      dryRun,
      validation,
      steps: [],
      message: 'No deprecated columns remain — already clean.',
    };
  }

  if (dryRun) {
    return {
      migration: MIGRATION_NAME,
      dryRun: true,
      validation,
      steps: steps.map((s) => ({ name: s.name, dryRun: true })),
    };
  }

  const connection = await pool.getConnection();
  const executed = [];
  try {
    await connection.beginTransaction();
    for (const step of steps) {
      await connection.query(step.sql);
      executed.push({ name: step.name, ok: true });
      console.log(`[cleanup] ${step.name}: done`);
    }
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  return {
    migration: MIGRATION_NAME,
    dryRun: false,
    validation,
    executedAt: new Date().toISOString(),
    steps: executed,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const verifyOnly = args.has('--verify');
  const force = args.has('--force');

  const pool = createMigrationPool();

  try {
    if (verifyOnly) {
      const report = await verifyDeprecatedColumnsRemoved(pool);
      console.log(JSON.stringify(report, null, 2));
      if (!report.ok) process.exitCode = 1;
      return;
    }

    const result = await runRemoveDeprecatedEnrollmentColumns(pool, { dryRun, force });
    console.log(JSON.stringify(result, null, 2));

    if (!dryRun) {
      const verify = await verifyDeprecatedColumnsRemoved(pool);
      console.log(JSON.stringify({ verify }, null, 2));
      if (!verify.ok) {
        process.exitCode = 1;
        return;
      }
      console.log(
        '✅ Deprecated enrollment columns removed. Course-level admission_status is the sole enrollment gate.'
      );
    }
  } finally {
    await pool.end();
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
