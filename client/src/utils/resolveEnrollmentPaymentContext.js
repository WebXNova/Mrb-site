import { enrollmentApi } from '../api/enrollmentApi.js';
import { ENROLLMENT_BUTTON_STATE } from '../course/courseEnrollmentCta.js';
import { parseEnrollmentPaymentSearch } from './enrollmentPaymentRoute.js';

function isPendingPaymentEnrollment(row) {
  if (!row) return false;
  const access = String(row.accessStatus || '').toLowerCase();
  if (access === 'active') return false;
  const orderStatus = String(row.orderStatus || '').toLowerCase();
  return (orderStatus === 'pending' || orderStatus === 'created') && row.orderId != null;
}

/**
 * Resolve order/course context for /enrollment/payment without relying on navigation state.
 * Uses URL query params first, then authenticated enrollment APIs.
 *
 * @returns {Promise<
 *   | { kind: 'ready', orderId: number, enrollmentId: number|null, courseId: number|null }
 *   | { kind: 'already_active', courseId: number|null }
 *   | { kind: 'missing' }
 * >}
 */
export async function resolveEnrollmentPaymentContext({ searchParams, locationState }) {
  const fromUrl = parseEnrollmentPaymentSearch(searchParams);
  let orderId = fromUrl.orderId;
  let courseId = fromUrl.courseId;
  let enrollmentId = locationState?.enrollmentId ?? null;

  if (!orderId && locationState?.orderId != null) {
    orderId = Number(locationState.orderId);
    courseId = courseId ?? (locationState.courseId != null ? Number(locationState.courseId) : null);
    enrollmentId = enrollmentId ?? locationState.enrollmentId ?? null;
  }

  if (orderId) {
    return {
      kind: 'ready',
      orderId,
      enrollmentId: enrollmentId != null ? Number(enrollmentId) : null,
      courseId: courseId != null ? Number(courseId) : null,
    };
  }

  if (courseId) {
    const stateRes = await enrollmentApi.getState(courseId);
    const state = stateRes?.data;
    if (state?.buttonState === ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING) {
      return { kind: 'already_active', courseId };
    }
    if (state?.buttonState === ENROLLMENT_BUTTON_STATE.PAYMENT_PENDING && state.orderId) {
      return {
        kind: 'ready',
        orderId: Number(state.orderId),
        enrollmentId: state.enrollmentId != null ? Number(state.enrollmentId) : null,
        courseId,
      };
    }
  }

  const listRes = await enrollmentApi.listMine();
  const enrollments = listRes?.data?.enrollments ?? [];
  const pending = enrollments.find(isPendingPaymentEnrollment);
  if (pending?.orderId) {
    return {
      kind: 'ready',
      orderId: Number(pending.orderId),
      enrollmentId: pending.id != null ? Number(pending.id) : null,
      courseId: pending.courseId != null ? Number(pending.courseId) : null,
    };
  }

  const active = enrollments.find((row) => String(row.accessStatus || '').toLowerCase() === 'active');
  if (active) {
    return { kind: 'already_active', courseId: active.courseId ?? null };
  }

  return { kind: 'missing' };
}
