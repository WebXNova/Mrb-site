import { mysqlPool } from '../config/mysql.js';
import { truncateQuestionTitle } from './aikenImportDiagnostics.js';

export const IMPORT_BATCH_ITEM_STATUS = Object.freeze({
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
});

const QUESTION_TITLE_DB_MAX = 500;
const ERROR_MESSAGE_DB_MAX = 1000;

/**
 * @typedef {{
 *   batchId: number,
 *   questionNumber: number,
 *   questionTitle?: string | null,
 *   questionId?: number | null,
 *   status: string,
 *   errorCode?: string | null,
 *   errorMessage?: string | null,
 *   validationLayer?: string | null,
 * }} ImportBatchItemInput
 */

/**
 * @param {ImportBatchItemInput} input
 */
function normalizeItemInput(input) {
  return {
    batchId: Number(input.batchId),
    questionNumber: Number(input.questionNumber),
    questionTitle: input.questionTitle
      ? truncateQuestionTitle(input.questionTitle, QUESTION_TITLE_DB_MAX)
      : null,
    questionId: input.questionId != null ? Number(input.questionId) : null,
    status: String(input.status),
    errorCode: input.errorCode != null ? String(input.errorCode).slice(0, 100) : null,
    errorMessage:
      input.errorMessage != null ? String(input.errorMessage).slice(0, ERROR_MESSAGE_DB_MAX) : null,
    validationLayer:
      input.validationLayer != null ? String(input.validationLayer).slice(0, 50) : null,
  };
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {ImportBatchItemInput} input
 * @returns {Promise<number>}
 */
export async function insertImportBatchItem(pool, input) {
  const item = normalizeItemInput(input);
  const [result] = await pool.query(
    `INSERT INTO question_import_batch_items
       (batch_id, question_number, question_title, question_id, status, error_code, error_message, validation_layer)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.batchId,
      item.questionNumber,
      item.questionTitle,
      item.questionId,
      item.status,
      item.errorCode,
      item.errorMessage,
      item.validationLayer,
    ]
  );

  return Number(result.insertId);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} batchId
 * @param {ImportBatchItemInput[]} items
 */
export async function insertImportBatchItemsBulk(pool, batchId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  const placeholders = [];
  const params = [];

  for (const raw of items) {
    const item = normalizeItemInput({ ...raw, batchId });
    placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?)');
    params.push(
      item.batchId,
      item.questionNumber,
      item.questionTitle,
      item.questionId,
      item.status,
      item.errorCode,
      item.errorMessage,
      item.validationLayer
    );
  }

  await pool.query(
    `INSERT INTO question_import_batch_items
       (batch_id, question_number, question_title, question_id, status, error_code, error_message, validation_layer)
     VALUES ${placeholders.join(', ')}`,
    params
  );
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} batchId
 */
export async function getImportBatchById(pool, batchId) {
  const [rows] = await pool.query(
    `SELECT
       b.id,
       b.uploaded_by,
       b.source_type,
       b.file_name,
       b.total_questions,
       b.successful_questions,
       b.failed_questions,
       b.status,
       b.created_at,
       b.updated_at,
       u.full_name AS uploaded_by_name,
       u.email AS uploaded_by_email
     FROM question_import_batches b
     INNER JOIN users u ON u.id = b.uploaded_by
     WHERE b.id = ?
     LIMIT 1`,
    [batchId]
  );

  return rows[0] ?? null;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} batchId
 */
export async function listImportBatchItems(pool, batchId) {
  const [rows] = await pool.query(
    `SELECT
       id,
       batch_id,
       question_number,
       question_title,
       question_id,
       status,
       error_code,
       error_message,
       validation_layer,
       created_at
     FROM question_import_batch_items
     WHERE batch_id = ?
     ORDER BY question_number ASC, id ASC`,
    [batchId]
  );

  return rows;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ limit?: number, offset?: number, uploadedBy?: number }} [opts]
 */
export async function listImportBatches(pool, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit ?? 50), 1), 200);
  const offset = Math.max(Number(opts.offset ?? 0), 0);
  const uploadedBy = opts.uploadedBy != null ? Number(opts.uploadedBy) : null;

  const whereClause = uploadedBy != null && Number.isFinite(uploadedBy) ? 'WHERE b.uploaded_by = ?' : '';
  const params = uploadedBy != null && Number.isFinite(uploadedBy) ? [uploadedBy, limit, offset] : [limit, offset];

  const [rows] = await pool.query(
    `SELECT
       b.id,
       b.uploaded_by,
       b.source_type,
       b.file_name,
       b.total_questions,
       b.successful_questions,
       b.failed_questions,
       b.status,
       b.created_at,
       u.full_name AS uploaded_by_name
     FROM question_import_batches b
     INNER JOIN users u ON u.id = b.uploaded_by
     ${whereClause}
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT ? OFFSET ?`,
    params
  );

  return rows;
}

/**
 * Count SUCCESS batch items with a linked question_bank row (post-import verification).
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} batchId
 */
export async function countPersistedQuestionsForBatch(pool, batchId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS persisted_count
     FROM question_import_batch_items i
     INNER JOIN question_bank qb ON qb.id = i.question_id
     WHERE i.batch_id = ?
       AND i.status = ?
       AND i.question_id IS NOT NULL`,
    [batchId, IMPORT_BATCH_ITEM_STATUS.SUCCESS]
  );

  return Number(rows[0]?.persisted_count ?? 0);
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} batchId
 */
export async function countSuccessfulBatchItems(pool, batchId) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS success_count
     FROM question_import_batch_items
     WHERE batch_id = ?
       AND status = ?
       AND question_id IS NOT NULL`,
    [batchId, IMPORT_BATCH_ITEM_STATUS.SUCCESS]
  );

  return Number(rows[0]?.success_count ?? 0);
}

export async function findImportBatchItemsByQuestionId(pool, questionId) {
  const [rows] = await pool.query(
    `SELECT
       i.id,
       i.batch_id,
       i.question_number,
       i.question_title,
       i.question_id,
       i.status,
       i.error_code,
       i.error_message,
       i.validation_layer,
       i.created_at,
       b.file_name,
       b.uploaded_by,
       b.created_at AS batch_created_at
     FROM question_import_batch_items i
     INNER JOIN question_import_batches b ON b.id = i.batch_id
     WHERE i.question_id = ?
     ORDER BY i.created_at DESC, i.id DESC`,
    [questionId]
  );

  return rows;
}

/**
 * @param {number} batchId
 * @param {import('./aikenImportDiagnostics.js').ReturnType<import('./aikenImportDiagnostics.js').buildAikenImportDiagnostic>} diagnostic
 */
export function diagnosticToFailedBatchItem(batchId, diagnostic) {
  return {
    batchId,
    questionNumber: diagnostic.questionNumber,
    questionTitle: diagnostic.questionTitle,
    questionId: null,
    status: IMPORT_BATCH_ITEM_STATUS.FAILED,
    errorCode: diagnostic.errorCode,
    errorMessage: diagnostic.message,
    validationLayer: diagnostic.validationLayer,
  };
}

/**
 * @param {number} batchId
 * @param {import('./aikenImportDiagnostics.js').ReturnType<typeof import('./aikenImportDiagnostics.js').buildAikenImportDiagnostic>} diagnostic
 * @param {{ existingQuestionId?: number | null }} [opts]
 */
export function diagnosticToSkippedBatchItem(batchId, diagnostic, opts = {}) {
  return {
    batchId,
    questionNumber: diagnostic.questionNumber,
    questionTitle: diagnostic.questionTitle,
    questionId: opts.existingQuestionId ?? null,
    status: IMPORT_BATCH_ITEM_STATUS.SKIPPED,
    errorCode: diagnostic.errorCode,
    errorMessage: diagnostic.message,
    validationLayer: diagnostic.validationLayer,
  };
}

export { mysqlPool as defaultImportBatchItemsPool };
