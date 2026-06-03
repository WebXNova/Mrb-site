/**
 * Canonical SQL fragments and filter builders for question_bank reads.
 *
 * RULE: Every normal application read MUST include `deleted_at IS NULL`.
 * Mutations (soft delete, update lock) use dedicated helpers in questions.service.js.
 */

/** @typedef {'qb'|''} QuestionBankAlias */

export const QB_TABLE = 'question_bank';
export const QB_ALIAS = 'qb';

/** Predicate for aliased queries (list, joins). */
export const QB_ACTIVE_WHERE_ALIAS = `${QB_ALIAS}.deleted_at IS NULL`;

/** Predicate for unaliased single-table lookups. */
export const QB_ACTIVE_WHERE = 'deleted_at IS NULL';

export const QB_LIST_COLUMNS = `
  ${QB_ALIAS}.id,
  ${QB_ALIAS}.question_text,
  ${QB_ALIAS}.difficulty,
  ${QB_ALIAS}.course_id,
  ${QB_ALIAS}.subject_id,
  ${QB_ALIAS}.marks,
  ${QB_ALIAS}.created_at
`;

/** Selector/minimal columns for test builder and pickers. */
export const QB_SELECTOR_COLUMNS = `
  ${QB_ALIAS}.id,
  ${QB_ALIAS}.question_text,
  ${QB_ALIAS}.difficulty,
  ${QB_ALIAS}.course_id,
  ${QB_ALIAS}.subject_id,
  ${QB_ALIAS}.question_type,
  ${QB_ALIAS}.marks
`;

export const QB_DETAIL_COLUMNS = `
  id,
  course_id,
  subject_id,
  topic,
  difficulty,
  question_type,
  question_text,
  explanation,
  marks,
  created_by,
  created_at,
  updated_at
`;

/**
 * Base active-only WHERE for aliased list/search queries.
 * @param {string[]} [extraConditions] — must use `qb.` prefix when aliased
 * @param {unknown[]} [extraParams]
 */
export function buildActiveQuestionWhere(extraConditions = [], extraParams = []) {
  return {
    whereClause: [QB_ACTIVE_WHERE_ALIAS, ...extraConditions].join(' AND '),
    params: [...extraParams],
  };
}

/** Sanitize search term — strip LIKE wildcards to prevent pattern injection. */
export function sanitizeQuestionSearchTerm(value) {
  return String(value)
    .trim()
    .slice(0, 200)
    .replace(/[%_\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Admin list / search / filter / pagination predicates (active questions only).
 * @param {{
 *   search?: string,
 *   course_id?: number,
 *   subject_id?: number,
 *   difficulty?: string,
 * }} filters
 */
export function buildQuestionListFilters(filters) {
  const extraConditions = [];
  const extraParams = [];

  if (filters.course_id != null) {
    extraConditions.push(`${QB_ALIAS}.course_id = ?`);
    extraParams.push(filters.course_id);
  }

  if (filters.subject_id != null) {
    extraConditions.push(`${QB_ALIAS}.subject_id = ?`);
    extraParams.push(filters.subject_id);
  }

  if (filters.difficulty != null) {
    extraConditions.push(`${QB_ALIAS}.difficulty = ?`);
    extraParams.push(filters.difficulty);
  }

  if (filters.search != null && String(filters.search).trim() !== '') {
    const term = sanitizeQuestionSearchTerm(filters.search);
    if (term) {
      extraConditions.push(`${QB_ALIAS}.question_text LIKE ?`);
      extraParams.push(`%${term}%`);
    }
  }

  return buildActiveQuestionWhere(extraConditions, extraParams);
}

/** SQL + params for active question by primary key (unaliased). */
export function activeQuestionByIdLookup(questionId) {
  return {
    sql: `SELECT ${QB_DETAIL_COLUMNS}
          FROM ${QB_TABLE}
          WHERE id = ? AND ${QB_ACTIVE_WHERE}
          LIMIT 1`,
    params: [questionId],
  };
}

/** Existence check for test builder / junction table linking (active only). */
export function activeQuestionExistsLookup(questionId) {
  return {
    sql: `SELECT id FROM ${QB_TABLE} WHERE id = ? AND ${QB_ACTIVE_WHERE} LIMIT 1`,
    params: [questionId],
  };
}

/** Batch existence — active questions only; for future multi-select test builder. */
export function activeQuestionsByIdsLookup(questionIds) {
  if (!Array.isArray(questionIds) || questionIds.length === 0) {
    return { sql: null, params: [] };
  }
  const placeholders = questionIds.map(() => '?').join(',');
  return {
    sql: `SELECT id FROM ${QB_TABLE}
          WHERE id IN (${placeholders}) AND ${QB_ACTIVE_WHERE}`,
    params: questionIds,
  };
}

/**
 * Paginated active question list (shared by admin list + test builder selector).
 * @param {{ whereClause: string, params: unknown[] }} filterResult
 * @param {{ limit: number, offset: number, columns?: string, orderBy?: string }} paging
 */
export function buildActiveQuestionListQuery(filterResult, { limit, offset, columns = QB_LIST_COLUMNS, orderBy = `${QB_ALIAS}.id DESC` }) {
  const { whereClause, params } = filterResult;
  return {
    countSql: `SELECT COUNT(*) AS total FROM ${QB_TABLE} ${QB_ALIAS} WHERE ${whereClause}`,
    countParams: params,
    listSql: `SELECT ${columns}
              FROM ${QB_TABLE} ${QB_ALIAS}
              WHERE ${whereClause}
              ORDER BY ${orderBy}
              LIMIT ? OFFSET ?`,
    listParams: [...params, limit, offset],
  };
}
