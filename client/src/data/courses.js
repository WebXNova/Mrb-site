/**
 * Tab labels for the public course catalog toolbar (`CoursesPage`). IDs match URL `?tab=` values only.
 */
export const subjects = [
  { id: 'all', name: 'All', accent: '#4f46e5' },
  { id: 'mdcat', name: 'MDCAT', accent: '#d90915' },
];

/**
 * @deprecated Catalog rows come from `GET /api/courses/public`.
 */
export const courses = [];

/** @deprecated Use catalog API */
export function getCourseById() {
  return undefined;
}

/** @deprecated Use `filterCoursesByCatalogFilter` from `course/coursePresentation.js` */
export function getCoursesBySubject() {
  return [];
}
