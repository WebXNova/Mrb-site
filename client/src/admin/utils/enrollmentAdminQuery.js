/**
 * Build query object for GET /enrollments/admin — mirrors Student Q&A `?subject=` pattern.
 */
export function buildEnrollmentAdminQuery(filters, debouncedSearch) {
  const q = {};
  if (filters.batch !== 'all') q.batch = filters.batch;
  if (filters.province !== 'all') q.province = filters.province;
  if (filters.gender !== 'all') q.gender = filters.gender;
  const from = filters.dateFrom?.trim();
  const to = filters.dateTo?.trim();
  if (from) q.dateFrom = from;
  if (to) q.dateTo = to;
  const s = typeof debouncedSearch === 'string' ? debouncedSearch.trim() : '';
  if (s) q.search = s;
  return q;
}
