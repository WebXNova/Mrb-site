/**
 * Enrollment integration — end-to-end flows (in-memory simulator + API contracts).
 *
 * Run: node tests/enrollment-integration.test.js
 */

import assert from 'node:assert/strict';
import { ENROLLMENT_BUTTON_STATE } from '../src/constants/enrollmentButtonState.js';
import { ADMISSION_STATUS } from '../src/models/course.model.js';
import { resolveEnrollmentButtonState } from '../src/services/enrollmentState.service.js';
import { EnrollmentClosedError } from '../src/errors/enrollment/EnrollmentStateErrors.js';
import { DuplicateActiveEnrollmentError } from '../src/errors/enrollment/EnrollmentStateErrors.js';
import { toEnrollmentStateResponse } from '../src/dtos/enrollment.dto.js';
import { toCourseResponse } from '../src/dtos/course.dto.js';
import { normalizeEnrollmentState } from '../../client/src/api/enrollmentNormalizers.js';
import {
  buildCourseEnrollmentCtaFromState,
  ENROLLMENT_BUTTON_STATE as CLIENT_CTA,
} from '../../client/src/course/courseEnrollmentCta.js';
import { parseApiError } from '../../client/src/utils/errorHandler.js';
import { test, eq, ok, summary } from './_testUtils.mjs';

/**
 * In-memory enrollment simulator — mirrors server admission gates without MySQL.
 */
class EnrollmentFlowSimulator {
  constructor() {
    /** @type {Map<number, { id: number, title: string, admission_status: string, start_date?: string|null, end_date?: string|null }>} */
    this.courses = new Map();
    /** @type {Map<string, object>} key userId:courseId */
    this.enrollments = new Map();
    this._nextCourseId = 1;
    this._nextEnrollmentId = 1;
  }

  createCourse({ title, admission_status = ADMISSION_STATUS.CLOSED, start_date = null, end_date = null }) {
    const id = this._nextCourseId++;
    const course = { id, title, admission_status, start_date, end_date };
    this.courses.set(id, course);
    return course;
  }

  _enrollmentKey(userId, courseId) {
    return `${userId}:${courseId}`;
  }

  getActiveEntitlement(userId) {
    for (const row of this.enrollments.values()) {
      if (row.user_id === userId && row.access_status === 'active') {
        return { courseId: row.course_id, enrollmentSource: row.enrollment_source };
      }
    }
    return null;
  }

  getCourseEnrollment(userId, courseId) {
    return this.enrollments.get(this._enrollmentKey(userId, courseId)) ?? null;
  }

  resolveState(userId, courseId) {
    const course = this.courses.get(courseId);
    if (!course) throw new Error('course_not_found');
    const admissionsOpen = course.admission_status === ADMISSION_STATUS.OPEN;
    const activeEntitlement = this.getActiveEntitlement(userId);
    const raw = this.getCourseEnrollment(userId, courseId);

    let activeCourseName = null;
    let activeEnrollmentType = null;
    if (activeEntitlement) {
      const c = this.courses.get(activeEntitlement.courseId);
      activeCourseName = c?.title ?? null;
      activeEnrollmentType =
        activeEntitlement.enrollmentSource === 'paid' ? 'premium' : 'free';
    }

    const courseEnrollment = raw
      ? {
          id: raw.id,
          courseId: raw.course_id,
          status: raw.status,
          accessStatus: raw.access_status,
          enrollmentSource: raw.enrollment_source,
          orderId: raw.order_id ?? null,
          orderStatus: raw.order_status ?? null,
        }
      : null;

    return resolveEnrollmentButtonState({
      targetCourseId: courseId,
      targetEnrollmentType: 'free',
      activeEntitlement,
      activeCourseName,
      activeEnrollmentType,
      courseEnrollment,
      admissionsOpen,
    });
  }

  toApiState(userId, courseId) {
    const course = this.courses.get(courseId);
    const state = this.resolveState(userId, courseId);
    return toEnrollmentStateResponse(state, {
      courseId,
      courseName: course?.title ?? null,
      admission_status: course?.admission_status ?? null,
      start_date: course?.start_date ?? null,
      end_date: course?.end_date ?? null,
    });
  }

