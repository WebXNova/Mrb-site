#!/usr/bin/env node
/**
 * H-01 enrollment integrity migration runner.
 *
 * Usage:
 *   node scripts/run-enrollment-integrity-migration.mjs --analyze
 *   node scripts/run-enrollment-integrity-migration.mjs
 *   node scripts/run-enrollment-integrity-migration.mjs --dry-run
 *   node scripts/run-enrollment-integrity-migration.mjs --rollback
 */
import 'dotenv/config';
import { mysqlPool } from '../src/config/mysql.js';
import {
  analyzeEnrollmentUserCourseDuplicates,
  ensureEnrollmentUserCourseUniqueSchema,
  rollbackEnrollmentUserCourseUniqueSchema,
} from '../src/db/ensureEnrollmentUserCourseUniqueSchema.js';

const args = new Set(process.argv.slice(2));
const analyze = args.has('--analyze');
const dryRun = args.has('--dry-run');
const rollback = args.has('--rollback');

async function main() {
  try {
    if (analyze) {
      const report = await analyzeEnrollmentUserCourseDuplicates(mysqlPool);
      console.log(JSON.stringify(report, null, 2));
      if (!report.migrationReady && !report.uniqueIndexPresent) process.exitCode = 1;
      return;
    }

    const result = rollback
      ? await rollbackEnrollmentUserCourseUniqueSchema(mysqlPool, { dryRun })
      : await ensureEnrollmentUserCourseUniqueSchema(mysqlPool, { dryRun });

    console.log(JSON.stringify(result, null, 2));

    if (!dryRun && !rollback) {
      const verify = await analyzeEnrollmentUserCourseDuplicates(mysqlPool);
      console.log(JSON.stringify({ verify }, null, 2));
    }
  } finally {
    await mysqlPool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
