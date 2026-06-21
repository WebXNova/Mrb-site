import { z } from 'zod';
import { mysqlPool } from '../config/mysql.js';
import { ApiError } from '../utils/apiError.js';
import { getEnrollmentById } from './safepayEnrollment.service.js';
import {
  getTargetFormFields,
  mapEnrollmentFieldsToTargetForm,
} from './enrollmentFieldMapping.service.js';
import { logActivity } from './activityLog.service.js';

const pakistaniWhatsappSchema = z
  .string()
  .regex(/^\+923[0-9]{9}$/, 'Invalid WhatsApp number');

/** Per-field validators aligned with CreateEnrollmentDto (form-friendly string ids). */
const FIELD_VALIDATORS = {
  email: z.string().email(),
  applicantFullName: z.string().min(2).max(160),
  fatherName: z.string().min(2).max(160),
  dateOfBirth: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')])
    .optional(),
  gender: z.enum(['male', 'female']),
  whatsappNumber: pakistaniWhatsappSchema,
  province_id: z.coerce.number().int().positive(),
  district_id: z.coerce.number().int().positive(),
  city_id: z.coerce.number().int().positive(),
  board_id: z.coerce.number().int().positive(),
  hsscStatus: z.enum(['Inter Class', 'First Year Class', 'Matric Class']),
  mdcatAttemptType: z.enum(['Fresher', 'Improver']),
};

/** Fields never copied during prefill (payment / admin metadata). */
const NEVER_PREFILL = new Set([
  'orderId',
  'orderStatus',
  'orderGateway',
  'orderGatewayRef',
  'orderAmount',
  'orderCurrency',
  'orderPaidAt',
  'adminNote',
  'reviewedBy',
  'reviewedAt',
]);

/**
 * Flatten enrollment row (camelCase from toEnrollment) into mappable source fields.
 * @param {Record<string, unknown>|null|undefined} enrollment
 */
export function enrollmentToSourceFields(enrollment) {
  if (!enrollment) return {};

  const out = {
    email: enrollment.email ?? enrollment.userEmail ?? null,
    applicantFullName: enrollment.applicantFullName ?? enrollment.userFullName ?? null,
    fatherName: enrollment.fatherName ?? null,
    dateOfBirth: enrollment.dateOfBirth ?? null,
    gender: enrollment.gender ?? null,
    whatsappNumber: enrollment.whatsappNumber ?? null,
    provinceId: enrollment.provinceId ?? null,
    districtId: enrollment.districtId ?? null,
    cityId: enrollment.cityId ?? null,
    boardId: enrollment.boardId ?? null,
    hsscStatus: enrollment.hsscStatus ?? null,
    mdcatAttemptType: enrollment.mdcatAttemptType ?? null,
  };

  for (const key of NEVER_PREFILL) {
    delete out[key];
  }

  return out;
}

/**
 * @param {string} field
 * @param {unknown} value
 */
function validatePrefillField(field, value) {
  const schema = FIELD_VALIDATORS[field];
  if (!schema) return { ok: true, value };
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.errors[0]?.message || 'Validation failed' };
  }
  return { ok: true, value: parsed.data };
}

/**
 * Normalize validated values for the client form (ids as strings).
 * @param {Record<string, unknown>} fields
 */
export function normalizeFieldsForForm(fields) {
  const idFields = ['province_id', 'district_id', 'city_id', 'board_id'];
  const out = { ...fields };
  for (const key of idFields) {
    if (out[key] !== undefined && out[key] !== null && out[key] !== '') {
      out[key] = String(out[key]);
    }
  }
  if (out.dateOfBirth === null || out.dateOfBirth === undefined) {
    out.dateOfBirth = '';
  }
  return out;
}

/**
 * @param {Record<string, unknown>} mapped
 */
function validateAndFilterMappedFields(mapped) {
  const fields = {};
  const discardedFields = [];

  for (const [field, rawValue] of Object.entries(mapped)) {
    const result = validatePrefillField(field, rawValue);
    if (!result.ok) {
      discardedFields.push({ field, reason: result.reason || 'validation_failed' });
      continue;
    }
    fields[field] = result.value;
  }

  return { fields: normalizeFieldsForForm(fields), discardedFields };
}

/**
 * List enrollments eligible as prefill sources (active or completed profile data).
 * @param {number} userId
 * @param {number} targetCourseId
 */
