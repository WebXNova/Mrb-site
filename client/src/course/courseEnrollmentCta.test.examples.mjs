import assert from 'node:assert/strict';
import {
  ENROLLMENT_BUTTON_STATE,
  buildCourseEnrollmentCtaFromState,
} from './courseEnrollmentCta.js';

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

console.log('courseEnrollmentCta — backend-driven button state');

test('guest / logged out → Get Started', () => {
  const cta = buildCourseEnrollmentCtaFromState(null, { courseId: 42, isGuest: true });
  assert.equal(cta.label, 'Get Started');
  assert.equal(cta.buttonState, ENROLLMENT_BUTTON_STATE.ENROLL_NOW);
});

test('continue_learning → Continue Learning', () => {
  const cta = buildCourseEnrollmentCtaFromState(
    { buttonState: ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING },
    { courseId: 1, labelContext: 'card' }
  );
  assert.equal(cta.label, 'Continue Learning');
  assert.equal(cta.to, '/dashboard/lectures');
});

test('continue_learning never shows Enroll Now', () => {
  const contexts = ['card', 'hero', 'pricing', 'bottom', 'sticky'];
  for (const labelContext of contexts) {
    const cta = buildCourseEnrollmentCtaFromState(
      { buttonState: ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING },
      { courseId: 1, labelContext }
    );
    assert.notEqual(cta.label, 'Enroll Now');
  }
});

test('switch_course → Change Course with confirmation', () => {
  const cta = buildCourseEnrollmentCtaFromState(
    {
      buttonState: ENROLLMENT_BUTTON_STATE.SWITCH_COURSE,
      enrolledCourseName: 'MDCAT Prep',
      requiresSwitchConfirmation: true,
    },
    { courseId: 5 }
  );
  assert.equal(cta.label, 'Change Course');
  assert.equal(cta.requiresSwitchConfirmation, true);
});

test('upgrade_course → Upgrade Course', () => {
  const cta = buildCourseEnrollmentCtaFromState(
    { buttonState: ENROLLMENT_BUTTON_STATE.UPGRADE_COURSE, requiresSwitchConfirmation: true },
    { courseId: 7 }
  );
  assert.equal(cta.label, 'Upgrade Course');
});

test('payment_pending → Payment Pending', () => {
  const cta = buildCourseEnrollmentCtaFromState(
    {
      buttonState: ENROLLMENT_BUTTON_STATE.PAYMENT_PENDING,
      enrollmentId: 12,
      orderId: 34,
    },
    { courseId: 9 }
  );
  assert.equal(cta.label, 'Payment Pending');
  assert.equal(cta.to, '/enrollment/payment?order_id=34&course_id=9');
});

test('admissions_closed → Enrollment Closed (disabled)', () => {
  const cta = buildCourseEnrollmentCtaFromState(
    { buttonState: ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED },
    { courseId: 3 }
  );
  assert.equal(cta.label, 'Enrollment Closed');
  assert.equal(cta.disabled, true);
});

test('premium_blocks_free → disabled Not available', () => {
  const cta = buildCourseEnrollmentCtaFromState(
    { buttonState: ENROLLMENT_BUTTON_STATE.PREMIUM_BLOCKS_FREE },
    { courseId: 3 }
  );
  assert.equal(cta.disabled, true);
  assert.equal(cta.label, 'Not available');
  assert.match(cta.tooltip, /paid course/i);
});

test('free course enroll_now → Enroll Free', () => {
  const cta = buildCourseEnrollmentCtaFromState(
    { buttonState: ENROLLMENT_BUTTON_STATE.ENROLL_NOW, targetEnrollmentType: 'free' },
    { courseId: 4, isFreeCourse: true }
  );
  assert.equal(cta.label, 'Enroll Free');
});

console.log('courseEnrollmentCta backend-driven tests passed');
