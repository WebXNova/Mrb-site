import rateLimit from 'express-rate-limit';
import { QA_AUDIT_CATEGORIES } from '../constants/qaAudit.schema.js';
import { writeQaAuditEventFromReq } from '../services/qaAuditLog.service.js';
import { ApiError } from '../utils/apiError.js';
import { getClientIp } from '../utils/network.js';

const BURST_WINDOW_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

async function logStudentQuestionRateLimit(req, limitType, bucket) {
  await writeQaAuditEventFromReq(req, {
    role: 'student',
    action: 'student.question.rate_limit',
    entityType: 'student_question',
    eventCategory: QA_AUDIT_CATEGORIES.SUSPICIOUS_ACTIVITY,
    metadata: {
      limitType,
      bucket,
      method: req.method,
      ipAddress: getClientIp(req),
    },
  });
}

function createLimit({ windowMs, max, keyGenerator, limitType, bucket, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler(req, res, next) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      void logStudentQuestionRateLimit(req, limitType, bucket);
      next(new ApiError(429, message, { code: 'RATE_LIMITED' }));
    },
  });
}

function studentIdKey(req) {
  return `student-qa:student:${req.user?.id ?? 'anonymous'}`;
}

function sessionBurstKey(req) {
  const sid = req.user?.sid ?? 'no-session';
  const uid = req.user?.id ?? 'anonymous';
  return `student-qa:burst:${uid}:${sid}`;
}

function ipKey(req) {
  return `student-qa:ip:${getClientIp(req)}`;
}

/** Burst: max 3 question creates per 60s per session (double-click / automation). */
export const studentQuestionCreateBurstLimit = createLimit({
  windowMs: BURST_WINDOW_MS,
  max: 3,
  keyGenerator: sessionBurstKey,
  limitType: 'burst',
  bucket: 'create_burst',
  message: 'Please wait a moment before submitting another question.',
});

/** Per student: max 10 questions per hour. */
export const studentQuestionCreateStudentHourlyLimit = createLimit({
  windowMs: HOUR_MS,
  max: 10,
  keyGenerator: studentIdKey,
  limitType: 'student',
  bucket: 'create_student_hourly',
  message: 'You have reached the hourly question limit (10 per hour). Please try again later.',
});

/** Per student: max 30 questions per day. */
export const studentQuestionCreateStudentDailyLimit = createLimit({
  windowMs: DAY_MS,
  max: 30,
  keyGenerator: (req) => `${studentIdKey(req)}:day`,
  limitType: 'student',
  bucket: 'create_student_daily',
  message: 'You have reached the daily question limit (30 per day). Please try again tomorrow.',
});

/** Per IP: abuse protection — max 50 question creates per hour (shared networks). */
export const studentQuestionCreateIpLimit = createLimit({
  windowMs: HOUR_MS,
  max: 50,
  keyGenerator: ipKey,
  limitType: 'ip',
  bucket: 'create_ip_hourly',
  message: 'Too many requests from this network. Please try again later.',
});

/** Upload burst: 5 per minute per student session. */
export const studentQuestionUploadBurstLimit = createLimit({
  windowMs: BURST_WINDOW_MS,
  max: 5,
  keyGenerator: sessionBurstKey,
  limitType: 'burst',
  bucket: 'upload_burst',
  message: 'Please wait before uploading another file.',
});

/** Per student uploads: 30 per hour. */
export const studentQuestionUploadStudentLimit = createLimit({
  windowMs: HOUR_MS,
  max: 30,
  keyGenerator: studentIdKey,
  limitType: 'student',
  bucket: 'upload_student_hourly',
  message: 'You have reached the upload limit for now. Please try again later.',
});

/** Per IP uploads: 80 per hour. */
export const studentQuestionUploadIpLimit = createLimit({
  windowMs: HOUR_MS,
  max: 80,
  keyGenerator: ipKey,
  limitType: 'ip',
  bucket: 'upload_ip_hourly',
  message: 'Too many uploads from this network. Please try again later.',
});

/** Audio recording burst: 3 per minute per session (resource-heavy). */
export const studentQuestionAudioUploadBurstLimit = createLimit({
  windowMs: BURST_WINDOW_MS,
  max: 3,
  keyGenerator: sessionBurstKey,
  limitType: 'burst',
  bucket: 'audio_upload_burst',
  message: 'Please wait before uploading another recording.',
});

/** Per student audio: 20 per hour. */
export const studentQuestionAudioUploadStudentLimit = createLimit({
  windowMs: HOUR_MS,
  max: 20,
  keyGenerator: (req) => `${studentIdKey(req)}:audio`,
  limitType: 'student',
  bucket: 'audio_upload_student_hourly',
  message: 'You have reached the recording upload limit for now. Please try again later.',
});

/** Per IP audio: 50 per hour. */
export const studentQuestionAudioUploadIpLimit = createLimit({
  windowMs: HOUR_MS,
  max: 50,
  keyGenerator: (req) => `${ipKey(req)}:audio`,
  limitType: 'ip',
  bucket: 'audio_upload_ip_hourly',
  message: 'Too many recording uploads from this network. Please try again later.',
});

/** Read burst: max 40 list/detail views per minute per session. */
export const studentQuestionReadBurstLimit = createLimit({
  windowMs: BURST_WINDOW_MS,
  max: 40,
  keyGenerator: sessionBurstKey,
  limitType: 'burst',
  bucket: 'read_burst',
  message: 'Please wait a moment before refreshing your questions.',
});

/** Per student reads: 400 per hour. */
export const studentQuestionReadStudentLimit = createLimit({
  windowMs: HOUR_MS,
  max: 400,
  keyGenerator: studentIdKey,
  limitType: 'student',
  bucket: 'read_student_hourly',
  message: 'Too many question views. Please try again later.',
});

/** Per IP reads: 800 per hour. */
export const studentQuestionReadIpLimit = createLimit({
  windowMs: HOUR_MS,
  max: 800,
  keyGenerator: ipKey,
  limitType: 'ip',
  bucket: 'read_ip_hourly',
  message: 'Too many requests from this network. Please try again later.',
});
