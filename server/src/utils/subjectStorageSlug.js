/** Legacy Q&A slugs stored in student_questions.subject (VARCHAR 32). */
const CANONICAL_SLUGS = new Set(['physics', 'chemistry', 'biology', 'english', 'logical_reasoning']);

const TITLE_TO_SLUG = Object.freeze({
  physics: 'physics',
  chemistry: 'chemistry',
  biology: 'biology',
  english: 'english',
  'logical reasoning': 'logical_reasoning',
});

function normalizeTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function fuzzyCanonicalSlug(normalizedTitle) {
  if (!normalizedTitle) return null;
  if (TITLE_TO_SLUG[normalizedTitle]) return TITLE_TO_SLUG[normalizedTitle];
  if (normalizedTitle.includes('logical') && normalizedTitle.includes('reason')) {
    return 'logical_reasoning';
  }
  if (/\bphysics\b/.test(normalizedTitle) || normalizedTitle.startsWith('physics')) {
    return 'physics';
  }
  if (/\bchemistry\b/.test(normalizedTitle) || normalizedTitle.startsWith('chem')) {
    return 'chemistry';
  }
  if (/\bbiology\b/.test(normalizedTitle) || normalizedTitle.startsWith('bio')) {
    return 'biology';
  }
  if (/\benglish\b/.test(normalizedTitle)) return 'english';
  return null;
}

function slugifyTitle(title) {
  const slug = String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return slug.length >= 2 ? slug : '';
}

/**
 * Derive storage slug for student_questions.subject from relational subject row.
 * @param {string} title
 * @param {number} subjectId
 */
export function deriveSubjectStorageSlug(title, subjectId) {
  const normalized = normalizeTitle(title);
  const canonical = fuzzyCanonicalSlug(normalized);
  if (canonical && CANONICAL_SLUGS.has(canonical)) return canonical;

  const fromTitle = slugifyTitle(title);
  if (fromTitle) return fromTitle;

  const sid = Number(subjectId);
  return `sub_${sid}`.slice(0, 32);
}

export { CANONICAL_SLUGS as LEGACY_SUBJECT_SLUGS };
