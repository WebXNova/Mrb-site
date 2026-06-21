/**
 * Production cleanup scheduler bootstrap — starts all retention jobs on server listen.
 *
 * Each scheduler is started independently; a failure to start one job does not
 * block others or crash the HTTP server.
 */

import { startDataRetentionCleanupScheduler } from './dataRetentionCleanupScheduler.js';
import { startIdempotencyCleanupScheduler } from './idempotencyCleanupScheduler.js';

const LOG_PREFIX = '[cleanup-schedulers]';

/** @typedef {{ id: string, label: string, start: () => unknown }} CleanupSchedulerEntry */

/** @type {readonly CleanupSchedulerEntry[]} */
export const PRODUCTION_CLEANUP_SCHEDULERS = Object.freeze([
  {
    id: 'data-retention',
    label: 'activity_logs + processed_webhooks retention',
    start: startDataRetentionCleanupScheduler,
  },
  {
    id: 'idempotency',
    label: 'idempotency_keys cleanup',
    start: startIdempotencyCleanupScheduler,
  },
]);

/**
 * Start all production cleanup schedulers after HTTP listen.
 *
 * @param {readonly CleanupSchedulerEntry[]} [schedulers]
 * @returns {{ started: string[], failed: string[], disabled: string[] }}
 */
export function startProductionCleanupSchedulers(schedulers = PRODUCTION_CLEANUP_SCHEDULERS) {
  /** @type {string[]} */
  const started = [];
  /** @type {string[]} */
  const failed = [];
  /** @type {string[]} */
  const disabled = [];

  for (const scheduler of schedulers) {
    try {
      const handle = scheduler.start();
      if (handle != null) {
        started.push(scheduler.id);
      } else {
        disabled.push(scheduler.id);
      }
    } catch (error) {
      failed.push(scheduler.id);
      console.error(`${LOG_PREFIX} failed to start ${scheduler.id} (${scheduler.label})`, {
        message: error?.message || String(error),
      });
    }
  }

  console.info(`${LOG_PREFIX} bootstrap complete`, {
    started,
    disabled,
    failed,
  });

  return { started, failed, disabled };
}
