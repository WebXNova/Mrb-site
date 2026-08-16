import path from 'path';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { assertManualPaymentReviewerRole } from '../utils/manualPaymentReviewAccess.js';
import {
  parseManualPaymentReviewListQuery,
  parseRejectManualPaymentBody,
} from '../validators/manualPaymentReview.schema.js';
import {
  approveManualPaymentSubmission,
  getManualPaymentScreenshotFile,
  getManualPaymentSubmissionDetail,
  listManualPaymentSubmissions,
  rejectManualPaymentSubmission,
} from '../services/manualPaymentReview.service.js';
import { MANUAL_PAYMENT_UPLOAD_DIR } from '../services/manualPaymentScreenshotUpload.service.js';

function parseActor(req) {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  assertManualPaymentReviewerRole(req.user?.role);
  return {
    actorId: userId,
    actorRole: String(req.user.role),
  };
}

function parseSubmissionId(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid submission id');
  }
  return id;
}

export const getManualPaymentSubmissions = asyncHandler(async (req, res) => {
  parseActor(req);
  const filters = parseManualPaymentReviewListQuery(req.query || {});
  const result = await listManualPaymentSubmissions(filters);
  sendSuccess(res, {
    items: result.items,
    stats: result.stats,
  }, 200, {
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    },
  });
});

export const getManualPaymentSubmission = asyncHandler(async (req, res) => {
  parseActor(req);
  const detail = await getManualPaymentSubmissionDetail(parseSubmissionId(req));
  sendSuccess(res, { submission: detail });
});

export const getManualPaymentSubmissionScreenshot = asyncHandler(async (req, res) => {
  parseActor(req);
  const file = await getManualPaymentScreenshotFile(parseSubmissionId(req));
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(file.filename, {
    root: MANUAL_PAYMENT_UPLOAD_DIR,
    dotfiles: 'deny',
    headers: {
      'Content-Disposition': `inline; filename="${path.basename(file.filename)}"`,
    },
  });
});

export const putApproveManualPaymentSubmission = asyncHandler(async (req, res) => {
  const actor = parseActor(req);
  const submission = await approveManualPaymentSubmission({
    submissionId: parseSubmissionId(req),
    actorId: actor.actorId,
    actorRole: actor.actorRole,
  });
  sendSuccess(res, { submission });
});

export const putRejectManualPaymentSubmission = asyncHandler(async (req, res) => {
  const actor = parseActor(req);
  const { adminNote } = parseRejectManualPaymentBody(req.body || {});
  const submission = await rejectManualPaymentSubmission({
    submissionId: parseSubmissionId(req),
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    adminNote,
  });
  sendSuccess(res, { submission });
});
