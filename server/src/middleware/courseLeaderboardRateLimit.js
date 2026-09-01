import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/apiError.js';
import { getClientIp } from '../utils/network.js';

function createLeaderboardLimit({ windowMs, max, keyGenerator }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    keyGenerator,
    handler(_req, _res, next) {
      next(new ApiError(429, 'Too many requests. Please try again shortly.', { code: 'RATE_LIMITED' }));
    },
  });
}

/** Student board: 60 reads / minute per authenticated user (IP fallback). */
export const studentLeaderboardReadLimit = createLeaderboardLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => `lb:student:${req.user?.id ?? getClientIp(req)}`,
});

/** Admin board + drill-down: 120 reads / minute per admin. */
export const adminLeaderboardReadLimit = createLeaderboardLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => `lb:admin:${req.user?.id ?? getClientIp(req)}`,
});
