/**
 * Enrollment state resolver + switch guard tests (in-memory simulator).
 *
 * Run: node src/services/enrollmentState.test.examples.mjs
 */

import {
  ENROLLMENT_BUTTON_STATE,
} from '../constants/enrollmentButtonState.js';
import {
  resolveEnrollmentButtonState,
  mapEnrollmentSourceToType,
  mapPricingCategoryToType,
} from './enrollmentState.service.js';
import { ENROLLMENT_PRICING_CATEGORY } from '../constants/coursePricingTypes.js';
import { ENROLLMENT_SOURCE } from '../constants/enrollmentSource.js';

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`);
  }
}

function eq(label, actual, expected) {
  ok(label, actual === expected);
}

console.log('enrollmentState — button state resolver');

eq('mapEnrollmentSourceToType paid → premium', mapEnrollmentSourceToType(ENROLLMENT_SOURCE.PAID), 'premium');
eq('mapEnrollmentSourceToType free → free', mapEnrollmentSourceToType(ENROLLMENT_SOURCE.FREE), 'free');
eq(
  'mapPricingCategoryToType paid → premium',
  mapPricingCategoryToType(ENROLLMENT_PRICING_CATEGORY.PAID),
  'premium'
);

const firstEnrollment = resolveEnrollmentButtonState({
  targetCourseId: 10,
  targetEnrollmentType: 'free',
  activeEntitlement: null,
  activeCourseName: null,
  activeEnrollmentType: null,
  courseEnrollment: null,
});
eq('first enrollment → enroll_now', firstEnrollment.buttonState, ENROLLMENT_BUTTON_STATE.ENROLL_NOW);
ok('first enrollment canEnroll', firstEnrollment.canEnroll === true);

const duplicateSameCourse = resolveEnrollmentButtonState({
  targetCourseId: 10,
  targetEnrollmentType: 'free',
  activeEntitlement: { courseId: 10, enrollmentSource: 'free' },
  activeCourseName: 'Course A',
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
});
eq('duplicate same course → continue_learning', duplicateSameCourse.buttonState, ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING);
ok('duplicate same course cannot enroll', duplicateSameCourse.canEnroll === false);

const freeToFreeSwitch = resolveEnrollmentButtonState({
  targetCourseId: 20,
  targetEnrollmentType: 'free',
  activeEntitlement: { courseId: 10, enrollmentSource: 'free' },
  activeCourseName: 'Free Course A',
  activeEnrollmentType: 'free',
  courseEnrollment: null,
});
eq('free → free switch → switch_course', freeToFreeSwitch.buttonState, ENROLLMENT_BUTTON_STATE.SWITCH_COURSE);
ok('free → free requires confirmation', freeToFreeSwitch.requiresSwitchConfirmation === true);

const freeToPremiumSwitch = resolveEnrollmentButtonState({
  targetCourseId: 30,
  targetEnrollmentType: 'premium',
  activeEntitlement: { courseId: 10, enrollmentSource: 'free' },
  activeCourseName: 'Free Course A',
  activeEnrollmentType: 'free',
  courseEnrollment: null,
});
eq('free → premium → upgrade_course', freeToPremiumSwitch.buttonState, ENROLLMENT_BUTTON_STATE.UPGRADE_COURSE);
ok('free → premium canUpgrade', freeToPremiumSwitch.canUpgrade === true);

const premiumToFreeSwitch = resolveEnrollmentButtonState({
  targetCourseId: 20,
  targetEnrollmentType: 'free',
  activeEntitlement: { courseId: 10, enrollmentSource: 'paid' },
  activeCourseName: 'Premium Course A',
  activeEnrollmentType: 'premium',
  courseEnrollment: null,
});
eq('premium → free → premium_blocks_free', premiumToFreeSwitch.buttonState, ENROLLMENT_BUTTON_STATE.PREMIUM_BLOCKS_FREE);
ok('premium → free cannot enroll', premiumToFreeSwitch.canEnroll === false);

const premiumToPremiumSwitch = resolveEnrollmentButtonState({
  targetCourseId: 40,
  targetEnrollmentType: 'premium',
  activeEntitlement: { courseId: 10, enrollmentSource: 'paid' },
  activeCourseName: 'Premium Course A',
  activeEnrollmentType: 'premium',
  courseEnrollment: null,
});
eq('premium → premium → switch_course', premiumToPremiumSwitch.buttonState, ENROLLMENT_BUTTON_STATE.SWITCH_COURSE);

const paymentPending = resolveEnrollmentButtonState({
  targetCourseId: 30,
  targetEnrollmentType: 'premium',
  activeEntitlement: null,
  activeCourseName: null,
  activeEnrollmentType: null,
  courseEnrollment: {
    id: 5,
    courseId: 30,
    status: 'pending',
    accessStatus: 'inactive',
    enrollmentSource: null,
    orderId: 99,
    orderStatus: 'pending',
  },
});
eq('payment pending → payment_pending', paymentPending.buttonState, ENROLLMENT_BUTTON_STATE.PAYMENT_PENDING);

const closedAdmissions = resolveEnrollmentButtonState({
  targetCourseId: 50,
  targetEnrollmentType: 'free',
  activeEntitlement: null,
  activeCourseName: null,
  activeEnrollmentType: null,
  courseEnrollment: null,
  admissionsOpen: false,
});
eq('CLOSED admissions → admissions_closed', closedAdmissions.buttonState, ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED);
ok('CLOSED admissions cannot enroll', closedAdmissions.canEnroll === false);

const enrolledWhenClosed = resolveEnrollmentButtonState({
  targetCourseId: 60,
  targetEnrollmentType: 'free',
  activeEntitlement: { courseId: 60, enrollmentSource: 'free' },
  activeCourseName: 'My Course',
  activeEnrollmentType: 'free',
  courseEnrollment: {
    id: 9,
    courseId: 60,
    status: 'approved',
    accessStatus: 'active',
    enrollmentSource: 'free',
    orderId: null,
    orderStatus: null,
  },
  admissionsOpen: false,
});
eq('enrolled + CLOSED → continue_learning', enrolledWhenClosed.buttonState, ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING);

/**
 * In-memory activation switch guard — mirrors assertActivationSwitchAllowed logic.
 */
class ActivationSwitchSimulator {
  constructor() {
    /** @type {Map<number, object>} */
    this.enrollments = new Map();
    this._nextId = 1;
  }

  addEnrollment(row) {
    const id = row.id ?? this._nextId++;
    const enrollment = { ...row, id };
    this.enrollments.set(id, enrollment);
    return enrollment;
  }

  assertActivationSwitchAllowed(options) {
    const { userId, enrollmentId, courseId, enrollmentSource, confirmSwitch } = options;
    const target = this.enrollments.get(enrollmentId);
    if (!target) throw new Error('target_missing');

    const confirmed = confirmSwitch === true || target.switch_confirmed_at != null;
    const activeOthers = [...this.enrollments.values()].filter(
      (row) =>
        row.user_id === userId &&
        row.access_status === 'active' &&
        row.id !== enrollmentId &&
        row.course_id !== courseId
    );

    if (activeOthers.length === 0) return;

    const activeRow = activeOthers[0];
    const activeType = mapEnrollmentSourceToType(activeRow.enrollment_source);
    const targetType = mapEnrollmentSourceToType(enrollmentSource);

    if (activeType === 'premium' && targetType === 'free') {
      throw new Error('PREMIUM_ACCESS_PROTECTED');
    }
    if (!confirmed) {
      throw new Error('SWITCH_CONFIRMATION_REQUIRED');
    }
  }

  activate(options) {
    this.assertActivationSwitchAllowed(options);
    for (const row of this.enrollments.values()) {
      if (row.user_id === options.userId && row.access_status === 'active' && row.id !== options.enrollmentId) {
        row.access_status = 'inactive';
      }
    }
    const target = this.enrollments.get(options.enrollmentId);
    target.access_status = 'active';
    target.enrollment_source = options.enrollmentSource;
  }
}

console.log('\nenrollmentState — activation switch guard (race / abuse simulation)');

const sim = new ActivationSwitchSimulator();
sim.addEnrollment({ id: 1, user_id: 1, course_id: 10, access_status: 'active', enrollment_source: 'paid' });
const targetFree = sim.addEnrollment({
  id: 2,
  user_id: 1,
  course_id: 20,
  access_status: 'inactive',
  enrollment_source: null,
  switch_confirmed_at: null,
});

let blockedPremiumToFree = false;
try {
  sim.activate({
    userId: 1,
    enrollmentId: targetFree.id,
    courseId: 20,
    enrollmentSource: 'free',
    confirmSwitch: false,
  });
} catch (e) {
  blockedPremiumToFree = e.message === 'PREMIUM_ACCESS_PROTECTED';
}
ok('premium → free blocked without confirmation', blockedPremiumToFree);

targetFree.switch_confirmed_at = new Date();
let blockedPremiumToFreeWithConfirm = false;
try {
  sim.activate({
    userId: 1,
    enrollmentId: targetFree.id,
    courseId: 20,
    enrollmentSource: 'free',
    confirmSwitch: true,
  });
} catch (e) {
  blockedPremiumToFreeWithConfirm = e.message === 'PREMIUM_ACCESS_PROTECTED';
}
ok('premium → free blocked even with confirmation', blockedPremiumToFreeWithConfirm);

const sim2 = new ActivationSwitchSimulator();
sim2.addEnrollment({ id: 1, user_id: 2, course_id: 10, access_status: 'active', enrollment_source: 'free' });
const targetPremium = sim2.addEnrollment({
  id: 2,
  user_id: 2,
  course_id: 30,
  access_status: 'inactive',
  enrollment_source: null,
  switch_confirmed_at: null,
});

let blockedFreeToPremium = false;
try {
  sim2.activate({
    userId: 2,
    enrollmentId: targetPremium.id,
    courseId: 30,
    enrollmentSource: 'paid',
    confirmSwitch: false,
  });
} catch (e) {
  blockedFreeToPremium = e.message === 'SWITCH_CONFIRMATION_REQUIRED';
}
ok('free → premium blocked without confirmation (direct API)', blockedFreeToPremium);

sim2.activate({
  userId: 2,
  enrollmentId: targetPremium.id,
  courseId: 30,
  enrollmentSource: 'paid',
  confirmSwitch: true,
});
ok(
  'free → premium allowed with confirmSwitch (multiple tabs / refresh safe after confirm)',
  sim2.enrollments.get(2).access_status === 'active'
);

console.log(`\nenrollmentState tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
