import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import { normalizeUploadExtension } from '../utils/secureRasterImageValidation.js';
import { getQaImageUploadConfig } from '../config/qaImageUpload.config.js';
import {
  ensureQaImageUploadDir,
  finalizeQaImageUpload,
  generateQaTempUploadFilename,
  getQaImageUploadDir,
} from '../services/qaImageUpload.service.js';

const STUDENT_QA_NAMESPACE = 'student-qa';

const ALLOWED_MIME = /^image\/(jpeg|jpg|png|webp)$/i;

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    try {
      const dir = getQaImageUploadDir(STUDENT_QA_NAMESPACE);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (error) {
      cb(error);
    }
  },
  filename(req, _file, cb) {
    try {
      cb(null, generateQaTempUploadFilename(req.user?.id));
    } catch (error) {
      cb(error);
    }
  },
});

function createUploadMiddleware() {
  const config = getQaImageUploadConfig();
  return multer({
    storage,
    limits: { fileSize: config.maxBytes, files: 1 },
    fileFilter(_req, file, cb) {
      const extResult = normalizeUploadExtension(file.originalname || '');
      if (!extResult.ok || !extResult.ext) {
        cb(new Error('File type is not allowed'));
        return;
      }
      if (!ALLOWED_MIME.test(String(file.mimetype || ''))) {
        cb(new Error('Only JPEG, PNG, or WebP images are allowed'));
        return;
      }
      cb(null, true);
    },
  });
}

function handleUpload(req, res, next) {
  const config = getQaImageUploadConfig();
  createUploadMiddleware().single('image')(req, res, (err) => {
    if (err && err.name === 'MulterError') {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Image must be ${config.maxSizeLabelMb} MB or smaller.`
          : err.code === 'LIMIT_FILE_COUNT'
            ? 'Only one image may be uploaded at a time.'
            : 'Upload was rejected.';
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

export const postStudentQuestionAttachment = [
  handleUpload,
  asyncHandler(async (req, res) => {
    await ensureQaImageUploadDir(STUDENT_QA_NAMESPACE);

    if (!req.file) {
      throw new UploadRejectedError('No image file uploaded');
    }

    const originalName = path.basename(String(req.file.originalname || 'upload.bin'));
    if (originalName.includes('..') || /[\\/]/.test(originalName)) {
      throw new UploadRejectedError('Invalid file name');
    }

    try {
      const result = await finalizeQaImageUpload(req, {
        namespace: STUDENT_QA_NAMESPACE,
        filePath: req.file.path,
        originalName,
        claimedMime: String(req.file.mimetype || ''),
        size: req.file.size,
      });

      sendSuccess(res, { url: result.url });
    } catch (error) {
      if (error instanceof UploadRejectedError) throw error;
      console.error('[student-qa-upload] unexpected failure', error?.message || error);
      throw new UploadRejectedError('Upload failed');
    }
  }),
];
