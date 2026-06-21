/**
 * @param {{ easy?: number, medium?: number, hard?: number, unset?: number }|null|undefined} mix
 */
export function formatDifficultyMix(mix) {
  if (!mix) return '—';

  const parts = [];
  if (mix.easy) parts.push(`Easy ${mix.easy}`);
  if (mix.medium) parts.push(`Medium ${mix.medium}`);
  if (mix.hard) parts.push(`Hard ${mix.hard}`);
  if (mix.unset) parts.push(`Unset ${mix.unset}`);

  if (!parts.length) return 'Not specified';
  return parts.join(' · ');
}

/**
 * @param {number|null|undefined} value
 */
export function formatTotalMarks(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const num = Number(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * @param {number|null|undefined} minutes
 */
export function formatDurationMinutes(minutes) {
  if (minutes == null || !Number.isFinite(Number(minutes))) return '—';
  const value = Number(minutes);
  return `${value} minute${value === 1 ? '' : 's'}`;
}
