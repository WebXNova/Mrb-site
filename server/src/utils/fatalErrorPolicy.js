/**
 * Classify process-level failures so operational dependency errors are not treated
 * as fatal programmer bugs. Used by bootstrapFatalHandlers.
 */

const OPERATIONAL_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EPIPE',
  'ECONNABORTED',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'AbortError',
  'ABORT_ERR',
]);

const OPERATIONAL_NAME_RE =
  /RedisCommandTimeout|RedisUnavailable|RateLimitRedisUnavailable|MySqlAcquire|MySqlQuery|MySqlPool|MySqlTransaction|ExternalRequestTimeout|EmailDelivery/i;

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isOperationalProcessError(err) {
  if (!err || typeof err !== 'object') {
    return false;
  }

  if (err.isOperational === true) {
    return true;
  }

  const httpStatus = Number(err.httpStatus ?? err.statusCode ?? 0);
  if (httpStatus === 429 || httpStatus === 503) {
    return true;
  }

  const code = String(err.code || '');
  if (OPERATIONAL_CODES.has(code)) {
    return true;
  }

  const name = String(err.name || '');
  if (OPERATIONAL_NAME_RE.test(name)) {
    return true;
  }

  return false;
}

/**
 * Unhandled rejections: keep the process alive only for classified operational errors.
 * Unknown rejections are fatal (corrupted state risk).
 *
 * @param {unknown} err
 * @returns {'log' | 'fatal'}
 */
export function classifyUnhandledRejection(err) {
  return isOperationalProcessError(err) ? 'log' : 'fatal';
}

/**
 * Uncaught exceptions are always fatal except clearly ignorable socket noise
 * after the client already disconnected.
 *
 * @param {unknown} err
 * @returns {'log' | 'fatal'}
 */
export function classifyUncaughtException(err) {
  if (err && typeof err === 'object' && err.code === 'EPIPE') {
    return 'log';
  }
  return 'fatal';
}

export function shouldExitProcessOnFatal() {
  if (process.env.MRB_DISABLE_FATAL_EXIT === 'true') {
    return false;
  }
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  return true;
}
