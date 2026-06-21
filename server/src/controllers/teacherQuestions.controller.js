import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { parseStudentQuestionId } from '../services/studentQuestionStudentView.service.js';
import { openTeacherQuestionDetail } from '../services/teacherQuestionDetail.service.js';
import { submitTeacherQuestionAnswer } from '../services/teacherQuestionAnswer.service.js';
import { updateTeacherQuestionAnswer } from '../services/teacherQuestionAnswerUpdate.service.js';
import { listTeacherQuestionInbox, setTeacherQuestionPinned } from '../services/teacherQuestionInbox.service.js';
import {
  listTeacherQuestionThreads,
  openTeacherQuestionThread,
  resolveTeacherThreadIdFromQuestion,
} from '../services/teacherQuestionThreads.service.js';
import { sendTeacherThreadChatMessage } from '../services/teacherThreadChatMessage.service.js';
import { getTeacherQuestionStudentContext } from '../services/teacherQuestionStudentContext.service.js';
import { teacherQuestionAnswerBodySchema } from '../validators/teacherQuestionAnswer.schema.js';
import {
  teacherQuestionInboxQuerySchema,
  teacherQuestionPinBodySchema,
} from '../validators/teacherQuestionInbox.schema.js';
import {
  logTeacherQuestionAccessDenied,
  logTeacherQuestionAnswerCreated,
  logTeacherQuestionAnswerRejected,
  logTeacherQuestionInboxViewed,
  logTeacherQuestionOpened,
  logTeacherQuestionPinned,
  logTeacherQuestionSeenUpdated,
} from '../services/teacherQuestionDetailAudit.service.js';
import {
  logTeacherAnswerUpdated,
  logTeacherQuestionAnswered,
  logTeacherQuestionViewed,
} from '../services/teacherActivityLog.service.js';

/**
 * GET /api/teacher/question-threads
 */
export const getTeacherQuestionThreads = asyncHandler(async (req, res) => {
  const parsed = teacherQuestionInboxQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid thread query', parsed.error.flatten());
  }

  const data = await listTeacherQuestionThreads(req.user.id, parsed.data);
  void logTeacherQuestionInboxViewed(req, {
    count: data.items.length,
    status: parsed.data.status,
    search: parsed.data.search,
    view: 'threads',
  });
  sendSuccess(res, data);
});

/**
 * GET /api/teacher/question-threads/:threadId
 */
export const getTeacherQuestionThreadById = asyncHandler(async (req, res) => {
  const threadId = String(req.params.threadId || '').trim();
  if (!threadId) {
    throw new ApiError(404, 'Conversation not found', { code: 'THREAD_NOT_FOUND' });
  }

  const result = await openTeacherQuestionThread(req.user.id, threadId);

  if (result.kind === 'invalid_id' || result.kind === 'access_denied') {
    void logTeacherQuestionAccessDenied(req, { threadId, reason: 'thread_not_assigned' });
    throw new ApiError(403, 'You do not have access to this conversation', {
      code: 'THREAD_ACCESS_DENIED',
    });
  }

  void logTeacherQuestionOpened(req, {
    threadId,
    messageCount: result.thread.messages.length,
    statusUpdated: result.statusUpdated,
  });

  if (result.statusUpdated) {
    void logTeacherQuestionSeenUpdated(req, { threadId });
  }

  sendSuccess(res, result.thread);
});

/**
 * POST /api/teacher/question-threads/:threadId/messages
 * Teacher-initiated chat message (no pending student question required).
 */
