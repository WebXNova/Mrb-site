import rateLimit from 'express-rate-limit';

import { QA_AUDIT_CATEGORIES } from '../constants/qaAudit.schema.js';

import { writeQaAuditEventFromReq } from '../services/qaAuditLog.service.js';

import { ApiError } from '../utils/apiError.js';

import { getClientIp } from '../utils/network.js';



const BURST_WINDOW_MS = 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;



async function logRateLimit(req, limitType, bucket) {

  await writeQaAuditEventFromReq(req, {

    role: 'teacher',

    action: 'teacher.question.answer.rate_limit',

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

      void logRateLimit(req, limitType, bucket);

      next(new ApiError(429, message, { code: 'RATE_LIMITED' }));

    },

  });

}



function teacherIdKey(req) {

  return `teacher-answer:teacher:${req.user?.id ?? 'anonymous'}`;

}



function sessionBurstKey(req) {

  const sid = req.user?.sid ?? 'no-session';

  const uid = req.user?.id ?? 'anonymous';

  return `teacher-answer:burst:${uid}:${sid}`;

}



function ipKey(req) {

  return `teacher-answer:ip:${getClientIp(req)}`;

}



export const teacherAnswerCreateBurstLimit = createLimit({

  windowMs: BURST_WINDOW_MS,

  max: 3,

  keyGenerator: sessionBurstKey,

  limitType: 'burst',

  bucket: 'answer_burst',

  message: 'Please wait a moment before submitting another answer.',

});



export const teacherAnswerCreateTeacherLimit = createLimit({

  windowMs: HOUR_MS,

  max: 40,

  keyGenerator: teacherIdKey,

  limitType: 'teacher',

  bucket: 'answer_teacher_hourly',

  message: 'You have reached the hourly answer limit. Please try again later.',

});



export const teacherAnswerCreateIpLimit = createLimit({

  windowMs: HOUR_MS,

  max: 80,

  keyGenerator: ipKey,

  limitType: 'ip',

  bucket: 'answer_ip_hourly',

  message: 'Too many requests from this network. Please try again later.',

});


