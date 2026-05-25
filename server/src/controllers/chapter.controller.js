import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { logActivity } from '../services/activityLog.service.js';
import { getClientIp } from '../utils/network.js';
import {
  archiveChapter,
  createChapter,
  getChapterById,
  listChaptersBySubject,
  updateChapter,
} from '../services/chapter.service.js';

// =============================================================================
// Zod schemas
// =============================================================================

const DESCRIPTION_MAX_LENGTH = 8000;
const TITLE_MAX_LENGTH = 255;
const ORDER_INDEX_MAX = 1_000_000;

const positiveIntSchema = z
  .number({ invalid_type_error: 'must be a number' })
  .int('must be an integer')
  .positive('must be a positive integer');

const descriptionSchema = z
  .string()
  .max(DESCRIPTION_MAX_LENGTH)
  .optional()
  .nullable()
  .transform((v) => (v == null || String(v).trim() === '' ? null : String(v).trim()));

const titleSchema = z
  .string({ invalid_type_error: 'title must be a string' })
  .trim()
  .min(1, 'title must not be empty')
  .max(TITLE_MAX_LENGTH)
  .transform((v) => v.replace(/\s+/g, ' '));

function preprocessChapterCreateBody(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return raw;
  }
  const obj = { ...raw };
  if (obj.subject_id != null && obj.subjectId == null) obj.subjectId = obj.subject_id;
  if (obj.order_index != null && obj.orderIndex == null) obj.orderIndex = obj.order_index;
  if (obj.is_active != null && obj.isActive == null) obj.isActive = obj.is_active;
  delete obj.subject_id;
  delete obj.order_index;
  delete obj.is_active;
  return obj;
}

/** Update body: maps order_index only — subject reassignment is rejected before parse. */
function preprocessChapterUpdateBody(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return raw;
  }
  const obj = { ...raw };
  if (obj.order_index != null && obj.orderIndex == null) obj.orderIndex = obj.order_index;
  delete obj.order_index;
  return obj;
}

const chapterCreateBodySchema = z.preprocess(
  preprocessChapterCreateBody,
  z
    .object({
      subjectId: positiveIntSchema,
      title: titleSchema,
      description: descriptionSchema,
      orderIndex: z.number().int().min(0).max(ORDER_INDEX_MAX).optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
);

const chapterUpdateBodySchema = z.preprocess(
  preprocessChapterUpdateBody,
  z
    .object({
      title: titleSchema.optional(),
      description: descriptionSchema,
      orderIndex: z.number().int().min(0).max(ORDER_INDEX_MAX).optional(),
    })
    .strict()
);

const chapterListStatusSchema = z.enum(['active', 'archived', 'all']);

const chaptersQuerySchema = z
  .object({
    subjectId: z
      .string({ required_error: 'subjectId is required' })
      .trim()
      .min(1, 'subjectId is required')
      .regex(/^\d+$/, 'subjectId must be a positive integer')
      .transform((v) => Number(v))
      .pipe(positiveIntSchema),
    status: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(chapterListStatusSchema)
      .optional(),
  })
  .strict();

// =============================================================================
// Sanitizers & validation helpers
// =============================================================================

function invalidChapterId() {
  return new ApiError(400, 'Invalid chapter id', { code: 'INVALID_CHAPTER_ID' });
}

function assertObjectBody(body, message = 'Request body must be a JSON object') {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ApiError(422, message, { code: 'INVALID_BODY' });
  }
}

/** @param {import('express').Request} req */
function parseChapterIdParam(req) {
  const raw = req.params.id ?? req.params.chapterId;
  if (raw == null || String(raw).trim() === '') return null;
  const id = Number(String(raw).trim());
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) return null;
  return id;
}

/** @param {import('express').Request} req */
function parseChapterListQuery(req) {
  const parsed = chaptersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid or missing chapter list query parameters', parsed.error.flatten());
  }
  const status = parsed.data.status ?? 'active';
  return { subjectId: parsed.data.subjectId, status };
}

/** @param {import('express').Request} req @param {Record<string, unknown>} [extra] */
function buildAuditMetadata(req, extra = {}) {
  return {
    adminUserId: req.user?.id ?? null,
    ...extra,
    clientIp: getClientIp(req),
    userAgent: req.get('user-agent') || null,
  };
}

function scheduleChapterAudit(params) {
  void logActivity(params).catch(() => {
    /* logActivity swallows internally; guard against future throws */
  });
}

/** @param {z.infer<typeof chapterCreateBodySchema>} data */
function toCreateServicePayload(data) {
  return {
    subjectId: data.subjectId,
    title: data.title,
    description: data.description ?? null,
    orderIndex: data.orderIndex,
    isActive: data.isActive,
  };
}

