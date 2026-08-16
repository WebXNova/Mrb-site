/**
 * Course ↔ category junction — diff-based replace with validation and activity logging.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from './activityLog.service.js';
import { parseReplaceCourseCategoriesBody } from '../validators/courseCategory.schema.js';
import { getCourseRowById } from './courseCatalogQueries.service.js';

function mapAssignedCategory(row) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description ?? null,
    isActive: Boolean(row.is_active),
    displayOrder: Number(row.display_order),
  };
}

async function assertCourseExists(courseId) {
  const id = Number(courseId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
  }
  const row = await getCourseRowById(id);
  if (!row) {
    throw new ApiError(404, 'Course not found', { code: 'COURSE_NOT_FOUND' });
  }
  return row;
}

/**
 * @param {number} courseId
 */
export async function listCategoriesForCourse(courseId) {
  await assertCourseExists(courseId);

  const [rows] = await mysqlPool.query(
    `SELECT
       c.id,
       c.name,
       c.description,
       c.is_active,
       c.display_order
     FROM course_category_map m
     INNER JOIN course_categories c ON c.id = m.category_id
     WHERE m.course_id = ?
     ORDER BY c.display_order ASC, c.id ASC`,
    [Number(courseId)]
  );

  return rows.map(mapAssignedCategory);
}

/**
 * Validate category_ids: all must exist; new assignments to inactive categories rejected;
 * existing inactive assignments may remain.
 *
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} courseId
 * @param {number[]} targetIds
 */
async function validateCategoryAssignment(connection, courseId, targetIds) {
  if (!targetIds.length) return;

  const [categoryRows] = await connection.query(
    `SELECT id, is_active FROM course_categories WHERE id IN (?)`,
    [targetIds]
  );
  const found = new Map(categoryRows.map((r) => [Number(r.id), Boolean(r.is_active)]));

  for (const cid of targetIds) {
    if (!found.has(cid)) {
      throw new ApiError(422, `Category ${cid} does not exist`, {
        code: 'INVALID_CATEGORY_ID',
        categoryId: cid,
      });
    }
  }

  const [currentRows] = await connection.query(
    `SELECT category_id FROM course_category_map WHERE course_id = ?`,
    [courseId]
  );
  const currentSet = new Set(currentRows.map((r) => Number(r.category_id)));

  for (const cid of targetIds) {
    if (currentSet.has(cid)) continue;
    if (!found.get(cid)) {
      throw new ApiError(422, 'Cannot assign an inactive category to a course', {
        code: 'INACTIVE_CATEGORY_ASSIGNMENT',
        categoryId: cid,
      });
    }
  }
}

/**
 * Diff-based replace of course category assignments.
 *
 * @param {{ courseId: number, body: object, actorId: number, actorRole?: string }}
 */
export async function replaceCourseCategories({ courseId, body, actorId, actorRole }) {
  const cid = Number(courseId);
  await assertCourseExists(cid);
  const targetIds = parseReplaceCourseCategoriesBody(body);

  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(
      `SELECT id FROM courses WHERE id = ? LIMIT 1 FOR UPDATE`,
      [cid]
    );

    await validateCategoryAssignment(connection, cid, targetIds);

    const [currentRows] = await connection.query(
      `SELECT category_id FROM course_category_map WHERE course_id = ? FOR UPDATE`,
      [cid]
    );
    const currentIds = currentRows.map((r) => Number(r.category_id));
    const currentSet = new Set(currentIds);
    const targetSet = new Set(targetIds);

    const toRemove = currentIds.filter((id) => !targetSet.has(id));
    const toAdd = targetIds.filter((id) => !currentSet.has(id));

    if (toRemove.length) {
      await connection.query(
        `DELETE FROM course_category_map WHERE course_id = ? AND category_id IN (?)`,
        [cid, toRemove]
      );
    }

    if (toAdd.length) {
      const rows = toAdd.map((categoryId) => [cid, categoryId]);
      await connection.query(
        `INSERT INTO course_category_map (course_id, category_id) VALUES ?`,
        [rows]
      );
    }

    const [updatedRows] = await connection.query(
      `SELECT
         c.id,
         c.name,
         c.description,
         c.is_active,
         c.display_order
       FROM course_category_map m
       INNER JOIN course_categories c ON c.id = m.category_id
       WHERE m.course_id = ?
       ORDER BY c.display_order ASC, c.id ASC`,
      [cid]
    );

    await connection.commit();

    void logActivity({
      userId: actorId,
      role: typeof actorRole === 'string' ? actorRole : 'admin',
      action: 'course.categories_updated',
      entityType: 'course',
      entityId: String(cid),
      metadata: {
        added: toAdd,
        removed: toRemove,
        categoryIds: updatedRows.map((r) => Number(r.id)),
      },
    });

    return updatedRows.map(mapAssignedCategory);
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
