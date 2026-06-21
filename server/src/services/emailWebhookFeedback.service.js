import { z } from 'zod';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';

export const emailFeedbackPayloadSchema = z.object({
  email: z.string().trim().email(),
  event: z.enum(['bounce', 'complaint', 'block']),
  reason: z.string().trim().max(255).optional(),
});

/**
 * Persist provider feedback as an email suppression row.
 * @param {{ email: string, event: string, reason?: string }} payload
 */
export async function persistEmailProviderFeedback(payload) {
  const parsed = emailFeedbackPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid feedback payload', {
      code: 'EMAIL_WEBHOOK_INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }

  const email = parsed.data.email.toLowerCase();
  const reason = `${parsed.data.event}:${parsed.data.reason || 'provider_signal'}`;

  try {
    await mysqlPool.query(
      `INSERT INTO email_suppressions (email, reason, source, active)
       VALUES (?, ?, 'provider_webhook', TRUE)
       ON DUPLICATE KEY UPDATE reason = VALUES(reason), active = TRUE, updated_at = CURRENT_TIMESTAMP`,
      [email, reason]
    );
  } catch (error) {
    throw new ApiError(503, 'Unable to persist email suppression', {
      code: 'EMAIL_WEBHOOK_DB_ERROR',
      cause: error?.code ?? null,
    });
  }

  return { email, event: parsed.data.event };
}
