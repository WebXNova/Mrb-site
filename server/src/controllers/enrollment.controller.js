import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {
  assertBoardExists,
  assertCourseExists,
  assertOrderExists,
  createEnrollment,
  getEnrollmentById,
  hasDuplicatePendingEnrollment,
  listEnrollments,
  normalizeEnrollmentStatus,
  updateEnrollmentStatus,
} from '../services/safepayEnrollment.service.js';
import { resolveEnrollmentLocationSelection } from '../services/location.service.js';
import { logActivity } from '../services/activityLog.service.js';
import { ENROLLMENT_BATCH_IDS } from '../constants/enrollmentBatches.js';
import { sendSuccess } from '../utils/httpEnvelope.js';

const BATCH_NUMBER_ENUM = /** @type {readonly [string, ...string[]]} */ (ENROLLMENT_BATCH_IDS);

function emptyToUndefined(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === '' ? undefined : value;
}

const createEnrollmentSchema = z.object({
  courseId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive()),
  provinceId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive()),
  divisionId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive()),
  districtId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive()),
  cityId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive()),
  boardId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional().nullable()),
  orderId: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional().nullable()),
  applicantFullName: z.string().min(2).max(160),
  fatherName: z.string().min(2).max(160),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.enum(['male', 'female']),
  whatsappNumber: z
    .string()
    .regex(/^\+923[0-9]{9}$/, 'Enter a valid Pakistan WhatsApp number'),
  email: z.string().email().optional().nullable(),
  hsscStatus: z.enum(['Inter Class', 'First Year Class', 'Matric Class']),
  mdcatAttemptType: z.enum(['Fresher', 'Improver']),
  batchNumber: z.preprocess(emptyToUndefined, z.enum(BATCH_NUMBER_ENUM).optional().nullable()),
});

function parseBodyField(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function normalizePakistaniWhatsapp(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('92')) return `+${digits}`;
  if (digits.startsWith('0')) return `+92${digits.slice(1)}`;
  if (digits.startsWith('3')) return `+92${digits}`;
  return `+${digits}`;
}

export const postEnrollment = asyncHandler(async (req, res) => {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }

  const parsed = createEnrollmentSchema.safeParse({
    courseId: req.body.course_id ?? req.body.courseId,
    provinceId: req.body.province_id ?? req.body.provinceId,
    divisionId: req.body.division_id ?? req.body.divisionId,
    districtId: req.body.district_id ?? req.body.districtId,
    cityId: req.body.city_id ?? req.body.cityId,
    boardId: req.body.board_id ?? req.body.boardId,
    orderId: req.body.order_id ?? req.body.orderId,
    applicantFullName: parseBodyField(req.body.applicantFullName),
    fatherName: parseBodyField(req.body.fatherName),
    dateOfBirth: parseBodyField(req.body.dateOfBirth) || null,
    gender: parseBodyField(req.body.gender),
    whatsappNumber: normalizePakistaniWhatsapp(parseBodyField(req.body.whatsappNumber)),
    email: req.user?.email || parseBodyField(req.body.email),
    hsscStatus: parseBodyField(req.body.hsscStatus),
    mdcatAttemptType: parseBodyField(req.body.mdcatAttemptType),
    batchNumber: parseBodyField(req.body.batchNumber),
  });
  if (!parsed.success) throw new ApiError(422, 'Invalid enrollment payload', parsed.error.flatten());

  const userEmail = String(req.user?.email || parsed.data.email || '').trim();
  if (!userEmail) {
    throw new ApiError(401, 'Authenticated email is required');
  }

  if (parsed.data.email && String(parsed.data.email).toLowerCase() !== userEmail.toLowerCase()) {
    throw new ApiError(400, 'Email must match the signed-in student account');
  }

  const course = await assertCourseExists(parsed.data.courseId);
  const location = await resolveEnrollmentLocationSelection({
    provinceId: parsed.data.provinceId,
    divisionId: parsed.data.divisionId,
    districtId: parsed.data.districtId,
    cityId: parsed.data.cityId,
  });
  const board = await assertBoardExists(parsed.data.boardId);
  await assertOrderExists(parsed.data.orderId);

  const duplicatePending = await hasDuplicatePendingEnrollment({
    userId,
    courseId: parsed.data.courseId,
  });
  if (duplicatePending) {
    throw new ApiError(409, 'You already have a pending enrollment for this course.');
  }

  const enrollment = await createEnrollment({
    userId,
    courseId: parsed.data.courseId,
    orderId: null,
    applicantFullName: parsed.data.applicantFullName,
    fatherName: parsed.data.fatherName,
    dateOfBirth: parsed.data.dateOfBirth || null,
    gender: parsed.data.gender,
    whatsappNumber: parsed.data.whatsappNumber,
    email: userEmail,
    provinceId: location.province.id,
    divisionId: location.division.id,
    districtId: location.district.id,
    cityId: location.city.id,
    boardId: board?.id ?? null,
    hsscStatus: parsed.data.hsscStatus,
    mdcatAttemptType: parsed.data.mdcatAttemptType,
    batchNumber: parsed.data.batchNumber ?? null,
  });

  await logActivity({
    userId,
    role: req.user?.role,
    action: 'student.enrollment.create',
    entityType: 'enrollment',
    entityId: String(enrollment?.id || ''),
    metadata: {
      userId,
      courseId: course.id,
      province: location.province.name,
      division: location.division.name,
      district: location.district.name,
      city: location.city.name,
      board: board?.name || null,
    },
  });

  sendSuccess(
    res,
    {
      message: 'Enrollment saved successfully. Payment confirmation will be linked later via Safepay.',
      enrollment,
    },
    201
  );
});

