import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import { NOT_FOUND } from '../errors/codes/ErrorCodes.js';
import { DERIVED_PASS_STATUS_SQL } from '../result/passStatus.js';
import { assertTestMutationAccess } from './testMutationAccess.service.js';

/**
 * @param {number[]} attemptIds
 */
async function loadViolationsByAttemptIds(attemptIds) {
  const ids = [...new Set(attemptIds.map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => '?').join(', ');
  const [rows] = await mysqlPool.query(
    `SELECT attempt_id, violation_number, violation_type, occurred_at
     FROM test_cheating_violations
     WHERE attempt_id IN (${placeholders})
     ORDER BY attempt_id ASC, violation_number ASC`,
    ids
  );

  const map = new Map();
  for (const row of rows) {
    const attemptId = Number(row.attempt_id);
    const list = map.get(attemptId) ?? [];
    list.push({
      violation_number: Number(row.violation_number),
      violation_type: String(row.violation_type ?? ''),
      occurred_at: row.occurred_at ? new Date(row.occurred_at).toISOString() : null,
    });
    map.set(attemptId, list);
  }
  return map;
}

/**
 * Parse the detail_json from test_results into ordered items.
 * detail_json is the authoritative source for per-question results because
 * student_answers.is_correct is never populated by the submission flow.
 *
 * @param {string|null} detailJsonRaw
 * @returns {Array<{ questionId: number, item: object }>}
 */
export function parseDetailItemsOrdered(detailJsonRaw) {
  if (!detailJsonRaw) return [];
  try {
    const parsed = typeof detailJsonRaw === 'string' ? JSON.parse(detailJsonRaw) : detailJsonRaw;
    if (!Array.isArray(parsed)) return [];
    const items = [];
    for (const item of parsed) {
      if (item && item.questionId != null) {
        items.push({ questionId: Number(item.questionId), item });
      }
    }
    return items;
  } catch {
    return [];
  }
}

/**
 * Build a per-attempt answer grid from that attempt's frozen detail_json.
 * Does not map onto the current test_questions list.
 *
 * @param {string|null} detailJsonRaw
 * @param {number} columnCount
 */
export function buildAttemptAnswerGridFromDetail(detailJsonRaw, columnCount) {
  const items = parseDetailItemsOrdered(detailJsonRaw);
  const len = Math.max(Number(columnCount) || 0, items.length);
  const answerGrid = new Array(len).fill(null);
  const answerDetails = new Array(len).fill(null);

  items.forEach(({ questionId: qid, item: detail }, idx) => {
    if (idx >= len) return;
    const isCorrect = detail.isCorrect === true ? true : detail.isCorrect === false ? false : null;
    const selectedId = detail.selectedOptionId ?? detail.selectedOption ?? null;
    const wasAnswered = selectedId != null && selectedId !== '' && selectedId !== 0;
    answerGrid[idx] = wasAnswered ? isCorrect : null;
    answerDetails[idx] = {
      question_id: qid,
      question_text: detail.questionText ?? '',
      selected_option_id: detail.selectedOptionId ?? null,
      selected_option_key: detail.selectedOptionKey ?? '',
      selected_option_text: detail.selectedOptionText ?? '',
      correct_option_id: detail.correctOptionId ?? null,
      correct_option_key: detail.correctOptionKey ?? '',
      correct_option_text: detail.correctOptionText ?? '',
      is_correct: isCorrect,
      marks: detail.marks ?? null,
      marks_awarded: detail.marksAwarded ?? null,
      explanation: detail.explanation ?? '',
      options: Array.isArray(detail.options)
        ? detail.options.map((o) => ({
            option_id: o.id ?? null,
            option_key: o.key ?? '',
            option_text: o.text ?? '',
            is_correct: Boolean(o.isCorrect),
          }))
        : [],
    };
  });

  return { answerGrid, answerDetails };
}

/**
 * @param {number} testId
 * @param {{ userId?: number|null, role?: string|null }} [access]
 * @param {{ page?: number, limit?: number, q?: string, sort?: string, dir?: string }} [query]
 */
export async function listAdminTestResults(testId, access = {}, query = {}) {
  const tid = Number(testId);
  if (access.userId != null) {
    await assertTestMutationAccess(tid, access.userId, access.role ?? 'admin', {
      action: 'read_results',
    });
  }

  const [testRows] = await mysqlPool.query(
    `SELECT id, title, status, results_released_at, passing_marks
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [tid]
  );
  const testRow = testRows[0];
  if (!testRow) {
    throw new AppError({
      message: 'Test was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: tid },
    });
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 25));
  const offset = (page - 1) * limit;
  const search = String(query.q ?? '').trim().slice(0, 80);
  const sortMap = {
    submitted_at: 'a.submitted_at',
    started_at: 'a.started_at',
    percentage: 'r.percentage',
    student_name: 'COALESCE(a.student_name, u.full_name, u.username)',
    time_taken_seconds: 'r.time_taken_seconds',
  };
  const sortExpr = sortMap[String(query.sort || '')] || sortMap.submitted_at;
  const sortDir = String(query.dir || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const searchSql = search
    ? `AND (COALESCE(a.student_name, u.full_name, u.username, '') LIKE ? OR COALESCE(u.email, '') LIKE ?)`
    : '';
  const searchParams = search ? [`%${search}%`, `%${search}%`] : [];

  const [[stats]] = await mysqlPool.query(
    `SELECT
       COUNT(*) AS total_responses,
       AVG(r.score) AS average_score,
       AVG(r.percentage) AS average_percentage,
       AVG(NULLIF(r.time_taken_seconds, 0)) AS average_time_seconds
     FROM test_attempts a
     LEFT JOIN test_results r ON r.attempt_id = a.id
     WHERE a.test_id = ?
       AND a.status = 'submitted'`,
    [tid]
  );

  const [histRows] = await mysqlPool.query(
    `SELECT LEAST(FLOOR(r.percentage / 10), 9) AS bucket, COUNT(*) AS n
     FROM test_attempts a
     INNER JOIN test_results r ON r.attempt_id = a.id
     WHERE a.test_id = ?
       AND a.status = 'submitted'
       AND r.percentage IS NOT NULL
     GROUP BY bucket`,
    [tid]
  );
  const scoreBuckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const row of histRows) {
    const bucket = Number(row.bucket);
    if (bucket >= 0 && bucket <= 9) scoreBuckets[bucket] = Number(row.n ?? 0);
  }

  const [[countRow]] = await mysqlPool.query(
    `SELECT COUNT(*) AS total
     FROM test_attempts a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.test_id = ?
       AND a.status = 'submitted'
       ${searchSql}`,
    [tid, ...searchParams]
  );
  const filteredTotal = Number(countRow?.total ?? 0);

  const [attemptRows] = await mysqlPool.query(
    `SELECT
       a.id AS attempt_id,
       a.status AS attempt_status,
       a.submitted_at,
       a.started_at,
       a.is_flagged_cheating,
       a.user_id,
       COALESCE(a.student_name, u.full_name, u.username, 'Student') AS student_name,
       u.email AS user_email,
       r.score,
       r.max_score,
       r.percentage,
       r.correct_answers,
       r.wrong_answers,
       r.skipped_answers,
       r.total_questions,
       r.detail_json,
       ${DERIVED_PASS_STATUS_SQL} AS pass_status,
       r.time_taken_seconds
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id
     LEFT JOIN test_results r ON r.attempt_id = a.id
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.test_id = ?
       AND a.status = 'submitted'
       ${searchSql}
     ORDER BY ${sortExpr} ${sortDir}, a.id DESC
     LIMIT ? OFFSET ?`,
    [tid, ...searchParams, limit, offset]
  );

  const flaggedIds = attemptRows
    .filter((row) => Number(row.is_flagged_cheating) === 1)
    .map((row) => Number(row.attempt_id));
  const violationsByAttempt = await loadViolationsByAttemptIds(flaggedIds);

  const columnCount = attemptRows.reduce((max, row) => {
    const n = parseDetailItemsOrdered(row.detail_json).length;
    return Math.max(max, n);
  }, 0);
  const questionOrder = Array.from({ length: columnCount }, (_, idx) => idx + 1);

  const attempts = attemptRows.map((row) => {
    const attemptId = Number(row.attempt_id);
    const isFlagged = Number(row.is_flagged_cheating) === 1;
    const pct = row.percentage == null ? null : Number(row.percentage);
    const timeSec = row.time_taken_seconds == null ? null : Number(row.time_taken_seconds);
    const { answerGrid } = buildAttemptAnswerGridFromDetail(row.detail_json, columnCount);

    return {
      attempt_id: attemptId,
      user_id: row.user_id == null ? null : Number(row.user_id),
      student_name: String(row.student_name ?? 'Student'),
      user_email: row.user_email == null ? null : String(row.user_email),
      submitted_at: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
      started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
      score: row.score == null ? null : Number(row.score),
      max_score: row.max_score == null ? null : Number(row.max_score),
      percentage: pct,
      pass_status: row.pass_status == null ? null : String(row.pass_status),
      time_taken_seconds: timeSec,
      correct_answers: row.correct_answers == null ? null : Number(row.correct_answers),
      wrong_answers: row.wrong_answers == null ? null : Number(row.wrong_answers),
      skipped_answers: row.skipped_answers == null ? null : Number(row.skipped_answers),
      total_questions: row.total_questions == null ? null : Number(row.total_questions),
      is_flagged_cheating: isFlagged,
      violations: isFlagged ? violationsByAttempt.get(attemptId) ?? [] : [],
      answer_grid: answerGrid,
    };
  });

  const avgScore = stats?.average_score == null ? null : Math.round(Number(stats.average_score) * 100) / 100;
  const avgPercentage =
    stats?.average_percentage == null ? null : Math.round(Number(stats.average_percentage) * 100) / 100;
  const avgTimeSec =
    stats?.average_time_seconds == null ? null : Math.round(Number(stats.average_time_seconds));

  return {
    testId: tid,
    testTitle: String(testRow.title ?? ''),
    results_released_at: testRow.results_released_at
      ? new Date(testRow.results_released_at).toISOString()
      : null,
    summary: {
      total_responses: Number(stats?.total_responses ?? 0),
      average_score: avgScore,
      average_percentage: avgPercentage,
      average_time_seconds: avgTimeSec,
      passing_marks: Number(testRow.passing_marks ?? 0),
      score_histogram: scoreBuckets,
    },
    pagination: {
      page,
      limit,
      total: filteredTotal,
      total_pages: Math.max(1, Math.ceil(filteredTotal / limit)),
    },
    question_ids: questionOrder,
    attempts,
  };
}

/**
 * Single submitted attempt with frozen question-level detail (admin View Result).
 */
export async function getAdminTestAttemptResult(testId, attemptId, access = {}) {
  const tid = Number(testId);
  const aid = Number(attemptId);
  if (access.userId != null) {
    await assertTestMutationAccess(tid, access.userId, access.role ?? 'admin', {
      action: 'read_results',
    });
  }

  const [rows] = await mysqlPool.query(
    `SELECT
       a.id AS attempt_id,
       a.test_id,
       a.submitted_at,
       a.started_at,
       a.is_flagged_cheating,
       a.user_id,
       COALESCE(a.student_name, u.full_name, u.username, 'Student') AS student_name,
       u.email AS user_email,
       r.score,
       r.max_score,
       r.percentage,
       r.correct_answers,
       r.wrong_answers,
       r.skipped_answers,
       r.total_questions,
       r.detail_json,
       ${DERIVED_PASS_STATUS_SQL} AS pass_status,
       r.time_taken_seconds
     FROM test_attempts a
     INNER JOIN tests t ON t.id = a.test_id
     LEFT JOIN test_results r ON r.attempt_id = a.id
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.test_id = ?
       AND a.id = ?
       AND a.status = 'submitted'
     LIMIT 1`,
    [tid, aid]
  );
  const row = rows[0];
  if (!row) {
    throw new AppError({
      message: 'Attempt was not found.',
      errorCode: NOT_FOUND,
      httpStatus: 404,
      isOperational: true,
      metadata: { testId: tid, attemptId: aid },
    });
  }

  const items = parseDetailItemsOrdered(row.detail_json);
  const { answerGrid, answerDetails } = buildAttemptAnswerGridFromDetail(row.detail_json, items.length);
  const violationsByAttempt = await loadViolationsByAttemptIds(
    Number(row.is_flagged_cheating) === 1 ? [aid] : []
  );

  return {
    attempt_id: aid,
    user_id: row.user_id == null ? null : Number(row.user_id),
    student_name: String(row.student_name ?? 'Student'),
    user_email: row.user_email == null ? null : String(row.user_email),
    submitted_at: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
    started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
    score: row.score == null ? null : Number(row.score),
    max_score: row.max_score == null ? null : Number(row.max_score),
    percentage: row.percentage == null ? null : Number(row.percentage),
    pass_status: row.pass_status == null ? null : String(row.pass_status),
    time_taken_seconds: row.time_taken_seconds == null ? null : Number(row.time_taken_seconds),
    correct_answers: row.correct_answers == null ? null : Number(row.correct_answers),
    wrong_answers: row.wrong_answers == null ? null : Number(row.wrong_answers),
    skipped_answers: row.skipped_answers == null ? null : Number(row.skipped_answers),
    total_questions: row.total_questions == null ? null : Number(row.total_questions),
    is_flagged_cheating: Number(row.is_flagged_cheating) === 1,
    violations: violationsByAttempt.get(aid) ?? [],
    answer_grid: answerGrid,
    answer_details: answerDetails,
  };
}
