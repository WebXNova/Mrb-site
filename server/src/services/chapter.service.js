import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';

const TITLE_MAX_LENGTH = 255;

const CHAPTER_HIERARCHY_SELECT = `
  ch.id,
  ch.subject_id,
  ch.title,
  ch.description,
  ch.order_index,
  ch.is_active,
  ch.created_at,
  ch.updated_at,
  s.title AS subject_title,
  s.is_active AS subject_is_active,
  s.course_id,
  c.title AS course_title,
  c.is_active AS course_is_active
`;

const CHAPTER_HIERARCHY_FROM = `
  FROM chapters ch
  INNER JOIN subjects s ON s.id = ch.subject_id
  INNER JOIN courses c ON c.id = s.course_id
`;

/** @param {unknown} v */
function toIsoTimestamp(v) {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** @param {Record<string, unknown>} row */
function toChapterDto(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    subjectId: Number(row.subject_id),
    subjectTitle: String(row.subject_title ?? ''),
    courseId: Number(row.course_id),
    courseTitle: String(row.course_title ?? ''),
    title: String(row.title ?? ''),
    description: row.description == null ? null : String(row.description),
    orderIndex: Number(row.order_index ?? 0),
    isActive: Boolean(Number(row.is_active)),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

/** @param {unknown} value @param {string} field */
function parsePositiveInt(value, field) {
  const id = Number(value);
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) {
    throw new ApiError(422, `Invalid ${field}`, { code: 'INVALID_ID', field });
  }
  return id;
}

/** @param {unknown} value @param {string} field */
function parseNonNegativeInt(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new ApiError(422, `${field} must be a non-negative integer`, { code: 'INVALID_ORDER_INDEX', field });
  }
  return n;
}

/** @param {unknown} title */
function normalizeTitle(title) {
  if (title == null || typeof title !== 'string') {
    throw new ApiError(422, 'title is required', { code: 'INVALID_TITLE' });
  }
  const trimmed = title.trim();
  if (!trimmed) {
    throw new ApiError(422, 'title must not be empty', { code: 'INVALID_TITLE' });
  }
  if (trimmed.length > TITLE_MAX_LENGTH) {
    throw new ApiError(422, `title must be at most ${TITLE_MAX_LENGTH} characters`, { code: 'INVALID_TITLE' });
  }
  return trimmed;
}

/** @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor */
async function fetchChapterHierarchyRow(chapterId, executor = mysqlPool) {
  const [rows] = await executor.query(
    `SELECT ${CHAPTER_HIERARCHY_SELECT} ${CHAPTER_HIERARCHY_FROM} WHERE ch.id = ? LIMIT 1`,
    [chapterId]
  );
  return rows[0] || null;
}

/** @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor */
async function fetchSubjectHierarchyRow(subjectId, executor = mysqlPool) {
  const [rows] = await executor.query(
    `SELECT
       s.id AS subject_id,
       s.title AS subject_title,
       s.is_active AS subject_is_active,
       s.course_id,
       c.title AS course_title,
       c.is_active AS course_is_active
     FROM subjects s
     INNER JOIN courses c ON c.id = s.course_id
     WHERE s.id = ?
     LIMIT 1`,
    [subjectId]
  );
  return rows[0] || null;
}

/** @param {Record<string, unknown>} row */
function toSubjectHierarchyMeta(row) {
  return {
    subjectId: Number(row.subject_id),
    subjectTitle: String(row.subject_title ?? ''),
    courseId: Number(row.course_id),
    courseTitle: String(row.course_title ?? ''),
  };
}

function assertActiveSubjectHierarchy(row) {
  if (!Boolean(Number(row.subject_is_active))) {
    throw new ApiError(409, 'Subject is inactive', { code: 'SUBJECT_INACTIVE' });
  }
  if (!Boolean(Number(row.course_is_active))) {
    throw new ApiError(409, 'Parent course is inactive', { code: 'COURSE_INACTIVE' });
  }
}

