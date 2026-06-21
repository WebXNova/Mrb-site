/**
 * Build query string params for admin list APIs (server-side filtering).
 *
 * @param {Record<string, unknown>} filters
 */
export function buildAdminListQuery(filters = {}) {
  const sp = new URLSearchParams();

  const setIf = (key, value) => {
    if (value == null) return;
    const s = String(value).trim();
    if (!s || s === 'all') return;
    sp.set(key, s);
  };

  setIf('course_id', filters.courseId ?? filters.course_id);
  setIf('subject_id', filters.subjectId ?? filters.subject_id);
  setIf('chapter_id', filters.chapterId ?? filters.chapter_id);
  setIf('lecture_id', filters.lectureId ?? filters.lecture_id);
  setIf('test_id', filters.testId ?? filters.test_id);
  setIf('dateFrom', filters.dateFrom);
  setIf('dateTo', filters.dateTo);
  setIf('search', filters.search);
  setIf('status', filters.status);

  if (filters.limit != null) sp.set('limit', String(filters.limit));
  if (filters.offset != null) sp.set('offset', String(filters.offset));
  if (filters.page != null) sp.set('page', String(filters.page));

  return sp;
}

/** @param {Record<string, unknown>} filters */
export function adminListQueryString(filters = {}) {
  const qs = buildAdminListQuery(filters).toString();
  return qs ? `?${qs}` : '';
}

/**
 * Read hierarchy + date filters from URL search params.
 *
 * @param {URLSearchParams} searchParams
 */
export function readAdminFiltersFromUrl(searchParams) {
  const get = (key) => searchParams.get(key) ?? '';

  return {
    courseId: get('course_id') || get('courseId') || '',
    subjectId: get('subject_id') || get('subjectId') || '',
    chapterId: get('chapter_id') || get('chapterId') || '',
    dateFrom: get('dateFrom') || '',
    dateTo: get('dateTo') || '',
    search: get('search') || '',
    status: get('status') || 'all',
    page: get('page') || '1',
  };
}

/**
 * @param {URLSearchParams} searchParams
 * @param {Record<string, unknown>} patch
 */
export function writeAdminFiltersToUrl(searchParams, patch) {
  const next = new URLSearchParams(searchParams);

  const sync = (key, value) => {
    if (value == null || String(value).trim() === '' || value === 'all') {
      next.delete(key);
      return;
    }
    next.set(key, String(value).trim());
  };

  if ('courseId' in patch) sync('course_id', patch.courseId);
  if ('subjectId' in patch) sync('subject_id', patch.subjectId);
  if ('chapterId' in patch) sync('chapter_id', patch.chapterId);
  if ('dateFrom' in patch) sync('dateFrom', patch.dateFrom);
  if ('dateTo' in patch) sync('dateTo', patch.dateTo);
  if ('search' in patch) sync('search', patch.search);
  if ('status' in patch) sync('status', patch.status);
  if ('page' in patch) sync('page', patch.page);

  if ('courseId' in patch && !patch.courseId) {
    next.delete('subject_id');
    next.delete('chapter_id');
  }
  if ('subjectId' in patch && !patch.subjectId) {
    next.delete('chapter_id');
  }

  return next;
}
