import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import {
  getAdminApiMountPath,
  getAdminSecretPathSegments,
} from './config/adminSecretPath.config.js';
import authRoutes from './routes/auth.routes.js';
import adminAuthRoutes from './routes/adminAuth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import adminCoursesReadRoutes from './routes/adminCoursesRead.routes.js';
import testQuizDraftRoutes from './routes/testQuizDraft.routes.js';
import testsRoutes from './routes/tests.routes.js';
import studentRoutes from './routes/student.routes.js';
import teacherRoutes from './routes/teacher.routes.js';
import emailProviderRoutes, { emailProviderWebhookRouter } from './routes/emailProvider.routes.js';
import { isRedisReady } from './config/redis.js';
import { getEmailQueue } from './config/queue.js';
import contactRoutes from './routes/contact.routes.js';
import enrollmentRoutes, { adminEnrollmentRouter } from './routes/enrollment.routes.js';
import coursesRoutes from './routes/courses.routes.js';
import locationsRoutes from './routes/locations.routes.js';
import questionsRoutes from './routes/questions.routes.js';
import { paymentsWebhookRouter, paymentsApiRouter } from './routes/payments.routes.js';
import attemptRoutes from './attempt/attempt.routes.js';
import answerRoutes from './answer/answer.routes.js';
import submitRoutes from './submit/submit.routes.js';
import resultRoutes from './result/result.routes.js';
import legacyRuntimeRoutes from './routes/legacyRuntime.routes.js';
import { isLegacyStudentRuntimeEnabled } from './runtime/legacyRuntimeDeprecation.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { attachRequestContext } from './middleware/requestContext.js';
import { sendError, sendSuccess } from './utils/httpEnvelope.js';
import { applyCeeProtectionGrid } from './security/cee/protectionGrid.js';
import { studentRuntimeMetricsMiddleware } from './middleware/studentRuntimeMetrics.middleware.js';
import secureMediaRoutes from './routes/secureMedia.routes.js';
import { getMetrics } from './controllers/metrics.controller.js';
import {
  optionalAdminContext,
  requireMetricsAccess,
} from './middleware/observabilityAccess.js';
import { buildReadinessResponse, probeMySqlReadiness } from './services/observabilityReadiness.service.js';
import { adminSecretPathGate } from './middleware/adminSecretPathGate.js';

export const app = express();
app.set('trust proxy', env.security.trustProxy);

const allowedOrigins = env.security.trustedOrigins;

