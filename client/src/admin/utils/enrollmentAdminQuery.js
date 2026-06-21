/**
 * Build query object for GET /enrollments/admin.
 *
 * Supports filters:
 *   course (course_id), provinceId/districtId/cityId, gender, status,
 *   payment, dateFrom, dateTo, search.
 * Empty/`all` values are dropped so the URL only carries meaningful constraints.
 */
function pickPositive(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s || s === 'all') return '';
  return s;
}

export function buildEnrollmentAdminQuery(filters, debouncedSearch) {
  const q = {};

  if (filters.gender && filters.gender !== 'all') q.gender = filters.gender;
  if (filters.status && filters.status !== 'all') q.status = filters.status;
  if (filters.payment && filters.payment !== 'all') q.payment = filters.payment;

  const courseId = pickPositive(filters.course);
  if (courseId) q.course_id = courseId;

  const subjectId = pickPositive(filters.subjectId);
  if (subjectId) q.subject_id = subjectId;

  const chapterId = pickPositive(filters.chapterId);
  if (chapterId) q.chapter_id = chapterId;

  const provinceId = pickPositive(filters.provinceId);
  if (provinceId) q.province_id = provinceId;

  const districtId = pickPositive(filters.districtId);
  if (districtId) q.district_id = districtId;

  const cityId = pickPositive(filters.cityId);
  if (cityId) q.city_id = cityId;

  const from = typeof filters.dateFrom === 'string' ? filters.dateFrom.trim() : '';
  const to = typeof filters.dateTo === 'string' ? filters.dateTo.trim() : '';
  if (from) q.dateFrom = from;
  if (to) q.dateTo = to;

  const s = typeof debouncedSearch === 'string' ? debouncedSearch.trim() : '';
  if (s) q.search = s;
  return q;
}

/** Default filter shape used by AdminRegistrationsPage. */
export const DEFAULT_ENROLLMENT_FILTERS = Object.freeze({
  course: 'all',
  subjectId: 'all',
  chapterId: 'all',
  status: 'all',
  payment: 'all',
  gender: 'all',
  provinceId: 'all',
  districtId: 'all',
  cityId: 'all',
  dateFrom: '',
  dateTo: '',
});
