const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function toDateInputValue(value) {
  if (value == null || value === '') return '';
  const s = String(value).trim();
  if (DATE_ONLY.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * @param {{ start_date?: string|null, end_date?: string|null, admission_status?: string|null }} course
 */
export function validateCourseSchedule(course) {
  const errors = {};
  const start = toDateInputValue(course?.start_date);
  const end = toDateInputValue(course?.end_date);
  const status = String(course?.admission_status || 'CLOSED').toUpperCase();

  if (start && !DATE_ONLY.test(start)) {
    errors.start_date = 'Start date must be YYYY-MM-DD';
  }
  if (end && !DATE_ONLY.test(end)) {
    errors.end_date = 'End date must be YYYY-MM-DD';
  }
  if (start && end && end < start) {
    errors.end_date = 'End date must be on or after start date';
  }
  if (!['OPEN', 'CLOSED'].includes(status)) {
    errors.admission_status = 'Admission status must be OPEN or CLOSED';
  }

  return {
    success: Object.keys(errors).length === 0,
    errors,
    message: Object.values(errors)[0] || null,
  };
}
