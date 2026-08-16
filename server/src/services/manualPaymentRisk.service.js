/**
 * Pure risk-flag computation for manual payment submissions.
 * Student-facing serializers live here so tests can prove no intelligence leak.
 */

export const MANUAL_PAYMENT_RISK_FLAGS = Object.freeze({
  DUPLICATE_TRANSACTION_ID_PENDING: 'duplicate_transaction_id_pending',
  DUPLICATE_SCREENSHOT_HASH: 'duplicate_screenshot_hash',
  DUPLICATE_SCREENSHOT_DIFFERENT_STUDENT: 'duplicate_screenshot_different_student',
  AMOUNT_MISMATCH: 'amount_mismatch',
  HIGH_VELOCITY: 'high_velocity',
  SENDER_NUMBER_CHANGED: 'sender_number_changed',
});

/**
 * @param {{
 *   studentId: number,
 *   amountClaimed: number,
 *   expectedAmount: number,
 *   pendingTrxMatches: Array<{ studentId: number }>,
 *   screenshotMatches: Array<{ studentId: number, status: string }>,
 *   recentDifferentTrxCount: number,
 *   priorSenderNumbers: string[],
 *   senderPhone: string,
 * }} input
 * @returns {{ flags: string[], riskLevel: 'low'|'needs_review' }}
 */
export function computeManualPaymentRisk(input) {
  const flags = [];
  const studentId = Number(input.studentId);

  if (Array.isArray(input.pendingTrxMatches) && input.pendingTrxMatches.length > 0) {
    flags.push(MANUAL_PAYMENT_RISK_FLAGS.DUPLICATE_TRANSACTION_ID_PENDING);
  }

  const liveScreenshots = (input.screenshotMatches || []).filter(
    (row) => String(row.status) !== 'rejected'
  );
  if (liveScreenshots.length > 0) {
    flags.push(MANUAL_PAYMENT_RISK_FLAGS.DUPLICATE_SCREENSHOT_HASH);
    if (liveScreenshots.some((row) => Number(row.studentId) !== studentId)) {
      flags.push(MANUAL_PAYMENT_RISK_FLAGS.DUPLICATE_SCREENSHOT_DIFFERENT_STUDENT);
    }
  }

  if (Number(input.amountClaimed) !== Number(input.expectedAmount)) {
    flags.push(MANUAL_PAYMENT_RISK_FLAGS.AMOUNT_MISMATCH);
  }

  if (Number(input.recentDifferentTrxCount) >= 1) {
    flags.push(MANUAL_PAYMENT_RISK_FLAGS.HIGH_VELOCITY);
  }

  const prior = (input.priorSenderNumbers || []).filter(Boolean);
  if (prior.length > 0 && !prior.includes(input.senderPhone)) {
    flags.push(MANUAL_PAYMENT_RISK_FLAGS.SENDER_NUMBER_CHANGED);
  }

  return {
    flags,
    riskLevel: flags.length > 0 ? 'needs_review' : 'low',
  };
}

/**
 * Student-visible status payload — never includes risk intelligence or file hashes.
 * @param {Record<string, unknown>|null} row
 */
export function toStudentManualPaymentView(row) {
  if (!row) {
    return { status: 'none' };
  }

  return {
    status: String(row.status),
    transactionId: String(row.transaction_id),
    amountClaimed: Number(row.amount_claimed),
    paymentMethod: String(row.payment_method),
    submittedAt: row.created_at ?? null,
    adminNote: String(row.status) === 'rejected' ? row.admin_note || null : null,
  };
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseRiskFlagsJson(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && typeof raw === 'object') return Object.values(raw).map(String);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export const MANUAL_PAYMENT_RISK_FLAG_LABELS = Object.freeze({
  duplicate_transaction_id_pending: 'This transaction ID was also submitted on another pending payment',
  duplicate_screenshot_hash: 'This screenshot matches another payment proof on file',
  duplicate_screenshot_different_student: 'This screenshot was also submitted by a different student',
  amount_mismatch: 'Claimed amount does not match the order total',
  high_velocity: 'This student submitted multiple different transaction IDs in a short window',
  sender_number_changed: 'Sender mobile number differs from this student’s previous payment',
});

/**
 * @param {unknown} flags
 * @returns {Array<{ code: string, label: string }>}
 */
export function explainManualPaymentRiskFlags(flags) {
  return parseRiskFlagsJson(flags).map((code) => ({
    code,
    label: MANUAL_PAYMENT_RISK_FLAG_LABELS[code] || code.replace(/_/g, ' '),
  }));
}

export function assertNoRiskLeak(payload) {
  const raw = JSON.stringify(payload);
  if (raw.includes('risk_flags') || raw.includes('risk_level') || raw.includes('riskFlags') || raw.includes('riskLevel')) {
    throw new Error('Student payload leaked risk intelligence');
  }
  if (raw.includes('screenshot_file_hash') || raw.includes('screenshotFileHash')) {
    throw new Error('Student payload leaked screenshot hash');
  }
}

