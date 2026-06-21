import { mysqlPool } from '../config/mysql.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from './activityLog.service.js';
import { activateEnrollmentInTransaction } from './enrollmentLifecycle.service.js';
import {
  createSafepayHostedCheckoutSession,
  extractSafepayTokenFromWebhook,
  extractSafepayTransactionIdFromWebhook,
  verifySafepayWebhookSignature,
} from './safepay.service.js';
import {
  classifySafepayWebhookEvent,
  logSafepayWebhookEventDecision,
} from './safepayWebhookEventValidation.js';
import {
  logSettlementVerification,
  verifyWebhookSettlementAgainstOrder,
} from './safepayWebhookSettlement.js';
import { evaluatePaymentFulfillmentEligibility } from './paymentFulfillmentGate.service.js';
import {
  attachSafepaySessionToOrder,
  bindEnrollmentToCheckoutOrder,
  cancelSupersededPendingOrdersForEnrollment,
  insertPendingCheckoutOrder,
  lockEnrollmentByIdForFulfillment,
  lockEnrollmentForCheckout,
  markOrderFailedFromPending,
  markOrderPaidFromPending,
} from './orderCheckoutIntegrity.service.js';
import { assertPaymentSessionEligible } from './paymentEligibility.service.js';
import { isTerminalNonPayableOrderStatus } from './orderStateMachine.service.js';
import { assertPaidCheckoutAllowedForCourse } from './coursePricingGate.service.js';
import { ENROLLMENT_SOURCE } from '../constants/enrollmentSource.js';
import {
  logPaymentSecurityEvent,
  PAYMENT_SECURITY_EVENTS,
} from './paymentSecurityEvents.js';

const WEBHOOK_PAYLOAD_JSON_MAX_CHARS = 500_000;

function safeWebhookPayloadJson(payload) {
  try {
    const s = JSON.stringify(payload ?? {});
    if (s.length > WEBHOOK_PAYLOAD_JSON_MAX_CHARS) {
      return JSON.stringify({
        truncated: true,
        maxChars: WEBHOOK_PAYLOAD_JSON_MAX_CHARS,
        type: payload?.type ?? payload?.event ?? null,
      });
    }
    return s;
  } catch {
    return JSON.stringify({ error: 'webhook_payload_stringify_failed' });
  }
}

function shouldLogWebhookVerbose() {
  return env.nodeEnv !== 'production' || String(process.env.SAFEPAY_DEBUG || '').trim().toLowerCase() === 'true';
}

/** Always-on transaction / durability trace (rollback investigations). */
function logWebhookTx(phase, detail = undefined) {
  const prefix = '[payments.webhook.tx]';
  if (detail !== undefined) console.log(prefix, phase, detail);
  else console.log(prefix, phase);
}

function logWebhookVerbose(step, detail) {
  if (!shouldLogWebhookVerbose()) return;
  if (detail !== undefined) console.log(`[payments.webhook] ${step}`, detail);
  else console.log(`[payments.webhook] ${step}`);
}

/** @param {import('mysql2').ResultSetHeader | unknown} meta */
function summarizeResult(meta) {
  const m = meta && typeof meta === 'object' ? meta : {};
  return {
    affectedRows: Number(m.affectedRows ?? 0),
    insertId: Number(m.insertId ?? 0),
    warningStatus: Number(m.warningStatus ?? m.warningCount ?? 0),
  };
}

void summarizeResult;

function normalizePositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(400, `${label} must be a valid positive integer`);
  }
  return n;
}

async function getActiveCourseWithPricing(courseId) {
  const cid = normalizePositiveInt(courseId, 'course_id');
  const [rows] = await mysqlPool.query(
    `SELECT c.id, c.title, c.is_active AS course_active, cp.price_amount AS price
     FROM courses c
     INNER JOIN course_pricing cp ON cp.course_id = c.id
     WHERE c.id = ?
       AND cp.is_active = 1
     ORDER BY cp.created_at DESC
     LIMIT 1`,
    [cid]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.course_active === 0 || row.course_active === false) return null;
  return { id: row.id, title: row.title, price: row.price };
}

