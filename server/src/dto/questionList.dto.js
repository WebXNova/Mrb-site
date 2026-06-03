/** @param {unknown} v */
function toIsoTimestamp(v) {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** @param {Record<string, unknown>} row */
export function toQuestionListItemDto(row) {
  if (!row) return null;
  return {
    question_id: Number(row.id),
    question_text: String(row.question_text ?? ''),
    difficulty: row.difficulty == null ? null : String(row.difficulty),
    course_id: Number(row.course_id),
    subject_id: row.subject_id == null ? null : Number(row.subject_id),
    marks: Number(row.marks),
    created_at: toIsoTimestamp(row.created_at),
  };
}

/**
 * @param {number} page
 * @param {number} limit
 * @param {number} total
 */
export function buildQuestionListPagination(page, limit, total) {
  const totalNum = Math.max(0, Number(total) || 0);
  return {
    page,
    limit,
    total: totalNum,
    total_pages: totalNum === 0 ? 0 : Math.ceil(totalNum / limit),
  };
}

/**
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ page: number, limit: number, total: number }} paginationInput
 */
export function toQuestionListResponse(rows, paginationInput) {
  const items = rows.map((row) => toQuestionListItemDto(row));
  const pagination = buildQuestionListPagination(
    paginationInput.page,
    paginationInput.limit,
    paginationInput.total
  );
  return { items, pagination };
}
