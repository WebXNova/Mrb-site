/**
 * Admin course notes — CRUD with hierarchy validation and activity logging.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from './activityLog.service.js';
import {
  formatNoteScopeLabel,
  validateNoteScopeHierarchy,
} from './courseNoteScope.service.js';
import {
  buildCourseNoteFileUrl,
  contentTypeForNoteFileType,
  COURSE_NOTES_UPLOAD_DIR,
} from './courseNoteUpload.service.js';
import { resolveStoredNoteFilename } from '../utils/secureNoteFileValidation.js';
import {
  parseCreateCourseNoteFields,
  parseListCourseNotesQuery,
  parseUpdateCourseNoteBody,
} from '../validators/courseNote.schema.js';
import path from 'path';

const LIST_SQL = `
  SELECT
    n.id,
    n.course_id,
    n.subject_id,
    n.chapter_id,
    n.lecture_id,
    n.title,
    n.description,
    n.file_url,
    n.file_type,
    n.file_size,
    n.uploaded_by,
    n.is_active,
    n.created_at,
    n.updated_at,
    s.title AS subject_title,
    ch.title AS chapter_title,
    l.title AS lecture_title,
    u.full_name AS uploaded_by_name
  FROM notes n
  LEFT JOIN subjects s ON s.id = n.subject_id
  LEFT JOIN chapters ch ON ch.id = n.chapter_id
  LEFT JOIN lectures l ON l.id = n.lecture_id
  INNER JOIN users u ON u.id = n.uploaded_by
`;

function mapNoteRow(row) {
  if (!row) return null;
  const scopeLabel = formatNoteScopeLabel({
    subjectTitle: row.subject_title,
    chapterTitle: row.chapter_title,
    lectureTitle: row.lecture_title,
  });
  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    subjectId: row.subject_id == null ? null : Number(row.subject_id),
    chapterId: row.chapter_id == null ? null : Number(row.chapter_id),
    lectureId: row.lecture_id == null ? null : Number(row.lecture_id),
    title: row.title,
    description: row.description ?? null,
    fileUrl: row.file_url,
    fileType: row.file_type,
    fileSize: Number(row.file_size),
    uploadedBy: Number(row.uploaded_by),
    uploadedByName: row.uploaded_by_name || null,
    isActive: Boolean(row.is_active),
    scopeLabel,
    subjectTitle: row.subject_title ?? null,
    chapterTitle: row.chapter_title ?? null,
    lectureTitle: row.lecture_title ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function snapshotNote(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    course_id: Number(row.course_id),
    subject_id: row.subject_id == null ? null : Number(row.subject_id),
    chapter_id: row.chapter_id == null ? null : Number(row.chapter_id),
    lecture_id: row.lecture_id == null ? null : Number(row.lecture_id),
    title: String(row.title),
    description: row.description ?? null,
    file_url: row.file_url,
    file_type: row.file_type,
    file_size: Number(row.file_size),
    is_active: Boolean(row.is_active),
  };
}

async function logNoteActivity({ actorId, actorRole, action, noteId, metadata }) {
  void logActivity({
    userId: actorId,
    role: typeof actorRole === 'string' ? actorRole : 'admin',
    action,
    entityType: 'course_note',
    entityId: String(noteId),
    metadata,
  });
}

/**
 * @param {number} noteId
 */
export async function getCourseNoteById(noteId) {
  const id = Number(noteId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid note id');
  }
  const [rows] = await mysqlPool.query(`${LIST_SQL} WHERE n.id = ? LIMIT 1`, [id]);
  return rows[0] ? mapNoteRow(rows[0]) : null;
}

/**
 * @param {{ courseId: number, query?: Record<string, unknown> }}
 */
export async function listCourseNotes({ courseId, query = {} }) {
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw new ApiError(400, 'Invalid course id');
  }

  const filters = parseListCourseNotesQuery(query);
  const params = [cid];
  let sql = `${LIST_SQL} WHERE n.course_id = ?`;

  if (filters.subject_id != null) {
    sql += ` AND n.subject_id = ?`;
    params.push(filters.subject_id);
  }
  if (filters.chapter_id != null) {
    sql += ` AND n.chapter_id = ?`;
    params.push(filters.chapter_id);
  }
  if (filters.lecture_id != null) {
    sql += ` AND n.lecture_id = ?`;
    params.push(filters.lecture_id);
  }

  sql += ` ORDER BY
    CASE WHEN n.subject_id IS NULL THEN 0 ELSE 1 END,
    s.title ASC,
    ch.order_index ASC,
    ch.title ASC,
    l.sort_order ASC,
    l.title ASC,
    n.created_at DESC,
    n.id DESC`;

  const [rows] = await mysqlPool.query(sql, params);
  return rows.map(mapNoteRow);
}

/**
 * @param {{
 *   courseId: number,
 *   body: Record<string, unknown>,
 *   upload: { url: string, fileType: string, fileSize: number },
 *   actorId: number,
 *   actorRole?: string,
 * }}
 */
