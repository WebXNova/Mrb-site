import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/apiError.js';

/** Autosave-friendly throughput for quiz draft writes (per IP). */
export const testQuizDraftRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, _res, next) {
    next(
      new ApiError(429, 'Too many quiz draft save requests. Please try again shortly.', {
        code: 'RATE_LIMITED',
      })
    );
  },
});
