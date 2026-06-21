/**
 * Unified background scheduler for production data retention cleanup.
 *
 * Purges expired rows only (default 90 days):
 * - activity_logs
 * - processed_webhooks
 *
 * Non-blocking: setInterval + timer.unref(), batched DELETE with pauses/retries in services.
 */

import { getActivityLogRetentionConfig } from '../config/activityLogRetention.config.js';
import { getProcessedWebhooksRetentionConfig } from '../config/processedWebhooksRetention.config.js';
import { env } from '../config/env.js';
import { runActivityLogRetention } from '../services/activityLogRetention.service.js';
import { runProcessedWebhooksRetention } from '../services/processedWebhooksRetention.service.js';

const LOG_PREFIX = '[data-retention-scheduler]';

let timer = null;
let running = false;

function parseBoolean(raw, fallback) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off'].includes(v)) return false;
  return fallback;
}

function parseNumber(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function getDataRetentionSchedulerConfig() {
  const activity = getActivityLogRetentionConfig();
  const webhooks = getProcessedWebhooksRetentionConfig();
  const scheduleEnabled = parseBoolean(
    process.env.DATA_RETENTION_SCHEDULE_ENABLED,
    env.nodeEnv === 'production'
  );
  const intervalMinutes = parseNumber(
    process.env.DATA_RETENTION_INTERVAL_MINUTES,
    Math.min(activity.intervalMinutes, webhooks.intervalMinutes)
  );

  return {
    scheduleEnabled,
    intervalMinutes,
    intervalMs: intervalMinutes * 60 * 1000,
    activityLogEnabled: activity.scheduleEnabled,
    processedWebhooksEnabled: webhooks.scheduleEnabled,
    activityRetentionDays: activity.retentionDays,
    processedWebhooksRetentionDays: webhooks.retentionDays,
  };
}

/**
 * Start unified retention scheduler (activity_logs + processed_webhooks).
 */
export function startDataRetentionCleanupScheduler() {
  const config = getDataRetentionSchedulerConfig();
  if (!config.scheduleEnabled) {
    console.info(`${LOG_PREFIX} disabled (DATA_RETENTION_SCHEDULE_ENABLED=false)`);
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
      if (config.activityLogEnabled) {
        try {
          await runActivityLogRetention();
        } catch (error) {
          console.error(`${LOG_PREFIX} activity_logs cleanup failed`, error?.message || error);
        }
      }

      if (config.processedWebhooksEnabled) {
        try {
          await runProcessedWebhooksRetention();
        } catch (error) {
          console.error(`${LOG_PREFIX} processed_webhooks cleanup failed`, error?.message || error);
        }
      }
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
    activityLogsRetentionDays: config.activityRetentionDays,
    processedWebhooksRetentionDays: config.processedWebhooksRetentionDays,
    activityLogEnabled: config.activityLogEnabled,
    processedWebhooksEnabled: config.processedWebhooksEnabled,
  });

  const bootTimer = setTimeout(() => {
    void tick().catch((error) => {
      running = false;
      console.error(`${LOG_PREFIX} initial run failed`, error?.message || error);
    });
  }, 60_000);
  if (typeof bootTimer.unref === 'function') bootTimer.unref();

  return timer;
}

export function stopDataRetentionCleanupScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.info(`${LOG_PREFIX} stopped`);
  }
}
