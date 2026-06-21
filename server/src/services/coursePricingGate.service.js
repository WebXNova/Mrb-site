/**
 * DB-backed pricing gates for enrollment and payment (no client input).
 */

import { ApiError } from '../utils/apiError.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { getEffectivePricingForCourse } from './coursePricing.service.js';
import { ADMISSION_STATUS } from '../models/course.model.js';
import { EnrollmentClosedError } from '../errors/enrollment/EnrollmentStateErrors.js';
import {
  classifyCoursePricingCategory,
  ENROLLMENT_PRICING_CATEGORY,
} from '../constants/coursePricingTypes.js';

const PRICING_ERROR_MESSAGES = Object.freeze({
  pricing_not_configured: 'Course pricing is not configured for enrollment.',
  free_course_price_must_be_zero: 'Free course pricing is misconfigured (price must be 0).',
  paid_course_price_must_be_positive: 'Paid course pricing is misconfigured (price must be greater than 0).',
  unknown_pricing_type: 'Course pricing type is not supported for enrollment.',
  admissions_closed: 'Admissions are currently closed for this course.',
});

/**
 * Assert course admissions are open — sole gate for new enrollment attempts.
 * Existing students with active access are not subject to this check (see entitlement.service).
 *
 * @param {number} courseId
 */
export async function assertAdmissionOpen(courseId) {
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }

  const course = await getCourseRowById(cid, { activeOnly: true });
  if (!course) {
    throw new ApiError(404, 'Course not found or not available', { code: 'COURSE_NOT_FOUND' });
  }

  const admissionStatus = String(course.admission_status || ADMISSION_STATUS.CLOSED).toUpperCase();
  if (admissionStatus !== ADMISSION_STATUS.OPEN) {
    throw new EnrollmentClosedError({
      courseId: cid,
      admission_status: admissionStatus,
    });
  }

  return course;
}

/**
 * @param {number} courseId
 */
export async function assertCoursePricingValid(courseId) {
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }

  const course = await getCourseRowById(cid, { activeOnly: true });
  if (!course) {
    throw new ApiError(404, 'Course not found or not available', { code: 'COURSE_NOT_FOUND' });
  }

  const pricing = await getEffectivePricingForCourse(cid);
  const classification = classifyCoursePricingCategory(pricing);
  if (!classification.category) {
    const code = classification.error || 'pricing_not_configured';
    throw new ApiError(422, PRICING_ERROR_MESSAGES[code] || PRICING_ERROR_MESSAGES.pricing_not_configured, {
      code: 'COURSE_PRICING_INVALID',
      reason: code,
    });
  }

  return {
    courseId: cid,
    courseTitle: course.title,
    pricing,
    pricingCategory: classification.category,
  };
}

/**
 * @param {number} courseId
 */
export async function assertCourseEligibleForEnrollment(courseId) {
  const course = await assertAdmissionOpen(courseId);
  const pricingResult = await assertCoursePricingValid(courseId);
  return {
    ...pricingResult,
    courseTitle: course.title,
  };
}

/**
 * Paid checkout pricing gate — does NOT check admission_status.
 * Admission is enforced when creating a new enrollment row; in-flight payments may complete after close.
 *
 * @param {number} courseId
 */
export async function assertPaidCheckoutAllowedForCourse(courseId) {
  const { pricingCategory } = await assertCoursePricingValid(courseId);
  if (pricingCategory === ENROLLMENT_PRICING_CATEGORY.FREE) {
    throw new ApiError(400, 'Payment is not required for free courses.', {
      code: 'FREE_COURSE_NO_PAYMENT',
    });
  }
}
