/**
 * Student-facing course notes — read-only, active notes only, no file URLs in list responses.
 */

import { mysqlPool } from '../config/mysql.js';
import { scopedQuery } from '../security/cee/db/scopedQuery.js';
import { ApiError } from '../utils/apiError.js';
import { formatNoteScopeLabel } from './courseNoteScope.service.js';
import {
  contentTypeForNoteFileType,
  COURSE_NOTES_UPLOAD_DIR,
} from './courseNoteUpload.service.js';
import { resolveStoredNoteFilename } from '../utils/secureNoteFileValidation.js';
import { requireEntitlement } from '../security/cee/requireEntitlement.js';
import path from 'path';

const STUDENT_LIST_SQL = `
  SELECT
    n.id,
    n.course_id,
    n.subject_id,
    n.chapter_id,
    n.lecture_id,
    n.title,
    n.description,
    n.file_type,
    n.file_size,
    n.created_at,
    s.title AS subject_title,
    ch.title AS chapter_title,
    l.title AS lecture_title
  FROM notes n
  LEFT JOIN subjects s ON s.id = n.subject_id
  LEFT JOIN chapters ch ON ch.id = n.chapter_id
  LEFT JOIN lectures l ON l.id = n.lecture_id
`;

function noteSpecificityRank(row) {
  if (row.lecture_id != null) return 0;
  if (row.chapter_id != null) return 1;
  if (row.subject_id != null) return 2;
  return 3;
}

function mapStudentNote(row) {
  const scopeLabel = formatNoteScopeLabel({
    subjectTitle: row.subject_title,
    chapterTitle: row.chapter_title,
    lectureTitle: row.lecture_title,
  });
  let scopeLevel = 'course';
  if (row.lecture_id != null) scopeLevel = 'lecture';
  else if (row.chapter_id != null) scopeLevel = 'chapter';
  else if (row.subject_id != null) scopeLevel = 'subject';

  return {
    id: Number(row.id),
    title: row.title,
    description: row.description ?? null,
    fileType: row.file_type,
    fileSize: Number(row.file_size),
    scope: {
      level: scopeLevel,
      label: scopeLabel,
      subjectId: row.subject_id == null ? null : Number(row.subject_id),
      chapterId: row.chapter_id == null ? null : Number(row.chapter_id),
      lectureId: row.lecture_id == null ? null : Number(row.lecture_id),
      subjectTitle: row.subject_title ?? null,
      chapterTitle: row.chapter_title ?? null,
      lectureTitle: row.lecture_title ?? null,
    },
    createdAt: row.created_at,
  };
}

function sortStudentNotes(rows) {
  return [...rows].sort((a, b) => {
    const rankDiff = noteSpecificityRank(a) - noteSpecificityRank(b);
    if (rankDiff !== 0) return rankDiff;
    const subjectCmp = String(a.subject_title || '').localeCompare(String(b.subject_title || ''));
    if (subjectCmp !== 0) return subjectCmp;
    const chapterCmp = String(a.chapter_title || '').localeCompare(String(b.chapter_title || ''));
    if (chapterCmp !== 0) return chapterCmp;
    const lectureCmp = String(a.lecture_title || '').localeCompare(String(b.lecture_title || ''));
    if (lectureCmp !== 0) return lectureCmp;
    return Number(b.id) - Number(a.id);
  });
}

function groupStudentNotes(rows) {
  const sorted = sortStudentNotes(rows);
  const groups = [];
  const indexByKey = new Map();

  for (const row of sorted) {
    const note = mapStudentNote(row);
    const key = note.scope.label || 'Course-wide';
    if (!indexByKey.has(key)) {
      indexByKey.set(key, groups.length);
      groups.push({
        scopeLabel: key,
        scopeLevel: note.scope.level,
        subjectId: note.scope.subjectId,
        chapterId: note.scope.chapterId,
        lectureId: note.scope.lectureId,
        notes: [],
      });
    }
    groups[indexByKey.get(key)].notes.push(note);
  }

  return groups;
}

function buildSummary(groups) {
  const totalNotes = groups.reduce((sum, group) => sum + group.notes.length, 0);
  const bySubject = new Map();
  for (const group of groups) {
    if (group.subjectId == null) continue;
    const key = String(group.subjectId);
    bySubject.set(key, (bySubject.get(key) || 0) + group.notes.length);
  }
  return {
    totalNotes,
    subjectCounts: Object.fromEntries(bySubject),
  };
}

async function queryActiveNotes(courseId, whereClause, params) {
  const cid = Number(courseId);
  const db = scopedQuery({ courseId: cid, context: 'studentCourseNotes.queryActiveNotes' });
  const rows = await db.rows(
    `${STUDENT_LIST_SQL}
     WHERE n.is_active = TRUE
       AND n.course_id = ?
       AND ${whereClause}
     ORDER BY n.id DESC`,
    [cid, ...params]
  );
  return rows;
}

/**
 * @param {number} courseId
 */
export async function listStudentCourseNotesGrouped(courseId) {
  const cid = Number(courseId);
  const rows = await queryActiveNotes(cid, '1=1', []);
  const groups = groupStudentNotes(rows);
  return {
    groups,
    summary: buildSummary(groups),
  };
}

