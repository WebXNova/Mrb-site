/**
 * Authoritative enrollment state for a user + course pair.
 * Single source for CTA buttonState and enrollment action gates.
 */

import { mysqlPool } from '../config/mysql.js';
import { loadBatchSeatSnapshot } from './batchSeat.service.js';
import { ENROLLMENT_PRICING_CATEGORY } from '../constants/coursePricingTypes.js';
import { ENROLLMENT_SOURCE } from '../constants/enrollmentSource.js';
import { ENROLLMENT_BUTTON_STATE } from '../constants/enrollmentButtonState.js';
import { ADMISSION_STATUS } from '../models/course.model.js';
import { assertCoursePricingValid } from './coursePricingGate.service.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { resolveActiveEntitlement } from './entitlement.service.js';
import { MultipleActiveEnrollmentsError } from '../errors/entitlement/EntitlementErrors.js';
import {
  DuplicateActiveEnrollmentError,
  EnrollmentClosedError,
  EnrollmentSwitchConfirmationRequiredError,
  PremiumAccessProtectedError,
  CourseFullError,
} from '../errors/enrollment/EnrollmentStateErrors.js';

/**
 * @typedef {object} EnrollmentStateResult
 * @property {number|null} enrolledCourseId
 * @property {string|null} enrolledCourseName
 * @property {'free'|'premium'|null} enrollmentType
 * @property {boolean} canEnroll
 * @property {boolean} canSwitch
 * @property {boolean} canUpgrade
 * @property {string} buttonState
 * @property {number|null} targetCourseId
 * @property {'free'|'premium'|null} targetEnrollmentType
 * @property {boolean} requiresSwitchConfirmation
 * @property {object|null} courseEnrollment
 */

function normalizePositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return n;
}

/**
 * @param {'free'|'paid'|null|undefined} source
 * @returns {'free'|'premium'|null}
 */
export function mapEnrollmentSourceToType(source) {
  const s = String(source || '').toLowerCase();
  if (s === ENROLLMENT_SOURCE.PAID) return 'premium';
  if (s === ENROLLMENT_SOURCE.FREE) return 'free';
  return null;
}

/**
 * @param {string|null|undefined} pricingCategory
 * @returns {'free'|'premium'|null}
 */
export function mapPricingCategoryToType(pricingCategory) {
  if (pricingCategory === ENROLLMENT_PRICING_CATEGORY.FREE) return 'free';
  if (pricingCategory === ENROLLMENT_PRICING_CATEGORY.PAID) return 'premium';
  return null;
}

/**
 * @param {import('mysql2/promise').PoolConnection|null} connection
 * @param {number} userId
 * @param {number} courseId
 */
async function loadCourseEnrollmentRow(connection, userId, courseId) {
  const sql = `
    SELECT
      e.id,
      e.course_id,
      e.status,
      e.access_status,
      e.enrollment_source,
      e.order_id,
      o.status AS order_status
    FROM enrollments e
    LEFT JOIN orders o ON o.id = e.order_id
    WHERE e.user_id = ? AND e.course_id = ?
    LIMIT 1
  `;
  const params = [userId, courseId];
  const [rows] = connection
    ? await connection.query(sql, params)
    : await mysqlPool.query(sql, params);
  return rows[0] ?? null;
}

/**
 * @param {Record<string, unknown>|null} row
 */
function mapCourseEnrollmentDto(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    status: String(row.status || ''),
    accessStatus: String(row.access_status || ''),
    enrollmentSource: row.enrollment_source ?? null,
    orderId: row.order_id == null ? null : Number(row.order_id),
    orderStatus: row.order_status ?? null,
  };
}

function isActiveAccess(row) {
  const access = String(row?.access_status || row?.accessStatus || '').toLowerCase();
  return access === 'active';
}

function isRejectedOrRevoked(row) {
  const status = String(row?.status || '').toLowerCase();
  const access = String(row?.access_status || row?.accessStatus || '').toLowerCase();
  return status === 'rejected' || access === 'revoked';
}

function isPaymentPending(row) {
  if (!row || isActiveAccess(row) || isRejectedOrRevoked(row)) return false;
  const orderStatus = String(row.order_status || row.orderStatus || '').toLowerCase();
  return orderStatus === 'pending' || orderStatus === 'created';
}

