import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { UploadRejectedError } from '../errors/media/MediaErrors.js';
import { runWithCeeQueryContext } from '../security/cee/db/ceeQueryContext.js';
import { mysqlPool } from '../config/mysql.js';
import { normalizeUploadExtension } from '../utils/secureRasterImageValidation.js';
import { NOTE_UPLOAD_FINAL_EXTENSIONS } from '../utils/secureNoteFileValidation.js';
import {
  activateCourseNote,
  createCourseNote,
  deactivateCourseNote,
  getCourseNoteById,
  getCourseNoteFileForAdmin,
  listCourseNotes,
  updateCourseNote,
} from '../services/courseNotes.service.js';
import {
  COURSE_NOTES_UPLOAD_DIR,
  COURSE_NOTES_UPLOAD_MAX_BYTES,
  ensureCourseNotesUploadDir,
  finalizeCourseNoteUpload,
  generateCourseNoteTempFilename,
  safeUnlink,
} from '../services/courseNoteUpload.service.js';

function parseActorId(req) {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  return userId;
}

function parseActorRole(req) {
  return typeof req.user?.role === 'string' ? req.user.role : 'admin';
}

function parseCourseIdParam(req) {
  const id = Number(req.params.courseId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid course id');
  }
  return id;
}

function parseNoteIdParam(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid note id');
  }
  return id;
}

async function resolveNoteCourseId(noteId) {
  const [rows] = await mysqlPool.query(
    `SELECT course_id FROM notes WHERE id = ? LIMIT 1`,
    [noteId]
  );
  const courseId = Number(rows[0]?.course_id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    throw new ApiError(404, 'Note not found');
  }
  return courseId;
}

function runAdminNotesContext(courseId, fn) {
  return runWithCeeQueryContext(
    {
      validated: true,
      courseId: Number(courseId),
      context: 'admin.courseNotes',
    },
    fn
  );
}

const ALLOWED_MIME =
  /^(application\/(pdf|x-pdf|acrobat|vnd\.pdf)|image\/(jpe?g|pjpeg|png)|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i;
const ALLOWED_EXT = NOTE_UPLOAD_FINAL_EXTENSIONS;

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(COURSE_NOTES_UPLOAD_DIR, { recursive: true });
    cb(null, COURSE_NOTES_UPLOAD_DIR);
  },
  filename(_req, _file, cb) {
    cb(null, generateCourseNoteTempFilename());
  },
});

const upload = multer({
  storage,
  limits: { fileSize: COURSE_NOTES_UPLOAD_MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    const extResult = normalizeUploadExtension(file.originalname || '', {
      allowedFinalExtensions: ALLOWED_EXT,
    });
    if (!extResult.ok || !ALLOWED_EXT.has(extResult.ext)) {
      cb(new Error('File must be PDF, JPG, PNG, or DOCX.'));
      return;
    }
    if (!ALLOWED_MIME.test(String(file.mimetype || ''))) {
      cb(new Error('File must be PDF, JPG, PNG, or DOCX.'));
      return;
    }
    cb(null, true);
  },
});

function handleNoteFileUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err && err.name === 'MulterError') {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'File must be 100 MB or smaller.'
          : err.code === 'LIMIT_FILE_COUNT'
            ? 'Only one file may be uploaded.'
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

export const getCourseNotesHandler = asyncHandler(async (req, res) => {
  const courseId = parseCourseIdParam(req);
  const notes = await runAdminNotesContext(courseId, () =>
    listCourseNotes({ courseId, query: req.query || {} })
  );
  sendSuccess(res, { notes });
});

export const postCourseNoteHandler = asyncHandler(async (req, res) => {
  if (!req.file?.path) {
    throw new ApiError(400, 'File is required');
  }

  await ensureCourseNotesUploadDir();

  let finalized;
  try {
    finalized = await finalizeCourseNoteUpload({
      filePath: req.file.path,
      originalName: req.file.originalname || '',
      claimedMime: req.file.mimetype || '',
      size: req.file.size,
    });
  } catch (error) {
    await safeUnlink(req.file.path);
    throw error;
  }

  const courseId = parseCourseIdParam(req);
  const note = await runAdminNotesContext(courseId, () =>
    createCourseNote({
      courseId,
      body: req.body || {},
      upload: {
        url: finalized.url,
        fileType: finalized.fileType,
        fileSize: finalized.fileSize,
      },
      actorId: parseActorId(req),
      actorRole: parseActorRole(req),
    })
  );

  sendSuccess(res, { note }, 201);
});

export const putCourseNoteHandler = asyncHandler(async (req, res) => {
  const noteId = parseNoteIdParam(req);
  const courseId = await resolveNoteCourseId(noteId);
  const note = await runAdminNotesContext(courseId, () =>
    updateCourseNote({
      noteId,
      body: req.body || {},
      actorId: parseActorId(req),
      actorRole: parseActorRole(req),
    })
  );
  sendSuccess(res, { note });
});

export const putCourseNoteActivateHandler = asyncHandler(async (req, res) => {
  const noteId = parseNoteIdParam(req);
  const courseId = await resolveNoteCourseId(noteId);
  const note = await runAdminNotesContext(courseId, () =>
    activateCourseNote({
      noteId,
      actorId: parseActorId(req),
      actorRole: parseActorRole(req),
    })
  );
  sendSuccess(res, { note });
});

export const putCourseNoteDeactivateHandler = asyncHandler(async (req, res) => {
  const noteId = parseNoteIdParam(req);
  const courseId = await resolveNoteCourseId(noteId);
  const note = await runAdminNotesContext(courseId, () =>
    deactivateCourseNote({
      noteId,
      actorId: parseActorId(req),
      actorRole: parseActorRole(req),
    })
  );
  sendSuccess(res, { note });
});

export const getCourseNoteFileHandler = asyncHandler(async (req, res) => {
  const noteId = parseNoteIdParam(req);
  const courseId = await resolveNoteCourseId(noteId);
  const file = await runAdminNotesContext(courseId, () => getCourseNoteFileForAdmin(noteId));
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(file.filename, {
    root: file.root,
    dotfiles: 'deny',
    headers: {
      'Content-Disposition': `inline; filename="${path.basename(file.downloadName)}"`,
    },
  });
});

export const getCourseNoteHandler = asyncHandler(async (req, res) => {
  const noteId = parseNoteIdParam(req);
  const courseId = await resolveNoteCourseId(noteId);
  const note = await runAdminNotesContext(courseId, () => getCourseNoteById(noteId));
  if (!note) {
    throw new ApiError(404, 'Note not found');
  }
  sendSuccess(res, { note });
});

export const postCourseNoteUploadMiddleware = handleNoteFileUpload;
