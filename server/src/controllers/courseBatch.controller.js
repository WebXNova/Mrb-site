import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { logActivity } from '../services/activityLog.service.js';
import {
  archiveBatch,
  createBatch,
  getBatchById,
  listCourseBatches,
  listPublicCourseBatches,
  reactivateBatch,
  updateBatch,
} from '../services/courseBatch.service.js';
import { courseBatchCreateBodySchema, courseBatchUpdateBodySchema } from '../validators/courseBatch.schema.js';

function invalidCourseId() {
  return new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
}

function invalidBatchId() {
  return new ApiError(400, 'Invalid batch id', { code: 'INVALID_BATCH_ID' });
}

function parseCourseId(req) {
  const id = Number(req.params.courseId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function parseBatchId(req) {
  const id = Number(req.params.batchId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function isSuperAdmin(req) {
  return String(req.user?.role || '') === 'super_admin';
}

export const getAdminCourseBatches = asyncHandler(async (req, res) => {
  const courseId = parseCourseId(req);
  if (!courseId) throw invalidCourseId();
  const data = await listCourseBatches(courseId);
  sendSuccess(res, data);
});

export const postAdminCourseBatch = asyncHandler(async (req, res) => {
  const courseId = parseCourseId(req);
  if (!courseId) throw invalidCourseId();
  const parsed = courseBatchCreateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid batch payload', parsed.error.flatten());
  }
  const created = await createBatch(courseId, parsed.data, req.user?.id || null);
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.batch.create',
    entityType: 'course_batch',
    entityId: String(created.id),
    metadata: {
      batch_id: created.id,
      course_id: courseId,
      previous_status: null,
      next_status: created.status,
    },
  });
  sendSuccess(res, created, 201);
});

export const putAdminBatch = asyncHandler(async (req, res) => {
  const batchId = parseBatchId(req);
  if (!batchId) throw invalidBatchId();
  const parsed = courseBatchUpdateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid batch payload', parsed.error.flatten());
  }
  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    throw new ApiError(422, 'No fields to update', { code: 'EMPTY_UPDATE' });
  }
  const existing = await getBatchById(batchId);
  const updated = await updateBatch(batchId, patch, { isSuperAdmin: isSuperAdmin(req) });
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.batch.update',
    entityType: 'course_batch',
    entityId: String(batchId),
    metadata: {
      batch_id: batchId,
      course_id: existing.course_id,
      previous_status: existing.status,
      next_status: updated.status,
    },
  });
  sendSuccess(res, updated);
});

export const postAdminBatchArchive = asyncHandler(async (req, res) => {
  const batchId = parseBatchId(req);
  if (!batchId) throw invalidBatchId();
  const before = await getBatchById(batchId);
  const updated = await archiveBatch(batchId);
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.batch.archive',
    entityType: 'course_batch',
    entityId: String(batchId),
    metadata: {
      batch_id: batchId,
      course_id: before.course_id,
      previous_status: before.status,
      next_status: updated.status,
    },
  });
  sendSuccess(res, updated);
});

export const postAdminBatchReactivate = asyncHandler(async (req, res) => {
  const batchId = parseBatchId(req);
  if (!batchId) throw invalidBatchId();
  const before = await getBatchById(batchId);
  const updated = await reactivateBatch(batchId, { isSuperAdmin: isSuperAdmin(req) });
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.batch.reactivate',
    entityType: 'course_batch',
    entityId: String(batchId),
    metadata: {
      batch_id: batchId,
      course_id: before.course_id,
      previous_status: before.status,
      next_status: updated.status,
    },
  });
  sendSuccess(res, updated);
});

export const getPublicCourseBatches = asyncHandler(async (req, res) => {
  const courseId = Number(req.params.courseId);
  if (!Number.isFinite(courseId) || courseId <= 0) throw invalidCourseId();
  const data = await listPublicCourseBatches(courseId);
  sendSuccess(res, data);
});
