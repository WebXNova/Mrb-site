import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { toSubjectAdminDto, toSubjectPublicDto } from '../dto/subject.dto.js';

function subjectNotFound() {
  return new ApiError(404, 'Subject not found', { code: 'SUBJECT_NOT_FOUND' });
}

function courseNotFound() {
  return new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
}

async function assertCourseExists(courseId) {
  const row = await getCourseRowById(courseId);
  if (!row) throw courseNotFound();
}

async function nextOrderIndex(conn, courseId) {
  const [rows] = await conn.query(
    `SELECT COALESCE(MAX(order_index), -1) + 1 AS next_idx FROM subjects WHERE course_id = ?`,
    [courseId]
  );
  return Number(rows[0]?.next_idx ?? 0);
}

/**
 * Make room at `fromIndex` by incrementing existing rows (insert / move-down semantics).
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} courseId
 * @param {number} fromIndex
 */
async function shiftSubjectOrderIndexesAtOrAbove(conn, courseId, fromIndex) {
  await conn.query(
    `UPDATE subjects
     SET order_index = order_index + 1
     WHERE course_id = ? AND order_index >= ?`,
    [courseId, fromIndex]
  );
}

/**
 * Move one subject to `targetIndex` and renumber the course to contiguous 0..n-1.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} courseId
 * @param {number} subjectId
 * @param {number} targetIndex
 */
async function reorderSubjectInCourse(conn, courseId, subjectId, targetIndex) {
  const [rows] = await conn.query(
    `SELECT id FROM subjects WHERE course_id = ? ORDER BY order_index ASC, id ASC FOR UPDATE`,
    [courseId]
  );
  const ids = rows.map((r) => Number(r.id));
  const sid = Number(subjectId);
  const currentIdx = ids.indexOf(sid);
  if (currentIdx < 0) throw subjectNotFound();

  const target = Math.max(0, Math.min(Math.trunc(Number(targetIndex)), ids.length - 1));
  if (target === currentIdx) return;

  ids.splice(currentIdx, 1);
  ids.splice(target, 0, sid);

  for (let i = 0; i < ids.length; i += 1) {
    await conn.query(`UPDATE subjects SET order_index = ? WHERE id = ? AND course_id = ?`, [
      i,
      ids[i],
      courseId,
    ]);
  }
}

export async function listSubjectsForCourse(courseId, { includeInactive = false } = {}) {
  await assertCourseExists(courseId);
  let sql = `SELECT id, course_id, title, description, order_index, is_active, created_at, updated_at
     FROM subjects WHERE course_id = ?`;
  const params = [courseId];
  if (!includeInactive) {
    sql += ' AND is_active = TRUE';
  }
  sql += ' ORDER BY order_index ASC, id ASC';
  const [rows] = await mysqlPool.query(sql, params);
  return rows.map(toSubjectAdminDto);
}

/** Active subjects for an active public catalog course. */
export async function listPublicSubjectsForCourse(courseId) {
  const cid = Number(courseId);
  if (!Number.isFinite(cid) || cid <= 0) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }
  const course = await getCourseRowById(cid, { activeOnly: true });
  if (!course) throw courseNotFound();
  const [rows] = await mysqlPool.query(
    `SELECT id, course_id, title, description, order_index, is_active, created_at, updated_at
     FROM subjects WHERE course_id = ? AND is_active = TRUE
     ORDER BY order_index ASC, id ASC`,
    [cid]
  );
  return rows.map(toSubjectPublicDto);
}

export async function getSubjectForCourse(courseId, subjectId) {
  await assertCourseExists(courseId);
  const [rows] = await mysqlPool.query(
    `SELECT id, course_id, title, description, order_index, is_active, created_at, updated_at
     FROM subjects WHERE id = ? AND course_id = ? LIMIT 1`,
    [subjectId, courseId]
  );
  const row = rows[0];
  if (!row) throw subjectNotFound();
  return toSubjectAdminDto(row);
}

export async function createSubject(courseId, { title, description = null, orderIndex = null }) {
  await assertCourseExists(courseId);
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(`SELECT id FROM subjects WHERE course_id = ? FOR UPDATE`, [courseId]);
    let idx;
    if (orderIndex != null && Number.isFinite(Number(orderIndex))) {
      idx = Math.max(0, Math.trunc(Number(orderIndex)));
      await shiftSubjectOrderIndexesAtOrAbove(connection, courseId, idx);
    } else {
      idx = await nextOrderIndex(connection, courseId);
    }
    const [result] = await connection.query(
      `INSERT INTO subjects (course_id, title, description, order_index, is_active)
       VALUES (?, ?, ?, ?, TRUE)`,
      [courseId, title, description, idx]
    );
    const insertId = result.insertId;
    const [rows] = await connection.query(
      `SELECT id, course_id, title, description, order_index, is_active, created_at, updated_at
       FROM subjects WHERE id = ? LIMIT 1`,
      [insertId]
    );
    await connection.commit();
    return toSubjectAdminDto(rows[0]);
  } catch (e) {
    try { await connection.rollback(); } catch { /* already rolled back */ }
    throw e;
  } finally {
    connection.release();
  }
}

