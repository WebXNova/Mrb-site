/**
 * Persist graded attempt results — all NOT NULL columns populated from attempt row.
 *
 * Params:
 * totalQuestions, correctAnswers, wrongAnswers, skippedAnswers,
 * score, maxScore, percentage, correctCount, wrongCount, skippedCount,
 * passStatus, timeTakenSeconds, detailJson,
 * courseId, attemptId, studentId
 */
export const INSERT_TEST_RESULT_SQL = `
  INSERT INTO test_results (
    attempt_id,
    student_id,
    test_id,
    course_id,
    total_questions,
    correct_answers,
    wrong_answers,
    skipped_answers,
    score,
    max_score,
    percentage,
    correct_count,
    wrong_count,
    skipped_count,
    grade,
    time_taken_seconds,
    detail_json,
    generated_at
  )
  SELECT
    a.id,
    a.student_id,
    a.test_id,
    t.course_id,
    ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?,
    ?,
    CURRENT_TIMESTAMP
  FROM test_attempts a
  INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
  WHERE a.id = ?
    AND a.student_id = ?
  LIMIT 1
`;
