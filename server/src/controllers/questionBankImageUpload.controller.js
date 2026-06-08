import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import {
  QUESTION_BANK_UPLOAD_DIR,
  QUESTION_BANK_UPLOAD_MAX_BYTES,
  ensureQuestionBankUploadDir,
  finalizeQuestionBankImageUpload,
  generateTempUploadFilename,
} from '../services/questionBankImageUpload.service.js';
import { normalizeUploadExtension } from '../utils/secureRasterImageValidation.js';

const ALLOWED_MIME = /^image\/(jpeg|png|webp)$/i;

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(QUESTION_BANK_UPLOAD_DIR, { recursive: true });
    cb(null, QUESTION_BANK_UPLOAD_DIR);
  },
  filename(_req, _file, cb) {
    cb(null, generateTempUploadFilename());
  },
});

const upload = multer({
  storage,
  limits: { fileSize: QUESTION_BANK_UPLOAD_MAX_BYTES, files: 1 },
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

function handleUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err && err.name === 'MulterError') {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Image must be 5 MB or smaller.'
          : err.code === 'LIMIT_FILE_COUNT'
            ? 'Only one image may be uploaded at a time.'
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

export const postQuestionBankImage = [
  handleUpload,
  asyncHandler(async (req, res) => {
    await ensureQuestionBankUploadDir();

    if (!req.file) {
      throw new UploadRejectedError('No image file uploaded');
    }

    const originalName = path.basename(String(req.file.originalname || 'upload.bin'));
    if (originalName.includes('..') || /[\\/]/.test(originalName)) {
      throw new UploadRejectedError('Invalid file name');
    }

    try {
      const result = await finalizeQuestionBankImageUpload(req, {
        filePath: req.file.path,
        originalName,
        claimedMime: String(req.file.mimetype || ''),
        size: req.file.size,
      });

      sendSuccess(res, { url: result.url });
    } catch (error) {
      if (error instanceof UploadRejectedError) throw error;
      console.error('[question-bank-upload] unexpected failure', error?.message || error);
      throw new UploadRejectedError('Upload failed');
    }
  }),
];
