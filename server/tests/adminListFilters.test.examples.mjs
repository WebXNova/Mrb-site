/**
 * Admin list filter parser tests (no DB).
 * Run: node tests/adminListFilters.test.examples.mjs
 */

import { parseAdminListFilters } from '../src/utils/parseAdminListFilters.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

console.log('\n[parseAdminListFilters]');

const base = parseAdminListFilters({});
assert(base.status === 'all', 'defaults status to all');
assert(base.limit === 50, 'default limit 50');
assert(base.courseId === null, 'empty course');

const courseOnly = parseAdminListFilters({ course_id: '12' });
assert(courseOnly.courseId === 12, 'parses course_id');

const hierarchy = parseAdminListFilters({
  course_id: '3',
  subject_id: '9',
  chapter_id: '44',
  dateFrom: '2026-01-01',
  dateTo: '2026-06-01',
  search: 'biology',
  status: 'active',
  page: '2',
  limit: '25',
});
assert(hierarchy.subjectId === 9, 'parses subject_id');
assert(hierarchy.chapterId === 44, 'parses chapter_id');
assert(hierarchy.offset === 25, 'page 2 offset with limit 25');
assert(hierarchy.dateFrom === '2026-01-01', 'parses dateFrom');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
