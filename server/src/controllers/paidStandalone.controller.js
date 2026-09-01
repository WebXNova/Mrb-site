import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import { normalizeUploadExtension } from '../utils/secureRasterImageValidation.js';
import {
  listPaidStandaloneCatalog,
  registerPaidStandaloneTest,
} from '../services/paidStandaloneRegistration.service.js';
import { listFreeStandaloneCatalog, loadFreeStandalonePrep, loadFreeStandalonePublicDetail } from '../services/freeStandaloneCatalog.service.js';
import { listStandaloneMyTests } from '../services/standaloneMyTests.service.js';
import { loadPaidStandaloneTestBySlug } from '../security/cee/paidStandaloneAccess.service.js';
import { recordExamIntegrityStrike } from '../services/examIntegrity.service.js';
import {
  getPaidStandaloneCheckoutInfo,
  getPaidStandalonePaymentStatus,
  getPaidStandaloneScreenshotForStudent,
  submitPaidStandalonePayment,
} from '../services/paidStandalonePayment.service.js';
import {
  loadPaidStandaloneMyRegistration,
  loadPaidStandalonePrep,
  loadPaidStandalonePublicDetail,
} from '../services/paidStandalonePrep.service.js';
import {
  createPaidStandaloneTestAttempt,
  getAttemptResult,
  getAttemptTestForStart,
  saveAttemptAnswer,
  submitAttempt,
} from '../services/testAttempt.service.js';
import {
  readAndVerifyAttemptToken,
} from '../services/attemptTokenAuth.service.js';
import {
  sanitizeAttemptTokenResponse,
  setAttemptTokenCookie,
} from '../services/attemptTokenCookie.service.js';
import {
  MANUAL_PAYMENT_UPLOAD_DIR,
  MANUAL_PAYMENT_UPLOAD_MAX_BYTES,
  ensureManualPaymentUploadDir,
  finalizeManualPaymentScreenshot,
  generateManualPaymentTempFilename,
  mapMulterFileToScreenshotInput,
  safeUnlink,
} from '../services/manualPaymentScreenshotUpload.service.js';
import { AttemptTokenInvalidError } from '../errors/testAttempt/TestAttemptErrors.js';
import { evaluateAccessRequest } from '../services/authDecisionEngine.js';

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

async function optionalStudentId(req) {
  try {
    const payload = await evaluateAccessRequest(req, { expectedRole: 'student' });
    const userId = Number(payload?.id);
    return Number.isInteger(userId) && userId > 0 ? userId : null;
  } catch (error) {
    if (error instanceof ApiError && (error.statusCode === 401 || error.statusCode === 403)) {
      return null;
    }
    throw error;
  }
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
    const mime = String(file.mimetype || '').toLowerCase();
    const extResult = normalizeUploadExtension(file.originalname || '');
    const extOk = extResult.ok && ['.jpg', '.jpeg', '.png'].includes(extResult.ext);
    const mimeOk = ALLOWED_MIME.test(mime);
    const mimeUnknown = !mime || mime === 'application/octet-stream';
    if (mimeOk || (mimeUnknown && extOk)) {
      cb(null, true);
      return;
    }
    cb(new UploadRejectedError('Screenshot must be a JPG or PNG image.'));
  },
});

export function paidStandaloneScreenshotUpload(req, res, next) {
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
      next(err instanceof ApiError ? err : new UploadRejectedError(err.message || 'Screenshot upload failed. Please try again.'));
      return;
    }
    next();
  });
}

function getAttemptPayload(req, userId) {
  const decoded = readAndVerifyAttemptToken(req);
  if (decoded.userId != null && Number(decoded.userId) !== Number(userId)) {
    throw new AttemptTokenInvalidError({
      reason: 'user_mismatch',
      attemptId: decoded.attemptId ?? null,
    });
  }
  return decoded;
}

export const getPaidStandaloneCatalog = asyncHandler(async (req, res) => {
  const items = await listPaidStandaloneCatalog({ studentId: await optionalStudentId(req) });
  sendSuccess(res, { items });
});

export const getFreeStandaloneCatalog = asyncHandler(async (req, res) => {
  const items = await listFreeStandaloneCatalog({ studentId: await optionalStudentId(req) });
  sendSuccess(res, { items });
});

export const getStandaloneMyTests = asyncHandler(async (req, res) => {
  const data = await listStandaloneMyTests(parseStudentId(req), {
    page: req.query.page,
    pageSize: req.query.pageSize,
    search: req.query.search,
    accessType: req.query.accessType ?? req.query.kind,
    status: req.query.status,
  });
  sendSuccess(res, data);
});
export const getStandaloneMyResults = getStandaloneMyTests;

export const getPaidStandalonePublic = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const paid = await loadPaidStandaloneTestBySlug(slug);
  if (paid) {
    const detail = await loadPaidStandalonePublicDetail(slug);
    sendSuccess(res, detail);
    return;
  }
  const detail = await loadFreeStandalonePublicDetail(slug);
  sendSuccess(res, detail);
});

export const postPaidStandaloneRegister = asyncHandler(async (req, res) => {
  const result = await registerPaidStandaloneTest({
    slug: String(req.params.slug || '').trim(),
    userId: parseStudentId(req),
    body: req.body,
  });
  sendSuccess(res, result, 201);
});

export const getPaidStandaloneCheckout = asyncHandler(async (req, res) => {
  const data = await getPaidStandaloneCheckoutInfo({
    studentId: parseStudentId(req),
    orderId: parseOrderId(req),
  });
  sendSuccess(res, data);
});

