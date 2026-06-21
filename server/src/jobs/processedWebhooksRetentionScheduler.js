import { getProcessedWebhooksRetentionConfig } from '../config/processedWebhooksRetention.config.js';
import { runProcessedWebhooksRetention } from '../services/processedWebhooksRetention.service.js';

const LOG_PREFIX = '[processed-webhooks-retention-scheduler]';

let timer = null;
let running = false;

/**
 * Start in-process processed_webhooks retention scheduler.
 * Enabled by default in production (PROCESSED_WEBHOOKS_RETENTION_SCHEDULE_ENABLED).
 */
export function startProcessedWebhooksRetentionScheduler() {
  const config = getProcessedWebhooksRetentionConfig();
  if (!config.scheduleEnabled) {
    console.info(`${LOG_PREFIX} disabled (PROCESSED_WEBHOOKS_RETENTION_SCHEDULE_ENABLED=false)`);
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
      await runProcessedWebhooksRetention();
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

  const bootTimer = setTimeout(() => {
    void tick();
  }, 120_000);
  if (typeof bootTimer.unref === 'function') bootTimer.unref();

  return timer;
}

export function stopProcessedWebhooksRetentionScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.info(`${LOG_PREFIX} stopped`);
  }
}
