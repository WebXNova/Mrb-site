import { request } from './requestClient.js';

function studentRequest(path, options = {}) {
  return request(path, { ...options, authScope: 'student' });
}

export const paymentsApi = {
  createSession: ({ enrollmentId, courseId }) =>
    studentRequest('/payments/create-session', {
      method: 'POST',
      body: {
        enrollment_id: enrollmentId,
        course_id: courseId,
      },
    }),

  getManualCheckoutInfo: (orderId) =>
    studentRequest(`/payments/manual/checkout-info?order_id=${encodeURIComponent(orderId)}`),

  getManualStatus: (orderId) => studentRequest(`/payments/manual/${encodeURIComponent(orderId)}/status`),

  validateManualPaymentCoupon: (orderId, code) =>
    studentRequest('/payments/manual/validate-coupon', {
      method: 'POST',
      body: {
        order_id: orderId,
        code,
      },
    }),

  submitManualPayment: (orderId, formData) =>
    studentRequest(`/payments/manual/${encodeURIComponent(orderId)}/submit`, {
      method: 'POST',
      body: formData,
      timeoutMs: 60_000,
    }),
};
