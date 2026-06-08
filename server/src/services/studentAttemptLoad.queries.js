/**
 * SQL for student attempt load (Phase 2B) and answer save (Phase 2C).
 */

export const LOAD_ATTEMPT_WITH_TEST_SQL = `
  SELECT
    a.id,
    a.test_id,
    a.user_id,
    a.student_id,
    a.status,
    a.started_at,
    a.expires_at,
    t.status AS test_status,
    t.deleted_at AS test_deleted_at
  FROM test_attempts a
  INNER JOIN tests t ON t.id = a.test_id
  WHERE a.id = ?
  LIMIT 1
`;

export const LOAD_SAVED_ANSWERS_SQL = `
  SELECT question_id, selected_option_id
  FROM student_answers
  WHERE attempt_id = ?
`;
