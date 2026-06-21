import { getActivityLogRetentionConfig } from '../config/activityLogRetention.config.js';
import { runActivityLogRetention } from '../services/activityLogRetention.service.js';

const LOG_PREFIX = '[activity-log-retention-scheduler]';

let timer = null;
let running = false;

/**
 * Start in-process activity_logs retention scheduler.
 * Enabled by default in production (ACTIVITY_LOG_RETENTION_SCHEDULE_ENABLED).
 */
export function startActivityLogRetentionScheduler() {
  const config = getActivityLogRetentionConfig();
  if (!config.scheduleEnabled) {
    console.info(`${LOG_PREFIX} disabled (ACTIVITY_LOG_RETENTION_SCHEDULE_ENABLED=false)`);
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
      await runActivityLogRetention();
    } catch (error) {
      console.error(`${LOG_PREFIX} run failed`, error?.message || error);
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, config.intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  console.info(`${LOG_PREFIX} started`, {
    intervalMinutes: config.intervalMinutes,
    retentionDays: config.retentionDays,
    batchSize: config.batchSize,
  });

  // Stagger first run slightly after boot to avoid competing with startup work.
  const bootTimer = setTimeout(() => {
    void tick();
  }, 60_000);
  if (typeof bootTimer.unref === 'function') bootTimer.unref();

  return timer;
}

export function stopActivityLogRetentionScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.info(`${LOG_PREFIX} stopped`);
  }
}
