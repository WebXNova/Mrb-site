/**
 * Parameterized SQL for answer storage (UPSERT).
 * Question/option membership is enforced via exam_snapshot_json.
 */

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
