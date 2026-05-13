import { mysqlPool } from '../config/mysql.js';

/** Minimal columns for course identity + educational metadata (legacy columns not selected). */
export const COURSE_CORE_COLUMNS = `id, title, description, short_description, level, image_url, is_active, created_by, created_at, updated_at`;

export async function listAllCourseRows() {
  const [rows] = await mysqlPool.query(
    `SELECT ${COURSE_CORE_COLUMNS} FROM courses ORDER BY created_at DESC`
  );
  return rows;
}

export async function listActiveCourseRows() {
  const [rows] = await mysqlPool.query(
    `SELECT ${COURSE_CORE_COLUMNS} FROM courses WHERE is_active = TRUE ORDER BY created_at DESC`
  );
  return rows;
}

export async function getCourseRowById(courseId, { activeOnly = false } = {}) {
  let sql = `SELECT ${COURSE_CORE_COLUMNS} FROM courses WHERE id = ?`;
  const params = [courseId];
  if (activeOnly) sql += ' AND is_active = TRUE';
  const [rows] = await mysqlPool.query(`${sql} LIMIT 1`, params);
  return rows[0] || null;
}
