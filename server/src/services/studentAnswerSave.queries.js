/**
 * Parameterized SQL for POST /student/attempts/:attemptId/answer (Phase 2C).
 * Question/option membership is enforced via exam_snapshot_json, not live test_questions.
 *
 * UPSERT only succeeds while the attempt is still in_progress. FOR UPDATE on the attempt
 * row serializes against submit so late answers cannot land after the graded snapshot.
 */

/** Params: questionId, selectedOptionId, attemptId, studentId, studentId */
export const UPSERT_STUDENT_ANSWER_SQL = `
  INSERT INTO student_answers (
    attempt_id,
    question_id,
    selected_option_id,
    answered_at,
    updated_at
  )
  SELECT a.id, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM test_attempts a
  WHERE a.id = ?
    AND a.status = 'in_progress'
    AND (a.user_id = ? OR a.student_id = ?)
  FOR UPDATE
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
