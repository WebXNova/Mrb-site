import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/apiError.js';

export const courseImageUploadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, _res, next) {
    next(new ApiError(429, 'Too many image uploads. Please try again shortly.', { code: 'RATE_LIMITED' }));
  },
});
