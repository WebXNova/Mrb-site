import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { assertChapterExists } from './chapter.service.js';

const LECTURE_HIERARCHY_SELECT = `
  l.id,
  l.course_id,
  l.chapter_id,
  l.title,
  l.youtube_url,
  l.youtube_video_id,
  l.topic,
  l.sort_order,
  l.is_active,
  l.created_at,
  l.updated_at,
  c.title AS course_title,
  ch.title AS chapter_title,
  ch.order_index AS chapter_order_index,
  s.id AS subject_id,
  s.title AS subject_title,
  s.order_index AS subject_order_index
`;

const LECTURE_HIERARCHY_FROM = `
  FROM lectures l
  INNER JOIN courses c ON c.id = l.course_id
  LEFT JOIN chapters ch ON ch.id = l.chapter_id
  LEFT JOIN subjects s ON s.id = ch.subject_id
`;

function getYouTubeVideoId(url) {
  const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/i;
  const match = String(url || '').match(regex);
  return match ? match[1] : null;
}

/** @param {unknown} v */
function toIsoTimestamp(v) {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** @param {Record<string, unknown>} row */
function toLectureDto(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    courseTitle: String(row.course_title ?? ''),
    chapterId: row.chapter_id == null ? null : Number(row.chapter_id),
    chapterTitle: row.chapter_title == null ? null : String(row.chapter_title),
    subjectId: row.subject_id == null ? null : Number(row.subject_id),
    subjectTitle: row.subject_title == null ? null : String(row.subject_title),
    title: String(row.title ?? ''),
    youtubeUrl: row.youtube_url,
    youtubeVideoId: row.youtube_video_id,
    topic: row.topic == null ? null : String(row.topic),
    sortOrder: Number(row.sort_order ?? 0),
    isActive: Boolean(Number(row.is_active)),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

/** @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor */
async function fetchLectureDto(lectureId, executor = mysqlPool) {
  const [rows] = await executor.query(
    `SELECT ${LECTURE_HIERARCHY_SELECT} ${LECTURE_HIERARCHY_FROM} WHERE l.id = ? LIMIT 1`,
    [lectureId]
  );
  return rows[0] ? toLectureDto(rows[0]) : null;
}

/** Validate chapter hierarchy; derive authoritative course_id (never trust client courseId). */
async function resolveChapterOwnership(chapterId) {
  const chapter = await assertChapterExists(chapterId);
  return {
    chapterId: chapter.id,
    courseId: chapter.courseId,
    subjectId: chapter.subjectId,
  };
}

export async function countLecturesForCourse(courseId) {
  const [[row]] = await mysqlPool.query(`SELECT COUNT(*) AS n FROM lectures WHERE course_id = ?`, [courseId]);
  return Number(row?.n || 0);
}

export async function listLectures() {
  const [rows] = await mysqlPool.query(
    `SELECT ${LECTURE_HIERARCHY_SELECT}
     ${LECTURE_HIERARCHY_FROM}
     ORDER BY l.created_at DESC`
  );
  return rows.map(toLectureDto);
}

export async function createLecture(payload) {
  const videoId = getYouTubeVideoId(payload.youtubeUrl);
  if (!videoId) {
    throw new ApiError(422, 'Invalid YouTube URL');
  }

  const { chapterId, courseId } = await resolveChapterOwnership(payload.chapterId);

  const [result] = await mysqlPool.query(
    `INSERT INTO lectures (course_id, chapter_id, title, youtube_url, youtube_video_id, topic, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      courseId,
      chapterId,
      payload.title,
      payload.youtubeUrl,
      videoId,
      payload.topic || null,
      payload.sortOrder || 0,
      payload.isActive ?? true,
    ]
  );

  const dto = await fetchLectureDto(result.insertId);
  if (!dto) {
    throw new ApiError(500, 'Lecture created but could not be loaded');
  }
  return dto;
}

export async function updateLecture(lectureId, payload) {
  const videoId = getYouTubeVideoId(payload.youtubeUrl);
  if (!videoId) {
    throw new ApiError(422, 'Invalid YouTube URL');
  }

  const [existingRows] = await mysqlPool.query(
    `SELECT id FROM lectures WHERE id = ? LIMIT 1`,
    [lectureId]
  );
  if (!existingRows[0]) {
    return null;
  }

  const { chapterId, courseId } = await resolveChapterOwnership(payload.chapterId);

  await mysqlPool.query(
    `UPDATE lectures
     SET course_id = ?, chapter_id = ?, title = ?, youtube_url = ?, youtube_video_id = ?, topic = ?, sort_order = ?, is_active = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      courseId,
      chapterId,
      payload.title,
      payload.youtubeUrl,
      videoId,
      payload.topic || null,
      payload.sortOrder || 0,
      payload.isActive ?? true,
      lectureId,
    ]
  );

  return fetchLectureDto(lectureId);
}

export async function deleteLecture(lectureId) {
  const [result] = await mysqlPool.query(`DELETE FROM lectures WHERE id = ?`, [lectureId]);
  return result.affectedRows > 0;
}