  assertCanEnroll(userId, courseId) {
    const state = this.resolveState(userId, courseId);
    if (state.buttonState === ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED) {
      throw new EnrollmentClosedError({ userId, courseId });
    }
    if (state.buttonState === ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING) {
      throw new DuplicateActiveEnrollmentError({ userId, courseId });
    }
    return state;
  }

  enroll(userId, courseId) {
    this.assertCanEnroll(userId, courseId);
    const key = this._enrollmentKey(userId, courseId);
    const existing = this.enrollments.get(key);
    if (existing?.access_status === 'active') {
      return { enrollment: existing, idempotent: true };
    }
    for (const row of this.enrollments.values()) {
      if (row.user_id === userId && row.access_status === 'active') {
        row.access_status = 'inactive';
      }
    }
    const enrollment = {
      id: this._nextEnrollmentId++,
      user_id: userId,
      course_id: courseId,
      status: 'approved',
      access_status: 'active',
      enrollment_source: 'free',
      order_id: null,
      order_status: null,
    };
    this.enrollments.set(key, enrollment);
    return { enrollment, idempotent: false };
  }

  closeAdmissions(courseId) {
    const course = this.courses.get(courseId);
    if (course) course.admission_status = ADMISSION_STATUS.CLOSED;
  }
}

console.log('enrollment-integration — OPEN admission enrollment');

test('prospect can enroll when OPEN', () => {
  const sim = new EnrollmentFlowSimulator();
  const course = sim.createCourse({ title: 'Open Course', admission_status: ADMISSION_STATUS.OPEN });
  const state = sim.resolveState(1, course.id);
  assert.equal(state.buttonState, ENROLLMENT_BUTTON_STATE.ENROLL_NOW);
  const result = sim.enroll(1, course.id);
  assert.equal(result.enrollment.access_status, 'active');
});

test('API state enroll_now when OPEN', () => {
  const sim = new EnrollmentFlowSimulator();
  const course = sim.createCourse({ title: 'Open', admission_status: ADMISSION_STATUS.OPEN });
  const api = sim.toApiState(2, course.id);
  assert.equal(api.buttonState, ENROLLMENT_BUTTON_STATE.ENROLL_NOW);
  assert.equal(api.isEnrollmentOpen, true);
  assert.equal(api.admissionsClosed, false);
});

console.log('\nenrollment-integration — CLOSED admission block');

test('prospect blocked when CLOSED', () => {
  const sim = new EnrollmentFlowSimulator();
  const course = sim.createCourse({ title: 'Closed Course', admission_status: ADMISSION_STATUS.CLOSED });
  const state = sim.resolveState(1, course.id);
  assert.equal(state.buttonState, ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED);
  assert.throws(() => sim.enroll(1, course.id), EnrollmentClosedError);
});

test('POST 403 ADMISSIONS_CLOSED client parse', () => {
  const err = {
    status: 403,
    errorCode: 'ADMISSIONS_CLOSED',
    message: 'Admissions are currently closed for this course.',
  };
  const parsed = parseApiError(err);
  assert.equal(parsed.isEnrollmentClosed, true);
  assert.equal(parsed.status, 403);
});

test('guest CTA disabled when CLOSED catalog', () => {
  const api = normalizeEnrollmentState({
    buttonState: 'admissions_closed',
    admissionsClosed: true,
    admissionStatus: 'CLOSED',
  });
  const cta = buildCourseEnrollmentCtaFromState(api, { courseId: 1, labelContext: 'card' });
  assert.equal(cta.disabled, true);
  assert.equal(cta.label, 'Enrollment Closed');
});

console.log('\nenrollment-integration — existing student access');

test('enrolled student continues when admissions close', () => {
  const sim = new EnrollmentFlowSimulator();
  const course = sim.createCourse({ title: 'Live Course', admission_status: ADMISSION_STATUS.OPEN });
  sim.enroll(5, course.id);
  sim.closeAdmissions(course.id);

  const state = sim.resolveState(5, course.id);
  assert.equal(state.buttonState, ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING);

  const api = sim.toApiState(5, course.id);
  assert.equal(api.isEnrolled, true);
  assert.equal(api.admissionsClosed, true);

  const cta = buildCourseEnrollmentCtaFromState(
    { buttonState: CLIENT_CTA.CONTINUE_LEARNING },
    { courseId: course.id, labelContext: 'card' }
  );
  assert.equal(cta.disabled, false);
  assert.equal(cta.to, '/dashboard/lectures');
});

