import path from 'path';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { assertManualPaymentReviewerRole } from '../utils/manualPaymentReviewAccess.js';
import { parseRejectManualPaymentBody } from '../validators/manualPaymentReview.schema.js';
import {
  approvePaidStandalonePayment,
  getPaidStandalonePaymentScreenshotFile,
  getPaidStandalonePaymentSubmissionDetail,
  listPaidStandalonePaymentSubmissions,
  MANUAL_PAYMENT_UPLOAD_DIR,
  rejectPaidStandalonePayment,
} from '../services/paidStandaloneReview.service.js';

function parseActor(req) {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  assertManualPaymentReviewerRole(req.user?.role);
  return { actorId: userId, actorRole: String(req.user.role) };
}

function parseSubmissionId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid submission id');
  }
  return id;
}

export const getPaidStandaloneSubmissions = asyncHandler(async (req, res) => {
  parseActor(req);
  const status = String(req.query.status || 'pending_review');
  const result = await listPaidStandalonePaymentSubmissions({
    status,
    limit: req.query.limit,
    offset: req.query.offset,
  });
  sendSuccess(res, { items: result.items }, 200, {
    meta: { total: result.total, limit: result.limit, offset: result.offset },
  });
});

export const getPaidStandaloneSubmission = asyncHandler(async (req, res) => {
  parseActor(req);
  const submission = await getPaidStandalonePaymentSubmissionDetail(parseSubmissionId(req));
  sendSuccess(res, { submission });
});

export const getPaidStandaloneSubmissionScreenshot = asyncHandler(async (req, res) => {
  parseActor(req);
  const file = await getPaidStandalonePaymentScreenshotFile(parseSubmissionId(req));
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(file.filename, {
    root: MANUAL_PAYMENT_UPLOAD_DIR,
    dotfiles: 'deny',
    headers: { 'Content-Disposition': `inline; filename="${path.basename(file.filename)}"` },
  });
});

export const putApprovePaidStandaloneSubmission = asyncHandler(async (req, res) => {
  const actor = parseActor(req);
  const result = await approvePaidStandalonePayment({
    submissionId: parseSubmissionId(req),
    actorId: actor.actorId,
    actorRole: actor.actorRole,
  });
  sendSuccess(res, result);
});

export const putRejectPaidStandaloneSubmission = asyncHandler(async (req, res) => {
  const actor = parseActor(req);
  const parsed = parseRejectManualPaymentBody(req.body || {});
  const result = await rejectPaidStandalonePayment({
    submissionId: parseSubmissionId(req),
    actorId: actor.actorId,
    adminNote: parsed.adminNote,
  });
  sendSuccess(res, result);
});