export const postTeacherThreadChatMessage = asyncHandler(async (req, res) => {
  const threadId = String(req.params.threadId || '').trim();
  if (!threadId) {
    throw new ApiError(404, 'Conversation not found', { code: 'THREAD_NOT_FOUND' });
  }

  const parsed = teacherQuestionAnswerBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid message payload', parsed.error.flatten());
  }

  const result = await sendTeacherThreadChatMessage(req.user.id, threadId, {
    body: parsed.data.body,
    imageUrl: parsed.data.imageUrl ?? null,
    audioUrl: parsed.data.audioUrl ?? null,
  });

  if (result.kind === 'access_denied') {
    void logTeacherQuestionAccessDenied(req, { threadId, reason: 'thread_message_not_assigned' });
    throw new ApiError(403, 'You do not have access to this conversation', {
      code: 'THREAD_ACCESS_DENIED',
    });
  }

  void logTeacherQuestionAnswerCreated(req, {
    questionId: result.detail?.id,
    hasImage: Boolean(parsed.data.imageUrl),
    hasAudio: Boolean(parsed.data.audioUrl),
    bodyLength: parsed.data.body.length,
    threadId,
    initiatedBy: 'teacher',
  });

  sendSuccess(res, result.detail);
});

/**
 * GET /api/teacher/questions
 */
export const getTeacherQuestions = asyncHandler(async (req, res) => {
  const parsed = teacherQuestionInboxQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid inbox query', parsed.error.flatten());
  }

  const data = await listTeacherQuestionInbox(req.user.id, parsed.data);
  void logTeacherQuestionInboxViewed(req, {
    count: data.items.length,
    status: parsed.data.status,
    search: parsed.data.search,
  });
  sendSuccess(res, data);
});

/**
 * GET /api/teacher/questions/:questionId/thread-id
 */
export const getTeacherQuestionThreadId = asyncHandler(async (req, res) => {
  const questionId = req.params.questionId ?? req.params.id;
  if (!parseStudentQuestionId(questionId)) {
    throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
  }

  const threadId = await resolveTeacherThreadIdFromQuestion(req.user.id, questionId);
  if (!threadId) {
    void logTeacherQuestionAccessDenied(req, { questionId, reason: 'thread_resolve_denied' });
    throw new ApiError(403, 'You do not have access to this question', {
      code: 'QUESTION_ACCESS_DENIED',
    });
  }

  sendSuccess(res, { threadId });
});

/**
 * GET /api/teacher/questions/:questionId
 * Opens assigned question, marks seen once (sent → seen), returns teacher-safe detail.
 */
export const getTeacherQuestionById = asyncHandler(async (req, res) => {
  const questionId = req.params.questionId ?? req.params.id;

  if (!parseStudentQuestionId(questionId)) {
    throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
  }

  const result = await openTeacherQuestionDetail(req.user.id, questionId);

  if (result.kind === 'invalid_id') {
    throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
  }

  if (result.kind === 'access_denied') {
    void logTeacherQuestionAccessDenied(req, { questionId });
    throw new ApiError(403, 'You do not have access to this question', {
      code: 'QUESTION_ACCESS_DENIED',
    });
  }

  void logTeacherQuestionOpened(req, {
    questionId,
    status: result.detail.status,
    statusUpdated: result.statusUpdated,
  });
  void logTeacherQuestionViewed(req.user.id, questionId, {
    status: result.detail.status,
    statusUpdated: Boolean(result.statusUpdated),
  });

  if (result.statusUpdated) {
    void logTeacherQuestionSeenUpdated(req, { questionId });
  }

  sendSuccess(res, result.detail);
});

/**
 * POST /api/teacher/questions/:questionId/answer
 */
