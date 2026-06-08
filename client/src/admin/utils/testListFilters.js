import { isTestPublishedStatus } from './testBasicInfoValidation';

export const TEST_STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Draft' },
  { key: 'incomplete', label: 'Incomplete' },
];

/**
 * @param {string} status
 */
export function getTestStatusFilterKey(status) {
  if (isTestPublishedStatus(status)) return 'published';
  const normalized = String(status ?? '').trim().toUpperCase();
  if (normalized === 'INCOMPLETE') return 'incomplete';
  return 'draft';
}

/**
 * @param {Array<Record<string, unknown>>} tests
 * @param {{ search?: string, statusFilter?: string, courseTitleById?: Map<number, string> }} options
 */
export function filterTestsList(tests, options = {}) {
  const { search = '', statusFilter = 'all', courseTitleById = new Map() } = options;
  const query = String(search).trim().toLowerCase();

  return tests.filter((test) => {
    if (statusFilter !== 'all' && getTestStatusFilterKey(test.status) !== statusFilter) {
      return false;
    }

    if (!query) return true;

    const title = String(test.title ?? '').toLowerCase();
    const category = String(test.category ?? '').toLowerCase();
    const courseName = test.courseId
      ? String(courseTitleById.get(Number(test.courseId)) ?? '').toLowerCase()
      : '';

    return title.includes(query) || category.includes(query) || courseName.includes(query);
  });
}
