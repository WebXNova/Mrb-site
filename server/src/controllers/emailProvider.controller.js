import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { verifyEmailWebhookRequest } from '../services/emailWebhookAuth.service.js';
import {
  assertEmailWebhookNotReplayed,
  markEmailWebhookProcessed,
} from '../services/emailWebhookReplay.service.js';
import { persistEmailProviderFeedback } from '../services/emailWebhookFeedback.service.js';
import {
  logEmailWebhookFailure,
  logEmailWebhookSecurityFailure,
  logEmailWebhookSuccess,
} from '../services/emailWebhookObservability.service.js';

/**
 * POST /api/email/provider-feedback
 *
 * Security stack (middleware order in routes):
 * rate limit → operational gate → content-type → raw body → auth → handler
 */
export const providerFeedbackWebhook = asyncHandler(async (req, res) => {
  const rawBody = req.rawBody;
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    logEmailWebhookSecurityFailure(req, 'EMAIL_WEBHOOK_EMPTY_BODY');
    throw new ApiError(400, 'Webhook body required', { code: 'EMAIL_WEBHOOK_EMPTY_BODY' });
  }

  let auth;
  try {
    auth = verifyEmailWebhookRequest(req, { rawBody });
  } catch (error) {
    const code = error?.metadata?.code || error?.errorCode || 'EMAIL_WEBHOOK_AUTH_FAILED';
    logEmailWebhookSecurityFailure(req, code);
    throw error;
  }

  const replayStatus = await assertEmailWebhookNotReplayed(auth.digest);
  if (replayStatus === 'replay') {
    logEmailWebhookSecurityFailure(req, 'EMAIL_WEBHOOK_REPLAY_REJECTED', { digestPrefix: auth.digest.slice(0, 12) });
    throw new ApiError(409, 'Webhook replay rejected', { code: 'EMAIL_WEBHOOK_REPLAY_REJECTED' });
  }

  try {
    const result = await persistEmailProviderFeedback(req.body);
    await markEmailWebhookProcessed(auth.digest);
    logEmailWebhookSuccess(req, {
      event: result.event,
      emailDomain: result.email.split('@')[1] || null,
      replayProtection: replayStatus,
    });
    sendSuccess(res, { acknowledged: true }, 200, { requestId: req.requestId });
  } catch (error) {
    const code = error?.metadata?.code || error?.errorCode || 'EMAIL_WEBHOOK_HANDLER_ERROR';
    logEmailWebhookFailure(req, code);
    throw error;
  }
});
