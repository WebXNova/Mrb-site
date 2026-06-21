/**
 * Q&A orphan upload cleanup — production-grade storage reclamation.
 *
 * Safety rules (all required):
 *  - Never delete/quarantine files referenced in student_questions
 *  - Never delete/quarantine files younger than configurable TTL
 *  - Transactional re-check immediately before each file action
 *  - Default mode: quarantine (recoverable) not hard delete
 *  - Dry-run / audit modes for operator review
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { mysqlPool } from '../config/mysql.js';
import { getQaUploadCleanupConfig } from '../config/qaUploadCleanup.config.js';
import {
  QA_UPLOAD_NAMESPACES,
  QA_UPLOAD_QUARANTINE_ROOT,
} from '../constants/qaUpload.constants.js';
import { QA_AUDIT_CATEGORIES } from '../constants/qaAudit.schema.js';
import { writeQaAuditEvent } from './qaAuditLog.service.js';
import {
  isUploadStillReferenced,
  loadReferencedUploadIndex,
} from './qaUploadReferenceIndex.service.js';
import { recordQaUploadCleanupRun } from '../observability/qaUploadCleanupMetrics.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsRoot = path.resolve(__dirname, '../../uploads');

const LOG_PREFIX = '[qa-upload-cleanup]';

/**
 * @typedef {'abandoned_temp'|'unlinked_question'|'unlinked_answer'|'ttl_expired'} OrphanReason
 */

/**
 * @typedef {Object} OrphanCandidate
 * @property {string} namespace
 * @property {string} filename
 * @property {string} absolutePath
 * @property {number} sizeBytes
 * @property {number} ageMs
 * @property {OrphanReason} reason
 */

function isSafeFilename(filename) {
  const base = path.basename(String(filename || ''));
  return Boolean(base && base === filename && !base.includes('..') && !/[\\/]/.test(base));
}

/**
 * @param {string} namespace
 */
function namespaceDir(namespace) {
  return path.resolve(uploadsRoot, namespace);
}

/**
 * @param {string} namespace
 * @param {string} filename
 */
function quarantinePath(namespace, filename) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return path.resolve(uploadsRoot, QA_UPLOAD_QUARANTINE_ROOT, namespace, date, filename);
}

/**
 * @param {string} filename
 * @param {string} namespace
 */
function classifyOrphanReason(filename, namespace) {
  if (filename.endsWith('.upload')) return 'abandoned_temp';
  if (namespace === 'student-qa') return 'unlinked_question';
  if (namespace === 'teacher-qa') return 'unlinked_answer';
  return 'ttl_expired';
}

/**
 * @param {string} namespace
 * @param {Set<string>} referenced
 * @param {{ orphanTtlMs: number, tempTtlMs: number, nowMs: number }} limits
 */
