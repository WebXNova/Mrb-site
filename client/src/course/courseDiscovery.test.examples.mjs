import assert from 'node:assert/strict';
import {
  filterDiscoverableCourses,
  formatCourseDuration,
  isActivePremiumEnrollment,
  isCatalogCourseFree,
  pickFeaturedCourse,
  resolveHomeCourseSectionCopy,
  studentHasActivePremiumCourse,
} from './courseDiscovery.js';

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

const freeCourse = {
  id: 1,
  title: 'Free English',
  pricing: { type: 'free', price_amount: 0, currency: 'PKR' },
  admission_status: 'OPEN',
  is_enrollment_open: true,
};
const paidCourse = {
  id: 2,
  title: 'MDCAT Prep',
  pricing: { type: 'one_time', price_amount: 5000, currency: 'PKR' },
  admission_status: 'OPEN',
  is_enrollment_open: true,
};
const paidClosed = {
  id: 3,
  title: 'Closed Paid',
  pricing: { type: 'one_time', price_amount: 8000, currency: 'PKR' },
  admission_status: 'CLOSED',
  is_enrollment_open: false,
};

console.log('courseDiscovery — catalog visibility');

test('free vs paid classification does not mix price and Free', () => {
  assert.equal(isCatalogCourseFree(freeCourse), true);
  assert.equal(isCatalogCourseFree(paidCourse), false);
});

test('guest / unpaid student still sees free courses', () => {
  const visible = filterDiscoverableCourses([freeCourse, paidCourse], { hideFree: false });
  assert.equal(visible.length, 2);
});

test('paid student catalog hides free courses', () => {
  const visible = filterDiscoverableCourses([freeCourse, paidCourse], { hideFree: true });
  assert.deepEqual(
    visible.map((c) => c.id),
    [2]
  );
});

test('active paid enrollment is treated as premium', () => {
  assert.equal(
    isActivePremiumEnrollment({ accessStatus: 'active', enrollmentSource: 'paid' }),
    true
  );
  assert.equal(
    isActivePremiumEnrollment({ accessStatus: 'active', enrollmentSource: 'free' }),
    false
  );
  assert.equal(
    isActivePremiumEnrollment({
      accessStatus: 'active',
      enrollmentSource: null,
      orderStatus: 'paid',
    }),
    true
  );
});

test('premium state from enrollment API also hides free courses', () => {
  assert.equal(
    studentHasActivePremiumCourse({}, [{ enrollmentType: 'premium', hideFreeCourses: true }]),
    true
  );
  assert.equal(
    studentHasActivePremiumCourse({}, [{ buttonState: 'premium_blocks_free' }]),
    true
  );
  assert.equal(studentHasActivePremiumCourse({}, [{ enrollmentType: 'free' }]), false);
});

test('personalized copy by auth / enrollment', () => {
  assert.match(resolveHomeCourseSectionCopy({ isAuthenticated: false }).title, /goal/i);
  assert.match(resolveHomeCourseSectionCopy({ isAuthenticated: true, hasActiveCourse: false }).title, /Find/i);
  assert.match(resolveHomeCourseSectionCopy({ isAuthenticated: true, hasActiveCourse: true }).title, /Continue/i);
});

test('featured course prefers current, then open paid', () => {
  assert.equal(pickFeaturedCourse([freeCourse, paidCourse, paidClosed], { currentCourseId: 3 }).id, 3);
  assert.equal(pickFeaturedCourse([freeCourse, paidClosed, paidCourse]).id, 2);
});

test('duration uses real dates only', () => {
  assert.equal(formatCourseDuration(null, '2026-06-01'), null);
  assert.equal(formatCourseDuration('2026-01-01', '2026-04-01'), '3 months');
});

console.log('courseDiscovery tests passed');
