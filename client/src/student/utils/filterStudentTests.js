/**
 * Client-side filters for student test catalog.
 * @typedef {'all' | 'available' | 'completed'} StudentTestAttemptFilter
 * @typedef {'all' | 'upcoming' | 'active' | 'past'} StudentTestDateFilter
 */

/** @param {Array<Record<string, unknown>>} tests */
export function collectTestSubjectOptions(tests) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const test of tests) {
    const ids = Array.isArray(test.subject_ids) ? test.subject_ids : [];
    const labelParts = String(test.subject_label || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    ids.forEach((id, index) => {
      const key = String(id);
      if (!map.has(key)) {
        map.set(key, labelParts[index] || labelParts[0] || `Subject ${key}`);
      }
    });
  }
  return [...map.entries()]
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * @param {Array<Record<string, unknown>>} tests
 * @param {{
 *   search?: string,
 *   subjectId?: string,
 *   dateFilter?: StudentTestDateFilter,
 *   attemptFilter?: StudentTestAttemptFilter,
 * }} filters
 */
export function filterStudentTests(tests, filters = {}) {
  const q = String(filters.search || '')
    .trim()
    .toLowerCase();
  const subjectId = filters.subjectId || 'all';
  const dateFilter = filters.dateFilter || 'all';
  const attemptFilter = filters.attemptFilter || 'all';
  const now = Date.now();

  return (tests || []).filter((test) => {
    const status = String(test.status || 'available');

    if (attemptFilter === 'available' && status === 'completed') return false;
    if (attemptFilter === 'completed' && status !== 'completed') return false;

    if (subjectId !== 'all') {
      const ids = Array.isArray(test.subject_ids) ? test.subject_ids.map(String) : [];
      if (!ids.includes(String(subjectId))) return false;
    }

    if (q) {
      const haystack = [test.title, test.category, test.subject_label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    if (dateFilter !== 'all') {
      const start = test.start_date ? Date.parse(String(test.start_date)) : NaN;
      const end = test.end_date ? Date.parse(String(test.end_date)) : NaN;

      if (dateFilter === 'upcoming') {
        if (!Number.isFinite(start) || start <= now) return false;
      } else if (dateFilter === 'active') {
        const afterStart = !Number.isFinite(start) || start <= now;
        const beforeEnd = !Number.isFinite(end) || end >= now;
        if (!(afterStart && beforeEnd)) return false;
      } else if (dateFilter === 'past') {
        if (!Number.isFinite(end) || end >= now) return false;
      }
    }

    return true;
  });
}

/** @param {Array<Record<string, unknown>>} tests */
export function groupTestsByAttemptStatus(tests) {
  const available = [];
  const completed = [];
  for (const test of tests || []) {
    if (String(test.status) === 'completed') {
      completed.push(test);
    } else {
      available.push(test);
    }
  }
  return { available, completed };
}
