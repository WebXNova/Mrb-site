import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/apiError.js';

/** Bounded write throughput for batch mutations (per IP). */
export const courseBatchWriteRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, _res, next) {
    next(new ApiError(429, 'Too many batch write requests. Please try again shortly.', { code: 'RATE_LIMITED' }));
  },
});