/**
 * Update a subject. Supports optional optimistic-concurrency via `expectedUpdatedAt`
 * (ISO-8601 timestamp). When provided and it does not match the row's `updated_at`
 * (with millisecond tolerance), throws a 409 `STALE_SUBJECT` so the UI can refresh.
 */
export async function updateSubject(courseId, subjectId, patch) {
  await assertCourseExists(courseId);
  const existing = await getSubjectRow(courseId, subjectId);
  if (!existing) throw subjectNotFound();

  if (patch.expectedUpdatedAt != null) {
    const expected = Date.parse(patch.expectedUpdatedAt);
    const actual = existing.updated_at instanceof Date
      ? existing.updated_at.getTime()
      : Date.parse(existing.updated_at);
    // MySQL TIMESTAMP has second resolution by default; allow 1s tolerance.
    if (!Number.isFinite(expected) || !Number.isFinite(actual) || Math.abs(expected - actual) > 1000) {
      throw new ApiError(409, 'Subject was modified by someone else; refresh and retry.', {
        code: 'STALE_SUBJECT',
      });
    }
  }

  const wasActive = Boolean(Number(existing.is_active));
  const title = patch.title !== undefined ? patch.title : existing.title;
  const description = patch.description !== undefined ? patch.description : existing.description;
  const isActive = patch.isActive !== undefined ? patch.isActive : wasActive;
  const orderChanging =
    patch.orderIndex !== undefined && Number(patch.orderIndex) !== Number(existing.order_index);

  if (orderChanging) {
    const connection = await mysqlPool.getConnection();
    try {
      await connection.beginTransaction();
      await reorderSubjectInCourse(connection, courseId, subjectId, Number(patch.orderIndex));
      await connection.query(
        `UPDATE subjects SET title = ?, description = ?, is_active = ? WHERE id = ? AND course_id = ?`,
        [title, description, isActive, subjectId, courseId]
      );
      const [rows] = await connection.query(
        `SELECT id, course_id, title, description, order_index, is_active, created_at, updated_at
         FROM subjects WHERE id = ? AND course_id = ? LIMIT 1`,
        [subjectId, courseId]
      );
      await connection.commit();
      return {
        dto: toSubjectAdminDto(rows[0]),
        activated: !wasActive && isActive === true,
        deactivated: wasActive && isActive === false,
      };
    } catch (e) {
      try {
        await connection.rollback();
      } catch {
        /* already rolled back */
      }
      throw e;
    } finally {
      connection.release();
    }
  }

  await mysqlPool.query(
    `UPDATE subjects SET title = ?, description = ?, order_index = ?, is_active = ? WHERE id = ? AND course_id = ?`,
    [title, description, existing.order_index, isActive, subjectId, courseId]
  );
  const [rows] = await mysqlPool.query(
    `SELECT id, course_id, title, description, order_index, is_active, created_at, updated_at
     FROM subjects WHERE id = ? AND course_id = ? LIMIT 1`,
    [subjectId, courseId]
  );
  return {
    dto: toSubjectAdminDto(rows[0]),
    activated: !wasActive && isActive === true,
    deactivated: wasActive && isActive === false,
  };
}

/**
 * Atomically reorders all subjects for a course.
 *
 * Canonical ordering policy: the reorder set covers **all** subjects for the
 * course (including inactive ones) so that hidden rows keep stable positions
 * and never silently move when an admin toggles "Show inactive". The caller
 * must pass every subject id exactly once.
 *
 * Invariant after commit: every subject row in the course has a distinct
 * `order_index` in the contiguous range `0..n-1`.
 *
 * @returns {Promise<Array>} subjects in their new canonical order (admin DTO).
 */
export async function reorderSubjects(courseId, orderedSubjectIds) {
  await assertCourseExists(courseId);
  const ids = Array.isArray(orderedSubjectIds) ? orderedSubjectIds.map((n) => Number(n)) : [];
  if (ids.length === 0) {
    throw new ApiError(422, 'orderedSubjectIds must not be empty', { code: 'REORDER_INVALID' });
  }
  if (new Set(ids).size !== ids.length) {
    throw new ApiError(422, 'orderedSubjectIds must not contain duplicates', { code: 'REORDER_INVALID' });
  }
  if (ids.some((id) => !Number.isFinite(id) || id <= 0)) {
    throw new ApiError(422, 'orderedSubjectIds must be positive integers', { code: 'REORDER_INVALID' });
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const [dbRows] = await connection.query(
      `SELECT id FROM subjects WHERE course_id = ? ORDER BY order_index ASC, id ASC FOR UPDATE`,
      [courseId]
    );
    const dbIds = dbRows.map((r) => Number(r.id));
    if (dbIds.length !== ids.length) {
      await connection.rollback();
      throw new ApiError(422, 'orderedSubjectIds must include every subject in the course exactly once', {
        code: 'REORDER_INVALID',
        expectedCount: dbIds.length,
        receivedCount: ids.length,
      });
    }
    const dbSet = new Set(dbIds);
    const allMatch = ids.every((id) => dbSet.has(id));
    if (!allMatch) {
      await connection.rollback();
      throw new ApiError(422, 'orderedSubjectIds contains ids that do not belong to this course', {
        code: 'REORDER_INVALID',
      });
    }

    for (let i = 0; i < ids.length; i += 1) {
      await connection.query(
        `UPDATE subjects SET order_index = ? WHERE id = ? AND course_id = ?`,
        [i, ids[i], courseId]
      );
    }

    const [rows] = await connection.query(
      `SELECT id, course_id, title, description, order_index, is_active, created_at, updated_at
       FROM subjects WHERE course_id = ? ORDER BY order_index ASC, id ASC`,
      [courseId]
    );
    await connection.commit();
    return rows.map(toSubjectAdminDto);
  } catch (e) {
    try { await connection.rollback(); } catch { /* already rolled back */ }
    throw e;
  } finally {
    connection.release();
  }
}

