/**
 * Grading engine — parameterized database access (batch queries, no N+1).
 */

/** Params: attemptId */
export const LOCK_SUBMITTED_ATTEMPT_SQL = `
  SELECT
    a.id,
    a.test_id,
    a.student_id,
    a.status,
    a.started_at,
    a.submitted_at,
    TIMESTAMPDIFF(SECOND, a.started_at, a.submitted_at) AS time_taken_seconds,
    t.course_id,
    t.passing_marks,
    t.negative_marking
  FROM test_attempts a
  INNER JOIN tests t ON t.id = a.test_id AND t.deleted_at IS NULL
  WHERE a.id = ?
  LIMIT 1
  FOR UPDATE
`;

/** Params: attemptId */
export const FIND_RESULT_BY_ATTEMPT_SQL = `
  SELECT
    id AS result_id,
    attempt_id,
    score,
    percentage,
    correct_answers,
    wrong_answers,
    skipped_answers AS unanswered_answers,
    grade AS pass_status,
    time_taken_seconds
  FROM test_results
  WHERE attempt_id = ?
  LIMIT 1
`;

/**
 * Batch load: all linked questions + student answer + correct option id.
 * Params: attemptId, testId
 */
export const LOAD_GRADING_QUESTIONS_SQL = `
  SELECT
    tq.question_id,
    COALESCE(tq.marks_override, qb.marks, 1) AS effective_marks,
    sa.selected_option_id,
    correct_opt.id AS correct_option_id
  FROM test_questions tq
  INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
  LEFT JOIN student_answers sa
    ON sa.attempt_id = ?
   AND sa.question_id = tq.question_id
  LEFT JOIN question_options correct_opt
    ON correct_opt.question_id = tq.question_id
   AND correct_opt.is_correct = 1
  WHERE tq.test_id = ?
  ORDER BY tq.display_order ASC, tq.id ASC
`;

/**
 * Params:
 * totalQuestions, correctAnswers, wrongAnswers, unansweredAnswers,
 * score, maxScore, percentage, passStatus, timeTakenSeconds,
 * courseId, attemptId, studentId
 */
export const INSERT_GRADING_RESULT_SQL = `
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
    NULL,
    CURRENT_TIMESTAMP
  FROM test_attempts a
  INNER JOIN tests t ON t.id = a.test_id AND t.course_id = ?
  WHERE a.id = ?
    AND a.student_id = ?
    AND a.status = 'submitted'
  LIMIT 1
`;

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {number} attemptId
 */
export async function lockSubmittedAttempt(db, attemptId) {
  const [rows] = await db.query(LOCK_SUBMITTED_ATTEMPT_SQL, [attemptId]);
  return rows[0] ?? null;
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {number} attemptId
 */
export async function findExistingResult(db, attemptId) {
  const [rows] = await db.query(FIND_RESULT_BY_ATTEMPT_SQL, [attemptId]);
  return rows[0] ?? null;
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {number} attemptId
 * @param {number} testId
 */
export async function loadGradingQuestionRows(db, attemptId, testId) {
  const [rows] = await db.query(LOAD_GRADING_QUESTIONS_SQL, [attemptId, testId]);
  return rows;
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} db
 * @param {object} params
 */
export async function insertGradingResult(db, params) {
  const [result] = await db.query(INSERT_GRADING_RESULT_SQL, [
    params.totalQuestions,
    params.correctAnswers,
    params.wrongAnswers,
    params.unansweredAnswers,
    params.score,
    params.maxScore,
    params.percentage,
    params.correctAnswers,
    params.wrongAnswers,
    params.unansweredAnswers,
    params.passStatus,
    params.timeTakenSeconds,
    params.courseId,
    params.attemptId,
    params.studentId,
  ]);
  return result;
}
