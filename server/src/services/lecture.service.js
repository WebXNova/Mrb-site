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

function normalizeCategory(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

async function resolveCourseIdForLecture(payload, fallbackCourseId = null) {
  if (payload.courseId) {
    const [courseRows] = await mysqlPool.query(`SELECT id FROM courses WHERE id = ? LIMIT 1`, [payload.courseId]);
    if (!courseRows[0]) {
      throw new ApiError(404, 'Selected course not found');
    }
    return Number(payload.courseId);
  }

  const requestedCategory = normalizeCategory(payload.courseCategory || 'MDCAT') || 'MDCAT';

  const [categoryRows] = await mysqlPool.query(
    `SELECT id FROM courses WHERE LOWER(TRIM(subject)) = LOWER(TRIM(?)) ORDER BY is_active DESC, created_at DESC LIMIT 1`,
    [requestedCategory]
  );
  if (categoryRows[0]) return Number(categoryRows[0].id);

  if (fallbackCourseId) return Number(fallbackCourseId);

  const autoSlug = `${slugify(`${requestedCategory} auto course`)}-${Date.now()}`;
  const autoTitle = `${requestedCategory} Auto Course`;
  const autoDescription = `Auto-generated course for ${requestedCategory} lectures. You can edit this course from the Courses section.`;

  const [result] = await mysqlPool.query(
    `INSERT INTO courses
     (slug, title, subject, description, price, original_price, accent_color, level, instructor,
      lectures_count, tests_count, duration_weeks, rating, students_enrolled, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [autoSlug, autoTitle, requestedCategory, autoDescription, 0, null, null, null, null, '0', '0', 0, 0, 0, true, null]
  );
  return Number(result.insertId);
}

export async function listLectures() {
  const [rows] = await mysqlPool.query(
    `SELECT l.*, c.title AS course_title, c.subject AS course_subject
     FROM lectures l
     INNER JOIN courses c ON c.id = l.course_id
     ORDER BY l.created_at DESC`
  );
  return rows.map((row) => ({
    ...toLecture(row),
    courseTitle: row.course_title,
    courseSubject: row.course_subject,
  }));
}

export async function createLecture(payload) {
  const videoId = getYouTubeVideoId(payload.youtubeUrl);
  if (!videoId) {
    throw new ApiError(422, 'Invalid YouTube URL');
  }

  const resolvedCourseId = await resolveCourseIdForLecture(payload);

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
  const resolvedCourseId = await resolveCourseIdForLecture(payload, existingRows[0].course_id);

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
