/**
 * Client-side mirror of server courseStaleAdvisory — admin UI only.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDateOnly(value) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  if (DATE_ONLY.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function todayDateOnlyUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function isCourseEndDatePassed(endDate, today = todayDateOnlyUtc()) {
  const end = normalizeDateOnly(endDate);
  if (!end) return false;
  return end < today;
}

export function computeAdmissionStale(course, today = todayDateOnlyUtc()) {
  const status = String(course?.admission_status || 'CLOSED').trim().toUpperCase();
  if (status !== 'OPEN') return false;
  return isCourseEndDatePassed(course?.end_date, today);
}

export function computeAccessStale(enrollment, today = todayDateOnlyUtc()) {
  if (enrollment?.access_stale === true) return true;
  if (enrollment?.access_stale === false) return false;
  const access = String(enrollment?.accessStatus || enrollment?.access_status || '').toLowerCase();
  if (access !== 'active') return false;
  const endDate = enrollment?.courseEndDate ?? enrollment?.course_end_date ?? null;
  return isCourseEndDatePassed(endDate, today);
}

export function formatAdminCourseEndDate(dateOnly) {
  if (!dateOnly) return '—';
  const normalized = normalizeDateOnly(dateOnly);
  if (!normalized) return String(dateOnly);
  const d = new Date(`${normalized}T12:00:00`);
  if (Number.isNaN(d.getTime())) return normalized;
  return d.toLocaleDateString('en-PK', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
