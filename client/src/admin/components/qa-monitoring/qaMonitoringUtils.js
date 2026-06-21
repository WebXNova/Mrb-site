/** Response speed thresholds (seconds). */
export const RESPONSE_FAST_MAX = 3600;
export const RESPONSE_MODERATE_MAX = 86400;

/**
 * @param {number|null|undefined} seconds
 * @returns {'fast'|'moderate'|'slow'|'pending'}
 */
export function getResponseTier(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return 'pending';
  const s = Number(seconds);
  if (s <= RESPONSE_FAST_MAX) return 'fast';
  if (s <= RESPONSE_MODERATE_MAX) return 'moderate';
  return 'slow';
}

export function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return '—';
  const s = Number(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}

export function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function studentInitials(name) {
  const parts = String(name || 'S').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.[0] || 'S').toUpperCase();
}

export const TIER_LABELS = {
  fast: 'Fast response',
  moderate: 'Moderate',
  slow: 'Slow response',
  pending: 'Awaiting answer',
};
