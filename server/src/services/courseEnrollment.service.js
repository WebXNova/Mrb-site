/**
 * Course enrollment orchestration — simplified admission_status gate.
 *
 * New enrollments require admission_status = OPEN.
 * Existing students (access_status = active) retain access when admissions close.
 * Pricing classification remains DB-backed; batch windows/seats are not enforced here.
 */

import { mysqlPool } from '../config/mysql.js';
import { ENROLLMENT_PRICING_CATEGORY } from '../constants/coursePricingTypes.js';
import { ENROLLMENT_SOURCE } from '../constants/enrollmentSource.js';
import {
  assertAdmissionOpen,
  assertCoursePricingValid,
} from './coursePricingGate.service.js';
import { findEnrollmentByUserAndCourse, getOrCreateEnrollment } from './enrollmentIntegrity.service.js';
import { activateEnrollmentInTransaction } from './enrollmentLifecycle.service.js';
import { createPaymentSession } from './payments.service.js';
import { getEnrollmentById } from './safepayEnrollment.service.js';
import {
  assertEnrollmentActionAllowed,
  markEnrollmentSwitchConfirmed,
  resolveEnrollmentStateForCourse,
} from './enrollmentState.service.js';

export { assertAdmissionOpen };

/**
 * Frontend enrollment CTA state — does not throw when admissions are closed
 * (existing students still receive continue_learning).
 *
 * @param {number} userId
 * @param {number} courseId
 */
export async function getEnrollmentState(userId, courseId) {
  return resolveEnrollmentStateForCourse(userId, courseId);
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} enrollmentId
 * @param {{ confirmSwitch?: boolean }} [options]
 */
export async function activateFreeEnrollmentInTransaction(connection, enrollmentId, options = {}) {
  const enrollment = await getEnrollmentById(enrollmentId);
  if (!enrollment) {
    throw new Error(`Enrollment ${enrollmentId} not found`);
  }

  return activateEnrollmentInTransaction(connection, {
    enrollmentId,
    orderId: null,
    actor: 'enrollment.free',
    reason: 'free_course_enrollment',
    requirePaidOrder: false,
    enrollmentSource: ENROLLMENT_SOURCE.FREE,
    confirmSwitch: options.confirmSwitch === true,
  });
}

/**
 * @param {number} enrollmentId
 * @param {{ confirmSwitch?: boolean }} [options]
 */
export async function activateFreeEnrollment(enrollmentId, options = {}) {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await activateFreeEnrollmentInTransaction(connection, enrollmentId, options);
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    connection.release();
  }
}

function isActiveEnrollment(enrollment) {
  return String(enrollment?.accessStatus || '').toLowerCase() === 'active';
}

function isPaymentPendingEnrollment(enrollment) {
  if (!enrollment || isActiveEnrollment(enrollment)) return false;
  const access = String(enrollment?.accessStatus || '').toLowerCase();
  if (access === 'revoked') return false;
  const status = String(enrollment?.status || '').toLowerCase();
  if (status === 'rejected') return false;
  const orderStatus = String(enrollment?.orderStatus || '').toLowerCase();
  return orderStatus === 'pending' || orderStatus === 'created';
}

/**
 * @typedef {object} EnrollmentProfilePayload
 * @property {number} userId
 * @property {number} courseId
 * @property {string} applicantFullName
 * @property {string} fatherName
 * @property {string|null} [dateOfBirth]
 * @property {'male'|'female'} gender
 * @property {string} whatsappNumber
 * @property {string} email
 * @property {number} provinceId
 * @property {number} districtId
 * @property {number} cityId
 * @property {number|null} [boardId]
 * @property {string} hsscStatus
 * @property {string} mdcatAttemptType
 */

/**
 * @param {EnrollmentProfilePayload} profile
 * @param {{ confirmSwitch?: boolean }} [options]
 */
export async function processCourseEnrollment(profile, options = {}) {
  const confirmSwitch = options.confirmSwitch === true;
  const userId = Number(profile.userId);
  const courseId = Number(profile.courseId);

  await assertEnrollmentActionAllowed({
    userId,
    courseId,
    confirmSwitch,
    isActivation: false,
  });

  const existingRow = await findEnrollmentByUserAndCourse(userId, courseId);
  const needsAdmissionGate =
    !existingRow || (!isActiveEnrollment(existingRow) && !isPaymentPendingEnrollment(existingRow));

  if (needsAdmissionGate) {
    await assertAdmissionOpen(courseId);
  }

  const { pricingCategory } = await assertCoursePricingValid(courseId);

  const { enrollment: existing, created } = await getOrCreateEnrollment({
    userId,
    courseId,
    orderId: null,
    applicantFullName: profile.applicantFullName,
    fatherName: profile.fatherName,
    dateOfBirth: profile.dateOfBirth || null,
    gender: profile.gender,
    whatsappNumber: profile.whatsappNumber,
    email: profile.email,
    provinceId: profile.provinceId,
    districtId: profile.districtId,
    cityId: profile.cityId,
    boardId: profile.boardId ?? null,
    hsscStatus: profile.hsscStatus,
    mdcatAttemptType: profile.mdcatAttemptType,
  });

  const enrollmentId = Number(existing.id);

  if (confirmSwitch) {
    await markEnrollmentSwitchConfirmed(null, enrollmentId);
  }

  if (isActiveEnrollment(existing)) {
    return {
      enrollment: existing,
      created: false,
      pricingCategory,
      accessGranted: true,
      paymentRequired: false,
      idempotent: true,
    };
  }

  if (pricingCategory === ENROLLMENT_PRICING_CATEGORY.FREE) {
    await assertEnrollmentActionAllowed({
      userId,
      courseId,
      confirmSwitch,
      isActivation: true,
    });
    await activateFreeEnrollment(enrollmentId, { confirmSwitch });
    const activated = await getEnrollmentById(enrollmentId);
    return {
      enrollment: activated,
      created,
      pricingCategory,
      accessGranted: true,
      paymentRequired: false,
      idempotent: !created && isActiveEnrollment(activated),
    };
  }

  const payment = await createPaymentSession({
    userId,
    enrollmentId,
    courseId,
  });

  const refreshed = await getEnrollmentById(enrollmentId);

  return {
    enrollment: refreshed,
    created,
    pricingCategory,
    accessGranted: false,
    paymentRequired: true,
    checkoutUrl: payment.checkoutUrl,
    orderId: payment.orderId,
  };
}
