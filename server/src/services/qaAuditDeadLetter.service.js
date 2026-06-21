import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getQaAuditLogConfig } from '../config/qaAuditLog.config.js';
import { sanitizeMetadata } from '../utils/logSanitizer.js';
import {
  recordQaAuditDlq,
  recordQaAuditDlqFailure,
} from '../observability/qaAuditMetrics.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..', '..');

/**
 * Append a failed Q&A audit event to the dead-letter queue (JSONL).
 *
 * @param {{
 *   record: Record<string, unknown>,
 *   error: Error|unknown,
 *   attempts: number,
 * }} input
 * @returns {Promise<boolean>}
 */
export async function writeQaAuditDeadLetter({ record, error, attempts }) {
  const config = getQaAuditLogConfig();
  if (!config.dlqEnabled) {
    recordQaAuditDlqFailure();
    return false;
  }

  const dlqDir = path.isAbsolute(config.dlqDir)
    ? config.dlqDir
    : path.join(serverRoot, config.dlqDir);
  const dlqFile = path.join(dlqDir, 'events.jsonl');

  const envelope = {
    schemaVersion: '1.0',
    component: 'qa_audit_dlq',
    timestamp: new Date().toISOString(),
    attempts,
    error: {
      message: error instanceof Error ? error.message : String(error ?? 'unknown'),
      code: error?.code ?? null,
    },
    event: {
      ...record,
      metadata: sanitizeMetadata(record.metadata ?? {}),
    },
  };

  try {
    await fs.mkdir(dlqDir, { recursive: true });
    await fs.appendFile(dlqFile, `${JSON.stringify(envelope)}\n`, 'utf8');
    recordQaAuditDlq();
    return true;
  } catch (dlqError) {
    recordQaAuditDlqFailure();
    console.error(
      JSON.stringify({
        level: 'ERROR',
        alert: 'qa_audit_dlq_write_failed',
        component: 'qa_audit',
        message: dlqError instanceof Error ? dlqError.message : String(dlqError),
        originalAction: record.action ?? null,
        originalAttempts: attempts,
      })
    );
    return false;
  }
}
