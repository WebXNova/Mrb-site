import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/apiError.js';
import { getClientIp } from '../utils/network.js';

export const reviewPublicReadRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `reviews-public:${getClientIp(req)}`,
  handler(_req, _res, next) {
    next(new ApiError(429, 'Too many requests. Please try again shortly.', { code: 'RATE_LIMITED' }));
  },
});
