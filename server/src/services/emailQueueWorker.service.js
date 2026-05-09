import { startEmailWorker } from '../config/queue.js';
import { isTerminalEmailError, sendEmailNow } from './email.service.js';
import { logActivity } from './activityLog.service.js';
import { mysqlPool } from '../config/mysql.js';

let worker = null;

export function startEmailQueueWorker() {
  if (worker) return worker;
  console.log('[email-worker] Starting email queue worker');
  worker = startEmailWorker(async (job) => {
    console.log('[email-worker] Processing job', {
      jobId: job?.id || null,
      outboxId: job?.data?.outboxId || null,
      to: job?.data?.to || null,
    });
    if (job.data?.outboxId) {
      await mysqlPool.query(`UPDATE email_outbox SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
        job.data.outboxId,
      ]);
    }
    await sendEmailNow(job.data);
    if (job.data?.outboxId) {
      await mysqlPool.query(`UPDATE email_outbox SET status = 'sent', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
        job.data.outboxId,
      ]);
    }
    await logActivity({
      userId: job.data.userId || null,
      role: job.data.userId ? 'student' : 'system',
      action: 'email.sendgrid.accepted',
      entityType: 'email',
      metadata: { to: job.data.to, outboxId: job.data?.outboxId || null },
    });
    console.log('[email-worker] Job sent successfully', {
      jobId: job?.id || null,
      outboxId: job?.data?.outboxId || null,
    });
  });
  if (!worker) {
    console.warn('[email-worker] Worker disabled because Redis queue connection is unavailable');
    return null;
  }
  worker.on('failed', async (job, error) => {
    let terminal = isTerminalEmailError(error);
    if (job?.data?.outboxId) {
      const attempts = Number(job.attemptsMade || 0);
      terminal = terminal || attempts >= Number(job.opts?.attempts || 5);
      await mysqlPool.query(
        `UPDATE email_outbox
         SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [terminal ? 'dlq' : 'failed', String(error.message || 'delivery_failed').slice(0, 255), job.data.outboxId]
      );
      if (terminal) {
        await mysqlPool.query(
          `INSERT INTO email_delivery_dlq (outbox_id, recipient_email, reason, payload_json)
           VALUES (?, ?, ?, ?)`,
          [
            job.data.outboxId,
            String(job.data.to || ''),
            String(error.message || 'delivery_failed').slice(0, 255),
            JSON.stringify(job.data || {}),
          ]
        );
      }
    }
    await logActivity({
      userId: job?.data?.userId || null,
      role: job?.data?.userId ? 'student' : 'system',
      action: terminal ? 'email.sendgrid.rejected' : 'email.sendgrid.deferred',
      entityType: 'email',
      metadata: {
        to: job?.data?.to,
        outboxId: job?.data?.outboxId || null,
        reason: String(error?.message || 'delivery_failed').slice(0, 255),
        attempts: job?.attemptsMade,
        statusCode: error?.statusCode || null,
        retryable: terminal ? false : true,
      },
    });
    console.error('[email-worker] Job failed', {
      jobId: job?.id || null,
      outboxId: job?.data?.outboxId || null,
      statusCode: error?.statusCode || null,
      retryable: terminal ? false : true,
      reason: String(error?.message || 'delivery_failed').slice(0, 255),
      providerErrors: error?.details?.providerErrors || null,
      responseBody: error?.details?.responseBody || null,
    });
  });
  return worker;
}