export const getPaidStandaloneStatus = asyncHandler(async (req, res) => {
  const data = await getPaidStandalonePaymentStatus({
    studentId: parseStudentId(req),
    orderId: parseOrderId(req),
  });
  sendSuccess(res, data);
});

export const getPaidStandaloneStudentScreenshot = asyncHandler(async (req, res) => {
  const file = await getPaidStandaloneScreenshotForStudent({
    studentId: parseStudentId(req),
    orderId: parseOrderId(req),
  });
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(file.filename, { root: MANUAL_PAYMENT_UPLOAD_DIR, dotfiles: 'deny' });
});

export const postPaidStandalonePaymentSubmit = asyncHandler(async (req, res) => {
  const studentId = parseStudentId(req);
  const orderId = parseOrderId(req);
  if (!req.file) {
    throw new UploadRejectedError('Screenshot is required.');
  }
  await ensureManualPaymentUploadDir();

  const originalName = path.basename(String(req.file.originalname || 'upload.bin'));
  if (originalName.includes('..') || /[\\/]/.test(originalName)) {
    await safeUnlink(req.file.path);
    throw new UploadRejectedError('Invalid file name');
  }

  let stored;
  try {
    stored = await finalizeManualPaymentScreenshot(mapMulterFileToScreenshotInput(req.file));
  } catch (error) {
    if (error instanceof UploadRejectedError) throw error;
    console.error('[paid-standalone-screenshot] unexpected failure', {
      orderId,
      originalName: req.file.originalname || null,
      size: req.file.size ?? null,
      mime: req.file.mimetype || null,
      message: error?.message || String(error),
      code: error?.code || null,
    });
    throw new UploadRejectedError('Screenshot upload failed. Please try again.');
  }

  const storedPath = stored.storedPath;
  const data = await submitPaidStandalonePayment({
    studentId,
    orderId,
    body: req.body,
    screenshot: {
      url: stored.url,
      sha256: stored.sha256,
      storedPath,
    },
  });
  sendSuccess(res, data, 201);
});

export const getPaidStandaloneMyRegistration = asyncHandler(async (req, res) => {
  const data = await loadPaidStandaloneMyRegistration({
    slug: String(req.params.slug || '').trim(),
    studentId: parseStudentId(req),
  });
  sendSuccess(res, data);
});

export const getPaidStandalonePrep = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || '').trim();
  const studentId = parseStudentId(req);
  const paid = await loadPaidStandaloneTestBySlug(slug);
  const prep = paid
    ? await loadPaidStandalonePrep({ slug, studentId })
    : await loadFreeStandalonePrep({ slug, studentId });
  sendSuccess(res, prep);
});

export const postPaidStandaloneVerify = asyncHandler(async (req, res) => {
  const studentId = parseStudentId(req);
  const slug = String(req.params.slug || '').trim();
  const result = await createPaidStandaloneTestAttempt({
    slug,
    studentId,
    studentName: req.body?.studentName || null,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null,
  });
  if (result.attemptToken) setAttemptTokenCookie(res, result.attemptToken);
  sendSuccess(res, sanitizeAttemptTokenResponse(result));
});

export const getPaidStandaloneStart = asyncHandler(async (req, res) => {
  const userId = parseStudentId(req);
  const slug = String(req.params.slug || '').trim();
  const attemptPayload = getAttemptPayload(req, userId);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }
  const data = await getAttemptTestForStart({
    slug,
    attemptId,
    userId,
    tokenNonce: attemptPayload.nonce,
  });
  sendSuccess(res, data);
});

export const patchPaidStandaloneAnswer = asyncHandler(async (req, res) => {
  const userId = parseStudentId(req);
  const slug = String(req.params.slug || '').trim();
  const attemptPayload = getAttemptPayload(req, userId);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }
  const data = await saveAttemptAnswer({
    slug,
    attemptId,
    userId,
    questionId: Number(req.body?.questionId),
    selectedOption: req.body?.selectedOption,
    tokenNonce: attemptPayload.nonce,
  });
  sendSuccess(res, data);
});

export const postPaidStandaloneSubmit = asyncHandler(async (req, res) => {
  const userId = parseStudentId(req);
  const slug = String(req.params.slug || '').trim();
  const attemptPayload = getAttemptPayload(req, userId);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }
  const data = await submitAttempt({
    slug,
    attemptId,
    userId,
    tokenNonce: attemptPayload.nonce,
  });
  sendSuccess(res, data);
});

export const getPaidStandaloneResult = asyncHandler(async (req, res) => {
  const userId = parseStudentId(req);
  const slug = String(req.params.slug || '').trim();
  const attemptId = Number(req.params.attemptId);
  const data = await getAttemptResult({ slug, attemptId, userId });
  sendSuccess(res, data);
});

export const postPaidStandaloneIntegrityEvent = asyncHandler(async (req, res) => {
  const userId = parseStudentId(req);
  const slug = String(req.params.slug || '').trim();
  const attemptPayload = getAttemptPayload(req, userId);
  const attemptId = Number(req.params.attemptId);
  if (!attemptId || attemptPayload.attemptId !== attemptId || attemptPayload.slug !== slug) {
    throw new ApiError(403, 'Attempt access denied');
  }
  const strike = await recordExamIntegrityStrike({
    attemptId,
    userId,
    slug,
    tokenNonce: attemptPayload.nonce,
  });
  if (strike.shouldSubmit) {
    const submitted = await submitAttempt({
      slug,
      attemptId,
      userId,
      tokenNonce: attemptPayload.nonce,
    });
    sendSuccess(res, { ...submitted, ...strike });
    return;
  }
  sendSuccess(res, strike);
});
