/**
 * courseStaleAdvisory — read-only admin advisory flags.
 * Run: node tests/course-stale-advisory.test.js
 */

import assert from 'node:assert/strict';
import {
  computeAccessStale,
  computeAdmissionStale,
  isCourseEndDatePassed,
  todayDateOnlyUtc,
} from '../src/utils/courseStaleAdvisory.js';
import { toCourseAdminApi, normalizeCourseRow } from '../src/dto/course.dto.js';
import { toCoursePublicApi } from '../src/dto/course.dto.js';
import { test, eq, ok, summary } from './_testUtils.mjs';

console.log('course-stale-advisory — compute helpers');

const TODAY = '2026-08-16';

eq(
  'OPEN + past end_date',
  computeAdmissionStale({ admission_status: 'OPEN', end_date: '2026-06-24' }, TODAY),
  true
);
eq(
  'OPEN + future end_date',
  computeAdmissionStale({ admission_status: 'OPEN', end_date: '2026-12-31' }, TODAY),
  false
);
eq(
  'OPEN + null end_date',
  computeAdmissionStale({ admission_status: 'OPEN', end_date: null }, TODAY),
  false
);
eq(
  'CLOSED + past end_date',
  computeAdmissionStale({ admission_status: 'CLOSED', end_date: '2026-01-01' }, TODAY),
  false
);
eq(
  'active + past course end',
  computeAccessStale({ access_status: 'active', course_end_date: '2026-06-24' }, TODAY),
  true
);
eq(
  'inactive + past course end',
  computeAccessStale({ access_status: 'inactive', course_end_date: '2026-06-24' }, TODAY),
  false
);
eq(
  'active + future course end',
  computeAccessStale({ access_status: 'active', course_end_date: '2026-12-31' }, TODAY),
  false
);

console.log('\ncourse-stale-advisory — admin DTO exposure');

test('toCourseAdminApi includes admission_stale', () => {
  const admin = toCourseAdminApi(
    normalizeCourseRow({
      id: 1,
      title: 'X',
      admission_status: 'OPEN',
      end_date: '2026-06-24',
      is_active: true,
    })
  );
  assert.equal(admin.admission_stale, true);
});

test('toCourseAdminApi admission_stale false when CLOSED', () => {
  const admin = toCourseAdminApi(
    normalizeCourseRow({
      id: 1,
      title: 'X',
      admission_status: 'CLOSED',
      end_date: '2026-06-24',
      is_active: true,
    })
  );
  assert.equal(admin.admission_stale, false);
});

test('toCoursePublicApi omits admission_stale', () => {
  const pub = toCoursePublicApi(
    normalizeCourseRow({
      id: 1,
      title: 'X',
      admission_status: 'OPEN',
      end_date: '2026-06-24',
    })
  );
  assert.equal('admission_stale' in pub, false);
});

ok('todayDateOnlyUtc returns YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(todayDateOnlyUtc()));
ok(
  'isCourseEndDatePassed same-day is false',
  isCourseEndDatePassed('2026-08-16', TODAY) === false
);
ok(
  'isCourseEndDatePassed yesterday is true',
  isCourseEndDatePassed('2026-08-15', TODAY) === true
);

summary();
