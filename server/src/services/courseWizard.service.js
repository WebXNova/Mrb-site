import { mysqlPool } from '../config/mysql.js';
import { toCourseAdminDto } from '../dto/course.dto.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';
import { insertActiveCoursePricingWithConnection } from './coursePricing.service.js';
import { insertCurriculumSeedsForNewCourse } from './courseCurriculumSeed.service.js';
import { insertCourseBatchWithConnection } from './courseBatch.service.js';

/**
 * Transactional course + pricing + batches + subjects (wizard create).
 *
 * @param {object} payload validated wizard body (`courseWizardBodySchema`)
 * @param {number|null} actorUserId
 */
export async function createCourseWizardTransaction(payload, actorUserId = null) {
  const publish = Boolean(payload.publish);
  const courseActive = publish ? Boolean(payload.course.is_active) : false;

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO courses
       (title, description, short_description, level, image_url, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.course.title,
        payload.course.description,
        payload.course.short_description ?? null,
        payload.course.level,
        payload.course.thumbnail_url ?? null,
        courseActive,
        actorUserId,
      ]
    );
    const newCourseId = result.insertId;

    await insertActiveCoursePricingWithConnection(connection, newCourseId, payload.pricing, actorUserId);

    for (const batch of payload.batches) {
      const rawStatus = String(batch.status || 'draft').toLowerCase();
      const status = publish && rawStatus === 'draft' ? 'upcoming' : rawStatus;
      await insertCourseBatchWithConnection(connection, newCourseId, { ...batch, status }, actorUserId);
    }

    const sortedSubjects = [...payload.subjects].sort((a, b) => a.order_index - b.order_index);
    await insertCurriculumSeedsForNewCourse(connection, newCourseId, sortedSubjects);

    await connection.commit();
    const row = await getCourseRowById(newCourseId);
    return toCourseAdminDto(row);
  } catch (e) {
    try {
      await connection.rollback();
    } catch {
      /* already rolled back */
    }
    throw e;
  } finally {
    connection.release();
  }
}