function assertActiveChapterHierarchy(row) {
  if (!Boolean(Number(row.is_active))) {
    throw new ApiError(409, 'Chapter is inactive', { code: 'CHAPTER_INACTIVE' });
  }
  assertActiveSubjectHierarchy(row);
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {number} subjectId
 * @param {string} title
 * @param {number} [excludeChapterId]
 */
async function assertUniqueChapterTitle(executor, subjectId, title, excludeChapterId = null) {
  const params = [subjectId, title.toLowerCase()];
  let sql = `
    SELECT ch.id
    FROM chapters ch
    WHERE ch.subject_id = ?
      AND LOWER(TRIM(ch.title)) = ?
  `;
  if (excludeChapterId != null) {
    sql += ' AND ch.id <> ?';
    params.push(excludeChapterId);
  }
  sql += ' LIMIT 1';
  const [rows] = await executor.query(sql, params);
  if (rows[0]) {
    throw new ApiError(409, 'A chapter with this title already exists for the subject', {
      code: 'DUPLICATE_CHAPTER_TITLE',
    });
  }
}

/** @param {import('mysql2/promise').PoolConnection} conn @param {number} subjectId */
async function nextChapterOrderIndex(conn, subjectId) {
  const [rows] = await conn.query(
    `SELECT COALESCE(MAX(order_index), -1) + 1 AS next_idx
     FROM chapters
     WHERE subject_id = ?
     FOR UPDATE`,
    [subjectId]
  );
  return Number(rows[0]?.next_idx ?? 0);
}

/** @param {number} subjectId @param {import('mysql2/promise').PoolConnection} [connection] */
export async function normalizeChapterOrder(subjectId, connection = null) {
  const sid = parsePositiveInt(subjectId, 'subjectId');
  const conn = connection || (await mysqlPool.getConnection());
  const ownConnection = connection == null;

  try {
    if (ownConnection) {
      await conn.beginTransaction();
    }

    const subjectRow = await fetchSubjectHierarchyRow(sid, conn);
    if (!subjectRow) {
      throw new ApiError(404, 'Subject not found', { code: 'SUBJECT_NOT_FOUND' });
    }

    const [rows] = await conn.query(
      `SELECT id
       FROM chapters
       WHERE subject_id = ?
       ORDER BY order_index ASC, created_at ASC, id ASC
       FOR UPDATE`,
      [sid]
    );

    for (let i = 0; i < rows.length; i += 1) {
      await conn.query(`UPDATE chapters SET order_index = ? WHERE id = ? AND subject_id = ?`, [
        i,
        rows[i].id,
        sid,
      ]);
    }

    if (ownConnection) {
      await conn.commit();
    }
  } catch (error) {
    if (ownConnection) {
      try {
        await conn.rollback();
      } catch {
        /* already rolled back */
      }
    }
    throw error;
  } finally {
    if (ownConnection) {
      conn.release();
    }
  }
}

export async function assertSubjectExists(subjectId) {
  const sid = parsePositiveInt(subjectId, 'subjectId');
  const row = await fetchSubjectHierarchyRow(sid);
  if (!row) {
    throw new ApiError(404, 'Subject not found', { code: 'SUBJECT_NOT_FOUND' });
  }
  assertActiveSubjectHierarchy(row);
  return toSubjectHierarchyMeta(row);
}

export async function assertChapterExists(chapterId) {
  const cid = parsePositiveInt(chapterId, 'chapterId');
  const row = await fetchChapterHierarchyRow(cid);
  if (!row) {
    throw new ApiError(404, 'Chapter not found', { code: 'CHAPTER_NOT_FOUND' });
  }
  assertActiveChapterHierarchy(row);
  return toChapterDto(row);
}

export async function getChapterById(chapterId) {
  const cid = parsePositiveInt(chapterId, 'chapterId');
  const row = await fetchChapterHierarchyRow(cid);
  if (!row) {
    throw new ApiError(404, 'Chapter not found', { code: 'CHAPTER_NOT_FOUND' });
  }
  return toChapterDto(row);
}

/** @typedef {'active' | 'archived' | 'all'} ChapterAdminListVisibility */

/**
 * Admin chapter index for one subject — optional visibility filter matches Chapters UI.
 * Defaults to active-only for backward compatibility.
 *
 * @param {number|string} subjectId
 * @param {{ status?: ChapterAdminListVisibility }} [opts]
 */
export async function listChaptersBySubject(subjectId, { status = 'active' } = {}) {
  const sid = parsePositiveInt(subjectId, 'subjectId');
  const subjectRow = await fetchSubjectHierarchyRow(sid);
  if (!subjectRow) {
    throw new ApiError(404, 'Subject not found', { code: 'SUBJECT_NOT_FOUND' });
  }

  let activeClause = ' AND ch.is_active = TRUE';
  if (status === 'archived') {
    activeClause = ' AND ch.is_active = FALSE';
  } else if (status === 'all') {
    activeClause = '';
  }

  const [rows] = await mysqlPool.query(
    `SELECT ${CHAPTER_HIERARCHY_SELECT}
     ${CHAPTER_HIERARCHY_FROM}
     WHERE ch.subject_id = ?${activeClause}
     ORDER BY ch.order_index ASC, ch.created_at ASC, ch.id ASC`,
    [sid]
  );

  return rows.map(toChapterDto);
}

export async function createChapter(payload) {
  const subjectId = parsePositiveInt(payload?.subjectId, 'subjectId');
  await assertSubjectExists(subjectId);

  const title = normalizeTitle(payload?.title);
  const description =
    payload?.description == null || payload?.description === ''
      ? null
      : String(payload.description).trim() || null;
  const isActive = payload?.isActive === undefined ? true : Boolean(payload.isActive);

  let orderIndex = null;
  if (payload?.orderIndex !== undefined && payload?.orderIndex !== null && payload?.orderIndex !== '') {
    orderIndex = parseNonNegativeInt(payload.orderIndex, 'orderIndex');
  }

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();
    await assertUniqueChapterTitle(conn, subjectId, title);

    const resolvedOrderIndex =
      orderIndex == null ? await nextChapterOrderIndex(conn, subjectId) : orderIndex;

    const [result] = await conn.query(
      `INSERT INTO chapters (subject_id, title, description, order_index, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [subjectId, title, description, resolvedOrderIndex, isActive ? 1 : 0]
    );

    await normalizeChapterOrder(subjectId, conn);

    const row = await fetchChapterHierarchyRow(result.insertId, conn);
    await conn.commit();
    return toChapterDto(row);
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      /* already rolled back */
    }
    throw error;
  } finally {
    conn.release();
  }
}

export async function updateChapter(chapterId, payload) {
  if (payload?.subjectId !== undefined || payload?.subject_id !== undefined) {
    throw new ApiError(400, 'Chapter reassignment is disabled', { code: 'CHAPTER_REASSIGNMENT_DISABLED' });
  }

  const cid = parsePositiveInt(chapterId, 'chapterId');
  const existing = await fetchChapterHierarchyRow(cid);
  if (!existing) {
    throw new ApiError(404, 'Chapter not found', { code: 'CHAPTER_NOT_FOUND' });
  }

  const subjectId = Number(existing.subject_id);
  const chapterIsActive = Boolean(Number(existing.is_active));
  if (chapterIsActive) {
    await assertSubjectExists(subjectId);
  } else {
    const subjectRow = await fetchSubjectHierarchyRow(subjectId);
    if (!subjectRow) {
      throw new ApiError(404, 'Subject not found', { code: 'SUBJECT_NOT_FOUND' });
    }
  }

  const title =
    payload?.title !== undefined ? normalizeTitle(payload.title) : String(existing.title ?? '').trim();

  const description =
    payload?.description !== undefined
      ? payload.description == null || payload.description === ''
        ? null
        : String(payload.description).trim() || null
      : existing.description == null
        ? null
        : String(existing.description);

  const orderIndex =
    payload?.orderIndex !== undefined
      ? parseNonNegativeInt(payload.orderIndex, 'orderIndex')
      : Number(existing.order_index ?? 0);

  const conn = await mysqlPool.getConnection();
  try {
    await conn.beginTransaction();
    await assertUniqueChapterTitle(conn, subjectId, title, cid);

    await conn.query(
      `UPDATE chapters
       SET title = ?, description = ?, order_index = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [title, description, orderIndex, cid]
    );

    await normalizeChapterOrder(subjectId, conn);

    const row = await fetchChapterHierarchyRow(cid, conn);
    await conn.commit();
    return toChapterDto(row);
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      /* already rolled back */
    }
    throw error;
  } finally {
    conn.release();
  }
}

export async function archiveChapter(chapterId) {
  const cid = parsePositiveInt(chapterId, 'chapterId');
  const existing = await fetchChapterHierarchyRow(cid);
  if (!existing) {
    throw new ApiError(404, 'Chapter not found', { code: 'CHAPTER_NOT_FOUND' });
  }

  if (!Boolean(Number(existing.is_active))) {
    return toChapterDto(existing);
  }

  const [[lectureCount]] = await mysqlPool.query(
    `SELECT COUNT(*) AS active_lecture_count
     FROM lectures
     WHERE chapter_id = ? AND is_active = TRUE`,
    [cid]
  );

  if (Number(lectureCount?.active_lecture_count || 0) > 0) {
    throw new ApiError(409, 'Cannot archive chapter while active lectures are linked', {
      code: 'CHAPTER_HAS_ACTIVE_LECTURES',
      activeLectureCount: Number(lectureCount.active_lecture_count),
    });
  }

  await mysqlPool.query(
    `UPDATE chapters SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [cid]
  );

  const row = await fetchChapterHierarchyRow(cid);
  return toChapterDto(row);
}
