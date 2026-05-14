import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { toCourseAdminDto } from '../dto/course.dto.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import {
  createDefaultFreeCoursePricing,
  insertActiveCoursePricingWithConnection,
} from './coursePricing.service.js';
import { insertCurriculumSeedsForNewCourse } from './courseCurriculumSeed.service.js';

function courseNotFound() {
  return new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
}

/**
 * Insert a course, its pricing row, and initial curriculum seeds in one transaction.
 *
 * @param {object} payload          validated course-identity fields
 * @param {number|null} createdBy   actor user id (or null for system writes)
 * @param {object} [options]
 * @param {object|null} [options.pricing] validated pricing payload (or null)
 * @param {Array<{ title: string, description: string|null }>} [options.curriculumSeeds] initial curriculum rows (required at API boundary; order = array index)
 */
export async function createCourse(payload, createdBy = null, { pricing = null, curriculumSeeds = [] } = {}) {
  const level = payload.level ?? 'beginner';
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      `INSERT INTO courses
       (title, description, short_description, level, image_url, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.title,
        payload.description,
        payload.short_description ?? null,
        level,
        payload.thumbnail_url ?? null,
        payload.is_active ?? true,
        createdBy,
      ]
    );
    const newCourseId = result.insertId;
    if (pricing) {
      await insertActiveCoursePricingWithConnection(connection, newCourseId, pricing, createdBy);
    } else {
      await createDefaultFreeCoursePricing(connection, newCourseId, createdBy);
    }
    await insertCurriculumSeedsForNewCourse(connection, newCourseId, curriculumSeeds);
    await connection.commit();
    const row = await getCourseRowById(newCourseId);
    return toCourseAdminDto(row);
  } catch (e) {
    try { await connection.rollback(); } catch { /* already rolled back */ }
    throw e;
  } finally {
    connection.release();
  }
}

export async function getCourseById(courseId, { activeOnly = false } = {}) {
  const row = await getCourseRowById(courseId, { activeOnly });
  if (!row) throw courseNotFound();
  return toCourseAdminDto(row);
}

export async function updateCourse(courseId, payload) {
  const existingRow = await getCourseRowById(courseId);
  if (!existingRow) throw courseNotFound();

  const level = payload.level !== undefined && payload.level !== null ? payload.level : existingRow.level;

  const shortDesc =
    payload.short_description !== undefined ? payload.short_description : existingRow.short_description ?? null;

  const thumb =
    payload.thumbnail_url !== undefined ? payload.thumbnail_url : existingRow.image_url ?? null;

  await mysqlPool.query(
    `UPDATE courses
     SET title = ?, description = ?, short_description = ?, level = ?, image_url = ?,
         is_active = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      payload.title,
      payload.description,
      shortDesc,
      level,
      thumb,
      payload.is_active !== undefined ? payload.is_active : !!existingRow.is_active,
      courseId,
    ]
  );
  const row = await getCourseRowById(courseId);
  return toCourseAdminDto(row);
}

export async function deactivateCourse(courseId) {
  const [result] = await mysqlPool.query(
    `UPDATE courses SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [courseId]
  );
  return result.affectedRows > 0;
}

export async function deleteCourse(courseId) {
  const [result] = await mysqlPool.query(`DELETE FROM courses WHERE id = ?`, [courseId]);
  return result.affectedRows > 0;
}
