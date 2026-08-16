/**
 * Course categories — admin CRUD with transactional updates and activity logging.
 */

import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from './activityLog.service.js';
import {
  parseCreateCourseCategoryBody,
  parseReorderCourseCategoriesBody,
  parseUpdateCourseCategoryBody,
} from '../validators/courseCategory.schema.js';

function mapCategoryRow(row) {
  return {
    id: Number(row.id),
    name: row.name,
    description: row.description ?? null,
    classLevel: row.class_level ?? 'not_applicable',
    department: row.department ?? 'not_applicable',
    board: row.board ?? 'not_applicable',
    isActive: Boolean(row.is_active),
    displayOrder: Number(row.display_order),
    createdBy: Number(row.created_by),
    updatedBy: row.updated_by == null ? null : Number(row.updated_by),
    createdByName: row.created_by_name || null,
    updatedByName: row.updated_by_name || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function snapshotCategory(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: String(row.name),
    description: row.description ?? null,
    class_level: row.class_level ?? 'not_applicable',
    department: row.department ?? 'not_applicable',
    board: row.board ?? 'not_applicable',
    is_active: Boolean(row.is_active),
    display_order: Number(row.display_order),
  };
}

const LIST_SQL = `
  SELECT
    cc.id,
    cc.name,
    cc.description,
    cc.class_level,
    cc.department,
    cc.board,
    cc.is_active,
    cc.display_order,
    cc.created_by,
    cc.updated_by,
    cc.created_at,
    cc.updated_at,
    cb.full_name AS created_by_name,
    ub.full_name AS updated_by_name
  FROM course_categories cc
  INNER JOIN users cb ON cb.id = cc.created_by
  LEFT JOIN users ub ON ub.id = cc.updated_by
`;

async function logCategoryActivity({ actorId, actorRole, action, categoryId, metadata }) {
  void logActivity({
    userId: actorId,
    role: typeof actorRole === 'string' ? actorRole : 'admin',
    action,
    entityType: 'course_category',
    entityId: String(categoryId),
    metadata,
  });
}

async function assertUniqueCategoryName(connection, name, excludeId = null) {
  const params = [name];
  let sql = `SELECT id FROM course_categories WHERE LOWER(name) = LOWER(?)`;
  if (excludeId != null) {
    sql += ` AND id <> ?`;
    params.push(Number(excludeId));
  }
  sql += ` LIMIT 1 FOR UPDATE`;
  const [rows] = await connection.query(sql, params);
  if (rows[0]) {
    throw new ApiError(409, 'A category with this name already exists', {
      code: 'CATEGORY_NAME_TAKEN',
      field: 'name',
    });
  }
}

export async function listCourseCategories() {
  const [rows] = await mysqlPool.query(
    `${LIST_SQL} ORDER BY cc.display_order ASC, cc.id ASC`
  );
  return rows.map(mapCategoryRow);
}

/**
 * @param {number} categoryId
 */
export async function getCourseCategoryById(categoryId) {
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid category id');
  }
  const [rows] = await mysqlPool.query(`${LIST_SQL} WHERE cc.id = ? LIMIT 1`, [id]);
  return rows[0] ? mapCategoryRow(rows[0]) : null;
}

/**
 * @param {{ body: object, actorId: number, actorRole?: string }}
 */
