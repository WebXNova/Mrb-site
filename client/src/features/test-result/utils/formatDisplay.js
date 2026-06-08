/**
 * Display-only formatters — values are always sourced from the Result API.
 */

/** @param {number|null|undefined} totalSeconds */
export function formatTimeTaken(totalSeconds) {
  const seconds = Number(totalSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds === 0) return '0s';

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${secs}s`;
}

/** @param {number|null|undefined} score @param {number|null|undefined} maxScore */
export function formatScoreDisplay(score, maxScore) {
  const s = Number(score);
  const max = maxScore == null ? null : Number(maxScore);
  if (!Number.isFinite(s)) return '—';
  if (max != null && Number.isFinite(max) && max > 0) {
    return `${s} / ${max}`;
  }
  return String(s);
}

/** @param {number|null|undefined} percentage */
export function formatPercentageDisplay(percentage) {
  const value = Number(percentage);
  if (!Number.isFinite(value)) return '—';
  return `${value}%`;
}
