/**
 * Shared read helpers for question_bank — enforces active-only visibility.
 */
import { mysqlPool } from '../config/mysql.js';
import {
  activeQuestionByIdLookup,
  activeQuestionExistsLookup,
  activeQuestionsByIdsLookup,
  buildActiveQuestionListQuery,
  buildQuestionListFilters,
  QB_SELECTOR_COLUMNS,
} from './questionBankQueries.service.js';
import { QuestionNotFoundError } from '../errors/questionBank/QuestionBankErrors.js';

/**
 * Assert question exists and is not soft-deleted.
 * Use before linking to tests or other entities.
 * @param {number} questionId
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} [connection]
 */
export async function assertActiveQuestionExists(questionId, connection = mysqlPool) {
  const { sql, params } = activeQuestionExistsLookup(questionId);
  const [rows] = await connection.query(sql, params);
  if (!rows.length) {
    throw new QuestionNotFoundError({ questionId });
  }
  return Number(rows[0].id);
}

/**
 * Batch validate active questions — returns ids that exist and are active.
 * @param {number[]} questionIds
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} [connection]
 */
export async function findActiveQuestionIds(questionIds, connection = mysqlPool) {
  const normalized = [...new Set(questionIds.map((id) => Number(id)).filter((id) => id > 0))];
  const { sql, params } = activeQuestionsByIdsLookup(normalized);
  if (!sql) return [];
  const [rows] = await connection.query(sql, params);
  return rows.map((row) => Number(row.id));
}

/**
 * Fetch one active question row (no options). For internal/service composition.
 * @param {number} questionId
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} [connection]
 */
export async function fetchActiveQuestionRow(questionId, connection = mysqlPool) {
  const { sql, params } = activeQuestionByIdLookup(questionId);
  const [rows] = await connection.query(sql, params);
  return rows[0] ?? null;
}

/**
 * Test builder / question picker — active questions only, same filters as admin list.
 * @param {{
 *   page?: number,
 *   limit?: number,
 *   search?: string,
 *   course_id?: number,
 *   subject_id?: number,
 *   difficulty?: string,
 * }} filters
 */
export async function listActiveQuestionsForSelector(filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 50));
  const offset = (page - 1) * limit;

  const filterResult = buildQuestionListFilters(filters);
  const { countSql, countParams, listSql, listParams } = buildActiveQuestionListQuery(filterResult, {
    limit,
    offset,
    columns: QB_SELECTOR_COLUMNS,
  });

  const [[countRow]] = await mysqlPool.query(countSql, countParams);
  const [rows] = await mysqlPool.query(listSql, listParams);

  return {
    items: rows.map((row) => ({
      question_id: Number(row.id),
      question_text: String(row.question_text ?? ''),
      difficulty: row.difficulty == null ? null : String(row.difficulty),
      course_id: Number(row.course_id),
      subject_id: row.subject_id == null ? null : Number(row.subject_id),
      question_type: String(row.question_type ?? 'mcq'),
      marks: Number(row.marks),
    })),
    pagination: {
      page,
      limit,
      total: Number(countRow?.total ?? 0),
      total_pages: Number(countRow?.total ?? 0) === 0 ? 0 : Math.ceil(Number(countRow.total) / limit),
    },
  };
}
