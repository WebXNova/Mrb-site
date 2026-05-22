/**
 * Pre-deploy duplicate check for course_batches.
 * Fails (exit 1) if any course_id has more than one batch.
 *
 * Usage:
 *   node scripts/verify-course-batch-duplicates.mjs
 */
import { mysqlPool } from '../src/config/mysql.js';

async function main() {
  const [dups] = await mysqlPool.query(`
    SELECT course_id, COUNT(*) AS batch_count
    FROM course_batches
    GROUP BY course_id
    HAVING COUNT(*) > 1
  `);

  if (dups.length > 0) {
    console.error('Found duplicate batches per course_id:');
    for (const row of dups) {
      console.error(`course_id=${row.course_id}, batch_count=${row.batch_count}`);
    }
    await mysqlPool.end();
    process.exit(1);
  }

  console.log('OK: no duplicate course_id entries in course_batches.');
  await mysqlPool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

