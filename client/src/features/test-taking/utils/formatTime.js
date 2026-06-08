/** @param {number} totalSeconds */
export function formatExamTime(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Remaining seconds from server-provided ISO expiry — never from a client-only countdown seed.
 * @param {string|null|undefined} expiresAtIso
 */
export function computeRemainingSeconds(expiresAtIso) {
  if (!expiresAtIso) return 0;
  const expiresMs = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(expiresMs)) return 0;
  return Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));
}
