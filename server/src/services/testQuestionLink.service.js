/**
 * Test question linking — junction table operations (question bank driven).
 */

import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import { QUESTION_SUBJECT_NOT_ALLOWED } from '../errors/codes/ErrorCodes.js';
import { activeQuestionByIdLookup } from './questionBankQueries.service.js';
import { QuestionNotFoundError } from '../errors/questionBank/QuestionBankErrors.js';
import {
  TestCourseScopeError,
  TestMissingCourseError,
  TestNotFoundError,
  TestQuestionBulkLimitError,
  TestQuestionIdsInvalidError,
  TestQuestionLinkDuplicateError,
  TestQuestionNotLinkedError,
  TestQuestionReorderInvalidError,
  TestQuestionUnlinkInvalidError,
} from '../errors/testBuilder/TestBuilderErrors.js';
import { BULK_LINK_MAX_QUESTION_IDS, MAX_QUESTIONS_PER_TEST } from '../validators/testQuestionLink.schema.js';
import { loadComposedTestQuestions } from './testQuestionComposition.service.js';
import { syncTestLifecycleStatus } from './testCompleteness.service.js';
import {
  assertQuestionSubjectIdAllowed,
  enforceQuestionMutationPreconditions,
} from './testValidation.service.js';
import {
  buildActiveQuestionListQuery,
  buildActiveQuestionWhere,
  QB_SELECTOR_COLUMNS,
  sanitizeQuestionSearchTerm,
} from './questionBankQueries.service.js';
import { toAvailableQuestionPickerDto, toTestQuestionLinkResultDto } from '../dto/testQuestion.dto.js';

/**
 * @param {number} testId
 * @param {import('mysql2/promise').PoolConnection} [connection]
 */
async function getTestScopeRow(testId, connection = mysqlPool) {
  const [rows] = await connection.query(
    `SELECT id, course_id, title FROM tests WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [testId]
  );
  return rows[0] ?? null;
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').PoolConnection} [connection]
 */
export async function assertTestExistsWithCourse(testId, connection = mysqlPool) {
  const row = await getTestScopeRow(testId, connection);
  if (!row) {
    throw new TestNotFoundError({ testId });
  }
  const courseId = row.course_id != null ? Number(row.course_id) : null;
  if (!courseId || courseId <= 0) {
    throw new TestMissingCourseError({ testId, reason: 'missing_course_id' });
  }
  return {
    testId: Number(row.id),
    courseId,
    title: String(row.title || ''),
  };
}

/**
 * @param {number} questionId
 * @param {number} courseId
 * @param {import('mysql2/promise').PoolConnection} connection
 */
async function assertActiveQuestionInCourse(questionId, courseId, connection) {
  const { sql, params } = activeQuestionByIdLookup(questionId);
  const [rows] = await connection.query(sql, params);
  const row = rows[0];
  if (!row) {
    throw new QuestionNotFoundError({ questionId });
  }
  if (Number(row.course_id) !== Number(courseId)) {
    throw new TestCourseScopeError({
      questionId,
      questionCourseId: row.course_id,
      testCourseId: courseId,
    });
  }
  return row;
}

/**
 * MCQs must have at least two options before they can be linked to a test.
 * @param {number} questionId
 * @param {import('mysql2/promise').PoolConnection} connection
 */
async function assertMcqHasMinimumOptions(questionId, connection) {
  const [rows] = await connection.query(
    `SELECT qb.question_type, COUNT(qo.id) AS option_count
     FROM question_bank qb
     LEFT JOIN question_options qo ON qo.question_id = qb.id
     WHERE qb.id = ? AND qb.deleted_at IS NULL
     GROUP BY qb.id, qb.question_type`,
    [questionId]
  );
  const row = rows[0];
  if (!row) {
    throw new QuestionNotFoundError({ questionId });
  }
  if (String(row.question_type ?? 'mcq').toLowerCase() !== 'mcq') {
    return;
  }
  const optionCount = Number(row.option_count ?? 0);
  if (optionCount < 2) {
    throw new TestQuestionIdsInvalidError([questionId], {
      reason: 'mcq_missing_options',
      optionCount,
    });
  }
}

/**
 * @param {number} testId
 * @param {number} questionId
 * @param {import('mysql2/promise').PoolConnection} connection
 */
async function assertQuestionLinkedToTest(testId, questionId, connection) {
  const [rows] = await connection.query(
    `SELECT id FROM test_questions WHERE test_id = ? AND question_id = ? LIMIT 1`,
    [testId, questionId]
  );
  if (!rows[0]) {
    throw new TestQuestionNotLinkedError({ testId, questionId });
  }
}

/**
 * @param {number} testId
 * @param {number} linkId
 * @param {import('mysql2/promise').PoolConnection} connection
 */
async function loadComposedLinkRow(testId, linkId, connection) {
  const [rows] = await connection.query(
    `SELECT
       tq.id AS link_id,
       tq.test_id,
       tq.question_id,
       tq.display_order,
       tq.marks_override,
       tq.created_at,
       tq.updated_at,
       qb.question_text,
       qb.explanation,
       qb.marks,
       qb.difficulty,
       qb.topic,
       qb.subject_id,
       qb.question_type,
       qb.course_id
     FROM test_questions tq
     INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
     WHERE tq.test_id = ? AND tq.id = ?
     LIMIT 1`,
    [testId, linkId]
  );
  const row = rows[0];
  if (!row) {
    throw new TestQuestionNotLinkedError({ testId, linkId });
  }

  const [optionRows] = await connection.query(
    `SELECT id, question_id, option_text, is_correct, sort_order
     FROM question_options
     WHERE question_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [row.question_id]
  );

  return toTestQuestionLinkResultDto(row, optionRows);
}