function parseAdminEnrollmentQuery(req) {
  const slice = (v) => {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s === '' ? undefined : s;
  };
  return {
    batch: slice(req.query.batch) ?? 'all',
    status: slice(req.query.status) ?? 'all',
    province: slice(req.query.province) ?? 'all',
    province_id: slice(req.query.province_id) ?? slice(req.query.provinceId),
    division_id: slice(req.query.division_id) ?? slice(req.query.divisionId),
    district_id: slice(req.query.district_id) ?? slice(req.query.districtId),
    city_id: slice(req.query.city_id) ?? slice(req.query.cityId),
    board_id: slice(req.query.board_id) ?? slice(req.query.boardId),
    course_id: slice(req.query.course_id) ?? slice(req.query.courseId),
    user_id: slice(req.query.user_id) ?? slice(req.query.userId),
    gender: (slice(req.query.gender)?.toLowerCase() ?? 'all') || 'all',
    dateFrom: slice(req.query.dateFrom),
    dateTo: slice(req.query.dateTo),
    search: slice(req.query.search),
  };
}

export const getAdminEnrollments = asyncHandler(async (req, res) => {
  const data = await listEnrollments(parseAdminEnrollmentQuery(req));
  sendSuccess(res, data);
});

const updateEnrollmentStatusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'verified']),
  adminNote: z.string().max(500).optional().nullable(),
});

export const putAdminEnrollmentStatus = asyncHandler(async (req, res) => {
  const enrollmentId = Number(req.params.enrollmentId);
  if (!enrollmentId) throw new ApiError(400, 'Invalid enrollment id');

  const parsed = updateEnrollmentStatusSchema.safeParse({
    status: req.body?.status,
    adminNote: parseBodyField(req.body?.adminNote) || null,
  });
  if (!parsed.success) throw new ApiError(422, 'Invalid status payload', parsed.error.flatten());

  const existing = await getEnrollmentById(enrollmentId);
  if (!existing) throw new ApiError(404, 'Enrollment not found');

  const updated = await updateEnrollmentStatus({
    enrollmentId,
    status: normalizeEnrollmentStatus(parsed.data.status),
    adminNote: parsed.data.adminNote,
    reviewedBy: req.user?.id || null,
  });

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.enrollment.status.update',
    entityType: 'enrollment',
    entityId: String(enrollmentId),
    metadata: { status: normalizeEnrollmentStatus(parsed.data.status) },
  });

  sendSuccess(res, updated);
});
