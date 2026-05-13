/**
 * Maps canonical course API objects (snake_case) onto list/detail UI props.
 * Public contract: id, title, description, short_description, level, thumbnail_url, timestamps.
 */

function truncateSummary(text, maxLen = 220) {
  const t = String(text || '').trim();
  if (!t) return '';
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trim()}…`;
}

/** @param {Record<string, unknown>} course from `/api/courses/public` or `/api/courses/:id` */
export function mapCatalogCourseToCardProps(course) {
  if (!course || typeof course !== 'object') return null;
  const id = typeof course.id === 'number' ? course.id : Number(course.id);
  const title = typeof course.title === 'string' ? course.title : '';
  const description = typeof course.description === 'string' ? course.description : '';
  const shortDesc =
    typeof course.short_description === 'string' && course.short_description.trim()
      ? course.short_description.trim()
      : '';
  const summarySource = shortDesc || description;
  const thumbnailUrl = typeof course.thumbnail_url === 'string' ? course.thumbnail_url : '';
  const level = typeof course.level === 'string' ? course.level : 'beginner';

  if (!Number.isFinite(id) || id <= 0) return null;

  return {
    id,
    title,
    summary: truncateSummary(summarySource, 260),
    thumbnail_url: thumbnailUrl,
    level,
  };
}

/** @param {Record<string, unknown>} course from `/api/courses/:id` */
export function mapCatalogCourseToDetailProps(course) {
  const base = mapCatalogCourseToCardProps(course);
  if (!base) return null;
  const description = typeof course.description === 'string' ? course.description : '';
  const shortDesc =
    typeof course.short_description === 'string' && course.short_description.trim()
      ? course.short_description.trim()
      : '';
  const summarySource = shortDesc || description || base.summary;
  return {
    ...base,
    summary: truncateSummary(summarySource, 2000),
    description,
  };
}

export function normalizeCatalogFilterKey(raw) {
  if (!raw || raw === 'all') return 'all';
  return String(raw).toLowerCase().trim();
}

/** Query param filter: matches title, summary, level tokens (legacy tab ids). */
export function filterCoursesByCatalogFilter(courseCardProps, rawFilter) {
  const key = normalizeCatalogFilterKey(rawFilter);
  if (key === 'all' || !Array.isArray(courseCardProps)) return courseCardProps || [];
  return courseCardProps.filter((c) => {
    const title = String(c.title ?? '').toLowerCase();
    const summary = String(c.summary ?? '').toLowerCase();
    const level = String(c.level ?? '').toLowerCase();
    return title.includes(key) || summary.includes(key) || level.includes(key) || key.includes(title.slice(0, 8));
  });
}
