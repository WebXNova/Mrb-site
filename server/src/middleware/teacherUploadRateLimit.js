import { env } from '../config/env.js';
import { getTeacherUploadRateLimitConfig } from '../config/teacherUploadRateLimit.config.js';
import { isRedisReady } from '../config/redis.js';
import { isProductionNodeEnv } from '../config/validateProductionStartup.js';
import { QA_AUDIT_CATEGORIES } from '../constants/qaAudit.schema.js';
import { writeQaAuditEventFromReq } from '../services/qaAuditLog.service.js';
import { checkSlidingWindowLimit } from '../services/slidingWindowRateLimit.service.js';
import { ApiError } from '../utils/apiError.js';
import { getClientIp } from '../utils/network.js';

const KEY_PREFIX = 'rl:teacher-upload';

/**
 * @param {'image'|'audio'} mediaType
 * @param {string} scope
 * @param {import('express').Request} req
 */
function buildRateLimitKey(mediaType, scope, req) {
  const teacherId = req.user?.id ?? 'anonymous';
  const sessionId = req.user?.sid ?? 'no-session';
  const ip = getClientIp(req);

  switch (scope) {
    case 'burst_session':
      return `${KEY_PREFIX}:${mediaType}:burst:session:${teacherId}:${sessionId}`;
    case 'burst_ip':
      return `${KEY_PREFIX}:${mediaType}:burst:ip:${ip}`;
    case 'teacher_hour':
      return `${KEY_PREFIX}:${mediaType}:teacher:hour:${teacherId}`;
    case 'teacher_day':
      return `${KEY_PREFIX}:${mediaType}:teacher:day:${teacherId}`;
    case 'ip_hour':
      return `${KEY_PREFIX}:${mediaType}:ip:hour:${ip}`;
    case 'ip_day':
      return `${KEY_PREFIX}:${mediaType}:ip:day:${ip}`;
    default:
      return `${KEY_PREFIX}:${mediaType}:${scope}:${teacherId}`;
  }
}

/**
 * @param {import('express').Request} req
 * @param {{
 *   mediaType: 'image'|'audio',
 *   scope: string,
 *   bucket: string,
 *   limitType: 'burst'|'sustained',
 *   windowMs: number,
 *   max: number,
 *   message: string,
 * }} meta
 */
async function logUploadRateLimitViolation(req, meta) {
  await writeQaAuditEventFromReq(req, {
    role: 'teacher',
    action: 'teacher.question.upload.rate_limit',
    entityType: 'teacher_qa_upload',
    eventCategory: QA_AUDIT_CATEGORIES.SUSPICIOUS_ACTIVITY,
    metadata: {
      mediaType: meta.mediaType,
      scope: meta.scope,
      bucket: meta.bucket,
      limitType: meta.limitType,
      windowMs: meta.windowMs,
      max: meta.max,
      method: req.method,
      path: req.originalUrl || req.path,
      ipAddress: getClientIp(req),
    },
  });
}

/**
 * Fail closed in production when Redis is required but unavailable.
 */
export async function requireRedisForTeacherUploads(req, res, next) {
  const config = getTeacherUploadRateLimitConfig();
  if (!config.requireRedis || !isProductionNodeEnv(env.nodeEnv)) {
    return next();
  }

  if (!isRedisReady()) {
    return next(
      new ApiError(503, 'Upload service temporarily unavailable. Please retry shortly.', {
        code: 'RATE_LIMIT_UNAVAILABLE',
      })
    );
  }

  return next();
}

/**
 * @param {{
 *   mediaType: 'image'|'audio',
 *   scope: string,
 *   bucket: string,
 *   limitType: 'burst'|'sustained',
 *   windowMs: number,
 *   max: number,
 *   message: string,
 * }} spec
 */
function createTeacherUploadLimit(spec) {
  return async function teacherUploadRateLimit(req, res, next) {
    const key = buildRateLimitKey(spec.mediaType, spec.scope, req);
    const result = await checkSlidingWindowLimit(key, spec.windowMs, spec.max);

    res.setHeader('RateLimit-Policy', `${spec.max};w=${Math.ceil(spec.windowMs / 1000)}`);
    res.setHeader('RateLimit-Limit', String(spec.max));
    res.setHeader('RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      const retrySec = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
      res.setHeader('Retry-After', String(retrySec));
      res.setHeader('RateLimit-Reset', String(retrySec));
      await logUploadRateLimitViolation(req, spec);
      return next(
        new ApiError(429, spec.message, {
          code: 'RATE_LIMITED',
          limitType: spec.limitType,
          mediaType: spec.mediaType,
        })
      );
    }

    return next();
  };
}

