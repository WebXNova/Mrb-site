/**
 * Parameterized SQL for POST /student/attempts/:attemptId/answer (Phase 2C).
 */

/** Params: testId, questionId */
export const QUESTION_BELONGS_TO_TEST_SQL = `
  SELECT 1 AS ok
  FROM test_questions tq
  INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
  WHERE tq.test_id = ?
    AND tq.question_id = ?
  LIMIT 1
`;

/** Params: selectedOptionId, questionId */
export const OPTION_BELONGS_TO_QUESTION_SQL = `
  SELECT 1 AS ok
  FROM question_options
  WHERE id = ?
    AND question_id = ?
  LIMIT 1
`;

/** Params: attemptId, questionId, selectedOptionId */
export const UPSERT_STUDENT_ANSWER_SQL = `
  INSERT INTO student_answers (
    attempt_id,
    question_id,
    selected_option_id,
    answered_at,
    updated_at
  ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON DUPLICATE KEY UPDATE
    selected_option_id = VALUES(selected_option_id),
    answered_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
`;

/** Params: attemptId, studentId, studentId */
export const TOUCH_ATTEMPT_LAST_ACTIVITY_SQL = `
  UPDATE test_attempts
  SET last_activity_at = CURRENT_TIMESTAMP
  WHERE id = ?
    AND status = 'in_progress'
    AND (user_id = ? OR student_id = ?)
`;
