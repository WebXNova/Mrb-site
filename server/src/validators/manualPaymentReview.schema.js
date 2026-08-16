import { z } from 'zod';
import { ApiError } from '../utils/apiError.js';
import { parseAdminListFilters } from '../utils/parseAdminListFilters.js';

export const MANUAL_PAYMENT_REVIEW_STATUSES = Object.freeze([
  'pending_review',
  'approved',
  'rejected',
  'all',
]);

export const MANUAL_PAYMENT_RISK_LEVELS = Object.freeze(['low', 'needs_review', 'all']);

const rejectBodySchema = z
  .object({
    admin_note: z.string().min(1, 'A rejection reason is required'),
  })
  .strict();

/**
 * @param {Record<string, unknown>} query
 */
export function parseManualPaymentReviewListQuery(query = {}) {
  const base = parseAdminListFilters(query, { defaultLimit: 50, maxLimit: 200 });

  const statusRaw = String(query.status ?? 'pending_review').trim().toLowerCase();
  const status = MANUAL_PAYMENT_REVIEW_STATUSES.includes(statusRaw) ? statusRaw : 'pending_review';

  const riskRaw = String(query.risk_level ?? query.riskLevel ?? 'all').trim().toLowerCase();
  const riskLevel = MANUAL_PAYMENT_RISK_LEVELS.includes(riskRaw) ? riskRaw : 'all';

  return {
    ...base,
    status,
    riskLevel,
  };
}

/**
 * @param {Record<string, unknown>} body
 * @returns {{ adminNote: string }}
 */
export function parseRejectManualPaymentBody(body) {
  const parsed = rejectBodySchema.safeParse(body || {});
  if (!parsed.success) {
    throw new ApiError(400, 'A rejection reason is required', {
      code: 'REJECTION_REASON_REQUIRED',
      issues: parsed.error.flatten(),
    });
  }
  const adminNote = String(parsed.data.admin_note || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
  if (adminNote.length < 3) {
    throw new ApiError(400, 'A rejection reason is required', { code: 'REJECTION_REASON_REQUIRED' });
  }
  if (adminNote.length > 1000) {
    throw new ApiError(400, 'Rejection reason must be 1000 characters or fewer', {
      code: 'REJECTION_REASON_TOO_LONG',
    });
  }
  return { adminNote };
}
