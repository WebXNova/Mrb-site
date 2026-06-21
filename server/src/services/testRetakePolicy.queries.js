/**
 * SQL guards — retake policy enforced at INSERT (race-safe).
 *
 * Requires tests alias `t`. Placeholders: studentId, studentId.
 */

/** Append to tests `t` WHERE — blocks new row when allow_retake=0 and any prior attempt exists. */
export const TEST_RETAKE_CREATE_WHERE_SQL = `
  AND (
    t.allow_retake = 1
    OR NOT EXISTS (
      SELECT 1
      FROM test_attempts a_retake
      WHERE a_retake.test_id = t.id
        AND (a_retake.student_id = ? OR a_retake.user_id = ?)
    )
  )`;

/** Params: testId, studentId, studentId */
export const COUNT_STUDENT_ATTEMPTS_FOR_TEST_SQL = `
  SELECT COUNT(*) AS total
  FROM test_attempts
  WHERE test_id = ?
    AND (student_id = ? OR user_id = ?)
`;
