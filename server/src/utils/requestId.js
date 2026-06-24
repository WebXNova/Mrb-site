import { customAlphabet } from 'nanoid';

const generateRequestId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

/**
 * Generate a unique request ID for tracking
 * Format: req_<16 chars>
 */
export function createRequestId() {
  return `req_${generateRequestId()}`;
}

/**
 * Generate a unique transaction ID for database transactions
 * Format: txn_<16 chars>
 */
export function createTransactionId() {
  return `txn_${generateRequestId()}`;
}

/**
 * Structured logger for consistent logging format
 */
export class StructuredLogger {
  constructor(context = {}) {
    this.context = context;
  }

  _log(level, message, data = {}) {
    if ((level === 'info' || level === 'debug') && process.env.VERBOSE_TELEMETRY !== 'true') {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...this.context,
      ...data,
    };
    
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
    console[method](JSON.stringify(logEntry));
  }

  info(message, data) {
    this._log('info', message, data);
  }

  error(message, data) {
    this._log('error', message, data);
  }

  warn(message, data) {
    this._log('warn', message, data);
  }

  debug(message, data) {
    this._log('debug', message, data);
  }
}
