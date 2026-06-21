/**
 * Backfill courses.start_date, end_date, admission_status from enrollment windows.
 *
 * Rules:
 * 1. OPEN when enrollment_open_at <= NOW() AND enrollment_close_at >= NOW() (and allowed)
 * 2. OPEN when no enrollment window restrictions (missing bounds or no batch)
 * 3. CLOSED for all remaining courses
 * 4. start_date / end_date from enrollment_open_at / enrollment_close_at when available
 *
 * Usage:
 *   npm run backfill:enrollment-data
 *   node src/db/runEnrollmentBackfill.js --verify
 *   node src/db/runEnrollmentBackfill.js --dry-run
 */

import 'dotenv/config';
import mysql from 'mysql2/promise';
import { pathToFileURL } from 'url';
import { env } from '../config/env.js';

const MIGRATION_NAME = 'enrollment_refactor_backfill';

const ACTIVE_BATCH_SUBQUERY = `
  SELECT
    cb.course_id,
    cb.enrollment_open_at,
    cb.enrollment_close_at,
    cb.allow_enrollment
  FROM course_batches cb
  INNER JOIN (
    SELECT course_id, MAX(id) AS batch_id
    FROM course_batches
    WHERE is_active = 1
    GROUP BY course_id
  ) pick ON pick.batch_id = cb.id
`;

