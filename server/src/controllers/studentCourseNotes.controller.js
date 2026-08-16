import path from 'path';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { requireEntitlement } from '../security/cee/requireEntitlement.js';
import {
  getStudentCourseNoteDownload,
  listStudentCourseNotesGrouped,
  listStudentNotesForChapter,
  listStudentNotesForLecture,
  listStudentNotesForSubject,
} from '../services/studentCourseNotes.service.js';

function parseStudentId(req) {
  const userId = Number(req.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new ApiError(401, 'Authentication required');
  }
  return userId;
}

function parseCourseIdParam(req) {
  const id = Number(req.params.courseId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid course id');
  }
  return id;
}

function parseSubjectIdParam(req) {
  const id = Number(req.params.subjectId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid subject id');
  }
  return id;
}

function parseChapterIdParam(req) {
  const id = Number(req.params.chapterId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid chapter id');
  }
  return id;
}

function parseLectureIdParam(req) {
  const id = Number(req.params.lectureId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid lecture id');
  }
  return id;
}

function parseNoteIdParam(req) {
  const id = Number(req.params.noteId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError(400, 'Invalid note id');
  }
  return id;
}

async function assertStudentCourseEntitlement(req, courseId) {
  await requireEntitlement(parseStudentId(req), { courseId });
}

export const getStudentCourseNotesHandler = asyncHandler(async (req, res) => {
  const courseId = parseCourseIdParam(req);
  await assertStudentCourseEntitlement(req, courseId);
  const payload = await listStudentCourseNotesGrouped(courseId);
  sendSuccess(res, payload);
});

export const getStudentSubjectNotesHandler = asyncHandler(async (req, res) => {
  const courseId = parseCourseIdParam(req);
  const subjectId = parseSubjectIdParam(req);
  await assertStudentCourseEntitlement(req, courseId);
  const payload = await listStudentNotesForSubject(courseId, subjectId);
  sendSuccess(res, payload);
});

export const getStudentChapterNotesHandler = asyncHandler(async (req, res) => {
  const courseId = parseCourseIdParam(req);
  const chapterId = parseChapterIdParam(req);
  await assertStudentCourseEntitlement(req, courseId);
  const payload = await listStudentNotesForChapter(courseId, chapterId);
  sendSuccess(res, payload);
});

export const getStudentLectureNotesHandler = asyncHandler(async (req, res) => {
  const courseId = parseCourseIdParam(req);
  const lectureId = parseLectureIdParam(req);
  await assertStudentCourseEntitlement(req, courseId);
  const payload = await listStudentNotesForLecture(courseId, lectureId);
  sendSuccess(res, payload);
});

export const getStudentNoteDownloadHandler = asyncHandler(async (req, res) => {
  const file = await getStudentCourseNoteDownload({
    noteId: parseNoteIdParam(req),
    userId: parseStudentId(req),
  });

  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(file.filename, {
    root: file.root,
    dotfiles: 'deny',
    headers: {
      'Content-Disposition': `attachment; filename="${path.basename(file.downloadName)}"`,
    },
  });
});
