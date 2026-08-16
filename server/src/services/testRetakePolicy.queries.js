/**
 * SQL guards — retake policy enforced at INSERT (race-safe).
 *
 * Requires tests alias `t`. Placeholders: studentId, studentId.
 */

/** Append to tests `t` WHERE — blocks new row when max_attempts cap is reached. */
export const TEST_RETAKE_CREATE_WHERE_SQL = `
  AND (
    t.max_attempts IS NULL OR t.max_attempts <= 0
    OR (
      SELECT COUNT(*)
      FROM test_attempts a_retake
      WHERE a_retake.test_id = t.id
        AND (a_retake.student_id = ? OR a_retake.user_id = ?)
    ) < t.max_attempts
  )`;

/** Params: testId, studentId, studentId */
export const COUNT_STUDENT_ATTEMPTS_FOR_TEST_SQL = `
  SELECT COUNT(*) AS total
  FROM test_attempts
  WHERE test_id = ?
    AND (student_id = ? OR user_id = ?)
`;
