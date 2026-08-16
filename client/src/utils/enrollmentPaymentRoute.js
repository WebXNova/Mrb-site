/**
 * Manual payment page URL helpers — order context must live in the query string
 * so refresh / new tab / return visits work without React Router location.state.
 */

export function buildEnrollmentPaymentPath({ orderId, courseId } = {}) {
  const params = new URLSearchParams();
  const oid = Number(orderId);
  const cid = Number(courseId);
  if (Number.isInteger(oid) && oid > 0) params.set('order_id', String(oid));
  if (Number.isInteger(cid) && cid > 0) params.set('course_id', String(cid));
  const query = params.toString();
  return query ? `/enrollment/payment?${query}` : '/enrollment/payment';
}

export function parseEnrollmentPaymentSearch(searchParams) {
  const orderRaw = searchParams.get('order_id') ?? searchParams.get('orderId');
  const courseRaw = searchParams.get('course_id') ?? searchParams.get('courseId');
  const orderId = orderRaw != null && String(orderRaw).trim() !== '' ? Number(orderRaw) : null;
  const courseId = courseRaw != null && String(courseRaw).trim() !== '' ? Number(courseRaw) : null;
  return {
    orderId: Number.isInteger(orderId) && orderId > 0 ? orderId : null,
    courseId: Number.isInteger(courseId) && courseId > 0 ? courseId : null,
  };
}