function createBackfillPool() {
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

async function columnExists(pool, db, table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [db, table, column]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function tableExists(pool, db, table) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, table]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function countSnapshot(pool) {
  const [[row]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(admission_status = 'OPEN') AS open_count,
       SUM(admission_status = 'CLOSED') AS closed_count,
       SUM(admission_status IS NULL) AS null_status,
       SUM(start_date IS NOT NULL) AS with_start_date,
       SUM(end_date IS NOT NULL) AS with_end_date,
       SUM(start_date IS NOT NULL AND end_date IS NOT NULL) AS with_both_dates
     FROM courses`
  );
  return row;
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {string} sql
 * @param {string} stepName
 */
async function runStep(connection, sql, stepName) {
  const [result] = await connection.query(sql);
  const affectedRows = result.affectedRows ?? 0;
  console.log(`[backfill] ${stepName}: ${affectedRows} row(s) affected`);
  return { name: stepName, affectedRows };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ dryRun?: boolean }} [options]
 */
export async function runEnrollmentDataBackfill(pool, options = {}) {
  const dryRun = options.dryRun === true;
  const [dbRows] = await pool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) throw new Error('No database selected');

  if (!(await tableExists(pool, db, 'courses'))) {
    throw new Error('courses table missing');
  }

  const before = await countSnapshot(pool);
  const stats = {
    migration: MIGRATION_NAME,
    executedAt: new Date().toISOString(),
    steps: [],
    before,
    after: null,
    dryRun,
  };

  const connection = await pool.getConnection();

  try {
    if (!dryRun) await connection.beginTransaction();

    if (await tableExists(pool, db, 'course_batches')) {
      if (dryRun) {
        stats.steps.push({ name: 'populate_dates_from_enrollment_window', dryRun: true });
        stats.steps.push({ name: 'open_within_enrollment_window', dryRun: true });
        stats.steps.push({ name: 'open_without_window_restrictions', dryRun: true });
        stats.steps.push({ name: 'open_no_active_batch', dryRun: true });
        stats.steps.push({ name: 'close_remaining_courses', dryRun: true });
      } else {
        stats.steps.push(
          await runStep(
            connection,
            `UPDATE courses c
             INNER JOIN (${ACTIVE_BATCH_SUBQUERY}) b ON b.course_id = c.id
             SET
               c.start_date = COALESCE(c.start_date, DATE(b.enrollment_open_at)),
               c.end_date = COALESCE(c.end_date, DATE(b.enrollment_close_at))`,
            'populate_dates_from_enrollment_window'
          )
        );

        stats.steps.push(
          await runStep(
            connection,
            `UPDATE courses c
             INNER JOIN (${ACTIVE_BATCH_SUBQUERY}) b ON b.course_id = c.id
             SET c.admission_status = 'OPEN'
             WHERE b.allow_enrollment = 1
               AND b.enrollment_open_at IS NOT NULL
               AND b.enrollment_close_at IS NOT NULL
               AND b.enrollment_open_at <= NOW()
               AND b.enrollment_close_at >= NOW()`,
            'open_within_enrollment_window'
          )
        );

        stats.steps.push(
          await runStep(
            connection,
            `UPDATE courses c
             INNER JOIN (${ACTIVE_BATCH_SUBQUERY}) b ON b.course_id = c.id
             SET c.admission_status = 'OPEN'
             WHERE b.allow_enrollment = 1
               AND (b.enrollment_open_at IS NULL OR b.enrollment_close_at IS NULL)`,
            'open_without_window_restrictions'
          )
        );

        stats.steps.push(
          await runStep(
            connection,
            `UPDATE courses c
             LEFT JOIN course_batches cb ON cb.course_id = c.id AND cb.is_active = 1
             SET c.admission_status = 'OPEN'
             WHERE cb.id IS NULL`,
            'open_no_active_batch'
          )
        );

        stats.steps.push(
          await runStep(
            connection,
            `UPDATE courses
             SET admission_status = 'CLOSED'
             WHERE admission_status IS NULL
                OR admission_status <> 'OPEN'`,
            'close_remaining_courses'
          )
        );
      }
    }

    const hasLegacyOpen = await columnExists(pool, db, 'courses', 'enrollment_open_at');
    const hasLegacyClose = await columnExists(pool, db, 'courses', 'enrollment_close_at');

    if (hasLegacyOpen || hasLegacyClose) {
      const legacySql = `
        UPDATE courses c
        SET
          c.start_date = COALESCE(c.start_date, DATE(c.enrollment_open_at)),
          c.end_date = COALESCE(c.end_date, DATE(c.enrollment_close_at)),
          c.admission_status = CASE
            WHEN c.allow_enrollment = 1
              AND c.enrollment_open_at IS NOT NULL
              AND c.enrollment_close_at IS NOT NULL
              AND c.enrollment_open_at <= NOW()
              AND c.enrollment_close_at >= NOW() THEN 'OPEN'
            WHEN c.allow_enrollment = 1
              AND (c.enrollment_open_at IS NULL OR c.enrollment_close_at IS NULL) THEN 'OPEN'
            ELSE c.admission_status
          END
        WHERE c.enrollment_open_at IS NOT NULL
           OR c.enrollment_close_at IS NOT NULL`;
      if (dryRun) {
        stats.steps.push({ name: 'legacy_courses_columns', dryRun: true });
      } else {
        stats.steps.push(await runStep(connection, legacySql, 'legacy_courses_columns'));
      }
    }

    if (!dryRun) {
      await connection.query(
        `UPDATE courses SET admission_status = 'CLOSED' WHERE admission_status IS NULL`
      );
      await connection.commit();
    }
  } catch (error) {
    if (!dryRun) {
      try {
        await connection.rollback();
      } catch {
        /* ignore */
      }
    }
    throw error;
  } finally {
    connection.release();
  }

  stats.after = dryRun ? before : await countSnapshot(pool);
  stats.rowsUpdated = Number(stats.after?.total ?? 0);

  console.log('[backfill] Migration audit:', JSON.stringify(stats, null, 2));
  return stats;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
export async function verifyEnrollmentBackfill(pool) {
  const [[nullStatus]] = await pool.query(
    `SELECT COUNT(*) AS n FROM courses WHERE admission_status IS NULL OR admission_status NOT IN ('OPEN', 'CLOSED')`
  );

  const [summary] = await pool.query(
    `SELECT
       admission_status,
       COUNT(*) AS count,
       MIN(start_date) AS earliest_start,
       MAX(end_date) AS latest_end,
       SUM(start_date IS NOT NULL) AS with_start_date,
       SUM(end_date IS NOT NULL) AS with_end_date
     FROM courses
     GROUP BY admission_status`
  );

  const [openWithinWindow] = await pool.query(
    `SELECT COUNT(DISTINCT c.id) AS n
     FROM courses c
     INNER JOIN course_batches cb ON cb.course_id = c.id AND cb.is_active = 1
     WHERE c.admission_status = 'OPEN'
       AND cb.allow_enrollment = 1
       AND cb.enrollment_open_at IS NOT NULL
       AND cb.enrollment_close_at IS NOT NULL
       AND cb.enrollment_open_at <= NOW()
       AND cb.enrollment_close_at >= NOW()`
  );

  const [openUnrestricted] = await pool.query(
    `SELECT COUNT(DISTINCT c.id) AS n
     FROM courses c
     LEFT JOIN course_batches cb ON cb.course_id = c.id AND cb.is_active = 1
     WHERE c.admission_status = 'OPEN'
       AND (
         cb.id IS NULL
         OR (
           cb.allow_enrollment = 1
           AND (cb.enrollment_open_at IS NULL OR cb.enrollment_close_at IS NULL)
         )
       )`
  );

  const [missingDatesWhenWindowExists] = await pool.query(
    `SELECT c.id, c.title, c.start_date, c.end_date, c.admission_status
     FROM courses c
     INNER JOIN course_batches cb ON cb.course_id = c.id AND cb.is_active = 1
     WHERE cb.enrollment_open_at IS NOT NULL
       AND cb.enrollment_close_at IS NOT NULL
       AND (c.start_date IS NULL OR c.end_date IS NULL)
     LIMIT 20`
  );

  const [report] = await pool.query(
    `SELECT 'Total Courses' AS metric, COUNT(*) AS value FROM courses
     UNION ALL
     SELECT 'Open for Enrollment', COUNT(*) FROM courses WHERE admission_status = 'OPEN'
     UNION ALL
     SELECT 'Closed for Enrollment', COUNT(*) FROM courses WHERE admission_status = 'CLOSED'
     UNION ALL
     SELECT 'Courses with start_date', COUNT(*) FROM courses WHERE start_date IS NOT NULL
     UNION ALL
     SELECT 'Courses with end_date', COUNT(*) FROM courses WHERE end_date IS NOT NULL
     UNION ALL
     SELECT 'Courses with both dates', COUNT(*) FROM courses WHERE start_date IS NOT NULL AND end_date IS NOT NULL`
  );

  const openCount = Number(
    summary.find((r) => r.admission_status === 'OPEN')?.count ?? 0
  );
  const closedCount = Number(
    summary.find((r) => r.admission_status === 'CLOSED')?.count ?? 0
  );

  const ok =
    Number(nullStatus?.n ?? 0) === 0 && missingDatesWhenWindowExists.length === 0;

  return {
    ok,
    nullOrInvalidStatus: Number(nullStatus?.n ?? 0),
    openCount,
    closedCount,
    openWithinWindow: Number(openWithinWindow[0]?.n ?? 0),
    openUnrestricted: Number(openUnrestricted[0]?.n ?? 0),
    summary,
    missingDatesWhenWindowExists,
    report,
    generatedAt: new Date().toISOString(),
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const verifyOnly = args.has('--verify');

  const pool = createBackfillPool();

  try {
    if (verifyOnly) {
      const report = await verifyEnrollmentBackfill(pool);
      console.log(JSON.stringify({ verificationReport: report }, null, 2));
      if (!report.ok) process.exitCode = 1;
      return;
    }

    console.log(`[backfill] Starting ${MIGRATION_NAME}...`);
    const result = await runEnrollmentDataBackfill(pool, { dryRun });

    if (!dryRun) {
      const verify = await verifyEnrollmentBackfill(pool);
      console.log(JSON.stringify({ verificationReport: verify }, null, 2));

      if (!verify.ok) {
        process.exitCode = 1;
        console.error('[backfill] Verification failed — see report above.');
        return;
      }

      console.log(
        `✅ Data backfill completed. All courses have admission_status. Open courses: ${verify.openCount}, Closed courses: ${verify.closedCount}. All dates populated correctly.`
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
