import {
  getAdminApiNamespace,
  getAdminSecretPathSegments,
  isLegacyPredictableAdminPath,
  isValidAdminSecretSegment,
} from '../config/adminSecretPath.config.js';
import { sendError } from '../utils/httpEnvelope.js';

const ADMIN_API_NS = getAdminApiNamespace();

function normalizePath(req) {
  return String(req.path || req.originalUrl?.split('?')[0] || '');
}

function notFound(req, res) {
  return sendError(res, 404, 'NOT_FOUND', 'Not found', {
    requestId: req.requestId ?? null,
  });
}

/**
 * Centralized admin secret-path gate.
 *
 * Executes before authentication, authorization, and route controllers.
 * Invalid or missing secret segments receive a generic 404 with no hints.
 */
export function adminSecretPathGate(req, res, next) {
  const path = normalizePath(req);

  if (isLegacyPredictableAdminPath(path)) {
    return notFound(req, res);
  }

  if (!path.startsWith(ADMIN_API_NS)) {
    return next();
  }

  const remainder = path.slice(ADMIN_API_NS.length);
  if (!remainder || remainder === '/') {
    return notFound(req, res);
  }

  const secretCandidate = remainder.split('/').filter(Boolean)[0];
  if (!secretCandidate || !isValidAdminSecretSegment(secretCandidate)) {
    return notFound(req, res);
  }

  return next();
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isAdminApiPathWithValidSecret(path) {
  const normalized = String(path || '').split('?')[0];
  if (!normalized.startsWith(ADMIN_API_NS)) return false;

  const remainder = normalized.slice(ADMIN_API_NS.length);
  const secretCandidate = remainder.split('/').filter(Boolean)[0];
  return Boolean(secretCandidate && isValidAdminSecretSegment(secretCandidate));
}

/** @internal Test helper — segment list used by gate (no values logged). */
export function getConfiguredAdminSecretSegmentCount() {
  return getAdminSecretPathSegments().length;
}
