import { env } from '../config/env.js';
import { verifyMySqlConnection } from '../config/mysql.js';
import { getObservabilityAccessConfig } from '../config/observabilityAccess.config.js';
import { isAdminRole } from '../utils/isAdminRole.js';
import {
  isInternalObservabilityClient,
  isMetricsScraperAuthorized,
} from '../middleware/observabilityAccess.util.js';

function isProductionRuntime() {
  return (process.env.NODE_ENV || env.nodeEnv || 'development') === 'production';
}

/**
 * @param {import('express').Request} req
 */
export function shouldExposeOperationalDetails(req) {
  const config = getObservabilityAccessConfig();
  if (!config.restrictOperationalDetails) {
    return true;
  }
  if (isMetricsScraperAuthorized(req, config)) {
    return true;
  }
  if (isInternalObservabilityClient(req, config)) {
    return true;
  }
  return Boolean(req.user?.role && isAdminRole(req.user.role));
}

/**
 * Lightweight MySQL pool ping for readiness probes.
 * @returns {Promise<boolean>}
 */
export async function probeMySqlReadiness() {
  try {
    await verifyMySqlConnection();
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {{ redis: boolean, mysql: boolean, emailQueue: boolean }} components
 */
function evaluateReadiness(components) {
  if (!components.mysql) {
    return false;
  }
  if (isProductionRuntime()) {
    return Boolean(components.redis);
  }
  return true;
}

/**
 * @param {import('express').Request} req
 * @param {{ redis: boolean, mysql: boolean, emailQueue: boolean }} components
 */
export function buildReadinessResponse(req, components) {
  const isReady = evaluateReadiness(components);
  const statusCode = isReady ? 200 : 503;

  if (shouldExposeOperationalDetails(req)) {
    return {
      statusCode,
      body: {
        ready: {
          redis: components.redis,
          mysql: components.mysql,
          emailQueue: components.emailQueue,
        },
      },
      message: isReady ? undefined : 'One or more required dependencies are not ready.',
      code: isReady ? undefined : 'SERVICE_NOT_READY',
    };
  }

  return {
    statusCode,
    body: { ready: isReady },
    message: isReady ? undefined : 'Service is not ready.',
    code: isReady ? undefined : 'SERVICE_NOT_READY',
  };
}
