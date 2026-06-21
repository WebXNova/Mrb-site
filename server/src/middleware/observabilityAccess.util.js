import crypto from 'crypto';
import { getObservabilityAccessConfig } from '../config/observabilityAccess.config.js';
import { isIpAllowlistedAny } from '../utils/ipAllowlist.util.js';
import { getClientIp } from '../utils/network.js';

/**
 * @param {import('express').Request} req
 */
export function getMetricsScraperToken(req) {
  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const header = req.headers?.['x-metrics-token'];
  return typeof header === 'string' ? header.trim() : '';
}

/**
 * @param {import('express').Request} req
 * @param {{ scraperToken?: string }} [config]
 */
export function isMetricsScraperAuthorized(req, config = getObservabilityAccessConfig()) {
  const expected = String(config.scraperToken || '').trim();
  if (!expected) return false;

  const provided = getMetricsScraperToken(req);
  if (!provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/**
 * @param {import('express').Request} req
 * @param {ReturnType<typeof getObservabilityAccessConfig>} config
 */
export function isInternalObservabilityClient(req, config) {
  return isIpAllowlistedAny(getClientIp(req), config.internalCidrs);
}

/**
 * @param {import('express').Request} req
 * @param {ReturnType<typeof getObservabilityAccessConfig>} config
 */
export function evaluateMetricsAccess(req, config = getObservabilityAccessConfig()) {
  if (!config.secureMetricsInProduction) {
    return { allowed: true, reason: 'development_open' };
  }
  if (isMetricsScraperAuthorized(req, config)) {
    return { allowed: true, reason: 'scraper_token' };
  }
  if (isInternalObservabilityClient(req, config)) {
    return { allowed: true, reason: 'internal_network' };
  }
  return { allowed: false, reason: 'admin_required' };
}
