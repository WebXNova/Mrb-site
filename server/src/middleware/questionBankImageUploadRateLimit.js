import rateLimit from 'express-rate-limit';
import { logActivity } from '../services/activityLog.service.js';
import { ApiError } from '../utils/apiError.js';
import { getClientIp } from '../utils/network.js';

const IP_WINDOW_MS = 60 * 1000;
const IP_MAX = 30;
const USER_WINDOW_MS = 60 * 60 * 1000;
const USER_MAX = 20;

async function logUploadRateLimitAbuse(req, limitType) {
  try {
    await logActivity({
      userId: req.user?.id ?? null,
      role: req.user?.role ?? 'system',
      action: 'admin.question.upload.rate_limit',
      entityType: 'question_bank_upload',
      metadata: {
        limitType,
        method: req.method,
        path: req.originalUrl || req.path,
        ipAddress: getClientIp(req),
        userId: req.user?.id ?? null,
      },
    });
  } catch {
    // Audit failure must not block the 429 response.
  }
}

function createUploadRateLimitHandler(limitType) {
  return function uploadRateLimitHandler(req, res, next) {
    res.setHeader('Retry-After', String(Math.ceil(IP_WINDOW_MS / 1000)));
    void logUploadRateLimitAbuse(req, limitType);
    next(
      new ApiError(429, 'Too many question image uploads. Please try again shortly.', {
        code: 'RATE_LIMITED',
        limitType,
      })
    );
  };
}

/** Per-IP burst protection for question image uploads. */
export const questionBankImageUploadIpRateLimit = rateLimit({
  windowMs: IP_WINDOW_MS,
  max: IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator(req) {
    return `question-bank-upload:ip:${getClientIp(req)}`;
  },
  handler: createUploadRateLimitHandler('upload_ip'),
});

/** Per-authenticated-user hourly cap for question image uploads. */
export const questionBankImageUploadUserRateLimit = rateLimit({
  windowMs: USER_WINDOW_MS,
  max: USER_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator(req) {
    const userId = req.user?.id ?? 'anonymous';
    return `question-bank-upload:user:${userId}`;
  },
  handler(req, res, next) {
    res.setHeader('Retry-After', String(Math.ceil(USER_WINDOW_MS / 1000)));
    void logUploadRateLimitAbuse(req, 'upload_user');
    next(
      new ApiError(429, 'Too many question image uploads. Please try again later.', {
        code: 'RATE_LIMITED',
        limitType: 'upload_user',
      })
    );
  },
});

/** @deprecated Use questionBankImageUploadIpRateLimit + questionBankImageUploadUserRateLimit */
export const questionBankImageUploadRateLimit = questionBankImageUploadIpRateLimit;
