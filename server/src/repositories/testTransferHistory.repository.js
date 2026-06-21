/**
 * Repository — test export/import transfer audit history.
 */

import { TEST_IMPORT_BATCH_STATUS } from '../constants/testRichContent.constants.js';

export const TEST_EXPORT_BATCH_STATUS = Object.freeze({
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {{
 *   exportedBy: number,
 *   testId: number,
 *   courseId: number,
 *   format: string,
 *   fileName?: string|null,
 *   questionCount: number,
 *   imageCount?: number,
 *   status?: string,
 *   errorCode?: string|null,
 *   errorMessage?: string|null,
 *   processingTimeMs?: number|null,
 * }} params
 */
export async function createTestExportBatch(executor, params) {
  const [result] = await executor.query(
    `INSERT INTO test_export_batches
       (exported_by, test_id, course_id, format, file_name, question_count, image_count, status, error_code, error_message, processing_time_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.exportedBy,
      params.testId,
      params.courseId,
      params.format,
      params.fileName ?? null,
      params.questionCount,
      params.imageCount ?? 0,
      params.status ?? TEST_EXPORT_BATCH_STATUS.COMPLETED,
      params.errorCode ?? null,
      params.errorMessage ?? null,
      params.processingTimeMs ?? null,
    ]
  );
  return Number(result.insertId);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} batchId
 */
export async function getTestExportBatchById(pool, batchId) {
  const [rows] = await pool.query(
    `SELECT
       b.id,
       b.exported_by,
       b.test_id,
       b.course_id,
       b.format,
       b.file_name,
       b.question_count,
       b.image_count,
       b.status,
       b.error_code,
       b.error_message,
       b.processing_time_ms,
       b.created_at,
       u.full_name AS exported_by_name,
       u.email AS exported_by_email,
       t.title AS test_title,
       c.title AS course_title
     FROM test_export_batches b
     INNER JOIN users u ON u.id = b.exported_by
     LEFT JOIN tests t ON t.id = b.test_id
     LEFT JOIN courses c ON c.id = b.course_id
     WHERE b.id = ?
     LIMIT 1`,
    [batchId]
  );
  return rows[0] ?? null;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ limit?: number, offset?: number, testId?: number|null, status?: string|null }} [opts]
 */
export async function listTestExportBatches(pool, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit ?? 50), 1), 200);
  const offset = Math.max(Number(opts.offset ?? 0), 0);
  const clauses = [];
  const params = [];

  if (opts.testId != null && Number.isFinite(Number(opts.testId))) {
    clauses.push('b.test_id = ?');
    params.push(Number(opts.testId));
  }
  if (opts.status) {
    clauses.push('b.status = ?');
    params.push(String(opts.status));
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit, offset);

  const [rows] = await pool.query(
    `SELECT
       b.id,
       b.exported_by,
       b.test_id,
       b.course_id,
       b.format,
       b.file_name,
       b.question_count,
       b.image_count,
       b.status,
       b.error_code,
       b.processing_time_ms,
       b.created_at,
       u.full_name AS exported_by_name,
       t.title AS test_title,
       c.title AS course_title
     FROM test_export_batches b
     INNER JOIN users u ON u.id = b.exported_by
     LEFT JOIN tests t ON t.id = b.test_id
     LEFT JOIN courses c ON c.id = b.course_id
     ${where}
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT ? OFFSET ?`,
    params
  );

  return rows;
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {number} batchId
 * @param {{
 *   format?: string|null,
 *   imageCount?: number,
 *   validationErrorCount?: number,
 *   processingTimeMs?: number|null,
 * }} patch
 */
export async function patchTestImportBatchMetrics(executor, batchId, patch) {
  const sets = [];
  const params = [];

  if (patch.format != null) {
    sets.push('format = ?');
    params.push(String(patch.format));
  }
  if (patch.imageCount != null) {
    sets.push('image_count = ?');
    params.push(Number(patch.imageCount));
  }
  if (patch.validationErrorCount != null) {
    sets.push('validation_error_count = ?');
    params.push(Number(patch.validationErrorCount));
  }
  if (patch.processingTimeMs != null) {
    sets.push('processing_time_ms = ?');
    params.push(Number(patch.processingTimeMs));
  }

  if (!sets.length) return;
  params.push(batchId);
  await executor.query(`UPDATE test_import_batches SET ${sets.join(', ')} WHERE id = ?`, params);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} batchId
 */
export async function getTestImportBatchById(pool, batchId) {
  const [rows] = await pool.query(
    `SELECT
       b.id,
       b.uploaded_by,
       b.source_type,
       b.format,
       b.file_name,
       b.target_course_id,
       b.target_test_id,
       b.total_questions,
       b.image_count,
       b.validation_error_count,
       b.status,
       b.error_code,
       b.error_message,
       b.processing_time_ms,
       b.created_at,
       b.updated_at,
       u.full_name AS uploaded_by_name,
       u.email AS uploaded_by_email,
       c.title AS course_title,
       t.title AS test_title
     FROM test_import_batches b
     INNER JOIN users u ON u.id = b.uploaded_by
     LEFT JOIN courses c ON c.id = b.target_course_id
     LEFT JOIN tests t ON t.id = b.target_test_id
     WHERE b.id = ?
     LIMIT 1`,
    [batchId]
  );
  return rows[0] ?? null;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ limit?: number, offset?: number, courseId?: number|null, status?: string|null }} [opts]
 */
export async function listTestImportBatches(pool, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit ?? 50), 1), 200);
  const offset = Math.max(Number(opts.offset ?? 0), 0);
  const clauses = [];
  const params = [];

  if (opts.courseId != null && Number.isFinite(Number(opts.courseId))) {
    clauses.push('b.target_course_id = ?');
    params.push(Number(opts.courseId));
  }
  if (opts.status) {
    clauses.push('b.status = ?');
    params.push(String(opts.status));
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit, offset);

  const [rows] = await pool.query(
    `SELECT
       b.id,
       b.uploaded_by,
       b.source_type,
       b.format,
       b.file_name,
       b.target_course_id,
       b.target_test_id,
       b.total_questions,
       b.image_count,
       b.validation_error_count,
       b.status,
       b.error_code,
       b.processing_time_ms,
       b.created_at,
       b.updated_at,
       u.full_name AS uploaded_by_name,
       c.title AS course_title,
       t.title AS test_title
     FROM test_import_batches b
     INNER JOIN users u ON u.id = b.uploaded_by
     LEFT JOIN courses c ON c.id = b.target_course_id
     LEFT JOIN tests t ON t.id = b.target_test_id
     ${where}
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT ? OFFSET ?`,
    params
  );

  return rows;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 */
export async function getTestTransferDashboardStats(pool) {
  const [[exportStats]] = await pool.query(
    `SELECT
       COUNT(*) AS export_count,
       SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS export_failures,
       MAX(created_at) AS last_export_at
     FROM test_export_batches`
  );

  const [[importStats]] = await pool.query(
    `SELECT
       COUNT(*) AS import_count,
       SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) AS import_failures,
       MAX(created_at) AS last_import_at
     FROM test_import_batches`,
    [TEST_IMPORT_BATCH_STATUS.FAILED]
  );

  const lastActivity = [exportStats?.last_export_at, importStats?.last_import_at]
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  return {
    export_count: Number(exportStats?.export_count ?? 0),
    import_count: Number(importStats?.import_count ?? 0),
    export_failures: Number(exportStats?.export_failures ?? 0),
    import_failures: Number(importStats?.import_failures ?? 0),
    failure_count:
      Number(exportStats?.export_failures ?? 0) + Number(importStats?.import_failures ?? 0),
    last_activity_at: lastActivity,
    last_export_at: exportStats?.last_export_at ?? null,
    last_import_at: importStats?.last_import_at ?? null,
  };
}
