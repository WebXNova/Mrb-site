/**
 * Subject taxonomy used by the public Courses page filter tabs.
 * This is structural configuration (UI accent + label), not user-facing
 * sample content, so it is preserved.
 */
export const subjects = [
  { id: 'all', name: 'All Subjects', accent: '#4f46e5' },
  { id: 'mdcat', name: 'MDCAT', accent: '#d90915' },
];

/**
 * Course catalog.
 *
 * The frontend previously shipped a hardcoded MDCAT course (with
 * placeholder price, rating, enrolled count, and cover image). That
 * sample card has been removed.
 *
 * Replace this empty array with data fetched from the backend
 * (`/api/courses` or admin courses endpoint). The pages that consume
 * `courses` already render a safe empty state.
 */
export const courses = [];

export function getCourseById(id) {
  return courses.find((c) => c.id === id);
}

export function getCoursesBySubject(subjectId) {
  if (!subjectId || subjectId === 'all') return courses;
  return courses.filter((c) => c.subjectId === subjectId);
}
