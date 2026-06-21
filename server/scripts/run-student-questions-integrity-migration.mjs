#!/usr/bin/env node
/**
 * CLI runner for student_questions integrity hardening.
 *
 * Usage:
 *   node scripts/run-student-questions-integrity-migration.mjs --audit
 *   node scripts/run-student-questions-integrity-migration.mjs --dry-run
 *   node scripts/run-student-questions-integrity-migration.mjs
 *   node scripts/run-student-questions-integrity-migration.mjs --rollback --dry-run
 *   node scripts/run-student-questions-integrity-migration.mjs --verify
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import {
  auditStudentQuestionsOrphans,
  ensureStudentQuestionsIntegritySchema,
  rollbackStudentQuestionsIntegritySchema,
} from '../src/db/ensureStudentQuestionsIntegritySchema.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const rollback = args.has('--rollback');
const verify = args.has('--verify');
const audit = args.has('--audit');
const skipOrphanCheck = args.has('--skip-orphan-check');

async function runVerify() {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;

  const [constraints] = await mysqlPool.query(
    `SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE
     FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'student_questions' AND CONSTRAINT_TYPE = 'FOREIGN KEY'
     ORDER BY CONSTRAINT_NAME`,
    [db]
  );

  const [indexes] = await mysqlPool.query(
    `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'student_questions'
     GROUP BY INDEX_NAME ORDER BY INDEX_NAME`,
    [db]
  );

  const [[counts]] = await mysqlPool.query(`SELECT COUNT(*) AS total FROM student_questions`);
  const orphans = await auditStudentQuestionsOrphans(mysqlPool);

  console.log(JSON.stringify({ db, constraints, indexes, counts, orphans }, null, 2));
}

async function main() {
  try {
    if (audit) {
      const orphans = await auditStudentQuestionsOrphans(mysqlPool);
      console.log(JSON.stringify({ orphans }, null, 2));
      const blocked = Object.values(orphans).some((n) => n > 0);
      if (blocked) process.exitCode = 2;
      return;
    }

    if (verify) {
      await runVerify();
      return;
    }

    const result = rollback
      ? await rollbackStudentQuestionsIntegritySchema(mysqlPool, { dryRun })
      : await ensureStudentQuestionsIntegritySchema(mysqlPool, { dryRun, skipOrphanCheck });

    console.log(JSON.stringify(result, null, 2));

    if (!dryRun && !rollback && result.skipped && result.reason === 'orphans_detected') {
      process.exitCode = 2;
    }

    if (!dryRun && !rollback && !result.skipped) {
      await runVerify();
    }
  } finally {
    await mysqlPool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
