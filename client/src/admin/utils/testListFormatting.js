/**
 * Display helpers for the admin tests list table.
 */

/**
 * @param {string|Date|null|undefined} value
 */
export function formatTestListDate(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * @param {{ updatedAt?: string|null, createdAt?: string|null }} test
 */
export function formatTestEditedCreatedLine(test) {
  const edited = formatTestListDate(test.updatedAt);
  const created = formatTestListDate(test.createdAt);
  return `Date Edited: ${edited} / Date Created: ${created}`;
}

/**
 * @param {number|null|undefined} value
 */
export function formatScorePercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value))}%`;
}

/**
 * @param {{ avgScore?: number|null, minScore?: number|null, maxScore?: number|null }} test
 */
export function formatAvgScoreCell(test) {
  const avg = formatScorePercent(test.avgScore);
  const hasRange =
    test.minScore != null &&
    test.maxScore != null &&
    Number.isFinite(Number(test.minScore)) &&
    Number.isFinite(Number(test.maxScore)) &&
    Number(test.scoresCount ?? 0) > 0;

  return {
    avg,
    range: hasRange
      ? `Low: ${formatScorePercent(test.minScore)} · High: ${formatScorePercent(test.maxScore)}`
      : null,
  };
}

export const TEST_LIST_SORT_KEYS = Object.freeze([
  'title',
  'status',
  'questions',
  'scores',
  'avg_score',
  'updated_at',
]);

/**
 * @param {string} column
 * @param {{ sortBy: string, sortDirection: 'asc'|'desc' }} state
 */
export function nextSortState(column, state) {
  if (state.sortBy !== column) {
    return { sortBy: column, sortDirection: column === 'title' ? 'asc' : 'desc' };
  }
  return {
    sortBy: column,
    sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc',
  };
}