async function scanNamespaceForCandidates(namespace, referenced, limits) {
  const dir = namespaceDir(namespace);
  let entries = [];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    if (error?.code === 'ENOENT') return { candidates: [], skippedYoung: 0 };
    throw error;
  }

  /** @type {OrphanCandidate[]} */
  const candidates = [];
  let skippedYoung = 0;

  for (const filename of entries) {
    if (!isSafeFilename(filename)) continue;

    const absolutePath = path.join(dir, filename);
    let stat;
    try {
      stat = await fs.stat(absolutePath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    const ageMs = limits.nowMs - stat.mtimeMs;
    const isTemp = filename.endsWith('.upload');
    const ttlMs = isTemp ? limits.tempTtlMs : limits.orphanTtlMs;

    if (ageMs < ttlMs) {
      skippedYoung += 1;
      continue;
    }
    if (referenced.has(filename)) continue;

    candidates.push({
      namespace,
      filename,
      absolutePath,
      sizeBytes: stat.size,
      ageMs,
      reason: classifyOrphanReason(filename, namespace),
    });
  }

  return { candidates, skippedYoung };
}

/**
 * @param {OrphanCandidate} candidate
 * @param {'quarantine'|'delete'} mode
 */
async function applyFileAction(candidate, mode) {
  if (mode === 'delete') {
    await fs.unlink(candidate.absolutePath);
    return { action: 'deleted', destination: null };
  }

  const dest = quarantinePath(candidate.namespace, candidate.filename);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.rename(candidate.absolutePath, dest);
  return { action: 'quarantined', destination: dest };
}

/**
 * @param {Record<string, unknown>} metadata
 */
async function logCleanupEvent(action, metadata = {}) {
  await writeQaAuditEvent({
    userId: null,
    role: 'system',
    action,
    entityType: 'qa_upload_cleanup',
    eventCategory: QA_AUDIT_CATEGORIES.SUSPICIOUS_ACTIVITY,
    metadata,
  });
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {OrphanCandidate} candidate
 * @param {{ dryRun: boolean, audit: boolean, mode: 'quarantine'|'delete' }} opts
 */
async function processCandidate(connection, candidate, opts) {
  if (await isUploadStillReferenced(connection, candidate.namespace, candidate.filename)) {
    return { status: 'skipped_referenced' };
  }

  if (opts.dryRun || opts.audit) {
    await logCleanupEvent('qa.upload.cleanup.candidate', {
      namespace: candidate.namespace,
      filename: candidate.filename,
      reason: candidate.reason,
      sizeBytes: candidate.sizeBytes,
      ageMs: candidate.ageMs,
      dryRun: opts.dryRun,
      audit: opts.audit,
    });
    return { status: 'candidate', action: opts.audit ? 'audit' : 'dry_run' };
  }

  const fileAction = await applyFileAction(candidate, opts.mode);
  await logCleanupEvent('qa.upload.cleanup.removed', {
    namespace: candidate.namespace,
    filename: candidate.filename,
    reason: candidate.reason,
    action: fileAction.action,
    destination: fileAction.destination,
    sizeBytes: candidate.sizeBytes,
  });
  return { status: 'removed', action: fileAction.action };
}

/**
 * Run orphan upload cleanup for student-qa and teacher-qa namespaces.
 *
 * @param {{
 *   dryRun?: boolean,
 *   audit?: boolean,
 *   purgeQuarantine?: boolean,
 * }} [opts]
 */
export async function runQaUploadCleanup(opts = {}) {
  const started = Date.now();
  const config = getQaUploadCleanupConfig();
  const dryRun = Boolean(opts.dryRun);
  const audit = Boolean(opts.audit);
  const mode = config.mode;

  const summary = {
    dryRun,
    audit,
    mode,
    candidates: 0,
    quarantined: 0,
    deleted: 0,
    skippedReferenced: 0,
    skippedYoung: 0,
    skippedError: 0,
    purgeDeleted: 0,
    byNamespace: /** @type {Record<string, number>} */ ({}),
    byReason: /** @type {Record<string, number>} */ ({}),
    samples: /** @type {Array<{ namespace: string, filename: string, reason: string, status: string }>} */ ([]),
  };

  if (opts.purgeQuarantine) {
    summary.purgeDeleted = await purgeExpiredQuarantine(config);
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const referenceIndex = await loadReferencedUploadIndex(connection);
    const nowMs = Date.now();
    const limits = {
      orphanTtlMs: config.orphanTtlMs,
      tempTtlMs: config.tempTtlMs,
      nowMs,
    };

    /** @type {OrphanCandidate[]} */
    let allCandidates = [];
    for (const ns of QA_UPLOAD_NAMESPACES) {
      const { candidates, skippedYoung } = await scanNamespaceForCandidates(ns, referenceIndex[ns], limits);
      allCandidates = allCandidates.concat(candidates);
      summary.skippedYoung += skippedYoung;
    }

    allCandidates.sort((a, b) => b.ageMs - a.ageMs);
    const batch = allCandidates.slice(0, config.batchSize);
    summary.candidates = batch.length;

    for (const candidate of batch) {
      try {
        const result = await processCandidate(connection, candidate, { dryRun, audit, mode });
        summary.byNamespace[candidate.namespace] = (summary.byNamespace[candidate.namespace] ?? 0) + 1;
        summary.byReason[candidate.reason] = (summary.byReason[candidate.reason] ?? 0) + 1;

        if (result.status === 'skipped_referenced') {
          summary.skippedReferenced += 1;
        } else if (result.status === 'removed') {
          if (result.action === 'quarantined') summary.quarantined += 1;
          if (result.action === 'deleted') summary.deleted += 1;
        }

        if (summary.samples.length < 25) {
          summary.samples.push({
            namespace: candidate.namespace,
            filename: candidate.filename,
            reason: candidate.reason,
            status: result.status,
          });
        }
      } catch (error) {
        summary.skippedError += 1;
        console.warn(`${LOG_PREFIX} candidate failed`, {
          namespace: candidate.namespace,
          filename: candidate.filename,
          message: error?.message || error,
        });
        await logCleanupEvent('qa.upload.cleanup.error', {
          namespace: candidate.namespace,
          filename: candidate.filename,
          message: error?.message || String(error),
        });
      }
    }

    if (dryRun || audit) {
      await connection.rollback();
    } else {
      await connection.commit();
    }
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const durationMs = Date.now() - started;
  summary.durationMs = durationMs;

  recordQaUploadCleanupRun({
    durationMs,
    candidates: summary.candidates,
    quarantined: summary.quarantined,
    deleted: summary.deleted,
    skippedReferenced: summary.skippedReferenced,
    skippedYoung: summary.skippedYoung,
    skippedError: summary.skippedError,
    purgeDeleted: summary.purgeDeleted,
    byNamespace: summary.byNamespace,
    byReason: summary.byReason,
  });

  await logCleanupEvent('qa.upload.cleanup.completed', {
    dryRun,
    audit,
    mode,
    durationMs,
    candidates: summary.candidates,
    quarantined: summary.quarantined,
    deleted: summary.deleted,
    skippedReferenced: summary.skippedReferenced,
    skippedError: summary.skippedError,
    purgeDeleted: summary.purgeDeleted,
  });

  console.info(`${LOG_PREFIX} completed`, {
    dryRun,
    audit,
    candidates: summary.candidates,
    quarantined: summary.quarantined,
    deleted: summary.deleted,
    skippedReferenced: summary.skippedReferenced,
    durationMs,
  });

  return summary;
}

/**
 * Permanently delete quarantined files older than retention window.
 * @param {ReturnType<typeof getQaUploadCleanupConfig>} config
 */
async function purgeExpiredQuarantine(config) {
  const quarantineRoot = path.resolve(uploadsRoot, QA_UPLOAD_QUARANTINE_ROOT);
  const cutoff = Date.now() - config.quarantineRetentionMs;
  let purged = 0;

  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = await fs.stat(full);
      if (stat.mtimeMs < cutoff) {
        await fs.unlink(full);
        purged += 1;
      }
    }
  }

  await walk(quarantineRoot);
  return purged;
}