/** Soft-delete: sets is_active = false (preserves id for future FK migration). */
export async function deactivateSubject(courseId, subjectId) {
  await assertCourseExists(courseId);
  const row = await getSubjectRow(courseId, subjectId);
  if (!row) throw subjectNotFound();
  await mysqlPool.query(`UPDATE subjects SET is_active = FALSE WHERE id = ? AND course_id = ?`, [subjectId, courseId]);
  return getSubjectForCourse(courseId, subjectId);
}

async function getSubjectRow(courseId, subjectId) {
  const [rows] = await mysqlPool.query(
    `SELECT id, course_id, title, description, order_index, is_active, created_at, updated_at
     FROM subjects WHERE id = ? AND course_id = ? LIMIT 1`,
    [subjectId, courseId]
  );
  return rows[0] || null;
}

function normalizeSubjectTitleKey(title) {
  return String(title || '').trim().toLowerCase();
}

/**
 * Active subjects deduplicated by title for teacher assignment UI.
 * Each entry uses the lowest subject id as the canonical id and tracks all
 * related course-scoped subject ids with the same title (for routing).
 */
export async function listUniqueActiveSubjectsForAdmin() {
  const [rows] = await mysqlPool.query(
    `SELECT id, title
     FROM subjects
     WHERE is_active = TRUE
     ORDER BY title ASC, id ASC`
  );

  const groups = new Map();
  for (const row of rows) {
    const titleKey = normalizeSubjectTitleKey(row.title);
    if (!titleKey) continue;
    const id = Number(row.id);
    const title = String(row.title || '').trim();
    if (!groups.has(titleKey)) {
      groups.set(titleKey, {
        id,
        title,
        titleKey,
        relatedSubjectIds: [id],
      });
      continue;
    }
    const group = groups.get(titleKey);
    group.relatedSubjectIds.push(id);
    group.id = Math.min(group.id, id);
  }

  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
}

/**
 * Expand canonical unique subject ids to all active subject ids sharing the same title.
 * Ensures teachers receive questions across all courses for a given subject name.
 */
export async function expandSubjectIdsForTeacherAssignment(canonicalIds, connection = mysqlPool) {
  const ids = [...new Set((canonicalIds || []).map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return [];

  const [titleRows] = await connection.query(
    `SELECT DISTINCT LOWER(TRIM(title)) AS title_key
     FROM subjects
     WHERE id IN (?) AND is_active = TRUE`,
    [ids]
  );
  const titleKeys = titleRows.map((row) => row.title_key).filter(Boolean);
  if (!titleKeys.length) return [];

  const [allRows] = await connection.query(
    `SELECT id
     FROM subjects
     WHERE is_active = TRUE AND LOWER(TRIM(title)) IN (?)
     ORDER BY id ASC`,
    [titleKeys]
  );

  return [...new Set(allRows.map((row) => Number(row.id)))];
}

/** Map stored subject ids to unique canonical ids for teacher edit forms. */
export async function mapSubjectIdsToUniqueCanonicalIds(subjectIds) {
  const ids = [...new Set((subjectIds || []).map((id) => Number(id)).filter((id) => id > 0))];
  if (!ids.length) return [];

  const uniqueSubjects = await listUniqueActiveSubjectsForAdmin();
  return uniqueSubjects
    .filter((subject) => subject.relatedSubjectIds.some((relatedId) => ids.includes(relatedId)))
    .map((subject) => subject.id);
}

/** Unique subject titles assigned to a teacher (for admin list display). */
export async function listUniqueSubjectTitlesForTeacher(teacherId, connection = mysqlPool) {
  const tid = Number(teacherId);
  if (!tid) return [];

  const [rows] = await connection.query(
    `SELECT DISTINCT TRIM(s.title) AS title
     FROM teacher_subjects ts
     INNER JOIN subjects s ON s.id = ts.subject_id
     WHERE ts.teacher_id = ? AND s.is_active = TRUE
     ORDER BY title ASC`,
    [tid]
  );

  return rows.map((row) => String(row.title || '').trim()).filter(Boolean);
}