/**
 * Pure resolver — maps entitlement + target course context to API state.
 * @param {object} input
 * @param {number} input.targetCourseId
 * @param {'free'|'premium'} input.targetEnrollmentType
 * @param {object|null} input.activeEntitlement
 * @param {string|null} input.activeCourseName
 * @param {'free'|'premium'|null} input.activeEnrollmentType
 * @param {object|null} input.courseEnrollment
 * @param {boolean} [input.admissionsOpen=true]
 * @param {boolean} [input.seatsAvailable=true]
 */
export function resolveEnrollmentButtonState(input) {
  const {
    targetCourseId,
    targetEnrollmentType,
    activeEntitlement,
    activeCourseName,
    activeEnrollmentType,
    courseEnrollment,
    admissionsOpen = true,
    seatsAvailable = true,
  } = input;

  const base = {
    enrolledCourseId: activeEntitlement?.courseId ?? null,
    enrolledCourseName: activeCourseName ?? null,
    enrollmentType: activeEnrollmentType ?? null,
    targetCourseId,
    targetEnrollmentType,
    courseEnrollment,
  };

  if (courseEnrollment && isRejectedOrRevoked(courseEnrollment)) {
    return {
      ...base,
      canEnroll: false,
      canSwitch: false,
      canUpgrade: false,
      buttonState: ENROLLMENT_BUTTON_STATE.CONTACT_SUPPORT,
      requiresSwitchConfirmation: false,
    };
  }

  if (activeEntitlement && Number(activeEntitlement.courseId) === Number(targetCourseId)) {
    if (isPaymentPending(courseEnrollment) && !isActiveAccess(courseEnrollment)) {
      return {
        ...base,
        canEnroll: false,
        canSwitch: false,
        canUpgrade: false,
        buttonState: ENROLLMENT_BUTTON_STATE.PAYMENT_PENDING,
        requiresSwitchConfirmation: false,
      };
    }
    return {
      ...base,
      canEnroll: false,
      canSwitch: false,
      canUpgrade: false,
      buttonState: ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING,
      requiresSwitchConfirmation: false,
    };
  }

  if (courseEnrollment && isPaymentPending(courseEnrollment)) {
    return {
      ...base,
      canEnroll: false,
      canSwitch: false,
      canUpgrade: false,
      buttonState: ENROLLMENT_BUTTON_STATE.PAYMENT_PENDING,
      requiresSwitchConfirmation: false,
    };
  }

  if (!admissionsOpen) {
    return {
      ...base,
      canEnroll: false,
      canSwitch: false,
      canUpgrade: false,
      buttonState: ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED,
      requiresSwitchConfirmation: false,
    };
  }

  if (!seatsAvailable) {
    return {
      ...base,
      canEnroll: false,
      canSwitch: false,
      canUpgrade: false,
      buttonState: ENROLLMENT_BUTTON_STATE.SEATS_FILLED,
      requiresSwitchConfirmation: false,
    };
  }

  if (
    activeEntitlement &&
    activeEnrollmentType === 'premium' &&
    targetEnrollmentType === 'free' &&
    Number(activeEntitlement.courseId) !== Number(targetCourseId)
  ) {
    return {
      ...base,
      canEnroll: false,
      canSwitch: false,
      canUpgrade: false,
      buttonState: ENROLLMENT_BUTTON_STATE.PREMIUM_BLOCKS_FREE,
      requiresSwitchConfirmation: false,
    };
  }

  if (!activeEntitlement) {
    return {
      ...base,
      canEnroll: true,
      canSwitch: false,
      canUpgrade: targetEnrollmentType === 'premium',
      buttonState: ENROLLMENT_BUTTON_STATE.ENROLL_NOW,
      requiresSwitchConfirmation: false,
    };
  }

  const isUpgrade =
    activeEnrollmentType === 'free' && targetEnrollmentType === 'premium';
  const isSwitch = !isUpgrade;

  return {
    ...base,
    canEnroll: false,
    canSwitch: isSwitch,
    canUpgrade: isUpgrade,
    buttonState: isUpgrade
      ? ENROLLMENT_BUTTON_STATE.UPGRADE_COURSE
      : ENROLLMENT_BUTTON_STATE.SWITCH_COURSE,
    requiresSwitchConfirmation: true,
  };
}

/**
 * Load authoritative enrollment state for user viewing a course.
 * @param {number} userId
 * @param {number} courseId
 * @returns {Promise<EnrollmentStateResult>}
 */
