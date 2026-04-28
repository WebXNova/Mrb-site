import { mysqlPool } from '../config/mysql.js';

function getYouTubeVideoId(url) {
  const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/;
  const match = url.match(regex);
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

export async function listLectures() {
  const [rows] = await mysqlPool.query(
    `SELECT l.*, c.title AS course_title
     FROM lectures l
     INNER JOIN courses c ON c.id = l.course_id
     ORDER BY l.created_at DESC`
  );
  return rows.map((row) => ({ ...toLecture(row), courseTitle: row.course_title }));
}

export async function createLecture(payload) {
  const videoId = getYouTubeVideoId(payload.youtubeUrl);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  const [result] = await mysqlPool.query(
    `INSERT INTO lectures (course_id, title, youtube_url, youtube_video_id, topic, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.courseId,
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
    throw new Error('Invalid YouTube URL');
  }

  await mysqlPool.query(
    `UPDATE lectures
     SET course_id = ?, title = ?, youtube_url = ?, youtube_video_id = ?, topic = ?, sort_order = ?, is_active = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      payload.courseId,
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