/** @param {unknown} payload */
function parseWebhookMetadataOrderId(payload) {
  const raw =
    payload?.data?.metadata?.order_id ??
    payload?.data?.metadata?.orderId ??
    payload?.metadata?.order_id ??
    payload?.metadata?.orderId;
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Webhook order resolution: metadata.order_id (ordering preference) OR tracker on safepay_token / safepay_tracker.
 */
async function findOrderForSafepayWebhook(payload, trackerToken) {
  const token = String(trackerToken || '').trim();
  const metaOrderId = parseWebhookMetadataOrderId(payload);
  const idForOr = metaOrderId ?? 0;

  if (!token && metaOrderId == null) {
    return null;
  }

  if (!token && metaOrderId != null) {
    const [rows] = await mysqlPool.query(
      `SELECT id, user_id, course_id, enrollment_id, status, safepay_token, safepay_tracker
       FROM orders
       WHERE id = ?
       LIMIT 1`,
      [metaOrderId]
    );
    return rows[0] || null;
  }

  const preferId = metaOrderId ?? 0;
  const [rows] = await mysqlPool.query(
    `SELECT id, user_id, course_id, enrollment_id, status, safepay_token, safepay_tracker
     FROM orders
     WHERE id = ? OR safepay_token = ? OR safepay_tracker = ?
     ORDER BY FIELD(id, ?) DESC
     LIMIT 1`,
    [idForOr, token, token, preferId]
  );
  return rows[0] || null;
}

/**
 * Create Safepay checkout for an existing enrollment row.
 * Admission gating runs at enrollment creation — not repeated here so in-flight checkouts succeed.
 *
 * @param {{ userId: number, enrollmentId: number, courseId: number }}
 */
export async function createPaymentSession({ userId, enrollmentId, courseId }) {
  const eid = normalizePositiveInt(enrollmentId, 'enrollment_id');
  const uid = normalizePositiveInt(userId, 'user_id');
  const cid = normalizePositiveInt(courseId, 'course_id');

  await assertPaidCheckoutAllowedForCourse(cid);

  const course = await getActiveCourseWithPricing(cid);
  if (!course) {
    throw new ApiError(404, 'Course not found or not available');
  }

  const amount = Number(course.price);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, 'Course price is not configured for payment', {
      code: 'PAYMENT_PRICE_NOT_CONFIGURED',
    });
  }

  const connection = await mysqlPool.getConnection();
  let orderId;
  let enrollmentRow;

  try {
    await connection.beginTransaction();

    enrollmentRow = await lockEnrollmentForCheckout(connection, eid, uid);
    if (Number(enrollmentRow.course_id) !== cid) {
      throw new ApiError(400, 'Course does not match enrollment');
    }

    await assertPaymentSessionEligible(connection, enrollmentRow);

    const supersededCount = await cancelSupersededPendingOrdersForEnrollment(connection, eid);
    if (supersededCount > 0) {
      logWebhookVerbose('superseded pending orders cancelled', {
        enrollmentId: eid,
        supersededCount,
      });
    }

    orderId = await insertPendingCheckoutOrder(connection, {
      userId: uid,
      courseId: cid,
      enrollmentId: eid,
      amount,
      currency: 'PKR',
    });

    await bindEnrollmentToCheckoutOrder(connection, eid, orderId);

    await connection.commit();
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

  let session;
  try {
    session = await createSafepayHostedCheckoutSession({
      amount,
      currency: 'PKR',
      orderId,
      enrollmentId: eid,
      courseId: cid,
    });
  } catch (error) {
    const cleanup = await mysqlPool.getConnection();
    try {
      await cleanup.beginTransaction();
      await cancelSupersededPendingOrdersForEnrollment(cleanup, eid);
      await cleanup.query(
        `UPDATE orders
         SET status = 'cancelled',
             cancellation_reason = 'session_setup_failed',
             cancelled_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'`,
        [orderId]
      );
      await cleanup.commit();
    } catch {
      try {
        await cleanup.rollback();
      } catch {
        /* ignore */
      }
    } finally {
      cleanup.release();
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'Safepay session creation failed');
  }

  const tokenConnection = await mysqlPool.getConnection();
  try {
    await tokenConnection.beginTransaction();
    await attachSafepaySessionToOrder(tokenConnection, orderId, session.token, session.tracker);
    await tokenConnection.commit();
  } catch (error) {
    try {
      await tokenConnection.rollback();
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    tokenConnection.release();
  }

  return {
    orderId,
    enrollmentId: eid,
    courseId: cid,
    amount,
    currency: 'PKR',
    checkoutUrl: session.checkoutUrl,
  };
}

/**
 * Fulfillment pipeline after HMAC verification succeeded (caller must verify first unless using
 * {@link processSafepayWebhook}).
 *
 * @param {{ payload: object, requestId?: string|null }}
 */
export async function fulfillSafepayWebhookVerified({ payload, requestId = null }) {
  try {
  const eventClassification = classifySafepayWebhookEvent(payload);

  if (eventClassification.outcome === 'rejected') {
    logSafepayWebhookEventDecision(eventClassification, { requestId });
    throw new ApiError(400, 'Invalid webhook payload', {
      code: 'WEBHOOK_PAYLOAD_REJECTED',
      reason: eventClassification.reason,
    });
  }

  const extractedToken = extractSafepayTokenFromWebhook(payload);
  const metadataOrderId = parseWebhookMetadataOrderId(payload);

  if (!extractedToken && metadataOrderId == null) {
    throw new ApiError(400, 'Missing payment tracker token and metadata.order_id in webhook');
  }

  const order = await findOrderForSafepayWebhook(payload, extractedToken);
  logWebhookVerbose('order resolved', { orderId: order?.id });

  if (!order) {
    throw new ApiError(404, 'Order not found');
  }

  logSafepayWebhookEventDecision(eventClassification, {
    orderId: order.id,
    enrollmentId: order.enrollment_id ?? null,
    requestId,
  });

  if (order.status === 'paid') {
    logWebhookTx('idempotent short-circuit (pool read: already paid)', { orderId: order.id });
    return { ok: true, duplicate: true, orderId: order.id };
  }

  if (
    eventClassification.outcome === 'success' &&
    isTerminalNonPayableOrderStatus(order.status)
  ) {
    logPaymentSecurityEvent(PAYMENT_SECURITY_EVENTS.STALE_ORDER_PAYMENT_ATTEMPT, {
      orderId: order.id,
      orderStatus: order.status,
      enrollmentId: order.enrollment_id ?? null,
      requestId,
      stage: 'pool_read',
    });
    logWebhookTx('stale order payment blocked (pool read)', {
      orderId: order.id,
      status: order.status,
    });
    return {
      ok: true,
      ignored: true,
      staleOrder: true,
      orderId: order.id,
      reason: `order_status_${order.status}`,
    };
  }

  if (eventClassification.outcome === 'ignored') {
    logWebhookTx('ignored event — no state change', {
      orderId: order.id,
      reason: eventClassification.reason,
    });
    return {
      ok: true,
      ignored: true,
      orderId: order.id,
      reason: eventClassification.reason,
    };
  }

  if (eventClassification.outcome === 'failure') {
    const connection = await mysqlPool.getConnection();
    logWebhookTx('FAIL path: before beginTransaction');
    try {
      await connection.beginTransaction();
      logWebhookTx('FAIL path: after beginTransaction');
      const affected = await markOrderFailedFromPending(connection, order.id);
      logWebhookTx('FAIL path: UPDATE orders', { affectedRows: affected });
      await connection.commit();
      logWebhookTx('FAIL path: after COMMIT');
    } catch (error) {
      logWebhookTx('FAIL path: ROLLBACK catch', { message: error?.message, code: error?.code });
      try {
        await connection.rollback();
      } catch {
        /* ignore */
      }
      throw error;
    } finally {
      connection.release();
    }
    return { ok: true, orderId: order.id, status: 'failed' };
  }

  if (eventClassification.outcome !== 'success') {
    logWebhookTx('fail-closed gate — fulfillment blocked', {
      orderId: order.id,
      outcome: eventClassification.outcome,
      reason: eventClassification.reason,
    });
    return {
      ok: true,
      ignored: true,
      orderId: order.id,
      reason: eventClassification.reason,
    };
  }

  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const [lockedRows] = await connection.query(
      `SELECT id, user_id, course_id, enrollment_id, status, amount, currency,
              safepay_token, safepay_tracker
       FROM orders WHERE id = ? FOR UPDATE`,
      [order.id]
    );
    const locked = lockedRows[0];
    if (!locked) {
      throw new ApiError(404, 'Order not found');
    }

    if (locked.status === 'paid') {
      await connection.commit();
      logWebhookTx('idempotent: already paid (FOR UPDATE)', { orderId: order.id });
      return { ok: true, duplicate: true, orderId: order.id };
    }

    const enrollmentId = Number(locked.enrollment_id);
    if (!enrollmentId) {
      throw new ApiError(409, 'Order has no enrollment linked');
    }

    const enrollmentRow = await lockEnrollmentByIdForFulfillment(connection, enrollmentId);
    if (!enrollmentRow) {
      throw new ApiError(404, 'Enrollment not found');
    }
    if (Number(enrollmentRow.user_id) !== Number(locked.user_id)) {
      throw new ApiError(409, 'Enrollment does not belong to order user');
    }
    if (Number(enrollmentRow.course_id) !== Number(locked.course_id)) {
      throw new ApiError(409, 'Enrollment course does not match order');
    }

    const settlement = verifyWebhookSettlementAgainstOrder(locked, payload);
    logSettlementVerification(settlement, { orderId: locked.id, requestId });

    const eligibility = evaluatePaymentFulfillmentEligibility({
      order: locked,
      enrollment: enrollmentRow,
      settlementOk: settlement.ok,
    });

    if (!eligibility.eligible) {
      if (eligibility.securityEvent) {
        logPaymentSecurityEvent(eligibility.securityEvent, {
          orderId: locked.id,
          enrollmentId,
          enrollmentOrderId: enrollmentRow.order_id ?? null,
          orderStatus: locked.status,
          requestId,
          reason: eligibility.reason,
          stage: 'fulfillment_gate',
        });
      }
      await connection.commit();
      logWebhookTx('fulfillment gate rejected', {
        orderId: order.id,
        reason: eligibility.reason,
        action: eligibility.action,
      });
      return {
        ok: true,
        ignored: true,
        orderId: order.id,
        reason: eligibility.reason,
        action: eligibility.action,
        ...(eligibility.action === 'stale_order' || eligibility.action === 'not_current_order'
          ? { staleOrder: true }
          : {}),
        ...(eligibility.action === 'settlement_rejected'
          ? { settlementRejected: true, code: settlement.code }
          : {}),
      };
    }

    const transactionIdExtracted = extractSafepayTransactionIdFromWebhook(payload);
    const rawTracker = String(
      extractedToken ||
        (typeof payload?.data?.tracker === 'string' ? payload.data.tracker : '') ||
        locked.safepay_token ||
        ''
    ).trim();
    const gatewayRefForDb = rawTracker.length > 0 ? rawTracker.slice(0, 120) : null;
    const txnIdRaw =
      transactionIdExtracted && String(transactionIdExtracted).trim()
        ? String(transactionIdExtracted).trim()
        : '';
    const safepayTxnForDb = txnIdRaw.length > 0 ? txnIdRaw.slice(0, 255) : gatewayRefForDb;
    const payloadJsonStr = safeWebhookPayloadJson(payload);

    const affected = await markOrderPaidFromPending(connection, {
      orderId: order.id,
      gatewayRefForDb,
      safepayTxnForDb,
      rawTrackerSlice: rawTracker.length > 0 ? rawTracker.slice(0, 255) : '',
      payloadJsonStr,
    });

    if (affected === 0) {
      await connection.commit();
      if (isTerminalNonPayableOrderStatus(locked.status)) {
        logPaymentSecurityEvent(PAYMENT_SECURITY_EVENTS.STALE_ORDER_PAYMENT_ATTEMPT, {
          orderId: order.id,
          orderStatus: locked.status,
          enrollmentId,
          requestId,
          stage: 'paid_update_zero_rows',
        });
        return {
          ok: true,
          ignored: true,
          staleOrder: true,
          orderId: order.id,
          reason: `order_status_${locked.status}`,
        };
      }
      logWebhookTx('idempotent: paid UPDATE affected 0', { orderId: order.id });
      return { ok: true, duplicate: true, orderId: order.id };
    }

    await activateEnrollmentInTransaction(connection, {
      enrollmentId,
      orderId: order.id,
      actor: 'payment.webhook',
      reason: 'safepay_paid',
      requirePaidOrder: true,
      enrollmentSource: ENROLLMENT_SOURCE.PAID,
    });

    await connection.commit();
    logWebhookTx('paid + enrollment committed', { orderId: order.id, enrollmentId });

    void logActivity({
      userId: locked.user_id,
      role: 'system',
      action: 'payment.webhook.paid',
      entityType: 'order',
      entityId: String(order.id),
      metadata: {
        courseId: locked.course_id,
        enrollmentId,
        gatewayRef: gatewayRefForDb,
        transactionId: safepayTxnForDb,
      },
    });

    logWebhookVerbose('payment recorded', { orderId: order.id, enrollmentId });
    return { ok: true, orderId: order.id, status: 'paid', enrollmentId };
  } catch (err) {
    logWebhookTx('paid path error', { message: err?.message, code: err?.code });
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    connection.release();
  }
  } catch (err) {
    if (!(err instanceof ApiError)) {
      console.error('[fulfillSafepayWebhookVerified] === CRASH ===');
      console.error('NAME:', err?.name);
      console.error('MESSAGE:', err?.message);
      console.error('STACK:', err?.stack);
      console.error('FULL ERROR:', err);
    }
    throw err;
  }
}