export async function createCourseNote({ courseId, body, upload, actorId, actorRole }) {
  const dto = parseCreateCourseNoteFields(body);
  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const scope = await validateNoteScopeHierarchy(
      courseId,
      {
        subjectId: dto.subject_id,
        chapterId: dto.chapter_id,
        lectureId: dto.lecture_id,
      },
      connection
    );

    const [result] = await connection.query(
      `INSERT INTO notes (
         course_id, subject_id, chapter_id, lecture_id,
         title, description, file_url, file_type, file_size,
         uploaded_by, is_active
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        Number(courseId),
        scope.subjectId,
        scope.chapterId,
        scope.lectureId,
        dto.title,
        dto.description,
        upload.url,
        upload.fileType,
        upload.fileSize,
        actorId,
      ]
    );

    await connection.commit();

    const note = await getCourseNoteById(result.insertId);
    void logNoteActivity({
      actorId,
      actorRole,
      action: 'course_note.created',
      noteId: result.insertId,
      metadata: {
        courseId: Number(courseId),
        scope,
        fileType: upload.fileType,
        fileSize: upload.fileSize,
      },
    });

    return note;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {{ noteId: number, body: Record<string, unknown>, actorId: number, actorRole?: string }}
 */
export async function updateCourseNote({ noteId, body, actorId, actorRole }) {
  const id = Number(noteId);
  const dto = parseUpdateCourseNoteBody(body);
  if (dto.title == null && dto.description === undefined) {
    throw new ApiError(400, 'At least one of title or description is required');
  }
  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, course_id, subject_id, chapter_id, lecture_id, title, description, file_url, file_type, file_size, is_active
       FROM notes
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );
    const existing = rows[0];
    if (!existing) {
      throw new ApiError(404, 'Note not found');
    }

    const oldSnapshot = snapshotNote(existing);
    const nextTitle = dto.title ?? existing.title;
    const nextDescription =
      dto.description !== undefined ? dto.description : existing.description;

    await connection.query(
      `UPDATE notes
       SET title = ?, description = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [nextTitle, nextDescription, id]
    );

    await connection.commit();

    const updated = await getCourseNoteById(id);
    void logNoteActivity({
      actorId,
      actorRole,
      action: 'course_note.updated',
      noteId: id,
      metadata: { oldValue: oldSnapshot, newValue: snapshotNote({ ...existing, title: nextTitle, description: nextDescription }) },
    });

    return updated;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function setNoteActiveState({ noteId, isActive, actorId, actorRole }) {
  const id = Number(noteId);
  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, course_id, subject_id, chapter_id, lecture_id, title, description, file_url, file_type, file_size, is_active
       FROM notes
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );
    const existing = rows[0];
    if (!existing) {
      throw new ApiError(404, 'Note not found');
    }

    const wasActive = Boolean(existing.is_active);
    if (wasActive === isActive) {
      await connection.commit();
      return getCourseNoteById(id);
    }

    const oldSnapshot = snapshotNote(existing);

    await connection.query(
      `UPDATE notes
       SET is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [isActive, id]
    );

    await connection.commit();

    void logNoteActivity({
      actorId,
      actorRole,
      action: isActive ? 'course_note.activated' : 'course_note.deactivated',
      noteId: id,
      metadata: {
        oldValue: oldSnapshot,
        newValue: { ...oldSnapshot, is_active: isActive },
      },
    });

    return getCourseNoteById(id);
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    connection.release();
  }
}

export function activateCourseNote(params) {
  return setNoteActiveState({ ...params, isActive: true });
}

export function deactivateCourseNote(params) {
  return setNoteActiveState({ ...params, isActive: false });
}

/**
 * @param {number} noteId
 */
export async function getCourseNoteFileForAdmin(noteId) {
  const note = await getCourseNoteById(noteId);
  if (!note) {
    throw new ApiError(404, 'Note not found');
  }

  const filename = resolveStoredNoteFilename(note.fileUrl);
  if (!filename) {
    throw new ApiError(404, 'File not found');
  }

  const absolutePath = path.join(COURSE_NOTES_UPLOAD_DIR, filename);
  const namespacePrefix = `${COURSE_NOTES_UPLOAD_DIR}${path.sep}`;
  if (!absolutePath.startsWith(namespacePrefix)) {
    throw new ApiError(404, 'File not found');
  }

  return {
    filename,
    root: COURSE_NOTES_UPLOAD_DIR,
    contentType: contentTypeForNoteFileType(note.fileType, filename),
    downloadName: `${note.title.replace(/[^\w\s.-]+/g, '').trim() || 'note'}${path.extname(filename)}`,
  };
}

/**
 * Resolve stored filename to note row — used by direct file route if needed.
 * @param {string} storedFilename
 */
export async function assertAdminNoteFileAccess(storedFilename) {
  const url = buildCourseNoteFileUrl(storedFilename);
  const [rows] = await mysqlPool.query(
    `SELECT id FROM notes WHERE file_url = ? LIMIT 1`,
    [url]
  );
  if (!rows[0]) {
    throw new ApiError(404, 'File not found');
  }
  return Number(rows[0].id);
}
