import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';

function getYouTubeVideoId(url) {
  const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/i;
  const match = String(url || '').match(regex);
  return match ? match[1] : null;
}

function toLecture(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    youtubeUrl: row.youtube_url,
    youtubeVideoId: row.youtube_video_id,
    topic: row.topic,
    sortOrder: row.sort_order,
    isActive: !!row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** @param {{ code: string }} [details] */
function courseNotFound(details) {
  return new ApiError(404, 'Course not found', details);
}

/** Require explicit `courseId`; verify row exists (no fallback, no auto-create). */
async function requireExistingCourseId(courseId) {
  const id = Number(courseId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }
  const [courseRows] = await mysqlPool.query(`SELECT id FROM courses WHERE id = ? LIMIT 1`, [id]);
  if (!courseRows[0]) {
    throw courseNotFound({ code: 'COURSE_NOT_FOUND' });
  }
  return id;
}

export async function countLecturesForCourse(courseId) {
  const [[row]] = await mysqlPool.query(`SELECT COUNT(*) AS n FROM lectures WHERE course_id = ?`, [courseId]);
  return Number(row?.n || 0);
}

export async function listLectures() {
  const [rows] = await mysqlPool.query(
    `SELECT l.*, c.title AS course_title
     FROM lectures l
     INNER JOIN courses c ON c.id = l.course_id
     ORDER BY l.created_at DESC`
  );
  return rows.map((row) => ({
    ...toLecture(row),
    courseTitle: row.course_title,
  }));
}

export async function createLecture(payload) {
  const videoId = getYouTubeVideoId(payload.youtubeUrl);
  if (!videoId) {
    throw new ApiError(422, 'Invalid YouTube URL');
  }

  const resolvedCourseId = await requireExistingCourseId(payload.courseId);

  const [result] = await mysqlPool.query(
    `INSERT INTO lectures (course_id, title, youtube_url, youtube_video_id, topic, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      resolvedCourseId,
      payload.title,
      payload.youtubeUrl,
      videoId,
      payload.topic || null,
      payload.sortOrder || 0,
      payload.isActive ?? true,
    ]
  );

  const [rows] = await mysqlPool.query(`SELECT * FROM lectures WHERE id = ?`, [result.insertId]);
  return toLecture(rows[0]);
}

export async function updateLecture(lectureId, payload) {
  const videoId = getYouTubeVideoId(payload.youtubeUrl);
  if (!videoId) {
    throw new ApiError(422, 'Invalid YouTube URL');
  }

  const [existingRows] = await mysqlPool.query(`SELECT id, course_id FROM lectures WHERE id = ? LIMIT 1`, [lectureId]);
  if (!existingRows[0]) {
    return null;
  }
  const resolvedCourseId = await requireExistingCourseId(payload.courseId);

  await mysqlPool.query(
    `UPDATE lectures
     SET course_id = ?, title = ?, youtube_url = ?, youtube_video_id = ?, topic = ?, sort_order = ?, is_active = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      resolvedCourseId,
      payload.title,
      payload.youtubeUrl,
      videoId,
      payload.topic || null,
      payload.sortOrder || 0,
      payload.isActive ?? true,
      lectureId,
    ]
  );

  const [rows] = await mysqlPool.query(`SELECT * FROM lectures WHERE id = ?`, [lectureId]);
  return rows[0] ? toLecture(rows[0]) : null;
}

export async function deleteLecture(lectureId) {
  const [result] = await mysqlPool.query(`DELETE FROM lectures WHERE id = ?`, [lectureId]);
  return result.affectedRows > 0;
}
