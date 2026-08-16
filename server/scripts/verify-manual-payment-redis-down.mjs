/**
 * Isolated subprocess: production rate-limit fail-closed when Redis unavailable.
 * Spawned with NODE_ENV=production and no REDIS_URL.
 */
import { manualPaymentSubmitRateLimit } from '../src/middleware/manualPaymentSubmitRateLimit.js';
import { normalizeError } from '../src/errors/middleware/normalizeError.js';
import { RateLimitRedisUnavailableError } from '../src/services/slidingWindowRateLimit.service.js';

let middlewareErr = null;
await manualPaymentSubmitRateLimit(
  { user: { id: 999001 }, params: { orderId: '999002' } },
  { setHeader() {} },
  (err) => {
    middlewareErr = err;
  }
);

const normalizedMiddleware = middlewareErr ? normalizeError(middlewareErr) : null;
const normalizedDirect = normalizeError(new RateLimitRedisUnavailableError());

console.log(
  JSON.stringify(
    {
      middlewareStatus: normalizedMiddleware?.httpStatus ?? null,
      middlewareMessage: normalizedMiddleware?.message ?? null,
      middlewareCode: normalizedMiddleware?.errorCode ?? null,
      normalizeDirectStatus: normalizedDirect.httpStatus,
      normalizeDirectMessage: normalizedDirect.message,
    },
    null,
    2
  )
);

const ok =
  normalizedMiddleware?.httpStatus === 503
  && normalizedDirect.httpStatus === 503
  && /temporarily unavailable/i.test(String(normalizedDirect.message));

process.exit(ok ? 0 : 1);