/** @param {z.infer<typeof chapterUpdateBodySchema>} data */
function toUpdateServicePayload(data) {
  /** @type {Record<string, unknown>} */
  const payload = {};
  if (data.title !== undefined) payload.title = data.title;
  if (data.description !== undefined) payload.description = data.description;
  if (data.orderIndex !== undefined) payload.orderIndex = data.orderIndex;
  return payload;
}

function rejectInvalidBody(schemaResult, message = 'Invalid chapter payload') {
  if (!schemaResult.success) {
    throw new ApiError(422, message, schemaResult.error.flatten());
  }
}

function chapterReassignmentDisabledError() {
  return new ApiError(400, 'Chapter reassignment is disabled', { code: 'CHAPTER_REASSIGNMENT_DISABLED' });
}

/** @param {import('express').Request} req @param {number} chapterId */
function assertChapterReassignmentNotRequested(req, chapterId) {
  const body = req.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return;
  }
  const hasSubjectId = Object.prototype.hasOwnProperty.call(body, 'subjectId');
  const hasSubjectSnake = Object.prototype.hasOwnProperty.call(body, 'subject_id');
  if (!hasSubjectId && !hasSubjectSnake) {
    return;
  }

  const attemptedSubjectId = hasSubjectId ? body.subjectId : body.subject_id;

  scheduleChapterAudit({
    userId: req.user?.id ?? null,
    role: req.user?.role ?? 'admin',
    action: 'admin.chapter.reassignment_blocked',
    entityType: 'chapter',
    entityId: String(chapterId),
    metadata: buildAuditMetadata(req, {
      chapterId,
      attemptedSubjectId,
      requestId: req.requestId ?? null,
    }),
  });

  throw chapterReassignmentDisabledError();
}

// =============================================================================
// Controllers
// =============================================================================

export const getChapters = asyncHandler(async (req, res) => {
  const { subjectId, status } = parseChapterListQuery(req);
  const data = await listChaptersBySubject(subjectId, { status });
  sendSuccess(res, data);
});

export const getChapter = asyncHandler(async (req, res) => {
  const chapterId = parseChapterIdParam(req);
  if (!chapterId) throw invalidChapterId();

  const data = await getChapterById(chapterId);
  sendSuccess(res, data);
});

export const postChapter = asyncHandler(async (req, res) => {
  assertObjectBody(req.body);
  const parsed = chapterCreateBodySchema.safeParse(req.body);
  rejectInvalidBody(parsed);

  const created = await createChapter(toCreateServicePayload(parsed.data));

  scheduleChapterAudit({
    userId: req.user?.id ?? null,
    role: req.user?.role ?? 'admin',
    action: 'admin.chapter.create',
    entityType: 'chapter',
    entityId: String(created.id),
    metadata: buildAuditMetadata(req, {
      chapterId: created.id,
      subjectId: created.subjectId,
      courseId: created.courseId,
    }),
  });

  sendSuccess(res, created, 201);
});

export const putChapter = asyncHandler(async (req, res) => {
  const chapterId = parseChapterIdParam(req);
  if (!chapterId) throw invalidChapterId();

  assertObjectBody(req.body);
  assertChapterReassignmentNotRequested(req, chapterId);
  const parsed = chapterUpdateBodySchema.safeParse(req.body);
  rejectInvalidBody(parsed, 'Invalid chapter update payload');

  const patch = toUpdateServicePayload(parsed.data);
  if (Object.keys(patch).length === 0) {
    throw new ApiError(422, 'No fields to update', { code: 'EMPTY_UPDATE' });
  }

  const updated = await updateChapter(chapterId, patch);

  scheduleChapterAudit({
    userId: req.user?.id ?? null,
    role: req.user?.role ?? 'admin',
    action: 'admin.chapter.update',
    entityType: 'chapter',
    entityId: String(chapterId),
    metadata: buildAuditMetadata(req, {
      chapterId,
      subjectId: updated.subjectId,
      courseId: updated.courseId,
      fields: Object.keys(patch),
    }),
  });

  sendSuccess(res, updated);
});

export const deleteChapter = asyncHandler(async (req, res) => {
  const chapterId = parseChapterIdParam(req);
  if (!chapterId) throw invalidChapterId();

  const archived = await archiveChapter(chapterId);

  scheduleChapterAudit({
    userId: req.user?.id ?? null,
    role: req.user?.role ?? 'admin',
    action: 'admin.chapter.archive',
    entityType: 'chapter',
    entityId: String(chapterId),
    metadata: buildAuditMetadata(req, {
      chapterId,
      subjectId: archived.subjectId,
      courseId: archived.courseId,
    }),
  });

  sendSuccess(res, archived);
});