function buildImageLimits() {
  const c = getTeacherUploadRateLimitConfig().image;
  return [
    createTeacherUploadLimit({
      mediaType: 'image',
      scope: 'burst_session',
      bucket: 'image_burst_session',
      limitType: 'burst',
      windowMs: c.burstWindowMs,
      max: c.burstSessionPerMinute,
      message: 'Please wait before uploading another image.',
    }),
    createTeacherUploadLimit({
      mediaType: 'image',
      scope: 'burst_ip',
      bucket: 'image_burst_ip',
      limitType: 'burst',
      windowMs: c.burstWindowMs,
      max: c.burstIpPerMinute,
      message: 'Too many image uploads from this network. Please wait a moment.',
    }),
    createTeacherUploadLimit({
      mediaType: 'image',
      scope: 'teacher_hour',
      bucket: 'image_teacher_hourly',
      limitType: 'sustained',
      windowMs: c.hourWindowMs,
      max: c.teacherPerHour,
      message: 'You have reached the hourly image upload limit. Please try again later.',
    }),
    createTeacherUploadLimit({
      mediaType: 'image',
      scope: 'teacher_day',
      bucket: 'image_teacher_daily',
      limitType: 'sustained',
      windowMs: c.dayWindowMs,
      max: c.teacherPerDay,
      message: 'You have reached the daily image upload limit. Please try again tomorrow.',
    }),
    createTeacherUploadLimit({
      mediaType: 'image',
      scope: 'ip_hour',
      bucket: 'image_ip_hourly',
      limitType: 'sustained',
      windowMs: c.hourWindowMs,
      max: c.ipPerHour,
      message: 'Too many image uploads from this network. Please try again later.',
    }),
    createTeacherUploadLimit({
      mediaType: 'image',
      scope: 'ip_day',
      bucket: 'image_ip_daily',
      limitType: 'sustained',
      windowMs: c.dayWindowMs,
      max: c.ipPerDay,
      message: 'Too many image uploads from this network today. Please try again tomorrow.',
    }),
  ];
}

function buildAudioLimits() {
  const c = getTeacherUploadRateLimitConfig().audio;
  return [
    createTeacherUploadLimit({
      mediaType: 'audio',
      scope: 'burst_session',
      bucket: 'audio_burst_session',
      limitType: 'burst',
      windowMs: c.burstWindowMs,
      max: c.burstSessionPerMinute,
      message: 'Please wait before uploading another recording.',
    }),
    createTeacherUploadLimit({
      mediaType: 'audio',
      scope: 'burst_ip',
      bucket: 'audio_burst_ip',
      limitType: 'burst',
      windowMs: c.burstWindowMs,
      max: c.burstIpPerMinute,
      message: 'Too many recording uploads from this network. Please wait a moment.',
    }),
    createTeacherUploadLimit({
      mediaType: 'audio',
      scope: 'teacher_hour',
      bucket: 'audio_teacher_hourly',
      limitType: 'sustained',
      windowMs: c.hourWindowMs,
      max: c.teacherPerHour,
      message: 'You have reached the hourly recording upload limit. Please try again later.',
    }),
    createTeacherUploadLimit({
      mediaType: 'audio',
      scope: 'teacher_day',
      bucket: 'audio_teacher_daily',
      limitType: 'sustained',
      windowMs: c.dayWindowMs,
      max: c.teacherPerDay,
      message: 'You have reached the daily recording upload limit. Please try again tomorrow.',
    }),
    createTeacherUploadLimit({
      mediaType: 'audio',
      scope: 'ip_hour',
      bucket: 'audio_ip_hourly',
      limitType: 'sustained',
      windowMs: c.hourWindowMs,
      max: c.ipPerHour,
      message: 'Too many recording uploads from this network. Please try again later.',
    }),
    createTeacherUploadLimit({
      mediaType: 'audio',
      scope: 'ip_day',
      bucket: 'audio_ip_daily',
      limitType: 'sustained',
      windowMs: c.dayWindowMs,
      max: c.ipPerDay,
      message: 'Too many recording uploads from this network today. Please try again tomorrow.',
    }),
  ];
}

/** Layered limits: burst → sustained user → sustained IP (Redis-backed when available). */
export const teacherImageUploadRateLimits = [requireRedisForTeacherUploads, ...buildImageLimits()];
export const teacherAudioUploadRateLimits = [requireRedisForTeacherUploads, ...buildAudioLimits()];

/** @deprecated Use teacherImageUploadRateLimits — kept for gradual migration */
export const teacherAnswerUploadBurstLimit = teacherImageUploadRateLimits[1];
export const teacherAnswerUploadTeacherLimit = teacherImageUploadRateLimits[3];
export const teacherAnswerUploadIpLimit = teacherImageUploadRateLimits[5];

/** @deprecated Use teacherAudioUploadRateLimits */
export const teacherAnswerAudioUploadBurstLimit = teacherAudioUploadRateLimits[1];
export const teacherAnswerAudioUploadTeacherLimit = teacherAudioUploadRateLimits[3];
export const teacherAnswerAudioUploadIpLimit = teacherAudioUploadRateLimits[5];
