import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/apiError.js';

/** Bounded throughput for test creation (per IP). */
export const testWriteRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, _res, next) {
    next(new ApiError(429, 'Too many test write requests. Please try again shortly.', { code: 'RATE_LIMITED' }));
  },
});