export async function resolveEnrollmentStateForCourse(userId, courseId) {
  const uid = normalizePositiveInt(userId, 'user_id');
  const cid = normalizePositiveInt(courseId, 'course_id');

  const courseRow = await getCourseRowById(cid);
  if (!courseRow) {
    throw new Error(`Course ${cid} not found`);
  }

  const admissionStatus = String(courseRow.admission_status || ADMISSION_STATUS.CLOSED).toUpperCase();
  const admissionsOpen = admissionStatus === ADMISSION_STATUS.OPEN;

  const { pricingCategory } = await assertCoursePricingValid(cid);
  const targetEnrollmentType = mapPricingCategoryToType(pricingCategory);

  let activeEntitlement = null;
  try {
    activeEntitlement = await resolveActiveEntitlement(uid);
  } catch (error) {
    if (!(error instanceof MultipleActiveEnrollmentsError)) {
      throw error;
    }
  }

  const courseEnrollmentRow = await loadCourseEnrollmentRow(null, uid, cid);
  const courseEnrollment = mapCourseEnrollmentDto(courseEnrollmentRow);

  const seatSnapshot = await loadBatchSeatSnapshot(cid);
  const hasActiveAccessToCourse =
    activeEntitlement && Number(activeEntitlement.courseId) === cid;
  const hasPendingEnrollment =
    courseEnrollment && isPaymentPending(courseEnrollment) && !isActiveAccess(courseEnrollment);
  const seatsAvailable =
    hasActiveAccessToCourse ||
    hasPendingEnrollment ||
    !seatSnapshot ||
    seatSnapshot.totalSeats <= 0 ||
    Number(seatSnapshot.seatsRemaining) > 0;

  let activeCourseName = null;
  let activeEnrollmentType = null;

  if (activeEntitlement) {
    const [courseRows] = await mysqlPool.query(
      `SELECT title, enrollment_source FROM courses c
       LEFT JOIN enrollments e ON e.course_id = c.id AND e.user_id = ? AND e.access_status = 'active'
       WHERE c.id = ? LIMIT 1`,
      [uid, activeEntitlement.courseId]
    );
    activeCourseName = courseRows[0]?.title ?? null;
    activeEnrollmentType =
      mapEnrollmentSourceToType(courseRows[0]?.enrollment_source) ??
      mapEnrollmentSourceToType(activeEntitlement.enrollmentSource);
  }

  return resolveEnrollmentButtonState({
    targetCourseId: cid,
    targetEnrollmentType,
    activeEntitlement,
    activeCourseName,
    activeEnrollmentType,
    courseEnrollment,
    admissionsOpen,
    seatsAvailable,
  });
}

/**
 * Assert enrollment action is permitted before mutating state.
 * @param {object} options
 * @param {number} options.userId
 * @param {number} options.courseId
 * @param {boolean} [options.confirmSwitch=false]
 * @param {boolean} [options.isActivation=false] — true when about to activate access
 */
export async function assertEnrollmentActionAllowed(options) {
  const uid = normalizePositiveInt(options.userId, 'user_id');
  const cid = normalizePositiveInt(options.courseId, 'course_id');
  const confirmSwitch = options.confirmSwitch === true;

  const state = await resolveEnrollmentStateForCourse(uid, cid);

  if (state.buttonState === ENROLLMENT_BUTTON_STATE.ADMISSIONS_CLOSED) {
    throw new EnrollmentClosedError({
      userId: uid,
      courseId: cid,
    });
  }

  if (state.buttonState === ENROLLMENT_BUTTON_STATE.SEATS_FILLED) {
    throw new CourseFullError({
      userId: uid,
      courseId: cid,
    });
  }

  if (state.buttonState === ENROLLMENT_BUTTON_STATE.PREMIUM_BLOCKS_FREE) {
    throw new PremiumAccessProtectedError({
      userId: uid,
      courseId: cid,
      reason: 'premium_blocks_free_enrollment',
    });
  }

  if (state.buttonState === ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING) {
    throw new DuplicateActiveEnrollmentError({
      userId: uid,
      courseId: cid,
      enrollmentId: state.courseEnrollment?.id ?? null,
    });
  }

  if (state.buttonState === ENROLLMENT_BUTTON_STATE.CONTACT_SUPPORT) {
    throw new PremiumAccessProtectedError({
      userId: uid,
      courseId: cid,
      reason: 'enrollment_rejected_or_revoked',
    });
  }

  if (
    state.requiresSwitchConfirmation &&
    options.isActivation &&
    !confirmSwitch
  ) {
    if (
      state.enrollmentType === 'premium' &&
      state.targetEnrollmentType === 'free'
    ) {
      throw new PremiumAccessProtectedError({
        userId: uid,
        courseId: cid,
        enrolledCourseId: state.enrolledCourseId,
        reason: 'free_cannot_replace_premium_without_confirmation',
      });
    }
    throw new EnrollmentSwitchConfirmationRequiredError({
      userId: uid,
      courseId: cid,
      enrolledCourseId: state.enrolledCourseId,
      buttonState: state.buttonState,
    });
  }

  if (state.requiresSwitchConfirmation && !confirmSwitch && options.isActivation === false) {
    // Creating enrollment row for switch/payment is OK; activation still gated separately.
    return state;
  }

  return state;
}

