import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
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
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { attachRequestContext } from './middleware/requestContext.js';

export const app = express();
app.set('trust proxy', env.security.trustProxy);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.resolve(__dirname, '../uploads');

const allowedOrigins = env.security.trustedOrigins;

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
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(attachRequestContext);
app.use('/api/uploads', express.static(uploadsRoot));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server healthy',
    requestId: req.requestId,
  });
});

app.get('/api/ready', async (req, res) => {
  const queue = getEmailQueue();
  const ready = {
    redis: isRedisReady(),
    emailQueue: Boolean(queue),
  };
  const statusCode = ready.redis || env.nodeEnv !== 'production' ? 200 : 503;
  res.status(statusCode).json({
    success: statusCode === 200,
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

app.use(notFoundHandler);
app.use(errorHandler);
