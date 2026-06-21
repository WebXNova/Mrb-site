/**
 * One-shot: create student_questions if missing (same as server startup bootstrap).
 * Run: node scripts/bootstrap-student-questions-table.mjs
 */
import { mysqlPool } from '../src/config/mysql.js';
import { ensureStudentQuestionsSchema } from '../src/db/ensureStudentQuestionsSchema.js';
import { ensureStudentQuestionsFoundationSchema } from '../src/db/ensureStudentQuestionsFoundationSchema.js';

await ensureStudentQuestionsSchema(mysqlPool);
await ensureStudentQuestionsFoundationSchema(mysqlPool);

const [rows] = await mysqlPool.query(
  "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_questions'"
);
console.log('student_questions exists:', Number(rows[0]?.n) > 0 ? 'YES' : 'NO');

await mysqlPool.end();
