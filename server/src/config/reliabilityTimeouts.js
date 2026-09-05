/**
 * Bounded deadlines for Redis, queues, outbound HTTP, and Node's HTTP server.
 *
 * Nginx (deployment/nginx/proxy-api.conf + mrb-learning.conf.template):
 *   proxy_connect_timeout 10s
 *   proxy_send_timeout    60s
 *   proxy_read_timeout    95s  (≤ Cloudflare ~100s when CF proxies /api)
 *   upstream keepalive    32
 *
 * Node keepAliveTimeout must exceed how long Nginx will reuse an idle upstream
 * socket. The previous implicit Node default (5s) caused intermittent 502 /
 * ECONNRESET. headersTimeout must be greater than keepAliveTimeout (Node rule).
 * requestTimeout is slightly above Nginx read timeout so Nginx emits 504 first
 * instead of Node aborting the socket (502).
 */

function parsePositiveIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback;
  }
  const trimmed = String(raw).trim();
  if (!/^\d+$/.test(trimmed)) {
    return fallback;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export const REDIS_CONNECT_TIMEOUT_MS = parsePositiveIntEnv('REDIS_CONNECT_TIMEOUT_MS', 2_000);
export const REDIS_COMMAND_TIMEOUT_MS = parsePositiveIntEnv('REDIS_COMMAND_TIMEOUT_MS', 1_500);

export const BULLMQ_QUEUE_CONNECT_TIMEOUT_MS = parsePositiveIntEnv(
  'BULLMQ_QUEUE_CONNECT_TIMEOUT_MS',
  2_000
);
export const BULLMQ_QUEUE_COMMAND_TIMEOUT_MS = parsePositiveIntEnv(
  'BULLMQ_QUEUE_COMMAND_TIMEOUT_MS',
  2_000
);
export const EMAIL_QUEUE_ADD_TIMEOUT_MS = parsePositiveIntEnv('EMAIL_QUEUE_ADD_TIMEOUT_MS', 2_500);

export const TURNSTILE_TIMEOUT_MS = parsePositiveIntEnv('TURNSTILE_TIMEOUT_MS', 4_000);
export const GOOGLE_AUTH_TIMEOUT_MS = parsePositiveIntEnv('GOOGLE_AUTH_TIMEOUT_MS', 5_000);
export const SAFEPAY_REQUEST_TIMEOUT_MS = parsePositiveIntEnv('SAFEPAY_REQUEST_TIMEOUT_MS', 8_000);
export const SENDGRID_TIMEOUT_MS = parsePositiveIntEnv('SENDGRID_TIMEOUT_MS', 8_000);
export const SMTP_CONNECTION_TIMEOUT_MS = parsePositiveIntEnv('SMTP_CONNECTION_TIMEOUT_MS', 5_000);
export const SMTP_GREETING_TIMEOUT_MS = parsePositiveIntEnv('SMTP_GREETING_TIMEOUT_MS', 5_000);
export const SMTP_SOCKET_TIMEOUT_MS = parsePositiveIntEnv('SMTP_SOCKET_TIMEOUT_MS', 15_000);
export const EMAIL_SEND_TIMEOUT_MS = parsePositiveIntEnv('EMAIL_SEND_TIMEOUT_MS', 15_000);

/** Idle keepalive — must be >> Node default 5s so Nginx upstream reuse does not 502. */
export const HTTP_KEEPALIVE_TIMEOUT_MS = parsePositiveIntEnv('HTTP_KEEPALIVE_TIMEOUT_MS', 65_000);
/** Must be > keepAliveTimeout (Node.js requirement). */
export const HTTP_HEADERS_TIMEOUT_MS = parsePositiveIntEnv('HTTP_HEADERS_TIMEOUT_MS', 70_000);
/** Slightly above Nginx proxy_read_timeout 95s. */
export const HTTP_REQUEST_TIMEOUT_MS = parsePositiveIntEnv('HTTP_REQUEST_TIMEOUT_MS', 100_000);

export const HTTP_SHUTDOWN_DRAIN_MS = parsePositiveIntEnv('HTTP_SHUTDOWN_DRAIN_MS', 8_000);
export const HTTP_SHUTDOWN_DEADLINE_MS = parsePositiveIntEnv('HTTP_SHUTDOWN_DEADLINE_MS', 14_000);

export const STARTUP_DEADLINE_MS = parsePositiveIntEnv('STARTUP_DEADLINE_MS', 180_000);

export function getHttpServerTimeoutConfig() {
  return {
    keepAliveTimeout: HTTP_KEEPALIVE_TIMEOUT_MS,
    headersTimeout: HTTP_HEADERS_TIMEOUT_MS,
    requestTimeout: HTTP_REQUEST_TIMEOUT_MS,
  };
}
