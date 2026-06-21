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

test('guest / logged out → Enroll Now', () => {
  const cta = buildCourseEnrollmentCtaFromState(null, { courseId: 42 });
  assert.equal(cta.label, 'Enroll Now');
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

test('switch_course → Switch Course with confirmation', () => {
  const cta = buildCourseEnrollmentCtaFromState(
    {
      buttonState: ENROLLMENT_BUTTON_STATE.SWITCH_COURSE,
      enrolledCourseName: 'MDCAT Prep',
      requiresSwitchConfirmation: true,
    },
    { courseId: 5 }
  );
  assert.equal(cta.label, 'Switch Course');
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
  assert.equal(cta.to.pathname, '/enrollment/payment');
});

test('admissions_closed → Enrollment Closed (disabled)', () => {
  const cta = buildCourseEnrollmentCtaFromState(
    { buttonState: ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED },
    { courseId: 3 }
  );
  assert.equal(cta.label, 'Enrollment Closed');
  assert.equal(cta.disabled, true);
});

test('premium_blocks_free → disabled with tooltip', () => {
  const cta = buildCourseEnrollmentCtaFromState(
    { buttonState: ENROLLMENT_BUTTON_STATE.PREMIUM_BLOCKS_FREE },
    { courseId: 3 }
  );
  assert.equal(cta.disabled, true);
  assert.match(cta.tooltip, /premium course/i);
});

console.log('courseEnrollmentCta backend-driven tests passed');
