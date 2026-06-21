import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from '../services/activityLog.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import {
  adminReviewBulkSchema,
  adminReviewFeatureSchema,
  adminReviewListQuerySchema,
  adminReviewNotesSchema,
  adminReviewUpdateSchema,
} from '../validators/review.schema.js';
import {
  approveReview,
  archiveReview,
  bulkReviewAction,
  deleteReview,
  featureReview,
  getReviewByIdAdmin,
  getReviewStats,
  listReviewsAdmin,
  publishReview,
  rejectReview,
  updateReviewAdmin,
} from '../services/review.service.js';
import { sanitizePlainText } from '../utils/sanitizeText.js';
import { normalizePkMobile } from '../utils/phoneValidation.js';

function adminContext(req) {
  const user = req.user || {};
  return {
    id: user.id,
    name: user.fullName || user.email || `Admin #${user.id}`,
  };
}

async function auditActivity(req, action, reviewId, metadata = {}) {
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role || 'admin',
    action: `review.${action}`,
    entityType: 'review',
    entityId: String(reviewId),
    metadata,
  });
}

function mapTransitionError(result) {
  if (result.error === 'NOT_FOUND') throw new ApiError(404, 'Review not found');
  if (result.error === 'NOT_APPROVED') {
    throw new ApiError(409, 'Review must be approved before publishing', {
      code: 'REVIEW_NOT_APPROVED',
      currentStatus: result.current,
    });
  }
  if (result.error === 'NOT_PUBLISHED') {
    throw new ApiError(409, 'Only published approved reviews can be featured', {
      code: 'REVIEW_NOT_PUBLISHED',
    });
  }
  if (result.error === 'INVALID_STATUS') {
    throw new ApiError(409, `Invalid status for this action (current: ${result.current})`, {
      code: 'REVIEW_INVALID_STATUS',
    });
  }
}

export const getAdminReviewStats = asyncHandler(async (req, res) => {
  const stats = await getReviewStats();
  sendSuccess(res, stats);
});

export const getAdminReviews = asyncHandler(async (req, res) => {
  const parsed = adminReviewListQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(422, 'Invalid query parameters', parsed.error.flatten());

  const { page, limit, ...filters } = parsed.data;
  const result = await listReviewsAdmin(filters, { page, limit });
  sendSuccess(res, result);
});

export const getAdminReviewDetail = asyncHandler(async (req, res) => {
  const reviewId = Number(req.params.reviewId);
  if (!reviewId) throw new ApiError(400, 'Invalid review id');
  const review = await getReviewByIdAdmin(reviewId);
  if (!review) throw new ApiError(404, 'Review not found');
  sendSuccess(res, review);
});

export const putAdminReview = asyncHandler(async (req, res) => {
  const reviewId = Number(req.params.reviewId);
  if (!reviewId) throw new ApiError(400, 'Invalid review id');

  const parsed = adminReviewUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid review payload', parsed.error.flatten());

  const patch = {};
  const data = parsed.data;
  if (data.name !== undefined) patch.name = sanitizePlainText(data.name, 120);
  if (data.phone !== undefined) patch.phone = normalizePkMobile(data.phone);
  if (data.email !== undefined) patch.email = data.email ? sanitizePlainText(data.email, 255) : null;
  if (data.courseName !== undefined) {
    patch.courseName = data.courseName ? sanitizePlainText(data.courseName, 200) : null;
  }
  if (data.rating !== undefined) patch.rating = data.rating;
  if (data.reviewMessage !== undefined) patch.reviewMessage = sanitizePlainText(data.reviewMessage, 5000);
  if (data.adminNotes !== undefined) {
    patch.adminNotes = data.adminNotes ? sanitizePlainText(data.adminNotes, 5000) : null;
  }

  const updated = await updateReviewAdmin(reviewId, patch, adminContext(req));
  if (!updated) throw new ApiError(404, 'Review not found');

  await auditActivity(req, 'update', reviewId, { fields: Object.keys(patch) });
  sendSuccess(res, updated);
});

export const putAdminReviewNotes = asyncHandler(async (req, res) => {
  const reviewId = Number(req.params.reviewId);
  if (!reviewId) throw new ApiError(400, 'Invalid review id');

  const parsed = adminReviewNotesSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid notes payload', parsed.error.flatten());

  const adminNotes = parsed.data.adminNotes
    ? sanitizePlainText(parsed.data.adminNotes, 5000)
    : null;

  const updated = await updateReviewAdmin(reviewId, { adminNotes }, adminContext(req));
  if (!updated) throw new ApiError(404, 'Review not found');

  await auditActivity(req, 'notes', reviewId);
  sendSuccess(res, updated);
});

export const postAdminReviewApprove = asyncHandler(async (req, res) => {
  const reviewId = Number(req.params.reviewId);
  if (!reviewId) throw new ApiError(400, 'Invalid review id');

  const result = await approveReview(reviewId, adminContext(req));
  mapTransitionError(result);
  await auditActivity(req, 'approve', reviewId);
  sendSuccess(res, result.review);
});

export const postAdminReviewReject = asyncHandler(async (req, res) => {
  const reviewId = Number(req.params.reviewId);
  if (!reviewId) throw new ApiError(400, 'Invalid review id');

  const result = await rejectReview(reviewId, adminContext(req));
  mapTransitionError(result);
  await auditActivity(req, 'reject', reviewId);
  sendSuccess(res, result.review);
});

export const postAdminReviewPublish = asyncHandler(async (req, res) => {
  const reviewId = Number(req.params.reviewId);
  if (!reviewId) throw new ApiError(400, 'Invalid review id');

  const result = await publishReview(reviewId, adminContext(req));
  mapTransitionError(result);
  await auditActivity(req, 'publish', reviewId);
  sendSuccess(res, result.review);
});

export const postAdminReviewFeature = asyncHandler(async (req, res) => {
  const reviewId = Number(req.params.reviewId);
  if (!reviewId) throw new ApiError(400, 'Invalid review id');

  const parsed = adminReviewFeatureSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid feature payload', parsed.error.flatten());

  const result = await featureReview(reviewId, parsed.data.featured, adminContext(req));
  mapTransitionError(result);
  await auditActivity(req, parsed.data.featured ? 'feature' : 'unfeature', reviewId);
  sendSuccess(res, result.review);
});

export const postAdminReviewArchive = asyncHandler(async (req, res) => {
  const reviewId = Number(req.params.reviewId);
  if (!reviewId) throw new ApiError(400, 'Invalid review id');

  const result = await archiveReview(reviewId, adminContext(req));
  mapTransitionError(result);
  await auditActivity(req, 'archive', reviewId);
  sendSuccess(res, result.review);
});

export const deleteAdminReview = asyncHandler(async (req, res) => {
  const reviewId = Number(req.params.reviewId);
  if (!reviewId) throw new ApiError(400, 'Invalid review id');

  const result = await deleteReview(reviewId, adminContext(req));
  mapTransitionError(result);
  await auditActivity(req, 'delete', reviewId);
  sendSuccess(res, { id: reviewId, deleted: true });
});

export const postAdminReviewBulk = asyncHandler(async (req, res) => {
  const parsed = adminReviewBulkSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid bulk payload', parsed.error.flatten());

  const results = await bulkReviewAction(parsed.data.ids, parsed.data.action, adminContext(req));
  await auditActivity(req, `bulk_${parsed.data.action}`, null, {
    ids: parsed.data.ids,
    count: parsed.data.ids.length,
  });
  sendSuccess(res, { results });
});
