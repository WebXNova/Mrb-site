import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { logActivity } from '../services/activityLog.service.js';
import {
  createSubject,
  deactivateSubject,
  getSubjectForCourse,
  listSubjectsForCourse,
  reorderSubjects,
  updateSubject,
} from '../services/subject.service.js';
import { subjectCreateBodySchema, subjectUpdateBodySchema } from '../validators/subjectWrite.schema.js';
import { subjectReorderBodySchema } from '../validators/subjectReorder.schema.js';

function invalidCourseId() {
  return new ApiError(400, 'Invalid course id', { code: 'INVALID_COURSE_ID' });
}

function invalidSubjectId() {
  return new ApiError(400, 'Invalid subject id', { code: 'INVALID_SUBJECT_ID' });
}

function parseCourseId(req) {
  const id = Number(req.params.courseId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function parseSubjectId(req) {
  const id = Number(req.params.subjectId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

export const getSubjects = asyncHandler(async (req, res) => {
  const courseId = parseCourseId(req);
  if (!courseId) throw invalidCourseId();
  const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
  const data = await listSubjectsForCourse(courseId, { includeInactive });
  sendSuccess(res, data);
});

export const postSubject = asyncHandler(async (req, res) => {
  const courseId = parseCourseId(req);
  if (!courseId) throw invalidCourseId();
  const parsed = subjectCreateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid subject payload', parsed.error.flatten());
  }
  const created = await createSubject(courseId, {
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    orderIndex: parsed.data.orderIndex,
  });
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.subject.create',
    entityType: 'subject',
    entityId: String(created.id),
    metadata: { courseId },
  });
  sendSuccess(res, created, 201);
});

export const getSubject = asyncHandler(async (req, res) => {
  const courseId = parseCourseId(req);
  const subjectId = parseSubjectId(req);
  if (!courseId) throw invalidCourseId();
  if (!subjectId) throw invalidSubjectId();
  const data = await getSubjectForCourse(courseId, subjectId);
  sendSuccess(res, data);
});

export const putSubject = asyncHandler(async (req, res) => {
  const courseId = parseCourseId(req);
  const subjectId = parseSubjectId(req);
  if (!courseId) throw invalidCourseId();
  if (!subjectId) throw invalidSubjectId();
  const parsed = subjectUpdateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid subject payload', parsed.error.flatten());
  }
  const patch = parsed.data;
  const mutatingKeys = Object.keys(patch).filter((k) => k !== 'expectedUpdatedAt');
  if (mutatingKeys.length === 0) {
    throw new ApiError(422, 'No fields to update', { code: 'EMPTY_UPDATE' });
  }
  const onlyOrderChanged = mutatingKeys.length === 1 && mutatingKeys[0] === 'orderIndex';
  const { dto, activated, deactivated } = await updateSubject(courseId, subjectId, patch);
  let action = 'admin.subject.update';
  if (onlyOrderChanged) action = 'admin.subject.reorder';
  else if (activated) action = 'admin.subject.activate';
  else if (deactivated) action = 'admin.subject.deactivate';
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action,
    entityType: 'subject',
    entityId: String(subjectId),
    metadata: { courseId },
  });
  sendSuccess(res, dto);
});

export const deleteSubject = asyncHandler(async (req, res) => {
  const courseId = parseCourseId(req);
  const subjectId = parseSubjectId(req);
  if (!courseId) throw invalidCourseId();
  if (!subjectId) throw invalidSubjectId();
  const updated = await deactivateSubject(courseId, subjectId);
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.subject.deactivate',
    entityType: 'subject',
    entityId: String(subjectId),
    metadata: { courseId },
  });
  sendSuccess(res, updated);
});

export const putSubjectsReorder = asyncHandler(async (req, res) => {
  const courseId = parseCourseId(req);
  if (!courseId) throw invalidCourseId();
  const parsed = subjectReorderBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid reorder payload', parsed.error.flatten());
  }
  const ordered = await reorderSubjects(courseId, parsed.data.orderedSubjectIds);
  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.subject.reorder_batch',
    entityType: 'course',
    entityId: String(courseId),
    metadata: { courseId, count: ordered.length },
  });
  sendSuccess(res, ordered);
});
