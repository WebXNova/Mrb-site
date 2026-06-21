/**
 * Parse batch schedule timestamps from ISO strings, MySQL DATETIME, or legacy YYYY-MM-DD.
 *
 * @param {unknown} value
 * @returns {number} ms since epoch, or NaN when unparseable
 */
export function parseBatchTimestamp(value) {
  if (value == null || value === '') return NaN;
  if (value instanceof Date) return value.getTime();
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return Date.parse(`${s}T00:00:00.000Z`);
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    return Date.parse(`${s.replace(' ', 'T')}Z`);
  }
  return Date.parse(s);
}

/**
 * Validate batch delivery schedule (start → end only).
 * Enrollment gating uses courses.admission_status — not batch windows.
 *
 * @param {{ start_date: string, end_date: string }} row
 * @returns {{ ok: true } | { ok: false, message: string, field?: string }}
 */
export function validateBatchScheduleWindow(row) {
  const start = parseBatchTimestamp(row.start_date);
  const end = parseBatchTimestamp(row.end_date);

  if (![start, end].every(Number.isFinite)) {
    return { ok: false, message: 'Invalid batch schedule dates', field: 'start_date' };
  }
  if (!(start < end)) {
    return { ok: false, message: 'end_date must be after start_date', field: 'end_date' };
  }
  return { ok: true };
}
