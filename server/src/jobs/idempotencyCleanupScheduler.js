import { getIdempotencyCleanupConfig } from '../config/idempotencyCleanup.config.js';
import { runIdempotencyCleanup } from '../services/idempotencyCleanup.service.js';

const LOG_PREFIX = '[idempotency-cleanup-scheduler]';

let timer = null;
let running = false;

/**
 * Start in-process idempotency_keys cleanup scheduler.
 * Enabled by default in production (IDEMPOTENCY_CLEANUP_SCHEDULE_ENABLED).
 */
export function startIdempotencyCleanupScheduler() {
  const config = getIdempotencyCleanupConfig();
  if (!config.scheduleEnabled) {
    console.info(`${LOG_PREFIX} disabled (IDEMPOTENCY_CLEANUP_SCHEDULE_ENABLED=false)`);
    return null;
  }

  if (timer) {
    console.warn(`${LOG_PREFIX} already running`);
    return timer;
  }

  const tick = async () => {
    if (running) {
      console.warn(`${LOG_PREFIX} skipped overlapping run`);
      return;
    }
    running = true;
    try {
      await runIdempotencyCleanup();
    } catch (error) {
      console.error(`${LOG_PREFIX} run failed`, error?.message || error);
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => {
    void tick().catch((error) => {
      running = false;
      console.error(`${LOG_PREFIX} scheduled run failed`, error?.message || error);
    });
  }, config.intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  console.info(`${LOG_PREFIX} started`, {
    intervalMinutes: config.intervalMinutes,
    batchSize: config.batchSize,
  });

  const bootTimer = setTimeout(() => {
    void tick().catch((error) => {
      running = false;
      console.error(`${LOG_PREFIX} initial run failed`, error?.message || error);
    });
  }, 90_000);
  if (typeof bootTimer.unref === 'function') bootTimer.unref();

  return timer;
}

export function stopIdempotencyCleanupScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.info(`${LOG_PREFIX} stopped`);
  }
}
