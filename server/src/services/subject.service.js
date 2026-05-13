import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { toSubjectAdminDto } from '../dto/subject.dto.js';

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
    const idx = orderIndex != null && Number.isFinite(Number(orderIndex)) ? Number(orderIndex) : await nextOrderIndex(connection, courseId);
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
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}

export async function updateSubject(courseId, subjectId, patch) {
  await assertCourseExists(courseId);
  const existing = await getSubjectRow(courseId, subjectId);
  if (!existing) throw subjectNotFound();

  const title = patch.title !== undefined ? patch.title : existing.title;
  const description = patch.description !== undefined ? patch.description : existing.description;
  const orderIndex = patch.orderIndex !== undefined ? patch.orderIndex : existing.order_index;
  const isActive = patch.isActive !== undefined ? patch.isActive : Boolean(Number(existing.is_active));

  await mysqlPool.query(
    `UPDATE subjects SET title = ?, description = ?, order_index = ?, is_active = ? WHERE id = ? AND course_id = ?`,
    [title, description, orderIndex, isActive, subjectId, courseId]
  );
  const [rows] = await mysqlPool.query(
    `SELECT id, course_id, title, description, order_index, is_active, created_at, updated_at
     FROM subjects WHERE id = ? AND course_id = ? LIMIT 1`,
    [subjectId, courseId]
  );
  return toSubjectAdminDto(rows[0]);
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
