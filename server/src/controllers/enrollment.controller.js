import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { mysqlPool } from '../config/mysql.js';
import {
  assertBoardExists,
  assertCourseExists,
  assertOrderExists,
  getEnrollmentById,
  listEnrollments,
  normalizeEnrollmentStatus,
  summarizeEnrollments,
  updateEnrollmentStatus,
} from '../services/safepayEnrollment.service.js';
import {
  processCourseEnrollment,
  getEnrollmentState as resolveEnrollmentState,
} from '../services/courseEnrollment.service.js';
import { suspendStudentForEnrollment } from '../services/enrollmentAdminActions.service.js';
import { getCourseRowById } from '../services/courseCatalogQueries.service.js';
import { toEnrollmentStateResponse, parseCreateEnrollmentDto } from '../dtos/enrollment.dto.js';
import { normalizeAdmissionStatus, normalizeDateOnly, ADMISSION_STATUS } from '../models/course.model.js';
import { resolveEnrollmentLocationSelection } from '../services/location.service.js';
import { logActivity } from '../services/activityLog.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { resolveEnrollmentPrefillData } from '../services/enrollmentPrefill.service.js';

function emptyToUndefined(value) {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === '' ? undefined : value;
}

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

function mapEnrollmentBodyToDto(body, userEmail) {
  return {
    course_id: body.course_id ?? body.courseId,
    province_id: body.province_id ?? body.provinceId,
    district_id: body.district_id ?? body.districtId,
    city_id: body.city_id ?? body.cityId,
    board_id: body.board_id ?? body.boardId,
    applicantFullName: parseBodyField(body.applicantFullName),
    fatherName: parseBodyField(body.fatherName),
    dateOfBirth: parseBodyField(body.dateOfBirth) || null,
    gender: parseBodyField(body.gender),
    whatsappNumber: normalizePakistaniWhatsapp(parseBodyField(body.whatsappNumber)),
    email: userEmail,
    hsscStatus: parseBodyField(body.hsscStatus),
    mdcatAttemptType: parseBodyField(body.mdcatAttemptType),
    confirmSwitch:
      body.confirmSwitch === true ||
      body.confirmSwitch === 'true' ||
      body.confirm_switch === true ||
      body.confirm_switch === 'true' ||
      body.confirmSwitch === 1 ||
      body.confirmSwitch === '1',
  };
}

/**
 * POST /api/enrollments — create or continue enrollment for an OPEN course.
 * Returns 201 when a new row is created; 403 when admissions are CLOSED.
 */
