import { getQaUploadCleanupConfig } from '../config/qaUploadCleanup.config.js';
import { runQaUploadCleanup } from '../services/qaUploadCleanup.service.js';

const LOG_PREFIX = '[qa-upload-cleanup-scheduler]';

let timer = null;
let running = false;

/**
 * Start in-process cleanup scheduler (opt-in via QA_UPLOAD_CLEANUP_SCHEDULE_ENABLED).
 */
export function startQaUploadCleanupScheduler() {
  const config = getQaUploadCleanupConfig();
  if (!config.scheduleEnabled) {
    console.info(`${LOG_PREFIX} disabled (QA_UPLOAD_CLEANUP_SCHEDULE_ENABLED=false)`);
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
      await runQaUploadCleanup({ purgeQuarantine: true });
    } catch (error) {
      console.error(`${LOG_PREFIX} run failed`, error?.message || error);
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, config.intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  console.info(`${LOG_PREFIX} started`, { intervalMinutes: config.intervalMinutes });
  void tick();
  return timer;
}

export function stopQaUploadCleanupScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.info(`${LOG_PREFIX} stopped`);
  }
}
