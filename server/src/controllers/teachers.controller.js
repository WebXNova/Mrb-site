import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { logActivity } from '../services/activityLog.service.js';
import { createTeacher, updateTeacherActivationStatus, getTeacherForAdmin, listTeachersForAdmin, updateTeacher } from '../services/teacher.service.js';
import { teacherCreateBodySchema } from '../validators/teacherCreate.schema.js';
import { teacherStatusBodySchema } from '../validators/teacherStatus.schema.js';
import { teacherUpdateBodySchema } from '../validators/teacherUpdate.schema.js';

export const postCreateTeacher = asyncHandler(async (req, res) => {
  const parsed = teacherCreateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid teacher creation payload', parsed.error.flatten());
  }

  const adminId = Number(req.user?.id);
  if (!adminId) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  const created = await createTeacher({
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    username: parsed.data.username,
    password: parsed.data.password,
    status: parsed.data.status,
    subjectIds: parsed.data.assignedSubjects,
    assignedBy: adminId,
  });

  await logActivity({
    userId: adminId,
    role: req.user?.role ?? 'admin',
    action: 'admin.teacher.create',
    entityType: 'user',
    entityId: String(created.id),
    metadata: {
      teacherId: created.id,
      teacherUsername: created.username,
      status: created.status,
      subjectCount: created.assignedSubjectIds.length,
      assignedSubjectIds: created.assignedSubjectIds,
    },
  });

  sendSuccess(res, created, 201);
});

function parseTeacherId(req) {
  const id = Number(req.params.teacherId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

export const patchTeacherStatus = asyncHandler(async (req, res) => {
  const teacherId = parseTeacherId(req);
  if (!teacherId) {
    throw new ApiError(400, 'Invalid teacher id', { code: 'INVALID_TEACHER_ID' });
  }

  const parsed = teacherStatusBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid teacher status payload', parsed.error.flatten());
  }

  const adminId = Number(req.user?.id);
  if (!adminId) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  const result = await updateTeacherActivationStatus(teacherId, {
    status: parsed.data.status,
    changedBy: adminId,
    reason: parsed.data.reason ?? null,
  });

  if (result.changed) {
    await logActivity({
      userId: adminId,
      role: req.user?.role ?? 'admin',
      action: 'admin.teacher.status.update',
      entityType: 'user',
      entityId: String(result.teacher.id),
      metadata: {
        teacherId: result.teacher.id,
        teacherUsername: result.teacher.username,
        previousStatus: result.previousStatus,
        newStatus: result.status,
        reason: result.reason,
      },
    });
  }

  sendSuccess(res, {
    ...result.teacher,
    previousStatus: result.previousStatus,
    changed: result.changed,
  });
});

export const getTeachers = asyncHandler(async (req, res) => {
  const teachers = await listTeachersForAdmin();
  sendSuccess(res, teachers);
});

export const getTeacher = asyncHandler(async (req, res) => {
  const teacherId = parseTeacherId(req);
  if (!teacherId) {
    throw new ApiError(400, 'Invalid teacher id', { code: 'INVALID_TEACHER_ID' });
  }
  const teacher = await getTeacherForAdmin(teacherId);
  sendSuccess(res, teacher);
});

export const putUpdateTeacher = asyncHandler(async (req, res) => {
  const teacherId = parseTeacherId(req);
  if (!teacherId) {
    throw new ApiError(400, 'Invalid teacher id', { code: 'INVALID_TEACHER_ID' });
  }

  const parsed = teacherUpdateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid teacher update payload', parsed.error.flatten());
  }

  const adminId = Number(req.user?.id);
  if (!adminId) {
    throw new ApiError(401, 'Authentication required', { code: 'AUTH_REQUIRED' });
  }

  const result = await updateTeacher(teacherId, {
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    username: parsed.data.username,
    status: parsed.data.status,
    subjectIds: parsed.data.assignedSubjects,
    password: parsed.data.password,
    updatedBy: adminId,
  });

  if (result.changed) {
    await logActivity({
      userId: adminId,
      role: req.user?.role ?? 'admin',
      action: 'admin.teacher.update',
      entityType: 'user',
      entityId: String(result.teacher.id),
      metadata: {
        teacherId: result.teacher.id,
        teacherUsername: result.teacher.username,
        changedFields: result.changedFields,
        previous: result.previous,
        next: result.next,
        passwordChanged: result.passwordChanged,
        subjectIdsAdded: result.subjectIdsAdded,
        subjectIdsRemoved: result.subjectIdsRemoved,
      },
    });
  }

  sendSuccess(res, {
    ...result.teacher,
    changed: result.changed,
    changedFields: result.changedFields,
    passwordChanged: result.passwordChanged,
  });
});
