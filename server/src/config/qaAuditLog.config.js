import { env } from './env.js';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 100;
const DEFAULT_ALERT_THRESHOLD = 5;
const DEFAULT_ALERT_WINDOW_MS = 60_000;

/**
 * Hardened Q&A audit logging configuration.
 */
export function getQaAuditLogConfig() {
  const cfg = env.qaAuditLog ?? {};

  return {
    maxRetries: Math.max(1, Number(cfg.maxRetries ?? DEFAULT_MAX_RETRIES)),
    retryDelayMs: Math.max(25, Number(cfg.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS)),
    dlqEnabled: cfg.dlqEnabled !== false,
    dlqDir: String(cfg.dlqDir || 'data/qa-audit-dlq'),
    stdoutEnabled: Boolean(cfg.stdoutEnabled),
    alertThreshold: Math.max(1, Number(cfg.alertThreshold ?? DEFAULT_ALERT_THRESHOLD)),
    alertWindowMs: Math.max(10_000, Number(cfg.alertWindowMs ?? DEFAULT_ALERT_WINDOW_MS)),
  };
}
