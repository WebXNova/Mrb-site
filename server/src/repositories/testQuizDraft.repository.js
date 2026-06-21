/**
 * test_quiz_drafts — parameterized persistence (transaction-aware).
 */

const DRAFT_COLUMNS = `
  draft_id,
  test_id,
  draft_payload,
  version,
  created_by,
  created_at,
  updated_at,
  deleted_at,
  deleted_by,
  materialized_version,
  materialized_at
`;

const ACTIVE_DRAFT_FILTER = 'deleted_at IS NULL';

/**
 * @param {import('mysql2/promise').RowDataPacket} row
 */
export function mapTestQuizDraftRow(row) {
  if (!row) return null;

  let draftPayload = row.draft_payload;
  if (typeof draftPayload === 'string') {
    try {
      draftPayload = JSON.parse(draftPayload);
    } catch {
      draftPayload = null;
    }
  }

  return {
    draftId: Number(row.draft_id),
    testId: Number(row.test_id),
    draftPayload,
    version: Number(row.version),
    createdBy: Number(row.created_by),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
    deletedBy: row.deleted_by != null ? Number(row.deleted_by) : null,
    materializedVersion: row.materialized_version != null ? Number(row.materialized_version) : null,
    materializedAt: row.materialized_at ?? null,
  };
}

/**
 * Row lock for mutations — includes soft-deleted rows (one row per test_id).
 *
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {number} testId
 */
export async function findTestQuizDraftByTestId(executor, testId) {
  const [rows] = await executor.query(
    `SELECT ${DRAFT_COLUMNS}
     FROM test_quiz_drafts
     WHERE test_id = ?
     LIMIT 1
     FOR UPDATE`,
    [testId]
  );
  return mapTestQuizDraftRow(rows[0] ?? null);
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {number} testId
 */
export async function findTestQuizDraftByTestIdForRead(executor, testId) {
  const [rows] = await executor.query(
    `SELECT ${DRAFT_COLUMNS}
     FROM test_quiz_drafts
     WHERE test_id = ? AND ${ACTIVE_DRAFT_FILTER}
     LIMIT 1`,
    [testId]
  );
  return mapTestQuizDraftRow(rows[0] ?? null);
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ testId: number, draftPayload: object, createdBy: number }} params
 */
export async function insertTestQuizDraft(connection, { testId, draftPayload, createdBy }) {
  const [result] = await connection.query(
    `INSERT INTO test_quiz_drafts (test_id, draft_payload, version, created_by)
     VALUES (?, CAST(? AS JSON), 1, ?)`,
    [testId, JSON.stringify(draftPayload), createdBy]
  );

  const draftId = Number(result.insertId);
  const [rows] = await connection.query(
    `SELECT ${DRAFT_COLUMNS} FROM test_quiz_drafts WHERE draft_id = ? LIMIT 1`,
    [draftId]
  );
  return mapTestQuizDraftRow(rows[0] ?? null);
}

/**
 * Restore a soft-deleted draft row (unique test_id constraint — no second INSERT).
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ testId: number, draftPayload: object, createdBy: number }} params
 */
export async function restoreSoftDeletedTestQuizDraft(connection, { testId, draftPayload, createdBy }) {
  const [result] = await connection.query(
    `UPDATE test_quiz_drafts
     SET draft_payload = CAST(? AS JSON),
         version = 1,
         created_by = ?,
         deleted_at = NULL,
         deleted_by = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE test_id = ? AND deleted_at IS NOT NULL`,
    [JSON.stringify(draftPayload), createdBy, testId]
  );

  if (Number(result.affectedRows ?? 0) === 0) {
    return null;
  }

  const [rows] = await connection.query(
    `SELECT ${DRAFT_COLUMNS} FROM test_quiz_drafts WHERE test_id = ? LIMIT 1`,
    [testId]
  );
  return mapTestQuizDraftRow(rows[0] ?? null);
}

/**
 * Optimistic concurrency update — active drafts only.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {{ testId: number, draftPayload: object, expectedVersion: number }} params
 * @returns {Promise<{ updated: boolean, row: ReturnType<typeof mapTestQuizDraftRow> | null }>}
 */
export async function updateTestQuizDraftWithVersion(
  connection,
  { testId, draftPayload, expectedVersion }
) {
  const [result] = await connection.query(
    `UPDATE test_quiz_drafts
     SET draft_payload = CAST(? AS JSON),
         version = version + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE test_id = ? AND version = ? AND ${ACTIVE_DRAFT_FILTER}`,
    [JSON.stringify(draftPayload), testId, expectedVersion]
  );

  if (Number(result.affectedRows ?? 0) === 0) {
    return { updated: false, row: null };
  }

  const [rows] = await connection.query(
    `SELECT ${DRAFT_COLUMNS} FROM test_quiz_drafts WHERE test_id = ? LIMIT 1`,
    [testId]
  );
  return { updated: true, row: mapTestQuizDraftRow(rows[0] ?? null) };
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} testId
 * @param {number} deletedBy
 * @returns {Promise<boolean>}
 */
export async function softDeleteTestQuizDraftByTestId(connection, testId, deletedBy) {
  const [result] = await connection.query(
    `UPDATE test_quiz_drafts
     SET deleted_at = CURRENT_TIMESTAMP,
         deleted_by = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE test_id = ? AND ${ACTIVE_DRAFT_FILTER}`,
    [deletedBy, testId]
  );
  return Number(result.affectedRows ?? 0) > 0;
}
