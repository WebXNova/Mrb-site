import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {
  createEnrollment,
  getEnrollmentById,
  getEnrollmentTrackingByToken,
  hasDuplicatePendingEnrollment,
  listEnrollments,
  updateEnrollmentStatus,
} from '../services/enrollment.service.js';
import { logActivity } from '../services/activityLog.service.js';
import { ENROLLMENT_BATCH_IDS } from '../constants/enrollmentBatches.js';

const BATCH_NUMBER_ENUM = /** @type {readonly [string, ...string[]]} */ (ENROLLMENT_BATCH_IDS);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../../uploads/enrollments');
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const maxReceiptSizeBytes = 8 * 1024 * 1024;

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext || (file.mimetype === 'application/pdf' ? '.pdf' : '.jpg');
    const name = `enrollment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: maxReceiptSizeBytes },
  fileFilter(_req, file, cb) {
    if (!allowedMimeTypes.has(file.mimetype)) {
      cb(new Error('Only JPG, PNG, WEBP images and PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
});

const createEnrollmentSchema = z.object({
  email: z.string().email(),
  applicantFullName: z.string().min(2).max(160),
  fatherName: z.string().min(2).max(160),
  dateOfBirth: z.string().optional().nullable(),
  gender: z.enum(['male', 'female']),
  whatsappNumber: z
    .string()
    .regex(/^\+923[0-9]{9}$/, 'Enter a valid Pakistan WhatsApp number'),
  province: z.string().min(2).max(80),
  district: z.string().min(2).max(120),
  hsscStatus: z.enum(['Inter Class', 'First Year Class', 'Matric Class']),
  board: z.string().min(2).max(120),
  mdcatAttemptType: z.enum(['Fresher', 'Improver']),
  batchNumber: z.enum(BATCH_NUMBER_ENUM),
  transactionId: z.string().min(3).max(120),
});

function parseBodyField(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

/** Strip non-digits and match client normalization so pasted/formatted WhatsApp accepts. */
function normalizePakistaniWhatsapp(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('92')) return `+${digits}`;
  if (digits.startsWith('0')) return `+92${digits.slice(1)}`;
  if (digits.startsWith('3')) return `+92${digits}`;
  return `+${digits}`;
}

function enrollmentReceiptUrl(fileName) {
  return `/api/uploads/enrollments/${fileName}`;
}

function handleReceiptUpload(req, res, next) {
  upload.single('receipt')(req, res, (err) => {
    if (err && err.name === 'MulterError') {
      next(new ApiError(400, err.code === 'LIMIT_FILE_SIZE' ? 'Receipt must be 8 MB or smaller.' : err.message));
      return;
    }
    if (err) {
      next(err instanceof ApiError ? err : new ApiError(400, err.message || 'Receipt upload failed'));
      return;
    }
    next();
  });
}

const trackingTokenRegex = /^[a-zA-Z0-9_-]{16,64}$/;

function stripEnrollmentSensitive(enrollment) {
  if (!enrollment) return enrollment;
  const { verificationToken, ...rest } = enrollment;
  return rest;
}

export const getEnrollmentTracking = asyncHandler(async (req, res) => {
  const token = req.params.token;
  if (!token || !trackingTokenRegex.test(token)) {
    throw new ApiError(404, 'Invalid tracking link.');
  }
  const data = await getEnrollmentTrackingByToken(token);
  if (!data) throw new ApiError(404, 'We could not find this registration. Please check your link or contact MRB Classes.');

  res.json({
    success: true,
    data,
  });
});

export const postEnrollment = [
  handleReceiptUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'Please upload your fee receipt');

    const parsed = createEnrollmentSchema.safeParse({
      email: parseBodyField(req.body.email),
      applicantFullName: parseBodyField(req.body.applicantFullName),
      fatherName: parseBodyField(req.body.fatherName),
      dateOfBirth: parseBodyField(req.body.dateOfBirth) || null,
      gender: parseBodyField(req.body.gender),
      whatsappNumber: normalizePakistaniWhatsapp(parseBodyField(req.body.whatsappNumber)),
      province: parseBodyField(req.body.province),
      district: parseBodyField(req.body.district),
      hsscStatus: parseBodyField(req.body.hsscStatus),
      board: parseBodyField(req.body.board),
      mdcatAttemptType: parseBodyField(req.body.mdcatAttemptType),
      batchNumber: parseBodyField(req.body.batchNumber),
      transactionId: parseBodyField(req.body.transactionId),
    });
    if (!parsed.success) throw new ApiError(422, 'Invalid enrollment payload', parsed.error.flatten());

    const duplicatePending = await hasDuplicatePendingEnrollment({
      email: parsed.data.email,
      whatsappNumber: parsed.data.whatsappNumber,
    });
    if (duplicatePending) {
      throw new ApiError(
        409,
        'You already have a pending registration. Please wait for admin review or contact support.'
      );
    }

    let enrollment;
    try {
      enrollment = await createEnrollment({
        ...parsed.data,
        receiptUrl: enrollmentReceiptUrl(req.file.filename),
        receiptOriginalName: req.file.originalname,
        receiptMimeType: req.file.mimetype,
        receiptSizeBytes: req.file.size,
        paymentMethod: 'EasyPaisa and JazzCash',
        accountTitle: 'Muzamil Raheem',
      });
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        throw new ApiError(409, 'This transaction ID is already submitted. Please double-check your receipt.');
      }
      throw error;
    }

    await logActivity({
      role: 'system',
      action: 'student.enrollment.create',
      entityType: 'enrollment',
      entityId: String(enrollment?.id || ''),
      metadata: {
        email: parsed.data.email,
        province: parsed.data.province,
        board: parsed.data.board,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Registration submitted successfully. Your request is pending verification.',
      data: enrollment,
    });
  }),
];

function parseAdminEnrollmentQuery(req) {
  const slice = (v) => {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s === '' ? undefined : s;
  };
  return {
    batch: slice(req.query.batch) ?? 'all',
    province: slice(req.query.province) ?? 'all',
    gender: (slice(req.query.gender)?.toLowerCase() ?? 'all') || 'all',
    dateFrom: slice(req.query.dateFrom),
    dateTo: slice(req.query.dateTo),
    search: slice(req.query.search),
  };
}

export const getAdminEnrollments = asyncHandler(async (req, res) => {
  const data = await listEnrollments(parseAdminEnrollmentQuery(req));
  res.json({ success: true, data: data.map(stripEnrollmentSensitive) });
});

const updateEnrollmentStatusSchema = z.object({
  status: z.enum(['pending', 'verified', 'rejected']),
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
    status: parsed.data.status,
    adminNote: parsed.data.adminNote,
    reviewedBy: req.user?.id || null,
  });

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.enrollment.status.update',
    entityType: 'enrollment',
    entityId: String(enrollmentId),
    metadata: { status: parsed.data.status },
  });

  res.json({ success: true, data: stripEnrollmentSensitive(updated) });
});
