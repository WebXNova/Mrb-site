import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/apiError.js';

export const courseWizardWriteRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, _res, next) {
    next(new ApiError(429, 'Too many course wizard submissions. Please try again shortly.', { code: 'RATE_LIMITED' }));
  },
});
