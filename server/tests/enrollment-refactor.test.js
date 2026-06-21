/**
 * Enrollment refactor — model, DTO, API contract, and client normalizer tests.
 *
 * Run: node tests/enrollment-refactor.test.js
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  ADMISSION_STATUS,
  applyCourseModelHooks,
  courseEnrollmentMessage,
  deriveCourseAdmissionFromBatch,
  isCourseEnrollmentOpen,
  normalizeAdmissionStatus,
  normalizeDateOnly,
  resolveAdmissionStatusFromDates,
  validateCourseDateRange,
} from '../src/models/course.model.js';
import {
  parseCreateCourseDto,
  parseUpdateCourseDto,
  toCourseListResponse,
  toCourseResponse,
} from '../src/dtos/course.dto.js';
import {
  parseCreateEnrollmentDto,
  toCourseEnrollmentSummary,
  toEnrollmentStateResponse,
} from '../src/dtos/enrollment.dto.js';
import { ENROLLMENT_BUTTON_STATE } from '../src/constants/enrollmentButtonState.js';
import { resolveEnrollmentButtonState } from '../src/services/enrollmentState.service.js';
import { EnrollmentClosedError } from '../src/errors/enrollment/EnrollmentStateErrors.js';
import { ADMISSIONS_CLOSED } from '../src/errors/codes/ErrorCodes.js';
import { normalizeEnrollmentState, normalizeEnrollmentRow } from '../../client/src/api/enrollmentNormalizers.js';
import {
  ERROR_CODES,
  extractErrorCode,
  getUserFacingErrorMessage,
  isEnrollmentClosedError,
  parseApiError,
} from '../../client/src/utils/errorHandler.js';
import {
  buildCourseEnrollmentCtaFromState,
  buildGuestEnrollmentCtaFromAdmission,
  ENROLLMENT_BUTTON_STATE as CLIENT_BUTTON_STATE,
} from '../../client/src/course/courseEnrollmentCta.js';
import {
  extractCourseAdmission,
  isAdmissionOpen,
} from '../../client/src/course/courseAdmissionPresentation.js';
import { validateCourseSchedule } from '../../client/src/admin/course-wizard/courseScheduleValidation.js';
import { test, eq, ok, summary } from './_testUtils.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('enrollment-refactor — course model');

eq('normalizeAdmissionStatus OPEN', normalizeAdmissionStatus('open'), ADMISSION_STATUS.OPEN);
eq('normalizeAdmissionStatus CLOSED default', normalizeAdmissionStatus(null), ADMISSION_STATUS.CLOSED);
eq('normalizeDateOnly ISO date', normalizeDateOnly('2026-06-01'), '2026-06-01');
eq('normalizeDateOnly empty → null', normalizeDateOnly(''), null);

ok('validateCourseDateRange valid', validateCourseDateRange('2026-01-01', '2026-12-31').ok);
ok(
  'validateCourseDateRange invalid',
  validateCourseDateRange('2026-12-31', '2026-01-01').ok === false
);

test('applyCourseModelHooks explicit OPEN', () => {
  const out = applyCourseModelHooks(
    { start_date: '2026-01-01', end_date: '2026-12-31', admission_status: 'OPEN' },
    { explicitAdmissionStatus: true }
  );
  assert.equal(out.admission_status, ADMISSION_STATUS.OPEN);
});

test('applyCourseModelHooks defaults CLOSED without dates', () => {
  const out = applyCourseModelHooks({}, {});
  assert.equal(out.admission_status, ADMISSION_STATUS.CLOSED);
});

eq('isCourseEnrollmentOpen', isCourseEnrollmentOpen({ admission_status: 'OPEN' }), true);
eq(
  'courseEnrollmentMessage CLOSED',
  courseEnrollmentMessage({ admission_status: 'CLOSED' }),
  'Admissions are currently closed.'
);

test('resolveAdmissionStatusFromDates within window', () => {
  const today = new Date().toISOString().slice(0, 10);
  const status = resolveAdmissionStatusFromDates({
    start_date: today,
    end_date: today,
    admission_status: null,
  });
  assert.equal(status, ADMISSION_STATUS.OPEN);
});

console.log('\nenrollment-refactor — course DTOs');

test('parseCreateCourseDto simplified fields', () => {
  const dto = parseCreateCourseDto({
    title: 'MDCAT Prep',
    start_date: '2026-06-01',
    end_date: '2026-12-31',
    admission_status: 'OPEN',
  });
  assert.equal(dto.title, 'MDCAT Prep');
  assert.equal(dto.start_date, '2026-06-01');
  assert.equal(dto.end_date, '2026-12-31');
  assert.equal(dto.admission_status, ADMISSION_STATUS.OPEN);
});

test('parseCreateCourseDto rejects invalid date range', () => {
  assert.throws(() =>
    parseCreateCourseDto({
      title: 'Bad Dates',
      start_date: '2026-12-31',
      end_date: '2026-01-01',
    })
  );
});

test('parseUpdateCourseDto partial admission_status', () => {
  const dto = parseUpdateCourseDto({ admission_status: 'CLOSED' });
  assert.equal(dto.admission_status, ADMISSION_STATUS.CLOSED);
});

test('toCourseResponse API contract', () => {
  const res = toCourseResponse({
    id: 1,
    title: 'Test Course',
    admission_status: 'OPEN',
    start_date: '2026-06-01',
    end_date: '2026-12-31',
  });
  assert.equal(res.admission_status, ADMISSION_STATUS.OPEN);
  assert.equal(res.is_enrollment_open, true);
  assert.equal(res.enrollment_message, 'Enrollment is open');
  assert.ok('start_date' in res);
  assert.ok('end_date' in res);
  assert.ok(!('enrollment_open_at' in res) || res.enrollment_open_at === null);
});

test('toCourseListResponse maps array', () => {
  const list = toCourseListResponse([
    { id: 1, title: 'A', admission_status: 'OPEN' },
    { id: 2, title: 'B', admission_status: 'CLOSED' },
  ]);
  assert.equal(list.length, 2);
  assert.equal(list[0].is_enrollment_open, true);
  assert.equal(list[1].is_enrollment_open, false);
});

console.log('\nenrollment-refactor — enrollment DTOs');

test('parseCreateEnrollmentDto valid payload', () => {
  const dto = parseCreateEnrollmentDto({
    course_id: 5,
    applicantFullName: 'Ali Khan',
    fatherName: 'Ahmed Khan',
    gender: 'male',
    whatsappNumber: '+923001234567',
    email: 'ali@example.com',
    province_id: 1,
    district_id: 2,
    city_id: 3,
    hsscStatus: 'Inter Class',
    mdcatAttemptType: 'Fresher',
  });
  assert.equal(dto.course_id, 5);
  assert.equal(dto.confirmSwitch, false);
});

test('toEnrollmentStateResponse merges admission context', () => {
  const base = resolveEnrollmentButtonState({
    targetCourseId: 10,
    targetEnrollmentType: 'free',
    activeEntitlement: null,
    activeCourseName: null,
    activeEnrollmentType: null,
    courseEnrollment: null,
    admissionsOpen: false,
  });
  const api = toEnrollmentStateResponse(base, {
    courseId: 10,
    courseName: 'MDCAT',
    admission_status: 'CLOSED',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
  });
  assert.equal(api.buttonState, ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED);
  assert.equal(api.admissionsClosed, true);
  assert.equal(api.isEnrolled, false);
  assert.equal(api.admissionStatus, ADMISSION_STATUS.CLOSED);
  assert.equal(api.message, 'Admissions are currently closed.');
});

test('toEnrollmentStateResponse continue_learning when enrolled + CLOSED', () => {
  const base = resolveEnrollmentButtonState({
    targetCourseId: 10,
    targetEnrollmentType: 'free',
    activeEntitlement: { courseId: 10, enrollmentSource: 'free' },
    activeCourseName: 'MDCAT',
    activeEnrollmentType: 'free',
    courseEnrollment: {
      id: 1,
      courseId: 10,
      status: 'approved',
      accessStatus: 'active',
      enrollmentSource: 'free',
      orderId: null,
      orderStatus: null,
    },
    admissionsOpen: false,
  });
  const api = toEnrollmentStateResponse(base, {
    courseId: 10,
    admission_status: 'CLOSED',
  });
  assert.equal(api.buttonState, ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING);
  assert.equal(api.isEnrolled, true);
  assert.equal(api.admissionsClosed, true);
});

test('toCourseEnrollmentSummary compact shape', () => {
  const s = toCourseEnrollmentSummary({
    admission_status: 'OPEN',
    start_date: '2026-06-01',
    end_date: '2026-12-31',
  });
  assert.equal(s.admission_status, ADMISSION_STATUS.OPEN);
  assert.equal(s.is_enrollment_open, true);
});

console.log('\nenrollment-refactor — button state (OPEN/CLOSED)');

eq(
  'prospect + CLOSED → admissions_closed',
  resolveEnrollmentButtonState({
    targetCourseId: 1,
    targetEnrollmentType: 'free',
    activeEntitlement: null,
    activeCourseName: null,
    activeEnrollmentType: null,
    courseEnrollment: null,
    admissionsOpen: false,
  }).buttonState,
  ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED
);

eq(
  'prospect + OPEN → enroll_now',
  resolveEnrollmentButtonState({
    targetCourseId: 1,
    targetEnrollmentType: 'free',
    activeEntitlement: null,
    activeCourseName: null,
    activeEnrollmentType: null,
    courseEnrollment: null,
    admissionsOpen: true,
  }).buttonState,
  ENROLLMENT_BUTTON_STATE.ENROLL_NOW
);

eq(
  'enrolled + CLOSED → continue_learning',
  resolveEnrollmentButtonState({
    targetCourseId: 10,
    targetEnrollmentType: 'free',
    activeEntitlement: { courseId: 10, enrollmentSource: 'free' },
    activeCourseName: 'Course',
    activeEnrollmentType: 'free',
    courseEnrollment: {
      id: 1,
      courseId: 10,
      status: 'approved',
      accessStatus: 'active',
      enrollmentSource: 'free',
      orderId: null,
      orderStatus: null,
    },
    admissionsOpen: false,
  }).buttonState,
  ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING
);

console.log('\nenrollment-refactor — EnrollmentClosedError');

test('EnrollmentClosedError 403 ADMISSIONS_CLOSED', () => {
  const err = new EnrollmentClosedError({ courseId: 5 });
  assert.equal(err.httpStatus, 403);
  assert.equal(err.errorCode, ADMISSIONS_CLOSED);
  assert.match(err.message, /closed/i);
});

console.log('\nenrollment-refactor — client normalizers');

test('normalizeEnrollmentState snake_case admission fields', () => {
  const n = normalizeEnrollmentState({
    buttonState: 'admissions_closed',
    admission_status: 'CLOSED',
    is_enrollment_open: false,
    enrollment_message: 'Admissions are currently closed.',
  });
  assert.equal(n.admissionStatus, ADMISSION_STATUS.CLOSED);
  assert.equal(n.admissionsClosed, true);
  assert.equal(n.canContinueLearning, false);
});

test('normalizeEnrollmentRow includes admission', () => {
  const row = normalizeEnrollmentRow({
    id: 1,
    courseId: 5,
    admission_status: 'OPEN',
    is_enrollment_open: true,
  });
  assert.equal(row.admission_status, ADMISSION_STATUS.OPEN);
  assert.equal(row.is_enrollment_open, true);
});

test('errorHandler ADMISSIONS_CLOSED 403', () => {
  const err = { status: 403, errorCode: ERROR_CODES.ADMISSIONS_CLOSED, message: 'Admissions are currently closed.' };
  assert.equal(isEnrollmentClosedError(err), true);
  const parsed = parseApiError(err);
  assert.equal(parsed.isEnrollmentClosed, true);
  assert.equal(parsed.isForbidden, true);
  assert.match(getUserFacingErrorMessage(err), /closed/i);
});

test('buildCourseEnrollmentCta continue_learning when CLOSED', () => {
  const cta = buildCourseEnrollmentCtaFromState(
    { buttonState: CLIENT_BUTTON_STATE.CONTINUE_LEARNING },
    { courseId: 1, labelContext: 'card' }
  );
  assert.equal(cta.label, 'Continue Learning');
  assert.equal(cta.disabled, false);
  assert.equal(cta.to, '/dashboard/lectures');
});

test('buildGuestEnrollmentCtaFromAdmission CLOSED', () => {
  const cta = buildGuestEnrollmentCtaFromAdmission(
    { admission_status: 'CLOSED', is_enrollment_open: false },
    { courseId: 1 }
  );
  assert.equal(cta.label, 'Enrollment Closed');
  assert.equal(cta.disabled, true);
});

test('extractCourseAdmission defaults CLOSED', () => {
  const a = extractCourseAdmission(null);
  assert.equal(a.admission_status, ADMISSION_STATUS.CLOSED);
  assert.equal(isAdmissionOpen(a), false);
});

console.log('\nenrollment-refactor — admin schedule validation');

test('validateCourseSchedule rejects end before start', () => {
  const r = validateCourseSchedule({
    start_date: '2026-12-31',
    end_date: '2026-01-01',
    admission_status: 'OPEN',
  });
  assert.equal(r.success, false);
  assert.ok(r.errors.end_date);
});

test('validateCourseSchedule accepts valid OPEN schedule', () => {
  const r = validateCourseSchedule({
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    admission_status: 'OPEN',
  });
  assert.equal(r.success, true);
});

console.log('\nenrollment-refactor — migration schema integrity');

test('migration SQL defines admission columns and constraint', () => {
  const sql = readFileSync(
    join(__dirname, '../src/db/migrations/20250620_refactor_course_enrollment_schema.sql'),
    'utf8'
  );
  assert.match(sql, /admission_status ENUM\('OPEN', 'CLOSED'\)/);
  assert.match(sql, /chk_course_dates/);
  assert.match(sql, /idx_courses_admission_status/);
  assert.match(sql, /vw_course_enrollment_status/);
});

test('deriveCourseAdmissionFromBatch legacy compat', () => {
  const derived = deriveCourseAdmissionFromBatch({
    status: 'enrollment_open',
    allow_enrollment: true,
    start_date: '2026-06-01',
    end_date: '2026-12-31',
  });
  assert.ok([ADMISSION_STATUS.OPEN, ADMISSION_STATUS.CLOSED].includes(derived.admission_status));
});

summary('enrollment-refactor');
