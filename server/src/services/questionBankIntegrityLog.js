const LOG_PREFIX = '[question-bank:integrity]';

/**
 * Structured integrity logging — never auto-repair; record and reject.
 */

/**
 * @param {string} event
 * @param {Record<string, unknown>} [metadata]
 */
function writeIntegrityLog(level, event, metadata = {}) {
  const payload = {
    event,
    ts: new Date().toISOString(),
    ...metadata,
  };

  if (level === 'error') {
    console.error(`${LOG_PREFIX} ${event}`, payload);
    return;
  }

  if (level === 'warn') {
    console.warn(`${LOG_PREFIX} ${event}`, payload);
    return;
  }

  console.info(`${LOG_PREFIX} ${event}`, payload);
}

/**
 * Invalid or malformed write payload received (pre-validation).
 * @param {Record<string, unknown>} metadata
 */
export function logInvalidPayloadAttempt(metadata) {
  writeIntegrityLog('warn', 'INVALID_PAYLOAD_ATTEMPT', metadata);
}

/**
 * Business-rule / integrity validation failed — write rejected.
 * @param {Record<string, unknown>} metadata
 */
export function logValidationFailure(metadata) {
  writeIntegrityLog('warn', 'VALIDATION_FAILURE', metadata);
}

/**
 * Transaction rolled back due to integrity or persistence failure.
 * @param {Record<string, unknown>} metadata
 */
export function logTransactionRollback(metadata) {
  writeIntegrityLog('error', 'TRANSACTION_ROLLBACK', metadata);
}

/**
 * Post-commit read-back integrity check failed (should be rare).
 * @param {Record<string, unknown>} metadata
 */
export function logPostWriteIntegrityFailure(metadata) {
  writeIntegrityLog('error', 'POST_WRITE_INTEGRITY_FAILURE', metadata);
}
