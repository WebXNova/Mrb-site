/**
 * Course service — simplified admission field creation and editing (DTO + model layer).
 *
 * Run: node tests/course-service.test.js
 */

import assert from 'node:assert/strict';
import {
  ADMISSION_STATUS,
  applyCourseModelHooks,
  COURSE_MODEL_FIELDS,
  validateCourseDateRange,
} from '../src/models/course.model.js';
import {
  parseCreateCourseDto,
  parseUpdateCourseDto,
  toCourseResponse,
} from '../src/dtos/course.dto.js';
import { validateCourseSchedule, deriveLegacyBatchEnrollmentFields } from '../../client/src/admin/course-wizard/courseScheduleValidation.js';
import { test, eq, ok, summary } from './_testUtils.mjs';

console.log('course-service — schema fields');

ok('COURSE_MODEL_FIELDS includes admission columns', () => {
  assert.ok(COURSE_MODEL_FIELDS.includes('start_date'));
  assert.ok(COURSE_MODEL_FIELDS.includes('end_date'));
  assert.ok(COURSE_MODEL_FIELDS.includes('admission_status'));
});

console.log('\ncourse-service — course creation with simplified fields');

test('create course OPEN with date window', () => {
  const dto = parseCreateCourseDto({
    title: 'Summer MDCAT',
    description: 'Full prep',
    level: 'intermediate',
    start_date: '2026-06-01',
    end_date: '2026-08-31',
    admission_status: 'OPEN',
  });
  assert.equal(dto.admission_status, ADMISSION_STATUS.OPEN);
  assert.equal(dto.start_date, '2026-06-01');
  assert.equal(dto.end_date, '2026-08-31');
  const api = toCourseResponse({ ...dto, id: 99 });
  assert.equal(api.is_enrollment_open, true);
});

test('create course defaults CLOSED when no admission_status', () => {
  const dto = parseCreateCourseDto({
    title: 'Draft Course',
    start_date: null,
    end_date: null,
  });
  assert.equal(dto.admission_status, ADMISSION_STATUS.CLOSED);
  const api = toCourseResponse({ ...dto, id: 1 });
  assert.equal(api.is_enrollment_open, false);
  assert.equal(api.enrollment_message, 'Admissions are currently closed.');
});

test('create course explicit CLOSED', () => {
  const dto = parseCreateCourseDto({
    title: 'Archived Intake',
    admission_status: 'CLOSED',
    start_date: '2025-01-01',
    end_date: '2025-12-31',
  });
  assert.equal(dto.admission_status, ADMISSION_STATUS.CLOSED);
});

test('create course rejects missing title', () => {
  assert.throws(() =>
    parseCreateCourseDto({
      start_date: '2026-01-01',
      admission_status: 'OPEN',
    })
  );
});

console.log('\ncourse-service — course editing (dates, status)');

test('update admission_status OPEN → CLOSED', () => {
  const dto = parseUpdateCourseDto({ admission_status: 'CLOSED' });
  assert.equal(dto.admission_status, ADMISSION_STATUS.CLOSED);
});

test('update dates only preserves hook normalization', () => {
  const dto = parseUpdateCourseDto({
    start_date: '2026-03-01',
    end_date: '2026-09-30',
  });
  assert.equal(dto.start_date, '2026-03-01');
  assert.equal(dto.end_date, '2026-09-30');
});

test('update invalid date range rejected', () => {
  assert.throws(() =>
    parseUpdateCourseDto({
      start_date: '2026-12-01',
      end_date: '2026-01-01',
    })
  );
});

test('applyCourseModelHooks merge simulates updateCourse admission write', () => {
  const existing = {
    start_date: '2026-01-01',
    end_date: '2026-06-30',
    admission_status: ADMISSION_STATUS.OPEN,
  };
  const payload = { admission_status: 'CLOSED' };
  const merged = applyCourseModelHooks(
    {
      start_date: payload.start_date !== undefined ? payload.start_date : existing.start_date,
      end_date: payload.end_date !== undefined ? payload.end_date : existing.end_date,
      admission_status:
        payload.admission_status !== undefined
          ? payload.admission_status
          : existing.admission_status,
    },
    { explicitAdmissionStatus: payload.admission_status !== undefined }
  );
  assert.equal(merged.admission_status, ADMISSION_STATUS.CLOSED);
  assert.equal(merged.start_date, '2026-01-01');
});

test('toggle OPEN after edit', () => {
  const dto = parseUpdateCourseDto({
    admission_status: 'OPEN',
    start_date: '2026-06-01',
    end_date: '2026-12-31',
  });
  assert.equal(dto.admission_status, ADMISSION_STATUS.OPEN);
  const api = toCourseResponse({ id: 2, title: 'Reopened', ...dto });
  assert.equal(api.is_enrollment_open, true);
});

console.log('\ncourse-service — admin wizard schedule validation');

test('admin schedule validation mirrors server date rules', () => {
  const client = validateCourseSchedule({
    start_date: '2026-06-01',
    end_date: '2026-05-01',
    admission_status: 'OPEN',
  });
  const server = validateCourseDateRange('2026-06-01', '2026-05-01');
  assert.equal(client.success, false);
  assert.equal(server.ok, false);
});

test('deriveLegacyBatchEnrollmentFields OPEN sets allow_enrollment', () => {
  const legacy = deriveLegacyBatchEnrollmentFields(
    {
      start_date: '2026-07-01T00:00:00.000Z',
      end_date: '2026-12-01T00:00:00.000Z',
    },
    { admission_status: 'OPEN', start_date: '2026-06-01', end_date: '2026-06-30' }
  );
  assert.equal(legacy.allow_enrollment, true);
  assert.ok(legacy.enrollment_open_at);
  assert.ok(legacy.enrollment_close_at);
});

test('deriveLegacyBatchEnrollmentFields CLOSED sets allow_enrollment false', () => {
  const legacy = deriveLegacyBatchEnrollmentFields(
    {
      start_date: '2026-07-01T00:00:00.000Z',
      end_date: '2026-12-01T00:00:00.000Z',
    },
    { admission_status: 'CLOSED' }
  );
  assert.equal(legacy.allow_enrollment, false);
});

console.log('\ncourse-service — public API response shape');

test('toCourseResponse exposes simplified enrollment contract', () => {
  const res = toCourseResponse({
    id: 42,
    title: 'Public Course',
    level: 'beginner',
    admission_status: 'OPEN',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
  });
  const keys = [
    'id',
    'title',
    'start_date',
    'end_date',
    'admission_status',
    'is_enrollment_open',
    'enrollment_message',
  ];
  for (const key of keys) {
    assert.ok(key in res, `missing ${key}`);
  }
  assert.equal(res.is_enrollment_open, true);
});

eq(
  'CLOSED course enrollment_message',
  toCourseResponse({ id: 1, title: 'X', admission_status: 'CLOSED' }).enrollment_message,
  'Admissions are currently closed.'
);

summary('course-service');
