import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import testsRoutes from './routes/tests.routes.js';
import studentRoutes from './routes/student.routes.js';
import emailProviderRoutes from './routes/emailProvider.routes.js';
import { isRedisReady } from './config/redis.js';
import { getEmailQueue } from './config/queue.js';
import contactRoutes from './routes/contact.routes.js';
import enrollmentRoutes from './routes/enrollment.routes.js';
import coursesRoutes from './routes/courses.routes.js';
import locationsRoutes from './routes/locations.routes.js';
import questionsRoutes from './routes/questions.routes.js';
import { paymentsWebhookRouter, paymentsApiRouter } from './routes/payments.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { attachRequestContext } from './middleware/requestContext.js';
import { sendError, sendSuccess } from './utils/httpEnvelope.js';
import { applyCeeProtectionGrid } from './security/cee/protectionGrid.js';
import secureMediaRoutes from './routes/secureMedia.routes.js';

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
        "connect-src": ["'self'", ...allowedOrigins],
        "img-src": ["'self'", 'data:', 'https:'],
        "script-src": ["'self'"],
        "style-src": ["'self'"],
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

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

/** CEE Protection Grid — entitlement enforcement before instructional route handlers. */
applyCeeProtectionGrid(app);

/** Secure media (replaces express.static — entitlement required via grid). */
app.use('/api/uploads', secureMediaRoutes);

app.get('/api/health', (req, res) => {
  sendSuccess(res, { message: 'Server healthy' }, 200, { requestId: req.requestId });
});

app.get('/api/ready', async (req, res) => {
  const queue = getEmailQueue();
  const ready = {
    redis: isRedisReady(),
    emailQueue: Boolean(queue),
  };
  const statusCode = ready.redis || env.nodeEnv !== 'production' ? 200 : 503;
  if (statusCode === 200) {
    sendSuccess(res, { ready }, 200, { requestId: req.requestId });
    return;
  }
  sendError(res, 503, 'SERVICE_NOT_READY', 'Redis is required for readiness in production.', {
    requestId: req.requestId,
    ready,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/email', emailProviderRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/locations', locationsRoutes);
app.use('/api/questions', questionsRoutes);
app.use('/api/payments', paymentsApiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
