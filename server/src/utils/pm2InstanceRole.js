/**
 * PM2 cluster role helpers — keep background work on a single leader process.
 *
 * PM2 cluster sets NODE_APP_INSTANCE to "0", "1", … per worker.
 * Non-PM2 / single fork (env unset) is always the leader.
 */

/**
 * @param {NodeJS.ProcessEnv} [processEnv]
 * @returns {boolean}
 */
export function isPm2BackgroundLeader(processEnv = process.env) {
  const raw = processEnv.NODE_APP_INSTANCE;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return true;
  }
  return String(raw).trim() === '0';
}

/**
 * Email worker + cleanup schedulers should run on the leader only when clustering.
 * Override with EMAIL_WORKER_ENABLED / BACKGROUND_JOBS_ENABLED = true|false.
 *
 * @param {NodeJS.ProcessEnv} [processEnv]
 * @returns {boolean}
 */
export function shouldStartBackgroundJobs(processEnv = process.env) {
  const override = processEnv.BACKGROUND_JOBS_ENABLED;
  if (override !== undefined && override !== null && String(override).trim() !== '') {
    const v = String(override).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off'].includes(v)) return false;
  }
  return isPm2BackgroundLeader(processEnv);
}

/**
 * @param {NodeJS.ProcessEnv} [processEnv]
 * @returns {boolean}
 */
export function shouldStartEmailQueueWorker(processEnv = process.env) {
  const override = processEnv.EMAIL_WORKER_ENABLED;
  if (override !== undefined && override !== null && String(override).trim() !== '') {
    const v = String(override).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(v)) return true;
    if (['0', 'false', 'no', 'off'].includes(v)) return false;
  }
  return shouldStartBackgroundJobs(processEnv);
}
