import { env } from './env.js';

const DEFAULT_ORPHAN_TTL_HOURS = 24;
const DEFAULT_TEMP_TTL_HOURS = 1;
const DEFAULT_QUARANTINE_RETENTION_DAYS = 30;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_INTERVAL_MINUTES = 360;

/**
 * Q&A orphan upload cleanup configuration.
 */
export function getQaUploadCleanupConfig() {
  const orphanTtlHours = env.qaUploadCleanup?.orphanTtlHours ?? DEFAULT_ORPHAN_TTL_HOURS;
  const tempTtlHours = env.qaUploadCleanup?.tempTtlHours ?? DEFAULT_TEMP_TTL_HOURS;
  const quarantineRetentionDays =
    env.qaUploadCleanup?.quarantineRetentionDays ?? DEFAULT_QUARANTINE_RETENTION_DAYS;
  const batchSize = env.qaUploadCleanup?.batchSize ?? DEFAULT_BATCH_SIZE;
  const scheduleEnabled = env.qaUploadCleanup?.scheduleEnabled ?? false;
  const intervalMinutes = env.qaUploadCleanup?.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES;
  const mode = env.qaUploadCleanup?.mode === 'delete' ? 'delete' : 'quarantine';

  return {
    orphanTtlMs: orphanTtlHours * 60 * 60 * 1000,
    tempTtlMs: tempTtlHours * 60 * 60 * 1000,
    orphanTtlHours,
    tempTtlHours,
    quarantineRetentionDays,
    quarantineRetentionMs: quarantineRetentionDays * 24 * 60 * 60 * 1000,
    batchSize,
    scheduleEnabled,
    intervalMinutes,
    intervalMs: intervalMinutes * 60 * 1000,
    mode,
  };
}