export async function createCourseCategory({ body, actorId, actorRole }) {
  const dto = parseCreateCourseCategoryBody(body);
  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    await assertUniqueCategoryName(connection, dto.name);

    const [maxRows] = await connection.query(
      `SELECT COALESCE(MAX(display_order), -1) AS max_order FROM course_categories FOR UPDATE`
    );
    const nextOrder = Number(maxRows[0]?.max_order ?? -1) + 1;

    const [insertResult] = await connection.query(
      `INSERT INTO course_categories (name, description, class_level, department, board, is_active, display_order, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, TRUE, ?, ?, ?)`,
      [
        dto.name,
        dto.description,
        dto.class_level,
        dto.department,
        dto.board,
        nextOrder,
        actorId,
        actorId,
      ]
    );

    const categoryId = Number(insertResult.insertId);
    const newSnapshot = {
      id: categoryId,
      name: dto.name,
      description: dto.description,
      class_level: dto.class_level,
      department: dto.department,
      board: dto.board,
      is_active: true,
      display_order: nextOrder,
    };

    await connection.commit();

    void logCategoryActivity({
      actorId,
      actorRole,
      action: 'course_category.created',
      categoryId,
      metadata: { newValue: newSnapshot },
    });

    const created = await getCourseCategoryById(categoryId);
    if (!created) {
      throw new ApiError(500, 'Category missing after create');
    }
    return created;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'A category with this name already exists', {
        code: 'CATEGORY_NAME_TAKEN',
        field: 'name',
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {{ categoryId: number, body: object, actorId: number, actorRole?: string }}
 */
export async function updateCourseCategory({ categoryId, body, actorId, actorRole }) {
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid category id');
  }

  const dto = parseUpdateCourseCategoryBody(body);
  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, name, description, class_level, department, board, is_active, display_order
       FROM course_categories
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );
    const existing = rows[0];
    if (!existing) {
      throw new ApiError(404, 'Category not found');
    }

    await assertUniqueCategoryName(connection, dto.name, id);
    const oldSnapshot = snapshotCategory(existing);

    await connection.query(
      `UPDATE course_categories
       SET name = ?, description = ?, class_level = ?, department = ?, board = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [dto.name, dto.description, dto.class_level, dto.department, dto.board, actorId, id]
    );

    const newSnapshot = {
      ...oldSnapshot,
      name: dto.name,
      description: dto.description,
      class_level: dto.class_level,
      department: dto.department,
      board: dto.board,
    };

    await connection.commit();

    void logCategoryActivity({
      actorId,
      actorRole,
      action: 'course_category.updated',
      categoryId: id,
      metadata: { oldValue: oldSnapshot, newValue: newSnapshot },
    });

    const updated = await getCourseCategoryById(id);
    if (!updated) {
      throw new ApiError(500, 'Category missing after update');
    }
    return updated;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      /* ignore */
    }
    if (error?.code === 'ER_DUP_ENTRY') {
      throw new ApiError(409, 'A category with this name already exists', {
        code: 'CATEGORY_NAME_TAKEN',
        field: 'name',
      });
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * @param {{ categoryId: number, actorId: number, actorRole?: string }}
 */
export async function activateCourseCategory({ categoryId, actorId, actorRole }) {
  return setCategoryActiveState({ categoryId, isActive: true, actorId, actorRole });
}

/**
 * @param {{ categoryId: number, actorId: number, actorRole?: string }}
 */
export async function deactivateCourseCategory({ categoryId, actorId, actorRole }) {
  return setCategoryActiveState({ categoryId, isActive: false, actorId, actorRole });
}

async function setCategoryActiveState({ categoryId, isActive, actorId, actorRole }) {
  const id = Number(categoryId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid category id');
  }

  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT id, name, description, class_level, department, board, is_active, display_order
       FROM course_categories
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );
    const existing = rows[0];
    if (!existing) {
      throw new ApiError(404, 'Category not found');
    }

    const wasActive = Boolean(existing.is_active);
    if (wasActive === isActive) {
      await connection.commit();
      return getCourseCategoryById(id);
    }

    const oldSnapshot = snapshotCategory(existing);

    await connection.query(
      `UPDATE course_categories
       SET is_active = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [isActive, actorId, id]
    );

    const newSnapshot = { ...oldSnapshot, is_active: isActive };

    await connection.commit();

    void logCategoryActivity({
      actorId,
      actorRole,
      action: isActive ? 'course_category.activated' : 'course_category.deactivated',
      categoryId: id,
      metadata: { oldValue: oldSnapshot, newValue: newSnapshot },
    });

    return getCourseCategoryById(id);
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

/**
 * @param {{ body: object, actorId: number, actorRole?: string }}
 */
export async function reorderCourseCategories({ body, actorId, actorRole }) {
  const orderedIds = parseReorderCourseCategoriesBody(body);
  const connection = await mysqlPool.getConnection();

  try {
    await connection.beginTransaction();

    const [dbRows] = await connection.query(
      `SELECT id FROM course_categories ORDER BY display_order ASC, id ASC FOR UPDATE`
    );
    const dbIds = dbRows.map((r) => Number(r.id));

    if (dbIds.length !== orderedIds.length) {
      await connection.rollback();
      throw new ApiError(
        422,
        'ordered_category_ids must include every category exactly once',
        {
          code: 'REORDER_INVALID',
          expectedCount: dbIds.length,
          receivedCount: orderedIds.length,
        }
      );
    }

    const dbSet = new Set(dbIds);
    if (!orderedIds.every((cid) => dbSet.has(cid))) {
      await connection.rollback();
      throw new ApiError(422, 'ordered_category_ids contains unknown or extra category ids', {
        code: 'REORDER_INVALID',
      });
    }

    for (let i = 0; i < orderedIds.length; i += 1) {
      await connection.query(
        `UPDATE course_categories SET display_order = ?, updated_by = ? WHERE id = ?`,
        [i, actorId, orderedIds[i]]
      );
    }

    await connection.commit();

    void logCategoryActivity({
      actorId,
      actorRole,
      action: 'course_category.reordered',
      categoryId: 0,
      metadata: { orderedCategoryIds: orderedIds },
    });

    return listCourseCategories();
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

/**
 * Load categories keyed by course id for admin list enrichment.
 * @returns {Promise<Map<number, Array<{ id: number, name: string, isActive: boolean }>>>}
 */
/**
 * Public catalog — active categories only, ordered for display.
 */
export async function listPublicActiveCourseCategories() {
  try {
    const [rows] = await mysqlPool.query(
      `SELECT id, name, description, class_level, department, board, display_order
       FROM course_categories
       WHERE is_active = TRUE
       ORDER BY display_order ASC, id ASC`
    );
    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      description: row.description ?? null,
      class_level: row.class_level ?? 'not_applicable',
      department: row.department ?? 'not_applicable',
      board: row.board ?? 'not_applicable',
      display_order: Number(row.display_order),
    }));
  } catch (error) {
    const code = String(error?.code || '');
    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') {
      return [];
    }
    throw error;
  }
}

export async function loadCategoriesByCourseIds(courseIds) {
  const ids = [...new Set((courseIds || []).map((id) => Number(id)).filter((id) => id > 0))];
  const map = new Map();
  if (!ids.length) return map;

  const [rows] = await mysqlPool.query(
    `SELECT
       m.course_id,
       c.id,
       c.name,
       c.class_level,
       c.department,
       c.board,
       c.is_active
     FROM course_category_map m
     INNER JOIN course_categories c ON c.id = m.category_id
     WHERE m.course_id IN (?)
     ORDER BY c.display_order ASC, c.id ASC`,
    [ids]
  );

  for (const row of rows) {
    const courseId = Number(row.course_id);
    if (!map.has(courseId)) map.set(courseId, []);
    map.get(courseId).push({
      id: Number(row.id),
      name: row.name,
      classLevel: row.class_level ?? 'not_applicable',
      department: row.department ?? 'not_applicable',
      board: row.board ?? 'not_applicable',
      isActive: Boolean(row.is_active),
    });
  }

  return map;
}