/**
 * Course-wide + all notes under this subject (any chapter/lecture).
 */
export async function listStudentNotesForSubject(courseId, subjectId) {
  const cid = Number(courseId);
  const sid = Number(subjectId);
  const db = scopedQuery({ courseId: cid, context: 'studentCourseNotes.listForSubject' });

  const subjectRows = await db.rows(
    `SELECT id FROM subjects WHERE id = ? AND course_id = ? LIMIT 1`,
    [sid, cid]
  );
  if (!subjectRows[0]) {
    throw new ApiError(404, 'Subject not found for this course');
  }

  const rows = await queryActiveNotes(
    cid,
    `(
         (n.subject_id IS NULL AND n.chapter_id IS NULL AND n.lecture_id IS NULL)
         OR n.subject_id = ?
       )`,
    [sid]
  );

  return { groups: groupStudentNotes(rows) };
}

/**
 * Course-wide + subject-wide for parent subject + this chapter's notes.
 */
export async function listStudentNotesForChapter(courseId, chapterId) {
  const cid = Number(courseId);
  const chid = Number(chapterId);
  const db = scopedQuery({ courseId: cid, context: 'studentCourseNotes.listForChapter' });

  const chapterRows = await db.rows(
    `SELECT ch.id, ch.subject_id, s.course_id
     FROM chapters ch
     INNER JOIN subjects s ON s.id = ch.subject_id
     WHERE ch.id = ? AND s.course_id = ?
     LIMIT 1`,
    [chid, cid]
  );
  const chapter = chapterRows[0];
  if (!chapter) {
    throw new ApiError(404, 'Chapter not found for this course');
  }

  const sid = Number(chapter.subject_id);
  const rows = await queryActiveNotes(
    cid,
    `(
         (n.subject_id IS NULL AND n.chapter_id IS NULL AND n.lecture_id IS NULL)
         OR (n.subject_id = ? AND n.chapter_id IS NULL AND n.lecture_id IS NULL)
         OR n.chapter_id = ?
       )`,
    [sid, chid]
  );

  return { groups: groupStudentNotes(rows) };
}

/**
 * All applicable notes for a lecture context (course → subject → chapter → lecture).
 */
export async function listStudentNotesForLecture(courseId, lectureId) {
  const cid = Number(courseId);
  const lid = Number(lectureId);
  const db = scopedQuery({ courseId: cid, context: 'studentCourseNotes.listForLecture' });

  const lectureRows = await db.rows(
    `SELECT l.id, l.course_id, l.chapter_id, ch.subject_id
     FROM lectures l
     LEFT JOIN chapters ch ON ch.id = l.chapter_id
     WHERE l.id = ? AND l.course_id = ?
     LIMIT 1`,
    [lid, cid]
  );
  const lecture = lectureRows[0];
  if (!lecture) {
    throw new ApiError(404, 'Lecture not found for this course');
  }

  const chid = lecture.chapter_id == null ? null : Number(lecture.chapter_id);
  const sid = lecture.subject_id == null ? null : Number(lecture.subject_id);

  let rows;
  if (chid != null && sid != null) {
    rows = await queryActiveNotes(
      cid,
      `(
           (n.subject_id IS NULL AND n.chapter_id IS NULL AND n.lecture_id IS NULL)
           OR (n.subject_id = ? AND n.chapter_id IS NULL AND n.lecture_id IS NULL)
           OR (n.chapter_id = ? AND n.lecture_id IS NULL)
           OR n.lecture_id = ?
         )`,
      [sid, chid, lid]
    );
  } else {
    rows = await queryActiveNotes(
      cid,
      `(
           (n.subject_id IS NULL AND n.chapter_id IS NULL AND n.lecture_id IS NULL)
           OR n.lecture_id = ?
         )`,
      [lid]
    );
  }

  return { groups: groupStudentNotes(rows) };
}

/**
 * Secure download — entitlement checked against note.course_id from DB.
 * @param {{ noteId: number, userId: number }}
 */
export async function getStudentCourseNoteDownload({ noteId, userId }) {
  const id = Number(noteId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid note id');
  }

  const [rows] = await mysqlPool.query(
    `SELECT id, course_id, title, file_url, file_type, is_active
     FROM notes
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  const row = rows[0];
  if (!row || !row.is_active) {
    throw new ApiError(404, 'Note not found');
  }

  const courseId = Number(row.course_id);
  await requireEntitlement(userId, { courseId });

  const filename = resolveStoredNoteFilename(row.file_url);
  if (!filename) {
    throw new ApiError(404, 'File not found');
  }

  const absolutePath = path.join(COURSE_NOTES_UPLOAD_DIR, filename);
  const namespacePrefix = `${COURSE_NOTES_UPLOAD_DIR}${path.sep}`;
  if (!absolutePath.startsWith(namespacePrefix)) {
    throw new ApiError(404, 'File not found');
  }

  const safeTitle = String(row.title || 'note')
    .replace(/[^\w\s.-]+/g, '')
    .trim() || 'note';

  return {
    filename,
    root: COURSE_NOTES_UPLOAD_DIR,
    contentType: contentTypeForNoteFileType(row.file_type, filename),
    downloadName: `${safeTitle}${path.extname(filename)}`,
  };
}
