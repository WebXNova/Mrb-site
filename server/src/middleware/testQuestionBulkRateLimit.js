import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/apiError.js';

/** Bounded throughput for bulk question link/unlink (per IP). */
export const testQuestionBulkRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, _res, next) {
    next(
      new ApiError(429, 'Too many question linking requests. Please try again shortly.', {
        code: 'RATE_LIMITED',
      })
    );
  },
});