if (env.nodeEnv !== 'production') {
  app.use((req, res, next) => {
    console.log('GLOBAL REQUEST:', req.method, req.url);
    next();
  });
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      // Deny silently (browser blocks). Throwing invokes errorHandler → misleading HTTP 500 for all API calls.
      if (env.nodeEnv !== 'test') {
        console.warn('[cors] Origin not allowed (add CLIENT_URL/TRUSTED_ORIGINS):', origin);
      }
      callback(null, false);
    },
    credentials: true,
  })
);
app.use(
  helmet({
    hsts: env.nodeEnv === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    contentSecurityPolicy: {
      useDefaults: true,
      reportOnly: env.nodeEnv !== 'production',
      directives: {
        "default-src": ["'self'"],
        "connect-src": ["'self'", ...allowedOrigins, 'https://accounts.google.com'],
        "img-src": ["'self'", 'data:', 'https:'],
        "script-src": ["'self'", 'https://accounts.google.com'],
        "style-src": ["'self'", "'unsafe-inline'"],
        "frame-src": ["'self'", 'https://accounts.google.com'],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "frame-ancestors": ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  })
);

/**
 * WHY before raw/webhook parsers: every ingress (especially payment webhooks) needs a correlatable request id,
 * independent of downstream JSON/cookie parsers.
 */
app.use(attachRequestContext);

/**
 * WHY before `express.json()`: `/api/payments/webhook` HMAC binds to exact raw JSON octets — if `express.json`
 * executes first it consumes & normalises the stream and signature verification FAILS CLOSED forever.
 *
 * WHY only POST + router-isolated middleware: minimise attack surface versus `app.use(express.raw(global))`,
 * avoid parsing PDFs/binary as gateways and avoid RAM denial-of-service on benign JSON routes.
 */
app.use('/api/payments', paymentsWebhookRouter);

/** Email provider webhook — raw body HMAC before express.json(). */
app.use('/api/email', emailProviderWebhookRouter);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

/** Secret-path gate — before auth, authorization, and controllers (generic 404). */
app.use(adminSecretPathGate);

/** CEE Protection Grid — entitlement enforcement before instructional route handlers. */
applyCeeProtectionGrid(app);

/** Student runtime HTTP metrics + audit (slug, portal, legacy). */
app.use(studentRuntimeMetricsMiddleware);

/** Secure media (replaces express.static — entitlement required via grid). */
app.use('/api/uploads', secureMediaRoutes);

app.get('/api/health', (req, res) => {
  sendSuccess(res, { status: 'ok' }, 200, { requestId: req.requestId });
});

app.get('/api/metrics', requireMetricsAccess, getMetrics);

app.get('/api/ready', optionalAdminContext, async (req, res) => {
  const queue = getEmailQueue();
  const mysql = await probeMySqlReadiness();
  const readiness = buildReadinessResponse(req, {
    redis: isRedisReady(),
    mysql,
    emailQueue: Boolean(queue),
  });

  if (readiness.statusCode === 200) {
    sendSuccess(res, readiness.body, 200, { requestId: req.requestId });
    return;
  }

  sendError(res, readiness.statusCode, readiness.code, readiness.message, {
    requestId: req.requestId,
    ...readiness.body,
  });
});

app.use('/api/auth', authRoutes);

/** Admin portal — `/api/admin/<ADMIN_SECRET_PATH>/...` */
const adminApiMount = getAdminApiMountPath();
app.use(`${adminApiMount}/auth`, adminAuthRoutes);
app.use(adminApiMount, adminRoutes);
app.use(`${adminApiMount}/enrollments`, adminEnrollmentRouter);
app.use(`${adminApiMount}/courses`, adminCoursesReadRoutes);
app.use(`${adminApiMount}/questions`, questionsRoutes);
app.use(`${adminApiMount}/tests`, testQuizDraftRoutes);

/** Rotation window: accept previous secret segments until env is updated. */
for (const previousSegment of getAdminSecretPathSegments().slice(1)) {
  const previousMount = `/api/admin/${previousSegment}`;
  app.use(`${previousMount}/auth`, adminAuthRoutes);
  app.use(previousMount, adminRoutes);
  app.use(`${previousMount}/enrollments`, adminEnrollmentRouter);
  app.use(`${previousMount}/courses`, adminCoursesReadRoutes);
  app.use(`${previousMount}/questions`, questionsRoutes);
  app.use(`${previousMount}/tests`, testQuizDraftRoutes);
}

app.use('/api/tests', testsRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/teacher', teacherRoutes);
/**
 * Student test runtime mounts (G-RT-01 / G-RT-02).
 * Default: legacy /api/attempt(s) return 410 with canonical migration map.
 * Emergency rollback only: LEGACY_RUNTIME_ALLOW=true (CEE entitlement still enforced).
 */
if (isLegacyStudentRuntimeEnabled()) {
  if (env.nodeEnv === 'production') {
    console.warn(
      '[runtime] LEGACY_RUNTIME_ALLOW is enabled — legacy student endpoints are exposed. Migrate to /api/tests and /api/student.'
    );
  }
  app.use('/api/attempt', attemptRoutes);
  app.use('/api/attempts', answerRoutes);
  app.use('/api/attempts', submitRoutes);
  app.use('/api/attempts', resultRoutes);
} else {
  app.use('/api/attempt', legacyRuntimeRoutes);
  app.use('/api/attempts', legacyRuntimeRoutes);
}
app.use('/api/email', emailProviderRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/payments', paymentsApiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
