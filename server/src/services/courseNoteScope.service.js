/**
 * Validates course → subject → chapter → lecture hierarchy for notes.
 * courseId from the URL is always the source of truth.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';

function parseOptionalPositiveInt(value, label) {
  if (value == null || value === '' || value === 'null' || value === 'undefined') {
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ApiError(400, `${label} must be a positive integer`);
  }
  return n;
}

/**
 * @param {number} courseId
 * @param {{ subjectId?: number|null, chapterId?: number|null, lectureId?: number|null }} scope
 * @param {import('mysql2/promise').PoolConnection} [connection]
 * @returns {Promise<{ subjectId: number|null, chapterId: number|null, lectureId: number|null }>}
 */
export async function validateNoteScopeHierarchy(courseId, scope, connection = null) {
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw new ApiError(400, 'Invalid course id');
  }

  const subjectId = parseOptionalPositiveInt(scope.subjectId, 'subject_id');
  const chapterId = parseOptionalPositiveInt(scope.chapterId, 'chapter_id');
  const lectureId = parseOptionalPositiveInt(scope.lectureId, 'lecture_id');

  if (lectureId != null && chapterId == null) {
    throw new ApiError(400, 'chapter_id is required when lecture_id is set');
  }
  if (chapterId != null && subjectId == null) {
    throw new ApiError(400, 'subject_id is required when chapter_id is set');
  }

  const query = connection ? connection.query.bind(connection) : mysqlPool.query.bind(mysqlPool);

  const course = await getCourseRowById(cid);
  if (!course) {
    throw new ApiError(404, 'Course not found');
  }

  if (subjectId != null) {
    const [subjectRows] = await query(
      `SELECT id, course_id FROM subjects WHERE id = ? AND course_id = ? LIMIT 1`,
      [subjectId, cid]
    );
    const subject = subjectRows[0];
    if (!subject) {
      throw new ApiError(400, 'Subject not found for this course');
    }
  }

  if (chapterId != null) {
    const [chapterRows] = await query(
      `SELECT ch.id, ch.subject_id, s.course_id
       FROM chapters ch
       INNER JOIN subjects s ON s.id = ch.subject_id
       WHERE ch.id = ? AND s.course_id = ? AND ch.subject_id = ?
       LIMIT 1`,
      [chapterId, cid, subjectId]
    );
    const chapter = chapterRows[0];
    if (!chapter) {
      throw new ApiError(400, 'Chapter not found for this course');
    }
  }

  if (lectureId != null) {
    const [lectureRows] = await query(
      `SELECT l.id, l.course_id, l.chapter_id
       FROM lectures l
       WHERE l.id = ? AND l.course_id = ? AND l.chapter_id = ?
       LIMIT 1`,
      [lectureId, cid, chapterId]
    );
    const lecture = lectureRows[0];
    if (!lecture) {
      throw new ApiError(400, 'Lecture not found for this course');
    }
  }

  return { subjectId, chapterId, lectureId };
}

/**
 * @param {Record<string, unknown>} body
 */
export function parseNoteScopeFromBody(body) {
  return {
    subjectId: body?.subject_id ?? body?.subjectId ?? null,
    chapterId: body?.chapter_id ?? body?.chapterId ?? null,
    lectureId: body?.lecture_id ?? body?.lectureId ?? null,
  };
}

/**
 * Build human-readable scope label for admin UI.
 * @param {{ subjectTitle?: string|null, chapterTitle?: string|null, lectureTitle?: string|null }} parts
 */
export function formatNoteScopeLabel(parts) {
  const subject = parts.subjectTitle?.trim();
  const chapter = parts.chapterTitle?.trim();
  const lecture = parts.lectureTitle?.trim();

  if (!subject && !chapter && !lecture) return 'Course-wide';
  if (subject && !chapter && !lecture) return subject;
  if (subject && chapter && !lecture) return `${subject} → ${chapter}`;
  if (subject && chapter && lecture) return `${subject} → ${chapter} → ${lecture}`;
  if (chapter && !subject) return chapter;
  return 'Course-wide';
}
