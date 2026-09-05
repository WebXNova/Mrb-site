/**
 * Registered from `server.js` immediately after the production log filter.
 *
 * Policy:
 * - Operational unhandled rejections (Redis/MySQL timeouts, 503s) are logged and do not exit.
 * - Unknown unhandled rejections and uncaught exceptions trigger bounded graceful
 *   shutdown then process.exit(1) so PM2 can restart a clean process.
 * - Tests / MRB_DISABLE_FATAL_EXIT skip process.exit.
 */

import {
  classifyUncaughtException,
  classifyUnhandledRejection,
  shouldExitProcessOnFatal,
} from './utils/fatalErrorPolicy.js';

let fatalShutdownRunner = null;
let fatalExitInProgress = false;

/**
 * @param {() => Promise<void>} runner
 */
export function registerFatalShutdownRunner(runner) {
  fatalShutdownRunner = runner;
}

function logFatal(kind, err, extra = {}) {
  const payload = {
    tag: '[process.fatal]',
    kind,
    name: err instanceof Error ? err.name : typeof err,
    message: err instanceof Error ? err.message : String(err),
    code: err && typeof err === 'object' ? err.code || err.errorCode || null : null,
    stack: err instanceof Error ? err.stack : null,
    ...extra,
  };
  console.error(payload);
}

async function runFatalShutdown(kind, err) {
  if (fatalExitInProgress) {
    return;
  }
  fatalExitInProgress = true;
  logFatal(kind, err, { phase: 'shutdown_start' });

  if (typeof fatalShutdownRunner === 'function') {
    try {
      await Promise.race([
        fatalShutdownRunner(kind, err),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('fatal_shutdown_deadline')), 12_000);
        }),
      ]);
    } catch (shutdownError) {
      logFatal('fatal_shutdown_error', shutdownError);
    }
  }

  if (shouldExitProcessOnFatal()) {
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  const action = classifyUncaughtException(err);
  if (action === 'log') {
    logFatal('uncaughtException', err, { action: 'log_only' });
    return;
  }
  void runFatalShutdown('uncaughtException', err);
});

process.on('unhandledRejection', (err) => {
  const action = classifyUnhandledRejection(err);
  if (action === 'log') {
    logFatal('unhandledRejection', err, { action: 'operational_log_only' });
    return;
  }
  void runFatalShutdown('unhandledRejection', err);
});