export const postTeacherQuestionAnswer = asyncHandler(async (req, res) => {
  const questionId = req.params.questionId ?? req.params.id;

  if (!parseStudentQuestionId(questionId)) {
    throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
  }

  const parsed = teacherQuestionAnswerBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid answer payload', parsed.error.flatten());
  }

  const result = await submitTeacherQuestionAnswer(req.user.id, questionId, {
    body: parsed.data.body,
    imageUrl: parsed.data.imageUrl ?? null,
    audioUrl: parsed.data.audioUrl ?? null,
  });

  if (result.kind === 'access_denied') {
    void logTeacherQuestionAccessDenied(req, { questionId, reason: 'answer_not_assigned' });
    throw new ApiError(403, 'You do not have access to this question', {
      code: 'QUESTION_ACCESS_DENIED',
    });
  }

  if (result.kind === 'already_answered') {
    void logTeacherQuestionAnswerRejected(req, {
      questionId,
      reason: 'answer_already_exists',
      code: 'ANSWER_ALREADY_EXISTS',
    });
    throw new ApiError(409, 'This question already has an answer', { code: 'ANSWER_ALREADY_EXISTS' });
  }

  void logTeacherQuestionAnswerCreated(req, {
    questionId,
    hasImage: Boolean(parsed.data.imageUrl),
    hasAudio: Boolean(parsed.data.audioUrl),
    bodyLength: parsed.data.body.length,
  });
  void logTeacherQuestionAnswered(req.user.id, questionId, {
    hasImage: Boolean(parsed.data.imageUrl),
    hasAudio: Boolean(parsed.data.audioUrl),
  });

  sendSuccess(res, result.detail);
});

/**
 * PATCH /api/teacher/questions/:questionId/answer
 */
export const patchTeacherQuestionAnswer = asyncHandler(async (req, res) => {
  const questionId = req.params.questionId ?? req.params.id;

  if (!parseStudentQuestionId(questionId)) {
    throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
  }

  const parsed = teacherQuestionAnswerBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid answer payload', parsed.error.flatten());
  }

  const result = await updateTeacherQuestionAnswer(req.user.id, questionId, {
    body: parsed.data.body,
    imageUrl: parsed.data.imageUrl ?? null,
    audioUrl: parsed.data.audioUrl ?? null,
  });

  if (result.kind === 'access_denied') {
    void logTeacherQuestionAccessDenied(req, { questionId, reason: 'answer_update_not_assigned' });
    throw new ApiError(403, 'You do not have access to this question', {
      code: 'QUESTION_ACCESS_DENIED',
    });
  }

  if (result.kind === 'not_answered') {
    throw new ApiError(409, 'This question has no answer to update', { code: 'ANSWER_NOT_FOUND' });
  }

  void logTeacherAnswerUpdated(req.user.id, questionId, {
    hasImage: Boolean(parsed.data.imageUrl),
    hasAudio: Boolean(parsed.data.audioUrl),
    bodyLength: parsed.data.body.length,
  });

  sendSuccess(res, result.detail);
});

/**
 * GET /api/teacher/questions/:questionId/student-context
 */
export const getTeacherQuestionStudentContextHandler = asyncHandler(async (req, res) => {
  const questionId = req.params.questionId ?? req.params.id;
  if (!parseStudentQuestionId(questionId)) {
    throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
  }

  const context = await getTeacherQuestionStudentContext(req.user.id, questionId);
  if (!context) {
    void logTeacherQuestionAccessDenied(req, { questionId, reason: 'context_not_assigned' });
    throw new ApiError(403, 'You do not have access to this question', {
      code: 'QUESTION_ACCESS_DENIED',
    });
  }

  sendSuccess(res, context);
});

/**
 * PATCH /api/teacher/questions/:questionId/pin
 */
export const patchTeacherQuestionPin = asyncHandler(async (req, res) => {
  const questionId = req.params.questionId ?? req.params.id;
  if (!parseStudentQuestionId(questionId)) {
    throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
  }

  const parsed = teacherQuestionPinBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid pin payload', parsed.error.flatten());
  }

  const result = await setTeacherQuestionPinned(req.user.id, questionId, parsed.data.pinned);
  if (result.kind === 'access_denied') {
    void logTeacherQuestionAccessDenied(req, { questionId, reason: 'pin_not_assigned' });
    throw new ApiError(403, 'You do not have access to this question', {
      code: 'QUESTION_ACCESS_DENIED',
    });
  }

  void logTeacherQuestionPinned(req, { questionId, pinned: parsed.data.pinned });
  sendSuccess(res, { id: Number(questionId), pinned: result.pinned });
});
