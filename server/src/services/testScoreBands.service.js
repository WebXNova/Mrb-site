import { mysqlPool } from '../config/mysql.js';
import { AppError } from '../errors/base/AppError.js';
import { NOT_FOUND, VALIDATION_ERROR } from '../errors/codes/ErrorCodes.js';
import { assertValidScoreBandsPayload } from '../validators/testScoreBands.schema.js';
import { sanitizeQuestionHtml } from '../utils/questionHtmlSanitizer.js';

/**
 * @param {number} testId
 */
export async function listTestScoreBands(testId) {
  const tid = Number(testId);
  const [rows] = await mysqlPool.query(
    `SELECT id, test_id, min_score, max_score, message_html, display_order, created_at, updated_at
     FROM test_score_bands
     WHERE test_id = ?
     ORDER BY display_order ASC, id ASC`,
    [tid]
  );
  return rows.map((row) => ({
    id: Number(row.id),
    test_id: Number(row.test_id),
    min_score: Number(row.min_score),
    max_score: Number(row.max_score),
    message_html: String(row.message_html ?? ''),
    display_order: Number(row.display_order ?? 0),
  }));
}

/**
 * Find the score band whose range contains the student's percentage score.
 *
 * @param {number} testId
 * @param {number|null|undefined} percentage
 */
export async function findMatchingScoreBand(testId, percentage) {
  const value = Number(percentage);
  if (!Number.isFinite(value)) return null;
  const bands = await listTestScoreBands(testId);
  return (
    bands.find((band) => value >= Number(band.min_score) && value <= Number(band.max_score)) ?? null
  );
}

/**
 * Replace all score bands for a test (transaction-safe when connection provided).
 *
 * @param {number} testId
 * @param {unknown} bandsPayload
 * @param {import('mysql2/promise').PoolConnection} [connection]
 */
export async function replaceTestScoreBands(testId, bandsPayload, connection = null) {
  const tid = Number(testId);
  const validation = assertValidScoreBandsPayload(bandsPayload);
  if (!validation.ok) {
    throw new AppError({
      message: typeof validation.error === 'string' ? validation.error : 'Invalid score bands payload.',
      errorCode: VALIDATION_ERROR,
      httpStatus: 422,
      isOperational: true,
      metadata: { overlaps: validation.overlaps ?? null, issues: validation.error?.fieldErrors ?? null },
    });
  }

  const executor = connection ?? mysqlPool;
  const bands = validation.bands.map((band, index) => ({
    min_score: band.min_score,
    max_score: band.max_score,
    message_html: sanitizeQuestionHtml(band.message_html) ?? '',
    display_order: band.display_order ?? index,
  }));

  const run = async (conn) => {
    const [testRows] = await conn.query(
      'SELECT id FROM tests WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [tid]
    );
    if (!testRows.length) {
      throw new AppError({
        message: 'Test was not found.',
        errorCode: NOT_FOUND,
        httpStatus: 404,
        isOperational: true,
        metadata: { testId: tid },
      });
    }

    await conn.query('DELETE FROM test_score_bands WHERE test_id = ?', [tid]);

    for (const band of bands) {
      await conn.query(
        `INSERT INTO test_score_bands (test_id, min_score, max_score, message_html, display_order)
         VALUES (?, ?, ?, ?, ?)`,
        [tid, band.min_score, band.max_score, band.message_html, band.display_order]
      );
    }
  };

  if (connection) {
    await run(connection);
  } else {
    const conn = await mysqlPool.getConnection();
    try {
      await conn.beginTransaction();
      await run(conn);
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  return listTestScoreBands(tid);
}
