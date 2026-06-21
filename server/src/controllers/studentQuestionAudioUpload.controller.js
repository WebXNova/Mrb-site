import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import { normalizeAudioUploadExtension } from '../utils/secureAudioValidation.js';
import {
  isAllowedQaAudioUploadMime,
  qaAudioUploadMimeRejectionMessage,
} from '../utils/qaAudioMulterGate.js';
import { getQaAudioUploadConfig } from '../config/qaAudioUpload.config.js';
import {
  ensureQaAudioUploadDir,
  finalizeQaAudioUpload,
  generateQaAudioTempFilename,
  getQaAudioUploadDir,
} from '../services/qaAudioUpload.service.js';

const STUDENT_QA_NAMESPACE = 'student-qa';

/** Pre-multer MIME gate only — acceptance uses magic bytes + parse. */
const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    try {
      const dir = getQaAudioUploadDir(STUDENT_QA_NAMESPACE);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (error) {
      cb(error);
    }
  },
  filename(req, _file, cb) {
    try {
      cb(null, generateQaAudioTempFilename(req.user?.id));
    } catch (error) {
      cb(error);
    }
  },
});

function createUploadMiddleware() {
  const config = getQaAudioUploadConfig();
  return multer({
    storage,
    limits: { fileSize: config.maxBytes, files: 1 },
    fileFilter(_req, file, cb) {
      const extResult = normalizeAudioUploadExtension(file.originalname || '');
      if (!extResult.ok || !extResult.ext) {
        cb(new Error('Recording type is not allowed'));
        return;
      }
      if (!isAllowedQaAudioUploadMime(file.mimetype, file.originalname)) {
        cb(new Error(qaAudioUploadMimeRejectionMessage()));
        return;
      }
      cb(null, true);
    },
  });
}

function handleUpload(req, res, next) {
  const config = getQaAudioUploadConfig();
  createUploadMiddleware().single('recording')(req, res, (err) => {
    if (err && err.name === 'MulterError') {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `Recording must be ${config.maxSizeLabelMb} MB or smaller.`
          : err.code === 'LIMIT_FILE_COUNT'
            ? 'Only one recording may be uploaded at a time.'
            : 'Recording upload was rejected.';
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

export const postStudentQuestionAudioRecording = [
  handleUpload,
  asyncHandler(async (req, res) => {
    await ensureQaAudioUploadDir(STUDENT_QA_NAMESPACE);

    if (!req.file) {
      throw new UploadRejectedError('No recording uploaded');
    }

    const originalName = path.basename(String(req.file.originalname || 'recording.bin'));
    if (originalName.includes('..') || /[\\/]/.test(originalName)) {
      throw new UploadRejectedError('Invalid file name');
    }

    try {
      const result = await finalizeQaAudioUpload(req, {
        namespace: STUDENT_QA_NAMESPACE,
        filePath: req.file.path,
        originalName,
        claimedMime: String(req.file.mimetype || ''),
        size: req.file.size,
      });

      sendSuccess(res, { url: result.url, durationSec: result.durationSec });
    } catch (error) {
      if (error instanceof UploadRejectedError) throw error;
      console.error('[student-qa-audio-upload] unexpected failure', error?.message || error);
      throw new UploadRejectedError('Recording upload failed');
    }
  }),
];