export async function listPrefillSourceEnrollments(userId, targetCourseId) {
  const [rows] = await mysqlPool.query(
    `SELECT
       e.id,
       e.course_id,
       e.access_status,
       e.status,
       e.applicant_full_name,
       e.created_at,
       e.updated_at,
       c.title AS course_title
     FROM enrollments e
     INNER JOIN courses c ON c.id = e.course_id
     WHERE e.user_id = ?
       AND e.course_id <> ?
       AND (
         e.access_status = 'active'
         OR e.status IN ('approved', 'pending')
       )
     ORDER BY
       CASE WHEN e.access_status = 'active' THEN 0 ELSE 1 END,
       e.updated_at DESC,
       e.id DESC`,
    [userId, targetCourseId]
  );

  return rows.map((row) => ({
    enrollmentId: row.id,
    courseId: row.course_id,
    courseName: row.course_title || `Course #${row.course_id}`,
    accessStatus: row.access_status,
    status: row.status,
    applicantFullName: row.applicant_full_name,
    submittedAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.access_status === 'active',
  }));
}

/**
 * @param {number} userId
 */
async function loadUserProfileFallback(userId) {
  const [rows] = await mysqlPool.query(
    `SELECT email, full_name FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return {};
  return {
    email: row.email || null,
    applicantFullName: row.full_name || null,
  };
}

/**
 * Resolve prefill data for a target course registration form.
 *
 * @param {{
 *   userId: number,
 *   targetCourseId: number,
 *   sourceEnrollmentId?: number|null,
 *   actorRole?: string|null,
 * }} params
 */
export async function resolveEnrollmentPrefillData({
  userId,
  targetCourseId,
  sourceEnrollmentId = null,
  actorRole = 'student',
}) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  if (!Number.isInteger(targetCourseId) || targetCourseId <= 0) {
    throw new ApiError(400, 'Invalid target course id');
  }

  const availableSources = await listPrefillSourceEnrollments(userId, targetCourseId);

  let sourceEnrollment = null;
  if (sourceEnrollmentId) {
    sourceEnrollment = await getEnrollmentById(sourceEnrollmentId);
    if (!sourceEnrollment || Number(sourceEnrollment.userId) !== userId) {
      throw new ApiError(404, 'Source enrollment not found');
    }
    if (Number(sourceEnrollment.courseId) === targetCourseId) {
      throw new ApiError(400, 'Source enrollment must be from a different course');
    }
  } else if (availableSources.length > 0) {
    sourceEnrollment = await getEnrollmentById(availableSources[0].enrollmentId);
  }

  const sourceCourseId = sourceEnrollment?.courseId ?? null;
  const sourceCourseName = sourceEnrollment?.courseTitle ?? null;
  let sourceFields = enrollmentToSourceFields(sourceEnrollment);

  // Secondary fallback: user account profile (email, name)
  const profileFallback = await loadUserProfileFallback(userId);
  for (const [key, value] of Object.entries(profileFallback)) {
    if (value && (sourceFields[key] == null || String(sourceFields[key]).trim() === '')) {
      sourceFields[key] = value;
    }
  }

  const { mapped, omitted } = await mapEnrollmentFieldsToTargetForm(sourceFields, {
    sourceCourseId,
    targetCourseId,
    logger: (msg, meta) => {
      console.info(`[enrollmentPrefill] ${msg}`, meta || {});
    },
  });

  const { fields, discardedFields } = validateAndFilterMappedFields(mapped);

  const prefillFieldNames = Object.keys(fields);
  const hasPrefill = prefillFieldNames.length > 0;

  if (hasPrefill || sourceEnrollment) {
    await logActivity({
      userId,
      role: actorRole,
      action: 'student.enrollment.prefill',
      entityType: 'enrollment',
      entityId: sourceEnrollment?.id ? String(sourceEnrollment.id) : null,
      metadata: {
        targetCourseId,
        sourceCourseId,
        sourceEnrollmentId: sourceEnrollment?.id ?? null,
        fieldCount: prefillFieldNames.length,
        prefilledFields: prefillFieldNames,
        omittedSourceFields: omitted,
        discardedFields,
        availableSourceCount: availableSources.length,
      },
    });
  }

  return {
    fields,
    sourceCourseId: sourceCourseId != null ? String(sourceCourseId) : null,
    sourceCourseName,
    sourceEnrollmentId: sourceEnrollment?.id ?? null,
    prefilledFieldNames,
    discardedFields,
    omittedSourceFields: omitted,
    availableSources,
    hasPrefill,
    targetFormFields: getTargetFormFields(),
  };
}
