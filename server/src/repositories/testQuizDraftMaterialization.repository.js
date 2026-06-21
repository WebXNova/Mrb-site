/**
 * Draft → runtime materialization repository helpers.
 */

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} testId
 * @returns {Promise<number[]>}
 */
export async function listLinkedQuestionIdsForTest(connection, testId) {
  const [rows] = await connection.query(
    `SELECT question_id
     FROM test_questions
     WHERE test_id = ?
     ORDER BY display_order ASC, id ASC`,
    [testId]
  );
  return rows
    .map((row) => Number(row.question_id))
    .filter((id) => Number.isInteger(id) && id > 0);
}

/**
 * Soft-delete superseded question_bank rows that are unlinked and not referenced by attempts.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number[]} questionIds
 * @param {number} deletedBy
 */
export async function softDeleteUnlinkedSupersededQuestions(connection, questionIds, deletedBy) {
  const ids = [
    ...new Set(
      questionIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    ),
  ];
  if (!ids.length) {
    return { candidateCount: 0, deletedCount: 0, skippedCount: 0 };
  }

  const placeholders = ids.map(() => '?').join(', ');
  const [result] = await connection.query(
    `UPDATE question_bank qb
     SET qb.deleted_at = CURRENT_TIMESTAMP,
         qb.deleted_by = ?
     WHERE qb.id IN (${placeholders})
       AND qb.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM test_questions tq WHERE tq.question_id = qb.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM student_answers sa WHERE sa.question_id = qb.id
       )`,
    [deletedBy, ...ids]
  );

  const deletedCount = Number(result.affectedRows ?? 0);
  return {
    candidateCount: ids.length,
    deletedCount,
    skippedCount: Math.max(0, ids.length - deletedCount),
  };
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} testId
 */
export async function clearTestQuestionLinks(connection, testId) {
  const [result] = await connection.query(`DELETE FROM test_questions WHERE test_id = ?`, [testId]);
  return Number(result.affectedRows ?? 0);
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} testId
 */
export async function countTestQuestionLinks(connection, testId) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS total FROM test_questions WHERE test_id = ?`,
    [testId]
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} draftId
 * @param {number} version
 */
export async function markDraftMaterialized(connection, draftId, version) {
  await connection.query(
    `UPDATE test_quiz_drafts
     SET materialized_version = ?,
         materialized_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE draft_id = ?`,
    [version, draftId]
  );
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ testId: number, questionId: number, displayOrder: number, marksOverride: number|null }} row
 */
export async function insertTestQuestionLink(connection, { testId, questionId, displayOrder, marksOverride }) {
  await connection.query(
    `INSERT INTO test_questions (test_id, question_id, display_order, marks_override)
     VALUES (?, ?, ?, ?)`,
    [testId, questionId, displayOrder, marksOverride]
  );
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{
 *   courseId: number,
 *   subjectId: number|null,
 *   questionText: string,
 *   questionImageUrl: string|null,
 *   explanation: string|null,
 *   marks: number,
 *   createdBy: number,
 * }} params
 * @returns {Promise<number>}
 */
export async function insertMaterializedQuestionBankRow(
  connection,
  { courseId, subjectId, questionText, questionHtml, questionImageUrl, explanation, explanationHtml, marks, createdBy }
) {
  const stemHtml = questionHtml ?? questionText;
  const explHtml = explanationHtml ?? explanation;
  const [result] = await connection.query(
    `INSERT INTO question_bank
       (course_id, subject_id, topic, difficulty, question_type, question_text, question_html, question_image_url, explanation, explanation_html, marks, created_by)
     VALUES (?, ?, NULL, NULL, 'mcq', ?, ?, ?, ?, ?, ?, ?)`,
    [courseId, subjectId, questionText, stemHtml, questionImageUrl, explanation, explHtml, marks, createdBy]
  );
  return Number(result.insertId);
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} questionId
 * @param {Array<{ option_key: string, option_text: string, image_url: string|null, is_correct: boolean, sort_order: number }>} options
 */
export async function insertMaterializedQuestionOptions(connection, questionId, options) {
  for (const option of options) {
    await connection.query(
      `INSERT INTO question_options (question_id, option_key, option_text, option_html, image_url, is_correct, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        questionId,
        option.option_key,
        option.option_text.trim(),
        (option.option_html ?? option.option_text).trim(),
        option.image_url ?? null,
        option.is_correct ? 1 : 0,
        option.sort_order,
      ]
    );
  }
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} testId
 */
export async function loadTestPublishScopeRow(connection, testId) {
  const [rows] = await connection.query(
    `SELECT id, course_id, title, status
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1
     FOR UPDATE`,
    [testId]
  );
  return rows[0] ?? null;
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} testId
 */
export async function loadPrimaryTestSubjectId(connection, testId) {
  const [rows] = await connection.query(
    `SELECT subject_id FROM test_subjects WHERE test_id = ? ORDER BY subject_id ASC LIMIT 1`,
    [testId]
  );
  return rows[0]?.subject_id != null ? Number(rows[0].subject_id) : null;
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} testId
 * @param {number} questionId
 */
export async function assertTestQuestionLinkNotDuplicate(connection, testId, questionId) {
  const [rows] = await connection.query(
    `SELECT id FROM test_questions WHERE test_id = ? AND question_id = ? LIMIT 1`,
    [testId, questionId]
  );
  if (rows.length) {
    return true;
  }
  return false;
}
