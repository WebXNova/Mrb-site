#!/usr/bin/env node
/**
 * Backfill teacher_thread_ref for existing student_questions rows.
 *
 * Usage:
 *   node scripts/backfill-teacher-thread-ref.mjs
 *   node scripts/backfill-teacher-thread-ref.mjs --dry-run
 *   node scripts/backfill-teacher-thread-ref.mjs --batch-size=500
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import { buildTeacherQuestionThreadId } from '../src/services/teacherQuestionThreadRef.js';
import { ensureStudentQuestionsFoundationSchema } from '../src/db/ensureStudentQuestionsFoundationSchema.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const batchArg = args.find((a) => a.startsWith('--batch-size='));
const batchSize = Math.max(50, Number(batchArg?.split('=')[1] || 500));

async function columnExists(db, column) {
  const [rows] = await mysqlPool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'student_questions' AND COLUMN_NAME = ?`,
    [db, column]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function main() {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) throw new Error('No database selected');

  if (!dryRun) {
    await ensureStudentQuestionsFoundationSchema(mysqlPool);
  }

  if (!(await columnExists(db, 'teacher_thread_ref'))) {
    console.error('teacher_thread_ref column missing — run server bootstrap or migration first');
    process.exitCode = 1;
    return;
  }

  let lastId = 0;
  let updated = 0;
  let scanned = 0;

  while (true) {
    const [rows] = await mysqlPool.query(
      `SELECT id, assigned_teacher_id, user_id, teacher_thread_ref
       FROM student_questions
       WHERE id > ?
         AND assigned_teacher_id IS NOT NULL
         AND (teacher_thread_ref IS NULL OR teacher_thread_ref = '')
       ORDER BY id
       LIMIT ?`,
      [lastId, batchSize]
    );

    if (!rows.length) break;

    for (const row of rows) {
      scanned += 1;
      lastId = Number(row.id);
      const ref = buildTeacherQuestionThreadId(row.assigned_teacher_id, row.user_id);
      if (!ref) continue;
      if (row.teacher_thread_ref === ref) continue;

      if (!dryRun) {
        await mysqlPool.query(`UPDATE student_questions SET teacher_thread_ref = ? WHERE id = ?`, [
          ref,
          row.id,
        ]);
      }
      updated += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        batchSize,
        scanned,
        updated,
        message: dryRun ? 'dry-run complete — no rows written' : 'backfill complete',
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mysqlPool.end();
    } catch {
      /* ignore */
    }
  });
