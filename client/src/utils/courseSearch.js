import { buildPricingDisplay } from '../course/coursePresentation';
import { admissionBadgeLabel } from '../course/courseAdmissionPresentation';

const SUBJECT_KEYWORDS = [
  { id: 'physics', label: 'Physics' },
  { id: 'chemistry', label: 'Chemistry' },
  { id: 'biology', label: 'Biology' },
  { id: 'english', label: 'English' },
  { id: 'mdcat', label: 'MDCAT' },
  { id: 'ecat', label: 'ECAT' },
];

/**
 * Infer primary subject label from course title/summary text.
 * @param {{ title?: string, summary?: string, description?: string }} course
 */
export function inferCourseSubject(course) {
  const text = `${course?.title || ''} ${course?.summary || ''} ${course?.description || ''}`.toLowerCase();
  for (const subject of SUBJECT_KEYWORDS) {
    if (text.includes(subject.id)) return subject.label;
  }
  return null;
}

/**
 * All subjects mentioned in course text (for search + display).
 * @param {{ title?: string, summary?: string, description?: string }} course
 */
export function inferCourseSubjects(course) {
  const text = `${course?.title || ''} ${course?.summary || ''} ${course?.description || ''}`.toLowerCase();
  return SUBJECT_KEYWORDS.filter((subject) => text.includes(subject.id)).map((subject) => subject.label);
}

/**
 * Build searchable/display tags for a catalog course card.
 * @param {Record<string, unknown>} course
 */
export function buildCourseSearchTags(course) {
  const tags = new Set();
  const text = `${course?.title || ''} ${course?.summary || ''}`.toLowerCase();

  const pricingDisplay = buildPricingDisplay(course?.pricing);
  if (pricingDisplay?.isFree) {
    tags.add('FREE');
    tags.add('free');
  }

  const admission = admissionBadgeLabel(course?.admission_status);
  if (admission) {
    tags.add(admission);
    tags.add(String(admission).toLowerCase());
  }

  const level = String(course?.level || '').trim();
  if (level) {
    tags.add(level);
    tags.add(level.toLowerCase());
  }

  if (text.includes('mdcat')) {
    tags.add('MDCAT');
    tags.add('mdcat');
  }
  if (text.includes('ecat')) {
    tags.add('ECAT');
    tags.add('ecat');
  }
  if (text.includes('test')) {
    tags.add('test');
    tags.add('tests');
  }

  return [...tags];
}

/**
 * Collect all searchable text tokens for a course.
 * @param {Record<string, unknown>} course
 */
function getCourseSearchFields(course) {
  const subjects = inferCourseSubjects(course);
  const tags = buildCourseSearchTags(course);

  return [
    course?.title,
    course?.summary,
    course?.description,
    course?.level,
    course?.id != null ? String(course.id) : null,
    ...subjects,
    ...tags,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
}

/**
 * Unified course search — used by desktop, mobile overlay, and /search page.
 * @param {string} query
 * @param {Array<Record<string, unknown>>} courses
 */
export function searchCourses(query, courses) {
  const list = Array.isArray(courses) ? courses : [];
  const searchTerm = String(query || '').trim().toLowerCase();
  if (!searchTerm) return list;

  return list.filter((course) => {
    const fields = getCourseSearchFields(course);
    return fields.some((field) => field.includes(searchTerm));
  });
}

/** @deprecated Alias for searchCourses */
export const filterCoursesBySearchQuery = searchCourses;

/**
 * Navigate to the dedicated search results page.
 * @param {import('react-router-dom').NavigateFunction} navigate
 * @param {string} query
 */
export function navigateToSearch(navigate, query) {
  const trimmed = String(query || '').trim();
  if (!trimmed) return;
  navigate(`/search?q=${encodeURIComponent(trimmed)}`);
}

/**
 * Compact tag line for search result rows.
 * @param {Record<string, unknown>} course
 */
export function formatCourseSearchMeta(course) {
  const subject = inferCourseSubject(course);
  const tags = buildCourseSearchTags(course).filter((tag) => tag === tag.toUpperCase() && tag.length > 1);
  const unique = [...new Set([subject, ...tags].filter(Boolean))];
  return unique.slice(0, 4).join(' · ');
}
