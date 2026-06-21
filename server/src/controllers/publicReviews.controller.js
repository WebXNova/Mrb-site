import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import {
  getPublicPlatformStats,
  listPublishedReviews,
} from '../services/review.service.js';

const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=600';

export const publicReviewListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(9),
  featured: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const getPublicReviews = asyncHandler(async (req, res) => {
  const parsed = publicReviewListQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new ApiError(422, 'Invalid query parameters', parsed.error.flatten());

  const { page, limit, featured } = parsed.data;
  const result = await listPublishedReviews({
    page,
    limit,
    featuredOnly: Boolean(featured),
    publicView: true,
  });

  res.set('Cache-Control', CACHE_CONTROL);
  sendSuccess(res, result);
});

export const getPublicReviewPlatformStats = asyncHandler(async (req, res) => {
  const stats = await getPublicPlatformStats();
  res.set('Cache-Control', CACHE_CONTROL);
  sendSuccess(res, stats);
});
