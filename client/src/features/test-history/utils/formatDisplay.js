/** @param {string|null|undefined} iso */
export function formatSubmittedDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** @param {number|null|undefined} score @param {number|null|undefined} maxScore */
export function formatHistoryScore(score, maxScore) {
  if (score == null) return 'Pending';
  const max = maxScore == null ? null : Number(maxScore);
  if (max != null && Number.isFinite(max) && max > 0) return `${score} / ${max}`;
  return String(score);
}

/** @param {number|null|undefined} percentage */
export function formatHistoryPercentage(percentage) {
  if (percentage == null) return '—';
  return `${percentage}%`;
}

/** @param {string|null|undefined} status */
export function formatPassFail(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'PASS' || value === 'FAIL') return value;
  return '—';
}