/**
 * Safepay webhook: verify (Buffer-only), then resolve order — idempotent paid + enrollment activation.
 * Prefer the controller pattern: verify once → optional Redis replay short-circuit → {@link fulfillSafepayWebhookVerified}.
 *
 * @param {{ rawBodyBuffer: Buffer, headers: Record<string, string>, payload: object }}
 */
export async function processSafepayWebhook({ rawBodyBuffer, headers, payload }) {
  try {
    logWebhookVerbose('verify signature');

    const verifyResult = verifySafepayWebhookSignature({
      rawBodyBuffer,
      headers,
      payload,
    });

    if (!verifyResult.ok) {
      console.error('[WEBHOOK] verification rejected', JSON.stringify(verifyResult));
      if (verifyResult.branch === 'missing_x_sfpy_timestamp' || verifyResult.branch === 'invalid_timestamp') {
        throw new ApiError(400, 'Invalid webhook timestamp', verifyResult);
      }
      if (verifyResult.branch === 'invalid_utf8_body') {
        throw new ApiError(400, 'Invalid webhook encoding', verifyResult);
      }
      if (verifyResult.branch === 'timestamp_outside_skew') {
        throw new ApiError(401, 'Webhook timestamp outside allowed window', verifyResult);
      }
      if (verifyResult.branch === 'verification_threw') {
        throw new ApiError(500, 'Webhook verification crashed', verifyResult);
      }
      throw new ApiError(401, 'Invalid webhook signature', verifyResult);
    }

    logWebhookVerbose('verification ok', { branch: verifyResult.branch });

    return await fulfillSafepayWebhookVerified({ payload });
  } catch (err) {
    if (!(err instanceof ApiError)) {
      console.error('[processSafepayWebhook] === CRASH ===');
      console.error('NAME:', err?.name);
      console.error('MESSAGE:', err?.message);
      console.error('STACK:', err?.stack);
      console.error('FULL ERROR:', err);
    }
    throw err;
  }
}