export const createEnrollment = asyncHandler(async (req, res) => {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }

  const userEmail = String(req.user?.email || parseBodyField(req.body?.email) || '').trim();
  if (!userEmail) {
    throw new ApiError(401, 'Authenticated email is required');
  }

  const bodyEmail = parseBodyField(req.body?.email);
  if (bodyEmail && bodyEmail.toLowerCase() !== userEmail.toLowerCase()) {
    throw new ApiError(400, 'Email must match the signed-in student account');
  }

  let dto;
  try {
    dto = parseCreateEnrollmentDto(mapEnrollmentBodyToDto(req.body, userEmail));
  } catch (error) {
    if (error?.name === 'ZodError') {
      throw new ApiError(422, 'Invalid enrollment payload', error.flatten());
    }
    throw error;
  }

  const orderId = emptyToUndefined(req.body?.order_id ?? req.body?.orderId);

  const course = await assertCourseExists(dto.course_id);
  const location = await resolveEnrollmentLocationSelection({
    provinceId: dto.province_id,
    districtId: dto.district_id,
    cityId: dto.city_id,
  });
  const board = await assertBoardExists(dto.board_id);
  await assertOrderExists(orderId);

  const result = await processCourseEnrollment(
    {
      userId,
      courseId: dto.course_id,
      applicantFullName: dto.applicantFullName,
      fatherName: dto.fatherName,
      dateOfBirth: dto.dateOfBirth || null,
      gender: dto.gender,
      whatsappNumber: dto.whatsappNumber,
      email: userEmail,
      provinceId: location.province.id,
      districtId: location.district.id,
      cityId: location.city.id,
      boardId: board?.id ?? null,
      hsscStatus: dto.hsscStatus,
      mdcatAttemptType: dto.mdcatAttemptType,
    },
    { confirmSwitch: dto.confirmSwitch === true }
  );

  const { enrollment, created, accessGranted, paymentRequired, checkoutUrl, orderId: paymentOrderId, pricingCategory } =
    result;

  await logActivity({
    userId,
    role: req.user?.role,
    action: accessGranted ? 'student.enrollment.free.activate' : 'student.enrollment.create',
    entityType: 'enrollment',
    entityId: String(enrollment?.id || ''),
    metadata: {
      userId,
      courseId: course.id,
      pricingCategory,
      accessGranted,
      paymentRequired,
      province: location.province.name,
      district: location.district.name,
      city: location.city.name,
      board: board?.name || null,
    },
  });

  const message = accessGranted
    ? created
      ? 'Enrollment complete. You now have access to this course.'
      : 'You already have active access to this course.'
    : created
      ? 'Enrollment saved. Complete payment to unlock course access.'
      : 'You already have an enrollment for this course. Continue to payment.';

  sendSuccess(
    res,
    {
      message,
      enrollment,
      created,
      access_granted: accessGranted,
      payment_required: paymentRequired,
      pricing_category: pricingCategory,
      enrollment_source: enrollment?.enrollmentSource ?? null,
      checkout_url: checkoutUrl ?? null,
      order_id: paymentOrderId ?? enrollment?.orderId ?? null,
    },
    created ? 201 : 200
  );
});

/** @deprecated Use createEnrollment */
export const postEnrollment = createEnrollment;

async function enrichEnrollmentsWithAdmission(rows) {
  if (!rows.length) return [];
  const courseIds = [...new Set(rows.map((row) => Number(row.courseId)).filter((id) => id > 0))];
  if (!courseIds.length) return rows;

  const [courseRows] = await mysqlPool.query(
    `SELECT id, title, admission_status, start_date, end_date
     FROM courses
     WHERE id IN (?)`,
    [courseIds]
  );
  const courseById = new Map(courseRows.map((row) => [Number(row.id), row]));

  return rows.map((row) => {
    const course = courseById.get(Number(row.courseId));
    const admissionStatus = normalizeAdmissionStatus(course?.admission_status);
    return {
      id: row.id,
      courseId: row.courseId,
      courseTitle: row.courseTitle ?? course?.title ?? null,
      status: row.status,
      accessStatus: row.accessStatus,
      enrollmentSource: row.enrollmentSource ?? null,
      orderId: row.orderId,
      orderStatus: row.orderStatus,
      admission_status: admissionStatus,
      start_date: normalizeDateOnly(course?.start_date),
      end_date: normalizeDateOnly(course?.end_date),
      is_enrollment_open: admissionStatus === ADMISSION_STATUS.OPEN,
    };
  });
}

/** GET /api/enrollments/prefill-data — suggested registration field values from prior enrollment. */
export const getEnrollmentPrefillData = asyncHandler(async (req, res) => {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Login required');
  }

  const targetCourseId = Number(
    req.query.targetCourseId ?? req.query.target_course_id ?? req.query.courseId ?? req.query.course_id
  );
  if (!Number.isInteger(targetCourseId) || targetCourseId <= 0) {
    throw new ApiError(400, 'targetCourseId is required');
  }

  const sourceEnrollmentIdRaw =
    req.query.sourceEnrollmentId ?? req.query.source_enrollment_id ?? null;
  const sourceEnrollmentId =
    sourceEnrollmentIdRaw != null && String(sourceEnrollmentIdRaw).trim() !== ''
      ? Number(sourceEnrollmentIdRaw)
      : null;
  if (
    sourceEnrollmentIdRaw != null &&
    String(sourceEnrollmentIdRaw).trim() !== '' &&
    (!Number.isInteger(sourceEnrollmentId) || sourceEnrollmentId <= 0)
  ) {
    throw new ApiError(400, 'Invalid sourceEnrollmentId');
  }

  const result = await resolveEnrollmentPrefillData({
    userId,
    targetCourseId,
    sourceEnrollmentId,
    actorRole: req.user?.role ?? 'student',
  });

  sendSuccess(res, {
    fields: result.fields,
    sourceCourseId: result.sourceCourseId,
    sourceCourseName: result.sourceCourseName,
    sourceEnrollmentId: result.sourceEnrollmentId,
    prefilledFieldNames: result.prefilledFieldNames,
    discardedFields: result.discardedFields,
    availableSources: result.availableSources,
    hasPrefill: result.hasPrefill,
  });
});

