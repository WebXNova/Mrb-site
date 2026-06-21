/**
 * Display formatters for test instructions — presentation only; values come from API.
 */

export function formatDuration(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value <= 0) return 'Not set';
  if (value === 1) return '1 minute';
  if (value < 60) return `${value} minutes`;
  const hours = Math.floor(value / 60);
  const remainder = value % 60;
  if (remainder === 0) return hours === 1 ? '1 hour' : `${hours} hours`;
  return `${hours}h ${remainder}m`;
}

export function formatPassingMarks(passingMarks, totalMarks) {
  const passing = Number(passingMarks);
  const total = Number(totalMarks);
  if (!Number.isFinite(passing)) return 'Not set';
  if (!Number.isFinite(total) || total <= 0) return `${passing} marks`;
  return `${passing} / ${total} marks`;
}

/** @deprecated Use formatPassingMarks — percentage is derived server-side only. */
export function formatPassingPercentage(value) {
  const pct = Number(value);
  if (!Number.isFinite(pct)) return 'Not set';
  return `${pct}%`;
}

export function formatNegativeMarking(enabled, value) {
  if (!enabled) return 'No negative marking';
  const mark = Number(value);
  if (!Number.isFinite(mark) || mark <= 0) return 'Negative marking applies';
  return `${mark} mark${mark === 1 ? '' : 's'} deducted per wrong answer`;
}

export function formatAttemptLimit(maxAttempts) {
  const max = Number(maxAttempts);
  if (!Number.isFinite(max) || max <= 0) return 'Unlimited attempts';
  if (max === 1) return '1 attempt allowed';
  return `${max} attempts allowed`;
}

export function formatAttemptsUsed(used, maxAttempts) {
  const count = Number(used);
  const max = Number(maxAttempts);
  if (!Number.isFinite(max) || max <= 0) {
    return Number.isFinite(count) ? `${count} attempt${count === 1 ? '' : 's'} used` : null;
  }
  return `${count} of ${max} used`;
}
