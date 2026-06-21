/**
 * Shared batched DELETE loop for retention jobs — bounded batches, pauses, retries.
 * Runs off the request path (called from background schedulers only).
 */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {{
 *   deleteBatch: (batchSize: number) => Promise<number>,
 *   batchSize: number,
 *   batchPauseMs?: number,
 *   maxBatchesPerRun?: number,
 *   maxRetriesPerBatch?: number,
 *   retryBasePauseMs?: number,
 * }} params
 * @returns {Promise<{ batches: number, deleted: number, truncated: boolean, retriedBatches: number }>}
 */
export async function runBatchedRetentionDeletes({
  deleteBatch,
  batchSize,
  batchPauseMs = 50,
  maxBatchesPerRun = 200,
  maxRetriesPerBatch = 3,
  retryBasePauseMs = 200,
}) {
  const limit = Math.max(1, Number(batchSize) || 500);
  const pauseMs = Math.max(0, Number(batchPauseMs) || 0);
  const maxBatches = Math.max(1, Number(maxBatchesPerRun) || 1);
  const maxRetries = Math.max(1, Number(maxRetriesPerBatch) || 1);
  const retryPauseMs = Math.max(0, Number(retryBasePauseMs) || 0);

  const summary = {
    batches: 0,
    deleted: 0,
    truncated: false,
    retriedBatches: 0,
  };

  while (summary.batches < maxBatches) {
    let batchDeleted = 0;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        batchDeleted = await deleteBatch(limit);
        lastError = null;
        if (attempt > 1) {
          summary.retriedBatches += 1;
        }
        break;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries && retryPauseMs > 0) {
          await sleep(retryPauseMs * attempt);
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    summary.batches += 1;
    summary.deleted += batchDeleted;

    if (batchDeleted < limit) {
      break;
    }
    if (summary.batches >= maxBatches) {
      summary.truncated = true;
      break;
    }
    if (pauseMs > 0) {
      await sleep(pauseMs);
    }
  }

  return summary;
}
