import { QA_SUBJECT_OPTIONS } from '../../constants/qaSubjects';

const TITLE_TO_SLUG = Object.fromEntries(
  QA_SUBJECT_OPTIONS.map((option) => [normalizeTitle(option.label), option.value])
);

function normalizeTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Map a course subject title to a legacy Q&A display slug (optional).
 * @param {string} title
 * @returns {string|null}
 */
export function mapCourseSubjectTitleToQaSlug(title) {
  const key = normalizeTitle(title);
  if (TITLE_TO_SLUG[key]) return TITLE_TO_SLUG[key];
  if (key.includes('logical') && key.includes('reason')) return 'logical_reasoning';
  if (/\bphysics\b/.test(key) || key.startsWith('physics')) return 'physics';
  if (/\bchemistry\b/.test(key) || key.startsWith('chem')) return 'chemistry';
  if (/\bbiology\b/.test(key) || key.startsWith('bio')) return 'biology';
  if (/\benglish\b/.test(key)) return 'english';
  return null;
}