export async function linkQuestionsToTestBulk(testId, questionIds) {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const scope = await assertTestExistsWithCourse(testId, connection);
    const subjectCtx = await enforceQuestionMutationPreconditions(testId, connection);

    const normalizedIds = [...new Set(questionIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!normalizedIds.length) {
      throw new TestQuestionBulkLimitError('question_ids must contain at least one valid question id');
    }
    if (normalizedIds.length > BULK_LINK_MAX_QUESTION_IDS) {
      throw new TestQuestionBulkLimitError(`Cannot link more than ${BULK_LINK_MAX_QUESTION_IDS} questions per request`, {
        maxPerRequest: BULK_LINK_MAX_QUESTION_IDS,
        received: normalizedIds.length,
      });
    }

    const placeholders = normalizedIds.map(() => '?').join(',');
    const [bankRows] = await connection.query(
      `SELECT id, course_id, subject_id FROM question_bank
       WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      normalizedIds
    );

    const bankById = new Map(bankRows.map((row) => [Number(row.id), row]));
    const invalidIds = normalizedIds.filter((id) => {
      const row = bankById.get(id);
      return !row || Number(row.course_id) !== scope.courseId;
    });
    for (const row of bankRows) {
      assertQuestionSubjectIdAllowed(subjectCtx, row.subject_id, Number(row.id));
    }
    if (invalidIds.length) {
      throw new TestQuestionIdsInvalidError(invalidIds, { testId: scope.testId, courseId: scope.courseId });
    }

    const [linkedRows] = await connection.query(
      `SELECT question_id FROM test_questions WHERE test_id = ?`,
      [scope.testId]
    );
    const linkedSet = new Set(linkedRows.map((row) => Number(row.question_id)));
    const skippedDuplicates = normalizedIds.filter((id) => linkedSet.has(id));
    const toInsert = normalizedIds.filter((id) => !linkedSet.has(id));

    for (const questionId of toInsert) {
      await assertMcqHasMinimumOptions(questionId, connection);
    }

    const projectedTotal = linkedSet.size + toInsert.length;
    if (projectedTotal > MAX_QUESTIONS_PER_TEST) {
      throw new TestQuestionBulkLimitError(
        `Test cannot exceed ${MAX_QUESTIONS_PER_TEST} linked questions`,
        {
          maxPerTest: MAX_QUESTIONS_PER_TEST,
          currentCount: linkedSet.size,
          requestedAdd: toInsert.length,
        }
      );
    }

    if (toInsert.length) {
      const [orderRows] = await connection.query(
        `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
         FROM test_questions WHERE test_id = ?`,
        [scope.testId]
      );
      let nextOrder = Number(orderRows[0]?.next_order ?? 0);
      const values = toInsert.map((questionId) => [scope.testId, questionId, nextOrder++, null]);
      await connection.query(
        `INSERT INTO test_questions (test_id, question_id, display_order, marks_override) VALUES ?`,
        [values]
      );
    }

    await connection.commit();
    await syncTestLifecycleStatus(scope.testId);

    return {
      testId: scope.testId,
      added: toInsert.length,
      skipped_duplicates: skippedDuplicates.length,
      linkedQuestionIds: toInsert,
      skippedQuestionIds: skippedDuplicates,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {number} testId
 * @param {number[]} questionIds
 */
export async function unlinkQuestionsFromTestBulk(testId, questionIds) {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await assertTestExistsWithCourse(testId, connection);
    await enforceQuestionMutationPreconditions(testId, connection);

    const normalizedIds = [...new Set(questionIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    if (!normalizedIds.length) {
      throw new TestQuestionBulkLimitError('question_ids must contain at least one valid question id');
    }
    if (normalizedIds.length > BULK_LINK_MAX_QUESTION_IDS) {
      throw new TestQuestionBulkLimitError(`Cannot unlink more than ${BULK_LINK_MAX_QUESTION_IDS} questions per request`, {
        maxPerRequest: BULK_LINK_MAX_QUESTION_IDS,
        received: normalizedIds.length,
      });
    }

    const placeholders = normalizedIds.map(() => '?').join(',');
    const [linkedRows] = await connection.query(
      `SELECT question_id FROM test_questions WHERE test_id = ? AND question_id IN (${placeholders})`,
      [testId, ...normalizedIds]
    );
    const linkedSet = new Set(linkedRows.map((row) => Number(row.question_id)));
    const notLinkedIds = normalizedIds.filter((id) => !linkedSet.has(id));
    if (notLinkedIds.length) {
      throw new TestQuestionUnlinkInvalidError(notLinkedIds, { testId: Number(testId) });
    }

    const [result] = await connection.query(
      `DELETE FROM test_questions WHERE test_id = ? AND question_id IN (${placeholders})`,
      [testId, ...normalizedIds]
    );

    await connection.commit();
    await syncTestLifecycleStatus(Number(testId));

    return {
      testId: Number(testId),
      removed: Number(result.affectedRows ?? normalizedIds.length),
      questionIds: normalizedIds,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {number} testId
 * @param {{ questionId: number, displayOrder?: number, marksOverride?: number|null }} payload
 */
export async function linkQuestionToTest(testId, payload) {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const scope = await assertTestExistsWithCourse(testId, connection);
    const subjectCtx = await enforceQuestionMutationPreconditions(testId, connection);
    const questionId = Number(payload.questionId);

    const questionRow = await assertActiveQuestionInCourse(questionId, scope.courseId, connection);
    assertQuestionSubjectIdAllowed(subjectCtx, questionRow.subject_id, questionId);

    const [dupRows] = await connection.query(
      `SELECT id FROM test_questions WHERE test_id = ? AND question_id = ? LIMIT 1`,
      [scope.testId, questionId]
    );
    if (dupRows[0]) {
      throw new TestQuestionLinkDuplicateError({ testId: scope.testId, questionId });
    }

    let displayOrder = payload.displayOrder;
    if (displayOrder == null) {
      const [orderRows] = await connection.query(
        `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
         FROM test_questions WHERE test_id = ?`,
        [scope.testId]
      );
      displayOrder = Number(orderRows[0]?.next_order ?? 0);
    }

    const marksOverride = payload.marksOverride ?? null;

    const [insertResult] = await connection.query(
      `INSERT INTO test_questions (test_id, question_id, display_order, marks_override)
       VALUES (?, ?, ?, ?)`,
      [scope.testId, questionId, displayOrder, marksOverride]
    );

    const linkId = Number(insertResult.insertId);
    const composed = await loadComposedLinkRow(scope.testId, linkId, connection);
    await connection.commit();
    return composed;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {number} testId
 * @param {number} questionId — question_bank.id
 */
export async function unlinkQuestionFromTest(testId, questionId) {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await assertTestExistsWithCourse(testId, connection);
    await enforceQuestionMutationPreconditions(testId, connection);
    await assertQuestionLinkedToTest(testId, questionId, connection);

    const [result] = await connection.query(
      `DELETE FROM test_questions WHERE test_id = ? AND question_id = ?`,
      [testId, questionId]
    );

    if (!result.affectedRows) {
      throw new TestQuestionNotLinkedError({ testId, questionId });
    }

    await connection.commit();
    await syncTestLifecycleStatus(Number(testId));
    return { testId: Number(testId), questionId: Number(questionId), unlinked: true };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {number} testId
 * @param {Array<{ questionId: number, displayOrder: number }>} items
 */
export async function reorderTestQuestions(testId, items) {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const scope = await assertTestExistsWithCourse(testId, connection);
    await enforceQuestionMutationPreconditions(testId, connection);

    const normalized = items.map((item) => ({
      questionId: Number(item.questionId),
      displayOrder: Number(item.displayOrder),
    }));

    const questionIds = normalized.map((item) => item.questionId);
    if (new Set(questionIds).size !== questionIds.length) {
      throw new TestQuestionReorderInvalidError('questionId values must be unique in reorder payload');
    }

    const [linkedRows] = await connection.query(
      `SELECT question_id FROM test_questions WHERE test_id = ? ORDER BY display_order ASC, id ASC FOR UPDATE`,
      [scope.testId]
    );
    const linkedIds = linkedRows.map((row) => Number(row.question_id));

    if (linkedIds.length !== questionIds.length) {
      throw new TestQuestionReorderInvalidError(
        'Reorder payload must include every linked question exactly once',
        {
          expectedCount: linkedIds.length,
          receivedCount: questionIds.length,
        }
      );
    }

    const linkedSet = new Set(linkedIds);
    if (!questionIds.every((id) => linkedSet.has(id))) {
      throw new TestQuestionReorderInvalidError('Reorder payload contains questions not linked to this test');
    }

    for (const item of normalized) {
      await connection.query(
        `UPDATE test_questions
         SET display_order = ?, updated_at = CURRENT_TIMESTAMP
         WHERE test_id = ? AND question_id = ?`,
        [item.displayOrder, scope.testId, item.questionId]
      );
    }

    await connection.commit();
    return loadComposedTestQuestions(scope.testId, { audience: 'admin' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {number} testId
 * @param {{ page?: number, limit?: number, search?: string, subject_id?: number, difficulty?: string }} filters
 */
export async function listAvailableQuestionsForTest(testId, filters = {}) {
  const scope = await assertTestExistsWithCourse(testId);
  const subjectCtx = await enforceQuestionMutationPreconditions(scope.testId);

  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const offset = (page - 1) * limit;

  const allowedSubjectIds = subjectCtx.subjectIds;
  const subjectPlaceholders = allowedSubjectIds.map(() => '?').join(',');

  const extraConditions = [
    `${'qb'}.course_id = ?`,
    `${'qb'}.id NOT IN (SELECT tq.question_id FROM test_questions tq WHERE tq.test_id = ?)`,
    `${'qb'}.subject_id IN (${subjectPlaceholders})`,
  ];
  const extraParams = [scope.courseId, scope.testId, ...allowedSubjectIds];

  if (filters.subject_id != null) {
    const filterSubjectId = Number(filters.subject_id);
    if (!subjectCtx.allowedSubjectIdSet.has(filterSubjectId)) {
      throw new AppError({
        message: 'Filtered subject is not allowed for this test configuration.',
        errorCode: QUESTION_SUBJECT_NOT_ALLOWED,
        httpStatus: 403,
        isOperational: true,
        metadata: { testId: scope.testId, subjectId: filterSubjectId },
      });
    }
    extraConditions.push(`${'qb'}.subject_id = ?`);
    extraParams.push(filterSubjectId);
  }

  if (filters.difficulty != null) {
    extraConditions.push(`${'qb'}.difficulty = ?`);
    extraParams.push(String(filters.difficulty));
  }

  if (filters.search != null && String(filters.search).trim() !== '') {
    const term = sanitizeQuestionSearchTerm(filters.search);
    if (term) {
      extraConditions.push(`${'qb'}.question_text LIKE ?`);
      extraParams.push(`%${term}%`);
    }
  }

  const filterResult = buildActiveQuestionWhere(extraConditions, extraParams);
  const { countSql, countParams, listSql, listParams } = buildActiveQuestionListQuery(filterResult, {
    limit,
    offset,
    columns: `${QB_SELECTOR_COLUMNS}, ${'qb'}.topic`,
    orderBy: `${'qb'}.id DESC`,
  });

  const [[countRow]] = await mysqlPool.query(countSql, countParams);
  const [rows] = await mysqlPool.query(listSql, listParams);

  const total = Number(countRow?.total ?? 0);

  return {
    items: rows.map(toAvailableQuestionPickerDto),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
    test: {
      testId: scope.testId,
      courseId: scope.courseId,
    },
  };
}

/**
 * @param {number} testId
 */
export async function listLinkedTestQuestionsAdmin(testId) {
  await assertTestExistsWithCourse(testId);
  return loadComposedTestQuestions(testId, { audience: 'admin' });
}
