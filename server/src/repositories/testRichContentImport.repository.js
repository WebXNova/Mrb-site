/**
 * Repository — rich-content test import persistence (transactional helpers).
 */

import { TEST_IMPORT_BATCH_STATUS, TEST_IMPORT_SOURCE_TYPE } from '../constants/testRichContent.constants.js';
import { DEFAULT_TEST_CATEGORY } from '../constants/testMetadata.constants.js';
import { PHASE_1_QUESTION_TYPE } from '../validators/questionWrite.schema.js';
import { assertPersistedQuestionIntegrity } from '../services/questionBankIntegrity.service.js';

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {{
 *   uploadedBy: number,
 *   courseId: number,
 *   fileName?: string|null,
 *   totalQuestions: number,
 * }} params
 */
export async function createTestImportBatch(executor, { uploadedBy, courseId, fileName, totalQuestions }) {
  const [result] = await executor.query(
    `INSERT INTO test_import_batches
       (uploaded_by, source_type, file_name, target_course_id, total_questions, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      uploadedBy,
      TEST_IMPORT_SOURCE_TYPE,
      fileName ?? null,
      courseId,
      totalQuestions,
      TEST_IMPORT_BATCH_STATUS.PENDING,
    ]
  );
  return Number(result.insertId);
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {number} batchId
 * @param {number} testId
 */
export async function finalizeTestImportBatchSuccess(executor, batchId, testId) {
  await executor.query(
    `UPDATE test_import_batches
     SET status = ?, target_test_id = ?, error_code = NULL, error_message = NULL
     WHERE id = ?`,
    [TEST_IMPORT_BATCH_STATUS.COMPLETED, testId, batchId]
  );
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {number} batchId
 * @param {string} errorCode
 * @param {string} errorMessage
 */
export async function finalizeTestImportBatchFailure(executor, batchId, errorCode, errorMessage) {
  await executor.query(
    `UPDATE test_import_batches
     SET status = ?, error_code = ?, error_message = ?
     WHERE id = ?`,
    [TEST_IMPORT_BATCH_STATUS.FAILED, errorCode, String(errorMessage).slice(0, 1000), batchId]
  );
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} courseId
 */
export async function assertCourseExistsForImport(connection, courseId) {
  const [rows] = await connection.query(`SELECT id FROM courses WHERE id = ? LIMIT 1`, [courseId]);
  if (!rows.length) {
    const error = new Error('Course not found');
    error.code = 'COURSE_NOT_FOUND';
    throw error;
  }
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number[]} subjectIds
 * @param {number} courseId
 */
export async function assertSubjectsBelongToCourse(connection, subjectIds, courseId) {
  if (!subjectIds.length) return;
  const placeholders = subjectIds.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT id FROM subjects WHERE course_id = ? AND id IN (${placeholders})`,
    [courseId, ...subjectIds]
  );
  if (rows.length !== subjectIds.length) {
    const error = new Error('One or more subject_ids are invalid for this course.');
    error.code = 'SUBJECT_NOT_FOUND';
    throw error;
  }
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {Record<string, unknown>} testMeta
 * @param {number} courseId
 * @param {number} createdBy
 */
export async function insertImportedTestRow(connection, testMeta, courseId, createdBy) {
  const tags = Array.isArray(testMeta.tags) ? JSON.stringify(testMeta.tags) : JSON.stringify([]);
  const [result] = await connection.query(
    `INSERT INTO tests
       (course_id, title, description, category, test_type, duration_minutes, passing_marks, max_attempts,
        negative_marking, shuffle_questions, shuffle_options, show_explanations, show_result_immediately,
        show_answers_after_submit, allow_retake, access_mode, tags_json, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
    [
      courseId,
      testMeta.title,
      testMeta.description ?? null,
      testMeta.category ?? DEFAULT_TEST_CATEGORY,
      testMeta.test_type ?? 'mixed_subject',
      testMeta.duration_minutes,
      testMeta.passing_marks,
      testMeta.max_attempts,
      Number(testMeta.negative_marking ?? 0),
      testMeta.shuffle_questions ? 1 : 0,
      testMeta.shuffle_options ? 1 : 0,
      testMeta.show_explanations !== false ? 1 : 0,
      testMeta.show_result_immediately !== false ? 1 : 0,
      testMeta.show_answers_after_submit ? 1 : 0,
      testMeta.allow_retake ? 1 : 0,
      testMeta.access_mode ?? 'private',
      tags,
      createdBy,
    ]
  );
  return Number(result.insertId);
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} testId
 * @param {number[]} subjectIds
 */
export async function insertImportedTestSubjects(connection, testId, subjectIds) {
  if (!subjectIds.length) return;
  const values = subjectIds.map((subjectId) => [testId, subjectId]);
  await connection.query(`INSERT INTO test_subjects (test_id, subject_id) VALUES ?`, [values]);
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {Record<string, unknown>} prepared
 * @param {number} createdBy
 */
export async function insertImportedQuestionBankRow(connection, prepared, createdBy) {
  const [result] = await connection.query(
    `INSERT INTO question_bank
       (course_id, subject_id, topic, difficulty, question_type, question_text, question_html,
        question_image_url, explanation, explanation_html, marks, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      prepared.course_id,
      prepared.subject_id ?? null,
      prepared.topic ?? null,
      prepared.difficulty ?? null,
      PHASE_1_QUESTION_TYPE,
      prepared.question_text.trim(),
      (prepared.question_html ?? prepared.question_text).trim(),
      prepared.question_image_url ?? null,
      prepared.explanation ?? null,
      prepared.explanation_html ?? prepared.explanation ?? null,
      prepared.marks,
      createdBy,
    ]
  );
  return Number(result.insertId);
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} questionId
 * @param {Array<Record<string, unknown>>} options
 */
export async function insertImportedQuestionOptions(connection, questionId, options) {
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
 * @param {number} questionId
 * @param {number} displayOrder
 * @param {number|null} marksOverride
 */
export async function insertImportedTestQuestionLink(
  connection,
  testId,
  questionId,
  displayOrder,
  marksOverride
) {
  await connection.query(
    `INSERT INTO test_questions (test_id, question_id, display_order, marks_override)
     VALUES (?, ?, ?, ?)`,
    [testId, questionId, displayOrder, marksOverride]
  );
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} questionId
 */
export async function assertImportedQuestionIntegrity(connection, questionId) {
  await assertPersistedQuestionIntegrity(connection, questionId);
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {number} testId
 */
export async function loadRichContentExportRows(executor, testId) {
  const [testRows] = await executor.query(
    `SELECT id, course_id, title, description, category, test_type, duration_minutes, passing_marks,
            max_attempts, negative_marking, shuffle_questions, shuffle_options, show_explanations,
            show_result_immediately, show_answers_after_submit, allow_retake, access_mode, tags_json
     FROM tests
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [testId]
  );
  const test = testRows[0] ?? null;
  if (!test) return null;

  const [subjectRows] = await executor.query(
    `SELECT subject_id FROM test_subjects WHERE test_id = ? ORDER BY subject_id ASC`,
    [testId]
  );

  const [linkRows] = await executor.query(
    `SELECT
       tq.display_order,
       tq.marks_override,
       qb.topic,
       qb.difficulty,
       qb.question_type,
       qb.question_text,
       qb.question_html,
       qb.question_image_url,
       qb.explanation,
       qb.explanation_html,
       qb.marks,
       qb.id AS question_id
     FROM test_questions tq
     INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
     WHERE tq.test_id = ?
     ORDER BY tq.display_order ASC, tq.id ASC`,
    [testId]
  );

  const questionIds = linkRows.map((row) => Number(row.question_id));
  let optionsByQuestion = new Map();
  if (questionIds.length) {
    const placeholders = questionIds.map(() => '?').join(',');
    const [optionRows] = await executor.query(
      `SELECT question_id, option_key, option_text, option_html, image_url, is_correct, sort_order
       FROM question_options
       WHERE question_id IN (${placeholders})
       ORDER BY question_id ASC, sort_order ASC, id ASC`,
      questionIds
    );
    for (const row of optionRows) {
      const qid = Number(row.question_id);
      if (!optionsByQuestion.has(qid)) optionsByQuestion.set(qid, []);
      optionsByQuestion.get(qid).push(row);
    }
  }

  return {
    test,
    subjectIds: subjectRows.map((row) => Number(row.subject_id)),
    linkRows,
    optionsByQuestion,
  };
}
