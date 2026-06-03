import rateLimit from 'express-rate-limit';
import { logActivity } from '../services/activityLog.service.js';
import { ApiError } from '../utils/apiError.js';
import { getClientIp } from '../utils/network.js';

const WRITE_WINDOW_MS = 60 * 1000;

function questionBankRateLimitKey(req, bucket) {
  const adminId = req.user?.id ?? 'anonymous';
  const ip = getClientIp(req);
  return `question-bank:${bucket}:${adminId}:${ip}`;
}

async function logQuestionBankRateLimitAbuse(req, limitType) {
  try {
    await logActivity({
      userId: req.user?.id ?? null,
      role: req.user?.role ?? 'system',
      action: 'admin.question.rate_limit',
      entityType: 'question_bank',
      metadata: {
        event: 'QUESTION_BANK_RATE_LIMITED',
        limitType,
        method: req.method,
        path: req.originalUrl || req.path,
        ipAddress: getClientIp(req),
        adminId: req.user?.id ?? null,
      },
    });
  } catch {
    // Audit failure must not block the 429 response.
  }
}

function createQuestionBankRateLimit({ max, limitType, message }) {
  return rateLimit({
    windowMs: WRITE_WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator(req) {
      return questionBankRateLimitKey(req, limitType);
    },
    handler(req, res, next) {
      res.setHeader('Retry-After', String(Math.ceil(WRITE_WINDOW_MS / 1000)));
      void logQuestionBankRateLimitAbuse(req, limitType);
      next(new ApiError(429, message, { code: 'RATE_LIMITED' }));
    },
  });
}

/** Single-question CRUD writes: POST /questions, PUT|DELETE /questions/:id */
export const questionBankWriteRateLimit = createQuestionBankRateLimit({
  max: 30,
  limitType: 'write',
  message: 'Too many question bank write requests. Please try again shortly.',
});

/**
 * Future bulk import (`POST /questions/import`) — separate bucket so imports do not
 * share the CRUD write budget (and vice versa).
 */
export const questionBankImportRateLimit = createQuestionBankRateLimit({
  max: 5,
  limitType: 'import',
  message: 'Too many question import requests. Please try again shortly.',
});
