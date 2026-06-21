import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { applyCourseModelHooks, deriveCourseAdmissionFromBatch } from '../models/course.model.js';
import { toCourseAdminDto } from '../dto/course.dto.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { updateBatch } from './courseBatch.service.js';
import {
  createDefaultFreeCoursePricing,
  insertActiveCoursePricingWithConnection,
} from './coursePricing.service.js';
import { insertCurriculumSeedsForNewCourse } from './courseCurriculumSeed.service.js';

function courseNotFound() {
  return new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
}

function resolveAdmissionWriteFields(payload, { batchFallback = null, existing = null } = {}) {
  const derived = batchFallback ? deriveCourseAdmissionFromBatch(batchFallback) : {};
  const merged = {
    start_date:
      payload.start_date !== undefined
        ? payload.start_date
        : existing?.start_date ?? derived.start_date ?? null,
    end_date:
      payload.end_date !== undefined ? payload.end_date : existing?.end_date ?? derived.end_date ?? null,
    admission_status:
      payload.admission_status !== undefined
        ? payload.admission_status
        : existing?.admission_status ?? derived.admission_status,
  };
  return applyCourseModelHooks(merged, {
    explicitAdmissionStatus: payload.admission_status !== undefined,
  });
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
    const admission = resolveAdmissionWriteFields(payload);
    const [result] = await connection.query(
      `INSERT INTO courses
       (title, description, short_description, level, image_url, is_active, created_by,
        start_date, end_date, admission_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.title,
        payload.description,
        payload.short_description ?? null,
        level,
        payload.thumbnail_url ?? null,
        payload.is_active ?? true,
        createdBy,
        admission.start_date,
        admission.end_date,
        admission.admission_status,
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

  const wasActive = Boolean(Number(existingRow.is_active));
  const nextActive =
    payload.is_active !== undefined ? Boolean(payload.is_active) : wasActive;

  const admission = resolveAdmissionWriteFields(payload, { existing: existingRow });

  await mysqlPool.query(
    `UPDATE courses
     SET title = ?, description = ?, short_description = ?, level = ?, image_url = ?,
         is_active = ?, start_date = ?, end_date = ?, admission_status = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      payload.title,
      payload.description,
      shortDesc,
      level,
      thumb,
      nextActive,
      admission.start_date,
      admission.end_date,
      admission.admission_status,
      courseId,
    ]
  );

  if (!wasActive && nextActive) {
    const [batchRows] = await mysqlPool.query(
      `SELECT id, status, is_active FROM course_batches
       WHERE course_id = ? AND status != 'archived'
       ORDER BY id ASC LIMIT 1`,
      [courseId]
    );
    const batch = batchRows[0];
    if (batch) {
      const batchStatus = String(batch.status || 'draft').toLowerCase();
      const patch = { is_active: true };
      if (batchStatus === 'draft') {
        patch.status = 'upcoming';
      }
      if (batchStatus === 'draft' || !Boolean(Number(batch.is_active))) {
        await updateBatch(Number(batch.id), patch, { isSuperAdmin: false });
      }
    }
  }

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

function courseHasEnrollmentsError(activeCount) {
  return new ApiError(
    409,
    `This course has ${activeCount} active enrollment(s). Revoke student access before deleting the course.`,
    { code: 'COURSE_HAS_ENROLLMENTS', activeEnrollmentCount: activeCount }
  );
}

/**
 * Permanently delete a course with explicit content cascade and enrollment safety checks.
 *
 * Blocks when active enrollments exist (409 COURSE_HAS_ENROLLMENTS).
 * Soft-revokes inactive enrollments, removes order/enrollment rows, then deletes
 * lectures → chapters → subjects before removing the course row (tests/pricing/batches
 * cascade from the final course delete).
 *
 * @param {number} courseId
 * @returns {Promise<{ deleted: boolean, courseId: number, cascaded?: object }>}
 */
export async function deleteCourse(courseId) {
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }

  const [courseRows] = await mysqlPool.query(`SELECT id FROM courses WHERE id = ? LIMIT 1`, [cid]);
  if (!courseRows[0]) {
    return { deleted: false, courseId: cid };
  }

  const [activeRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ? AND access_status = 'active'`,
    [cid]
  );
  const activeEnrollmentCount = Number(activeRows[0]?.c || 0);
  if (activeEnrollmentCount > 0) {
    throw courseHasEnrollmentsError(activeEnrollmentCount);
  }

  const [
    [lectureCountRows],
    [chapterCountRows],
    [subjectCountRows],
    [enrollmentCountRows],
  ] = await Promise.all([
    mysqlPool.query(`SELECT COUNT(*) AS c FROM lectures WHERE course_id = ?`, [cid]),
    mysqlPool.query(
      `SELECT COUNT(*) AS c
       FROM chapters ch
       INNER JOIN subjects s ON s.id = ch.subject_id
       WHERE s.course_id = ?`,
      [cid]
    ),
    mysqlPool.query(`SELECT COUNT(*) AS c FROM subjects WHERE course_id = ?`, [cid]),
    mysqlPool.query(`SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ?`, [cid]),
  ]);

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const [revokeResult] = await connection.query(
      `UPDATE enrollments
       SET access_status = 'revoked',
           status = 'rejected',
           updated_at = CURRENT_TIMESTAMP
       WHERE course_id = ?
         AND access_status != 'revoked'`,
      [cid]
    );

    await connection.query(`DELETE FROM orders WHERE course_id = ?`, [cid]);
    await connection.query(`DELETE FROM enrollments WHERE course_id = ?`, [cid]);
    await connection.query(`DELETE FROM lecture_progress WHERE course_id = ?`, [cid]);
    await connection.query(`DELETE FROM lectures WHERE course_id = ?`, [cid]);
    await connection.query(
      `DELETE ch FROM chapters ch
       INNER JOIN subjects s ON s.id = ch.subject_id
       WHERE s.course_id = ?`,
      [cid]
    );
    await connection.query(`DELETE FROM subjects WHERE course_id = ?`, [cid]);

    const [deleteResult] = await connection.query(`DELETE FROM courses WHERE id = ?`, [cid]);

    await connection.commit();

    return {
      deleted: deleteResult.affectedRows > 0,
      courseId: cid,
      cascaded: {
        lecturesRemoved: Number(lectureCountRows[0]?.c || 0),
        chaptersRemoved: Number(chapterCountRows[0]?.c || 0),
        subjectsRemoved: Number(subjectCountRows[0]?.c || 0),
        enrollmentsRevoked: Number(revokeResult.affectedRows || 0),
        enrollmentsRemoved: Number(enrollmentCountRows[0]?.c || 0),
      },
    };
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
