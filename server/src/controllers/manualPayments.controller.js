import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import { normalizeUploadExtension } from '../utils/secureRasterImageValidation.js';
import {
  getManualCheckoutInfo,
  getManualPaymentScreenshotForStudent,
  getManualPaymentStatus,
  submitManualPayment,
  validateManualPaymentCoupon,
} from '../services/manualPayments.service.js';
import {
  MANUAL_PAYMENT_UPLOAD_DIR,
  MANUAL_PAYMENT_UPLOAD_MAX_BYTES,
  ensureManualPaymentUploadDir,
  finalizeManualPaymentScreenshot,
  generateManualPaymentTempFilename,
  safeUnlink,
} from '../services/manualPaymentScreenshotUpload.service.js';

function parseStudentId(req) {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  return userId;
}

function parseOrderId(req) {
  const raw = req.params.orderId ?? req.query.order_id ?? req.query.orderId;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid order id');
  }
  return id;
}

const ALLOWED_MIME = /^image\/(jpe?g|png)$/i;

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(MANUAL_PAYMENT_UPLOAD_DIR, { recursive: true });
    cb(null, MANUAL_PAYMENT_UPLOAD_DIR);
  },
  filename(_req, _file, cb) {
    cb(null, generateManualPaymentTempFilename());
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MANUAL_PAYMENT_UPLOAD_MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    const extResult = normalizeUploadExtension(file.originalname || '');
    if (!extResult.ok || !['.jpg', '.jpeg', '.png'].includes(extResult.ext)) {
      cb(new Error('Screenshot must be a JPG or PNG image.'));
      return;
    }
    if (!ALLOWED_MIME.test(String(file.mimetype || ''))) {
      cb(new Error('Screenshot must be a JPG or PNG image.'));
      return;
    }
    cb(null, true);
  },
});

function handleScreenshotUpload(req, res, next) {
  upload.single('screenshot')(req, res, (err) => {
    if (err && err.name === 'MulterError') {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Screenshot must be 5 MB or smaller.'
          : err.code === 'LIMIT_FILE_COUNT'
            ? 'Only one screenshot may be uploaded.'
            : err.message;
      next(new ApiError(400, message, { code: 'UPLOAD_REJECTED' }));
      return;
    }
    if (err) {
      next(err instanceof ApiError ? err : new UploadRejectedError(err.message || 'Upload failed'));
      return;
    }
    next();
  });
}

export const getManualCheckoutInfoHandler = asyncHandler(async (req, res) => {
  const data = await getManualCheckoutInfo({
    studentId: parseStudentId(req),
    orderId: parseOrderId(req),
  });
  sendSuccess(res, data);
});

export const postValidateManualPaymentCouponHandler = asyncHandler(async (req, res) => {
  const data = await validateManualPaymentCoupon({
    studentId: parseStudentId(req),
    body: req.body || {},
  });
  sendSuccess(res, data);
});

export const getManualPaymentStatusHandler = asyncHandler(async (req, res) => {
  const data = await getManualPaymentStatus({
    studentId: parseStudentId(req),
    orderId: parseOrderId(req),
  });
  sendSuccess(res, data);
});

export const getManualPaymentScreenshotHandler = asyncHandler(async (req, res) => {
  const file = await getManualPaymentScreenshotForStudent({
    studentId: parseStudentId(req),
    orderId: parseOrderId(req),
  });
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(file.filename, {
    root: MANUAL_PAYMENT_UPLOAD_DIR,
    dotfiles: 'deny',
    headers: {
      'Content-Disposition': `inline; filename="${path.basename(file.filename)}"`,
    },
  });
});

export const postManualPaymentSubmit = [
  handleScreenshotUpload,
  asyncHandler(async (req, res) => {
    await ensureManualPaymentUploadDir();
    const studentId = parseStudentId(req);
    const orderId = parseOrderId(req);

    if (!req.file) {
      throw new UploadRejectedError('Screenshot is required.');
    }

    const originalName = path.basename(String(req.file.originalname || 'upload.bin'));
    if (originalName.includes('..') || /[\\/]/.test(originalName)) {
      await safeUnlink(req.file.path);
      throw new UploadRejectedError('Invalid file name');
    }

    let stored;
    try {
      stored = await finalizeManualPaymentScreenshot({
        filePath: req.file.path,
        originalName,
        claimedMime: String(req.file.mimetype || ''),
        size: req.file.size,
      });
    } catch (error) {
      if (error instanceof UploadRejectedError) throw error;
      throw new UploadRejectedError(error?.message || 'Screenshot was rejected.');
    }

    const storedPath = path.join(MANUAL_PAYMENT_UPLOAD_DIR, stored.filename);

    const submission = await submitManualPayment({
      studentId,
      orderId,
      body: req.body || {},
      screenshot: {
        url: stored.url,
        sha256: stored.sha256,
        storedPath,
      },
    });

    sendSuccess(res, submission, 201);
  }),
];
