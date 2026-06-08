/**
 * Report tests with missing or violated subject mappings (no auto-fix).
 * Run: node scripts/audit-test-subject-integrity.mjs
 */
import { mysqlPool } from '../src/config/mysql.js';

async function main() {
  const issues = [];

  const [noSubjects] = await mysqlPool.query(
    `SELECT t.id AS test_id, t.title AS test_name, t.test_type, t.status
     FROM tests t
     WHERE t.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM test_subjects ts WHERE ts.test_id = t.id)
     ORDER BY t.id ASC`
  );

  for (const row of noSubjects) {
    issues.push({
      testId: row.test_id,
      testName: row.test_name,
      testType: row.test_type,
      status: row.status,
      issueType: 'NO_TEST_SUBJECTS',
      recommendedFix: 'Re-save Step 1 basic info with valid subject_id or subject_ids for the course.',
    });
  }

  const [subjectWiseMulti] = await mysqlPool.query(
    `SELECT t.id AS test_id, t.title AS test_name, t.test_type, t.status, COUNT(ts.subject_id) AS subject_count
     FROM tests t
     INNER JOIN test_subjects ts ON ts.test_id = t.id
     WHERE t.deleted_at IS NULL AND t.test_type = 'subject_wise'
     GROUP BY t.id, t.title, t.test_type, t.status
     HAVING subject_count <> 1`
  );

  for (const row of subjectWiseMulti) {
    issues.push({
      testId: row.test_id,
      testName: row.test_name,
      testType: row.test_type,
      status: row.status,
      issueType: 'SUBJECT_WISE_MULTIPLE_SUBJECTS',
      recommendedFix: 'Set exactly one subject via PATCH /admin/tests/:id/basic-info.',
    });
  }

  const [violations] = await mysqlPool.query(
    `SELECT t.id AS test_id,
            t.title AS test_name,
            t.test_type,
            t.status,
            tq.question_id,
            qb.subject_id AS question_subject_id
     FROM tests t
     INNER JOIN test_questions tq ON tq.test_id = t.id
     INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
     WHERE t.deleted_at IS NULL
       AND (
         NOT EXISTS (SELECT 1 FROM test_subjects ts WHERE ts.test_id = t.id)
         OR NOT EXISTS (
           SELECT 1 FROM test_subjects ts
           WHERE ts.test_id = t.id AND ts.subject_id = qb.subject_id
         )
       )
     ORDER BY t.id ASC, tq.question_id ASC`
  );

  const seen = new Set();
  for (const row of violations) {
    const key = `${row.test_id}:${row.question_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      testId: row.test_id,
      testName: row.test_name,
      testType: row.test_type,
      status: row.status,
      questionId: row.question_id,
      questionSubjectId: row.question_subject_id,
      issueType: 'LINKED_QUESTION_SUBJECT_VIOLATION',
      recommendedFix: 'Unlink invalid questions or update test_subjects to include the question subject.',
    });
  }

  console.log('=== Test Subject Integrity Audit (report only) ===\n');
  if (!issues.length) {
    console.log('No subject integrity issues found.');
    process.exit(0);
  }

  console.log(`Found ${issues.length} issue(s):\n`);
  for (const issue of issues) {
    console.log(JSON.stringify(issue, null, 2));
    console.log('---');
  }

  const summary = issues.reduce((acc, row) => {
    acc[row.issueType] = (acc[row.issueType] || 0) + 1;
    return acc;
  }, {});
  console.log('Summary by issue type:', summary);
  process.exit(0);
}

main().catch((err) => {
  console.error('Audit failed:', err.message);
  process.exit(1);
});
