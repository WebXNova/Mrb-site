/**
 * One-shot: legacy test_type migration, test_subjects backfill, lifecycle resync.
 */
import 'dotenv/config';
import { verifyMySqlConnection, mysqlPool } from '../src/config/mysql.js';
import { runTestSubjectsBackfill } from '../src/services/backfillTestSubjects.service.js';

await verifyMySqlConnection();
const summary = await runTestSubjectsBackfill(mysqlPool);
console.log(JSON.stringify(summary, null, 2));
if (summary.stillMissingSubjects > 0) {
  console.log(
    `\n${summary.stillMissingSubjects} test(s) have no test_subjects — they stay INCOMPLETE until Step 1 is re-saved with valid subject_id(s).`
  );
}
await mysqlPool.end();
