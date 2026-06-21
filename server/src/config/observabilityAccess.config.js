import { env } from './env.js';

const DEFAULT_INTERNAL_CIDRS = Object.freeze([
  '127.0.0.1',
  '::1',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
]);

/**
 * Observability endpoint access — production defaults secure metrics and readiness details.
 */
export function getObservabilityAccessConfig() {
  const secureInProduction = env.nodeEnv === 'production';

  return {
    /** When true, /api/metrics requires admin, scraper token, or internal network. */
    secureMetricsInProduction: parseBoolean(
      process.env.METRICS_SECURE_IN_PRODUCTION,
      secureInProduction
    ),
    /** When true, /api/ready hides redis/emailQueue details from public clients. */
    restrictOperationalDetails: parseBoolean(
      process.env.OPERATIONAL_DETAILS_RESTRICT_IN_PRODUCTION,
      secureInProduction
    ),
    internalCidrs: parseCsv(process.env.OBSERVABILITY_INTERNAL_CIDRS, DEFAULT_INTERNAL_CIDRS),
    scraperToken: String(process.env.METRICS_SCRAPER_TOKEN || '').trim(),
  };
}

function parseCsv(raw, fallback = []) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return [...fallback];
  }
  return String(raw)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseBoolean(raw, fallback) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}
