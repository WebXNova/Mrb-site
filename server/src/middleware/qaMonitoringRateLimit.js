import rateLimit from 'express-rate-limit';
import { ApiError } from '../utils/apiError.js';
import { getClientIp } from '../utils/network.js';

function createLimit({ windowMs, max, keyGenerator, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler(req, res, next) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      next(new ApiError(429, message, { code: 'RATE_LIMITED' }));
    },
  });
}

function adminIdKey(req) {
  return `qa-monitoring:admin:${req.user?.id ?? 'anonymous'}`;
}

function ipKey(req) {
  return `qa-monitoring:ip:${getClientIp(req)}`;
}

export const qaMonitoringReadBurstLimit = createLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: adminIdKey,
  message: 'Too many monitoring requests. Please wait a moment.',
});

export const qaMonitoringReadIpLimit = createLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: ipKey,
  message: 'Too many requests from this network. Please try again later.',
});

export const qaMonitoringExportLimit = createLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: adminIdKey,
  message: 'Export limit reached. Please try again later.',
});

export const teacherAnswerUpdateBurstLimit = createLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => `teacher-answer-update:teacher:${req.user?.id ?? 'anonymous'}`,
  message: 'Too many answer updates. Please wait a moment.',
});

export const teacherAnswerUpdateIpLimit = createLimit({
  windowMs: 60 * 1000,
  max: 40,
  keyGenerator: ipKey,
  message: 'Too many requests from this network. Please try again later.',
});