test('duplicate enrollment throws DUPLICATE_ACTIVE_ENROLLMENT', () => {
  const sim = new EnrollmentFlowSimulator();
  const course = sim.createCourse({ title: 'Dup', admission_status: ADMISSION_STATUS.OPEN });
  sim.enroll(7, course.id);
  assert.throws(() => sim.assertCanEnroll(7, course.id), DuplicateActiveEnrollmentError);
});

console.log('\nenrollment-integration — dashboard view contract');

test('dashboard course card fields from API', () => {
  const course = toCourseResponse({
    id: 3,
    title: 'Dashboard Course',
    admission_status: 'CLOSED',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
  });
  assert.equal(course.admission_status, ADMISSION_STATUS.CLOSED);
  assert.equal(course.is_enrollment_open, false);
  assert.ok(course.enrollment_message);
});

test('student portal active course warning data', () => {
  const sim = new EnrollmentFlowSimulator();
  const course = sim.createCourse({
    title: 'Portal Course',
    admission_status: ADMISSION_STATUS.OPEN,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
  });
  sim.enroll(10, course.id);
  sim.closeAdmissions(course.id);

  const api = sim.toApiState(10, course.id);
  assert.equal(api.isEnrolled, true);
  assert.equal(api.admissionsClosed, true);
  assert.match(api.message, /closed/i);
});

console.log('\nenrollment-integration — edge cases');

test('payment pending not blocked by CLOSED for same course', () => {
  const state = resolveEnrollmentButtonState({
    targetCourseId: 30,
    targetEnrollmentType: 'premium',
    activeEntitlement: { courseId: 30, enrollmentSource: 'paid' },
    activeCourseName: 'Paid',
    activeEnrollmentType: 'premium',
    courseEnrollment: {
      id: 5,
      courseId: 30,
      status: 'pending',
      accessStatus: 'inactive',
      enrollmentSource: null,
      orderId: 99,
      orderStatus: 'pending',
    },
    admissionsOpen: false,
  });
  assert.equal(state.buttonState, ENROLLMENT_BUTTON_STATE.PAYMENT_PENDING);
});

test('switch course blocked when CLOSED (prospect on other course)', () => {
  const state = resolveEnrollmentButtonState({
    targetCourseId: 20,
    targetEnrollmentType: 'free',
    activeEntitlement: { courseId: 10, enrollmentSource: 'free' },
    activeCourseName: 'Other',
    activeEnrollmentType: 'free',
    courseEnrollment: null,
    admissionsOpen: false,
  });
  assert.equal(state.buttonState, ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED);
  assert.equal(state.canSwitch, false);
});

test('needsAdmissionGate logic — active enrollment skips gate', () => {
  function needsAdmissionGate(existingRow) {
    const isActive = String(existingRow?.access_status || '').toLowerCase() === 'active';
    const isPaymentPending =
      existingRow &&
      !isActive &&
      String(existingRow?.order_status || '').toLowerCase() === 'pending';
    return !existingRow || (!isActive && !isPaymentPending);
  }
  assert.equal(needsAdmissionGate({ access_status: 'active' }), false);
  assert.equal(needsAdmissionGate(null), true);
  assert.equal(needsAdmissionGate({ access_status: 'inactive', order_status: 'pending' }), false);
  assert.equal(needsAdmissionGate({ access_status: 'inactive', order_status: null }), true);
});

test('full lifecycle: open → enroll → close → continue + block new user', () => {
  const sim = new EnrollmentFlowSimulator();
  const course = sim.createCourse({ title: 'Lifecycle', admission_status: ADMISSION_STATUS.OPEN });

  sim.enroll(100, course.id);
  sim.closeAdmissions(course.id);

  assert.equal(sim.resolveState(100, course.id).buttonState, ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING);
  assert.equal(sim.resolveState(101, course.id).buttonState, ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED);
  assert.throws(() => sim.enroll(101, course.id), EnrollmentClosedError);
});

ok('EnrollmentClosedError is operational 403', () => {
  const e = new EnrollmentClosedError({ courseId: 1 });
  assert.equal(e.httpStatus, 403);
  assert.equal(e.isOperational, true);
});

summary('enrollment-integration');
