/**
 * Homepage / catalog course discovery helpers.
 * Enrollment mutations stay on the existing enrollment API — this module only
 * decides what to show from backend-backed course and enrollment data.
 */

const PREMIUM_BLOCKS_FREE = 'premium_blocks_free';

export function isCatalogCourseFree(course) {
  const pricing = course?.pricing;
  if (!pricing || typeof pricing !== 'object') return false;
  const amount = Number(pricing.price_amount);
  return pricing.type === 'free' || (Number.isFinite(amount) && amount === 0);
}

function isCourseAdmissionOpen(course) {
  if (course?.is_enrollment_open === true) return true;
  if (course?.is_enrollment_open === false) return false;
  return String(course?.admission_status || '').toUpperCase() === 'OPEN';
}

export function isActiveAccess(row) {
  return String(row?.accessStatus || row?.access_status || '').toLowerCase() === 'active';
}

/**
 * Fail closed: unknown source with a paid order is treated as premium.
 * @param {Record<string, unknown>|null|undefined} row
 */
export function isActivePremiumEnrollment(row) {
  if (!row || !isActiveAccess(row)) return false;
  const source = String(row.enrollmentSource || row.enrollment_source || '').toLowerCase();
  if (source === 'paid') return true;
  if (source === 'free') return false;
  const orderStatus = String(row.orderStatus || row.order_status || '').toLowerCase();
  return orderStatus === 'paid';
}

export function getActiveEnrollment(enrollmentsByCourseId) {
  const rows = Object.values(enrollmentsByCourseId || {});
  return rows.find((row) => isActiveAccess(row)) ?? null;
}

export function studentHasActivePremiumCourse(enrollmentsByCourseId, enrollmentStates = []) {
  const active = getActiveEnrollment(enrollmentsByCourseId);
  if (isActivePremiumEnrollment(active)) {
    return true;
  }
  return (enrollmentStates || []).some(
    (state) =>
      state &&
      (state.enrollmentType === 'premium' ||
        state.hideFreeCourses === true ||
        state.buttonState === PREMIUM_BLOCKS_FREE)
  );
}

/**
 * Paid students must not see free courses as enrollable catalog items.
 */
export function filterDiscoverableCourses(courses, { hideFree = false } = {}) {
  if (!Array.isArray(courses)) return [];
  if (!hideFree) return courses;
  return courses.filter((course) => !isCatalogCourseFree(course));
}

export function resolveHomeCourseSectionCopy({ isAuthenticated = false, hasActiveCourse = false } = {}) {
  if (!isAuthenticated) {
    return {
      eyebrow: 'Courses',
      title: 'Courses built for your goal',
      lead: 'Explore our courses and choose the path that matches your preparation.',
    };
  }
  if (hasActiveCourse) {
    return {
      eyebrow: 'Your preparation',
      title: 'Continue your preparation',
      lead: 'Stay with your current course, or move to another paid program if you need a different path.',
    };
  }
  return {
    eyebrow: 'Courses',
    title: 'Find your course',
    lead: 'Choose the right path for your preparation and start learning.',
  };
}

export function pickFeaturedCourse(courses, { currentCourseId = null } = {}) {
  if (!Array.isArray(courses) || courses.length === 0) return null;
  if (currentCourseId != null) {
    const current = courses.find((course) => Number(course.id) === Number(currentCourseId));
    if (current) return current;
  }
  const openPaid = courses.find((course) => !isCatalogCourseFree(course) && isCourseAdmissionOpen(course));
  if (openPaid) return openPaid;
  const paid = courses.find((course) => !isCatalogCourseFree(course));
  return paid || courses[0];
}

export function formatCourseDuration(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (days < 1) return null;
  if (days >= 27) {
    const months = Math.max(1, Math.round(days / 30));
    return months === 1 ? '1 month' : `${months} months`;
  }
  return days === 1 ? '1 day' : `${days} days`;
}

export function formatCourseTypeLabel(course) {
  return isCatalogCourseFree(course) ? 'Free' : 'Paid';
}
