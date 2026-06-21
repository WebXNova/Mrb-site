/**
 * Set-based seen marking for teacher Q&A threads.
 * Used inside transactions — always scopes by assigned_teacher_id.
 */

export const MARK_TEACHER_THREAD_UNSEEN_SEEN_SQL = `
  UPDATE student_questions
  SET seen_at = COALESCE(seen_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = ?
    AND assigned_teacher_id = ?
    AND status = 'pending'
    AND seen_at IS NULL
`;

export const MARK_TEACHER_QUESTION_UNSEEN_SEEN_SQL = `
  UPDATE student_questions
  SET seen_at = COALESCE(seen_at, CURRENT_TIMESTAMP),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = ?
    AND assigned_teacher_id = ?
    AND status = 'pending'
    AND seen_at IS NULL
`;

/**
 * Apply in-memory seen_at for rows that were pending+unseen before a set-based update.
 * @param {Array<Record<string, unknown>>} rows
 * @param {number} affectedRows
 * @param {(row: Record<string, unknown>) => string} statusMapper
 */
export function applySeenAtToMarkedRows(rows, affectedRows, statusMapper) {
  if (!affectedRows || !rows?.length) return false;
  const now = new Date();
  for (const row of rows) {
    if (statusMapper(row) === 'sent') {
      row.seen_at = row.seen_at || now;
    }
  }
  return true;
}
