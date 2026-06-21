import { randomUUID } from 'crypto';
import { mysqlPool } from '../config/mysql.js';
import { maskPhone } from '../utils/phoneValidation.js';

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function toReview(row, { maskPhoneNumber = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    uuid: row.uuid,
    name: row.name,
    phone: maskPhoneNumber ? maskPhone(row.phone) : row.phone,
    email: row.email || '',
    courseName: row.course_name || '',
    rating: row.rating,
    reviewMessage: row.review_message,
    status: row.status,
    featured: Boolean(row.featured),
    published: Boolean(row.published),
    publishedAt: row.published_at,
    adminNotes: row.admin_notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedByAdminId: row.approved_by_admin_id,
    ipAddress: row.ip_address || '',
    userAgent: row.user_agent || '',
  };
}

/** Public-safe review shape — no PII beyond display name. */
export function toPublicReview(row) {
  if (!row) return null;
  return {
    id: row.id,
    uuid: row.uuid,
    name: row.name,
    courseName: row.course_name || '',
    rating: row.rating,
    reviewMessage: row.review_message,
    featured: Boolean(row.featured),
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

function toAuditEntry(row) {
  return {
    id: row.id,
    reviewId: row.review_id,
    adminId: row.admin_id,
    adminName: row.admin_name || 'System',
    action: row.action,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    note: row.note || '',
    metadata: parseJson(row.metadata_json),
    createdAt: row.created_at,
  };
}

function buildListWhere(filters) {
  const clauses = [];
  const params = [];

  if (filters.search) {
    const term = `%${filters.search.trim()}%`;
    clauses.push('(r.name LIKE ? OR r.phone LIKE ? OR r.email LIKE ?)');
    params.push(term, term, term);
  }
  if (filters.status) {
    clauses.push('r.status = ?');
    params.push(filters.status);
  }
  if (filters.rating) {
    clauses.push('r.rating = ?');
    params.push(filters.rating);
  }
  if (filters.featured !== undefined) {
    clauses.push('r.featured = ?');
    params.push(filters.featured ? 1 : 0);
  }
  if (filters.published !== undefined) {
    clauses.push('r.published = ?');
    params.push(filters.published ? 1 : 0);
  }
  if (filters.dateFrom) {
    clauses.push('r.created_at >= ?');
    params.push(`${filters.dateFrom} 00:00:00`);
  }
  if (filters.dateTo) {
    clauses.push('r.created_at <= ?');
    params.push(`${filters.dateTo} 23:59:59`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return { where, params };
}

async function insertAuditEntry(connection, {
  reviewId,
  adminId,
  adminName,
  action,
  previousStatus,
  newStatus,
  note = null,
  metadata = {},
}) {
  await connection.query(
    `INSERT INTO review_audit_log
       (review_id, admin_id, admin_name, action, previous_status, new_status, note, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reviewId,
      adminId ?? null,
      adminName ?? null,
      action,
      previousStatus ?? null,
      newStatus ?? null,
      note,
      JSON.stringify(metadata || {}),
    ]
  );
}

async function fetchReviewById(reviewId, connection = mysqlPool) {
  const [rows] = await connection.query(`SELECT * FROM reviews WHERE id = ? LIMIT 1`, [reviewId]);
  return rows[0] || null;
}

export async function getReviewStats() {
  const [rows] = await mysqlPool.query(`
    SELECT
      COUNT(*) AS total,
      SUM(status = 'PENDING') AS pending,
      SUM(status = 'APPROVED') AS approved,
      SUM(status = 'REJECTED') AS rejected,
      SUM(status = 'ARCHIVED') AS archived,
      SUM(published = 1) AS published,
      SUM(featured = 1) AS featured
    FROM reviews
  `);
  const row = rows[0] || {};
  return {
    total: Number(row.total ?? 0),
    pending: Number(row.pending ?? 0),
    approved: Number(row.approved ?? 0),
    rejected: Number(row.rejected ?? 0),
    archived: Number(row.archived ?? 0),
    published: Number(row.published ?? 0),
    featured: Number(row.featured ?? 0),
  };
}

export async function listReviewsAdmin(filters, pagination) {
  const page = pagination.page || 1;
  const limit = pagination.limit || 20;
  const offset = (page - 1) * limit;
  const { where, params } = buildListWhere(filters);

  const [countRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS total FROM reviews r ${where}`,
    params
  );
  const total = Number(countRows[0]?.total ?? 0);

  const [rows] = await mysqlPool.query(
    `SELECT r.* FROM reviews r
     ${where}
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map((row) => toReview(row, { maskPhoneNumber: true })),
    total,
    page,
    limit,
    totalPages: total ? Math.ceil(total / limit) : 0,
  };
}

export async function getReviewByIdAdmin(reviewId) {
  const row = await fetchReviewById(reviewId);
  if (!row) return null;

  const [auditRows] = await mysqlPool.query(
    `SELECT * FROM review_audit_log
     WHERE review_id = ?
     ORDER BY created_at DESC, id DESC`,
    [reviewId]
  );

  return {
    ...toReview(row),
    auditLog: auditRows.map(toAuditEntry),
  };
}

export async function updateReviewAdmin(reviewId, patch, adminContext) {
  const existing = await fetchReviewById(reviewId);
  if (!existing) return null;

  const fields = [];
  const params = [];

  if (patch.name !== undefined) {
    fields.push('name = ?');
    params.push(patch.name);
  }
  if (patch.phone !== undefined) {
    fields.push('phone = ?');
    params.push(patch.phone);
  }
  if (patch.email !== undefined) {
    fields.push('email = ?');
    params.push(patch.email);
  }
  if (patch.courseName !== undefined) {
    fields.push('course_name = ?');
    params.push(patch.courseName);
  }
  if (patch.rating !== undefined) {
    fields.push('rating = ?');
    params.push(patch.rating);
  }
  if (patch.reviewMessage !== undefined) {
    fields.push('review_message = ?');
    params.push(patch.reviewMessage);
  }
  if (patch.adminNotes !== undefined) {
    fields.push('admin_notes = ?');
    params.push(patch.adminNotes);
  }

  if (!fields.length) return toReview(existing);

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE reviews SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...params, reviewId]
    );
    if (patch.adminNotes !== undefined) {
      await insertAuditEntry(connection, {
        reviewId,
        adminId: adminContext.id,
        adminName: adminContext.name,
        action: 'note_update',
        previousStatus: existing.status,
        newStatus: existing.status,
        note: patch.adminNotes,
      });
    } else {
      await insertAuditEntry(connection, {
        reviewId,
        adminId: adminContext.id,
        adminName: adminContext.name,
        action: 'edit',
        previousStatus: existing.status,
        newStatus: existing.status,
        metadata: { fields: Object.keys(patch) },
      });
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return getReviewByIdAdmin(reviewId);
}

async function transitionReview(reviewId, adminContext, {
  action,
  requiredStatus,
  nextStatus,
  setPublished,
  setFeatured,
  clearPublished,
  clearFeatured,
  setApprovedBy,
}) {
  const existing = await fetchReviewById(reviewId);
  if (!existing) return { error: 'NOT_FOUND' };
  if (requiredStatus && existing.status !== requiredStatus) {
    return { error: 'INVALID_STATUS', current: existing.status };
  }

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const updates = ['updated_at = CURRENT_TIMESTAMP'];
    const params = [];

    if (nextStatus) {
      updates.push('status = ?');
      params.push(nextStatus);
    }
    if (setPublished) {
      updates.push('published = 1', 'published_at = CURRENT_TIMESTAMP');
    }
    if (clearPublished) {
      updates.push('published = 0', 'published_at = NULL');
    }
    if (setFeatured !== undefined) {
      updates.push('featured = ?');
      params.push(setFeatured ? 1 : 0);
    }
    if (clearFeatured) {
      updates.push('featured = 0');
    }
    if (setApprovedBy) {
      updates.push('approved_by_admin_id = ?');
      params.push(adminContext.id);
    }

    await connection.query(`UPDATE reviews SET ${updates.join(', ')} WHERE id = ?`, [
      ...params,
      reviewId,
    ]);

    await insertAuditEntry(connection, {
      reviewId,
      adminId: adminContext.id,
      adminName: adminContext.name,
      action,
      previousStatus: existing.status,
      newStatus: nextStatus || existing.status,
      metadata: {
        published: setPublished ? true : clearPublished ? false : undefined,
        featured: setFeatured,
      },
    });

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return { review: await getReviewByIdAdmin(reviewId) };
}

export async function approveReview(reviewId, adminContext) {
  return transitionReview(reviewId, adminContext, {
    action: 'approve',
    nextStatus: 'APPROVED',
    setApprovedBy: true,
  });
}

export async function rejectReview(reviewId, adminContext) {
  return transitionReview(reviewId, adminContext, {
    action: 'reject',
    nextStatus: 'REJECTED',
    clearPublished: true,
    clearFeatured: true,
  });
}

export async function archiveReview(reviewId, adminContext) {
  return transitionReview(reviewId, adminContext, {
    action: 'archive',
    nextStatus: 'ARCHIVED',
    clearPublished: true,
    clearFeatured: true,
  });
}

export async function publishReview(reviewId, adminContext) {
  const existing = await fetchReviewById(reviewId);
  if (!existing) return { error: 'NOT_FOUND' };
  if (existing.status !== 'APPROVED') {
    return { error: 'NOT_APPROVED', current: existing.status };
  }
  return transitionReview(reviewId, adminContext, {
    action: 'publish',
    setPublished: true,
    setApprovedBy: true,
  });
}

export async function featureReview(reviewId, featured, adminContext) {
  const existing = await fetchReviewById(reviewId);
  if (!existing) return { error: 'NOT_FOUND' };
  if (featured && (!existing.published || existing.status !== 'APPROVED')) {
    return { error: 'NOT_PUBLISHED' };
  }
  return transitionReview(reviewId, adminContext, {
    action: featured ? 'feature' : 'unfeature',
    setFeatured: featured,
  });
}

export async function deleteReview(reviewId, adminContext) {
  const existing = await fetchReviewById(reviewId);
  if (!existing) return { error: 'NOT_FOUND' };

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await insertAuditEntry(connection, {
      reviewId,
      adminId: adminContext.id,
      adminName: adminContext.name,
      action: 'delete',
      previousStatus: existing.status,
      newStatus: 'DELETED',
    });
    await connection.query(`DELETE FROM reviews WHERE id = ?`, [reviewId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return { deleted: true, id: reviewId };
}

export async function bulkReviewAction(ids, action, adminContext) {
  const results = [];
  for (const id of ids) {
    let result;
    switch (action) {
      case 'approve':
        result = await approveReview(id, adminContext);
        break;
      case 'reject':
        result = await rejectReview(id, adminContext);
        break;
      case 'publish':
        result = await publishReview(id, adminContext);
        break;
      case 'archive':
        result = await archiveReview(id, adminContext);
        break;
      case 'delete':
        result = await deleteReview(id, adminContext);
        break;
      default:
        result = { error: 'INVALID_ACTION' };
    }
    results.push({ id, ...result });
  }
  return results;
}

export async function listPublishedReviews({ page = 1, limit = 10, featuredOnly = false, publicView = false } = {}) {
  const offset = (page - 1) * limit;
  const featuredClause = featuredOnly ? 'AND r.featured = 1' : '';
  const [countRows] = await mysqlPool.query(
    `SELECT COUNT(*) AS total FROM reviews r
     WHERE r.status = 'APPROVED' AND r.published = 1 ${featuredClause}`
  );
  const total = Number(countRows[0]?.total ?? 0);
  const [rows] = await mysqlPool.query(
    `SELECT r.id, r.uuid, r.name, r.course_name, r.rating, r.review_message,
            r.featured, r.published_at, r.created_at
     FROM reviews r
     WHERE r.status = 'APPROVED' AND r.published = 1 ${featuredClause}
     ORDER BY r.featured DESC, r.published_at DESC, r.created_at DESC
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  const mapper = publicView ? toPublicReview : (row) => toReview(row);
  return {
    items: rows.map(mapper),
    total,
    page,
    limit,
    totalPages: total ? Math.ceil(total / limit) : 0,
  };
}

export async function getPublicPlatformStats() {
  const [[studentRow]] = await mysqlPool.query(
    `SELECT COUNT(*) AS value FROM users WHERE role = 'student' AND status = 'active'`
  );
  const [[enrollmentRow]] = await mysqlPool.query(
    `SELECT COUNT(DISTINCT user_id) AS value FROM enrollments WHERE status = 'approved'`
  );
  const [[testsRow]] = await mysqlPool.query(
    `SELECT COUNT(*) AS value FROM tests WHERE deleted_at IS NULL`
  );
  const testsCount = Number(testsRow?.value ?? 0);

  const studentsFromUsers = Number(studentRow?.value ?? 0);
  const studentsFromEnrollments = Number(enrollmentRow?.value ?? 0);
  const studentsCount = Math.max(studentsFromUsers, studentsFromEnrollments);

  const [[reviewStats]] = await mysqlPool.query(
    `SELECT
       COUNT(*) AS reviewCount,
       AVG(rating) AS avgRating
     FROM reviews
     WHERE status = 'APPROVED' AND published = 1`
  );

  const reviewCount = Number(reviewStats?.reviewCount ?? 0);
  const avgRating = reviewStats?.avgRating != null ? Number(reviewStats.avgRating) : null;
  let satisfactionPercent = 95;
  if (reviewCount > 0 && avgRating != null && !Number.isNaN(avgRating)) {
    satisfactionPercent = Math.min(100, Math.max(0, Math.round((avgRating / 5) * 100)));
  }

  return {
    studentsCount,
    testsCount,
    satisfactionPercent,
    reviewCount,
    avgRating: avgRating != null && !Number.isNaN(avgRating) ? Math.round(avgRating * 10) / 10 : null,
    display: {
      students: formatSocialProofCount(studentsCount, 5000),
      tests: formatSocialProofCount(testsCount, 1000),
      satisfaction: `${satisfactionPercent}%`,
    },
    source: {
      students: studentsCount > 0 ? 'database' : 'fallback',
      tests: testsCount > 0 ? 'database' : 'fallback',
      satisfaction: reviewCount > 0 ? 'database' : 'fallback',
    },
  };
}

function formatSocialProofCount(actual, fallbackMinimum) {
  const value = actual > 0 ? actual : fallbackMinimum;
  if (value >= 1000) {
    const rounded = Math.floor(value / 1000) * 1000;
    return `${rounded.toLocaleString('en-US')}+`;
  }
  if (value >= 100) {
    const rounded = Math.floor(value / 100) * 100;
    return `${rounded}+`;
  }
  return `${value}+`;
}

export async function createReview(payload, meta = {}) {
  const uuid = randomUUID();
  const [result] = await mysqlPool.query(
    `INSERT INTO reviews
       (uuid, name, phone, email, course_name, rating, review_message, status, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
    [
      uuid,
      payload.name,
      payload.phone,
      payload.email || null,
      payload.courseName || null,
      payload.rating,
      payload.reviewMessage,
      meta.ipAddress || null,
      meta.userAgent || null,
    ]
  );

  const reviewId = result.insertId;
  await insertAuditEntry(mysqlPool, {
    reviewId,
    adminId: null,
    adminName: 'Public submission',
    action: 'submit',
    previousStatus: null,
    newStatus: 'PENDING',
  });

  return getReviewByIdAdmin(reviewId);
}
