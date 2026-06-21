import rateLimit from 'express-rate-limit';
import { logActivity } from '../services/activityLog.service.js';
import { ApiError } from '../utils/apiError.js';
import { getClientIp } from '../utils/network.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

async function logContactRemarkRateLimit(req, bucket) {
  try {
    await logActivity({
      role: 'public',
      action: 'contact_remark.rate_limit',
      entityType: 'contact_remark',
      metadata: {
        bucket,
        ipAddress: getClientIp(req),
        method: req.method,
        path: req.originalUrl || req.path,
      },
    });
  } catch {
    // Non-blocking audit
  }
}

function createLimit({ windowMs, max, keyGenerator, bucket, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler(req, res, next) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      void logContactRemarkRateLimit(req, bucket);
      next(new ApiError(429, message, { code: 'RATE_LIMITED' }));
    },
  });
}

function ipKey(req) {
  return `contact-remark:ip:${getClientIp(req)}`;
}

/** One remark per minute per IP (anti-spam burst). */
export const contactRemarkSubmitIpMinuteLimit = createLimit({
  windowMs: MINUTE_MS,
  max: 1,
  keyGenerator: ipKey,
  bucket: 'ip_minute',
  message: 'Please wait one minute before sending another remark.',
});

/** Max 5 remarks per hour per IP (shared networks / scripted abuse). */
export const contactRemarkSubmitIpHourlyLimit = createLimit({
  windowMs: HOUR_MS,
  max: 5,
  keyGenerator: (req) => `${ipKey(req)}:hour`,
  bucket: 'ip_hourly',
  message: 'Too many remarks from this network. Please try again later.',
});