/** GET /api/enrollments/me — student enrollments with course admission context. */
export const getUserEnrollments = asyncHandler(async (req, res) => {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Login required');
  }

  const rows = await listEnrollments({ userId });
  sendSuccess(res, {
    enrollments: await enrichEnrollmentsWithAdmission(rows),
  });
});

/** @deprecated Use getUserEnrollments */
export const getMyEnrollments = getUserEnrollments;

/** GET /api/enrollments/state/:courseId — CTA state (existing students keep access when CLOSED). */
export const getEnrollmentState = asyncHandler(async (req, res) => {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Login required');
  }

  const courseId = Number(req.params.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    throw new ApiError(400, 'Invalid course id');
  }

  const state = await resolveEnrollmentState(userId, courseId);
  const courseRow = await getCourseRowById(courseId);
  sendSuccess(
    res,
    toEnrollmentStateResponse(state, {
      courseId,
      courseName: courseRow?.title ?? null,
      admission_status: courseRow?.admission_status ?? null,
      start_date: courseRow?.start_date ?? null,
      end_date: courseRow?.end_date ?? null,
    })
  );
});

function parseAdminEnrollmentQuery(req) {
  const slice = (v) => {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s === '' ? undefined : s;
  };
  return {
    status: slice(req.query.status) ?? 'all',
    province: slice(req.query.province) ?? 'all',
    province_id: slice(req.query.province_id) ?? slice(req.query.provinceId),
    district_id: slice(req.query.district_id) ?? slice(req.query.districtId),
    city_id: slice(req.query.city_id) ?? slice(req.query.cityId),
    board_id: slice(req.query.board_id) ?? slice(req.query.boardId),
    course_id: slice(req.query.course_id) ?? slice(req.query.courseId),
    subject_id: slice(req.query.subject_id) ?? slice(req.query.subjectId),
    chapter_id: slice(req.query.chapter_id) ?? slice(req.query.chapterId),
    user_id: slice(req.query.user_id) ?? slice(req.query.userId),
    gender: (slice(req.query.gender)?.toLowerCase() ?? 'all') || 'all',
    payment: (slice(req.query.payment)?.toLowerCase() ?? 'all') || 'all',
    dateFrom: slice(req.query.dateFrom),
    dateTo: slice(req.query.dateTo),
    search: slice(req.query.search),
  };
}

export const getAdminEnrollments = asyncHandler(async (req, res) => {
  const data = await listEnrollments(parseAdminEnrollmentQuery(req));
  sendSuccess(res, data);
});

export const getAdminEnrollmentsSummary = asyncHandler(async (_req, res) => {
  const summary = await summarizeEnrollments();
  sendSuccess(res, summary);
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

const suspendStudentSchema = z.object({
  adminNote: z.string().trim().min(3).max(500),
});

export const postAdminEnrollmentSuspendStudent = asyncHandler(async (req, res) => {
  const enrollmentId = Number(req.params.enrollmentId);
  if (!enrollmentId) throw new ApiError(400, 'Invalid enrollment id');

  const parsed = suspendStudentSchema.safeParse({
    adminNote: parseBodyField(req.body?.adminNote) || '',
  });
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid suspend payload', parsed.error.flatten());
  }

  await suspendStudentForEnrollment({
    enrollmentId,
    adminNote: parsed.data.adminNote,
    actor: { id: req.user?.id, role: req.user?.role },
  });

  const updated = await getEnrollmentById(enrollmentId);
  sendSuccess(res, updated);
});