/**
 * Persist explicit switch confirmation on the target enrollment row (survives payment webhook).
 * @param {import('mysql2/promise').PoolConnection|null} connection
 * @param {number} enrollmentId
 */
export async function markEnrollmentSwitchConfirmed(connection, enrollmentId) {
  const eid = normalizePositiveInt(enrollmentId, 'enrollment_id');
  const sql = `UPDATE enrollments
               SET switch_confirmed_at = COALESCE(switch_confirmed_at, CURRENT_TIMESTAMP),
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?`;
  if (connection) {
    await connection.query(sql, [eid]);
  } else {
    await mysqlPool.query(sql, [eid]);
  }
}

/**
 * Gate activation inside lifecycle — prevents silent course replacement.
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {object} options
 * @param {number} options.userId
 * @param {number} options.enrollmentId
 * @param {number} options.courseId
 * @param {'free'|'paid'|null} options.enrollmentSource
 * @param {boolean} [options.confirmSwitch=false]
 */
export async function assertActivationSwitchAllowed(connection, options) {
  const confirmSwitch = options.confirmSwitch === true;
  const uid = normalizePositiveInt(options.userId, 'user_id');
  const cid = normalizePositiveInt(options.courseId, 'course_id');
  const enrollmentId = normalizePositiveInt(options.enrollmentId, 'enrollment_id');

  const [targetRows] = await connection.query(
    `SELECT id, course_id, switch_confirmed_at
     FROM enrollments
     WHERE id = ? AND user_id = ?
     FOR UPDATE`,
    [enrollmentId, uid]
  );
  const targetRow = targetRows[0];
  if (!targetRow) {
    throw new DuplicateActiveEnrollmentError({ userId: uid, courseId: cid, enrollmentId });
  }

  const hasStoredConfirmation = targetRow.switch_confirmed_at != null;
  const confirmed = confirmSwitch || hasStoredConfirmation;

  const [activeRows] = await connection.query(
    `SELECT id, course_id, enrollment_source, access_status
     FROM enrollments
     WHERE user_id = ? AND access_status = 'active'
     FOR UPDATE`,
    [uid]
  );

  const otherActive = activeRows.filter(
    (row) => Number(row.id) !== enrollmentId && Number(row.course_id) !== cid
  );

  if (otherActive.length === 0) {
    return;
  }

  const activeRow = otherActive[0];
  const activeType = mapEnrollmentSourceToType(activeRow.enrollment_source);
  const targetType = mapEnrollmentSourceToType(options.enrollmentSource);

  if (activeType === 'premium' && targetType === 'free') {
    throw new PremiumAccessProtectedError({
      userId: uid,
      courseId: cid,
      reason: 'premium_blocks_free_enrollment',
    });
  }

  if (!confirmed) {
    throw new EnrollmentSwitchConfirmationRequiredError({
      userId: uid,
      courseId: cid,
      enrolledCourseId: Number(activeRow.course_id),
      buttonState:
        activeType === 'free' && targetType === 'premium'
          ? ENROLLMENT_BUTTON_STATE.UPGRADE_COURSE
          : ENROLLMENT_BUTTON_STATE.SWITCH_COURSE,
    });
  }
}

/**
 * Shape enrollment state for API responses (public fields only).
 * @param {EnrollmentStateResult} state
 */
export function toEnrollmentStateResponse(state) {
  return {
    enrolledCourseId: state.enrolledCourseId,
    enrolledCourseName: state.enrolledCourseName,
    enrollmentType: state.enrollmentType,
    canEnroll: state.canEnroll,
    canSwitch: state.canSwitch,
    canUpgrade: state.canUpgrade,
    buttonState: state.buttonState,
    requiresSwitchConfirmation: state.requiresSwitchConfirmation,
    targetCourseId: state.targetCourseId,
    targetEnrollmentType: state.targetEnrollmentType,
    enrollmentId: state.courseEnrollment?.id ?? null,
    orderId: state.courseEnrollment?.orderId ?? null,
  };
}
