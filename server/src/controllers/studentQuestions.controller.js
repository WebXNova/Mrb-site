import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import {
  getStudentQuestionDetailForStudent,
  listStudentQuestionsForStudent,
  parseStudentQuestionId,
} from '../services/studentQuestionStudentView.service.js';
import {
  listStudentQuestionThreads,
  openStudentQuestionThread,
  resolveStudentThreadIdFromQuestion,
} from '../services/studentQuestionThreads.service.js';
import { getStudentQuestionFormContext } from '../services/studentQuestionFormContext.service.js';
import { createStudentQuestionSecure } from '../services/studentQuestionCreate.service.js';
import { studentQuestionCreateBodySchema } from '../validators/studentQuestionCreate.schema.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { getClientIp } from '../utils/network.js';
import { assertEntitlementGrantable } from '../services/entitlement.service.js';
import { resolveRequestEntitlement } from '../security/cee/requireEntitlement.js';
import { rejectClientTeacherRouting } from '../services/teacherAssignment.service.js';
import { logStudentQuestionSecurityEvent } from '../services/studentQuestionSecurityAudit.service.js';
import {
  logStudentQuestionDetailViewed,
  logStudentQuestionListViewed,
  logStudentQuestionViewDenied,
} from '../services/studentQuestionViewAudit.service.js';

const FORBIDDEN_IDENTITY_FIELDS = Object.freeze([
  'courseId',
  'course_id',
  'userId',
  'user_id',
  'enrollmentId',
  'enrollment_id',
]);

function rejectTamperedIdentityFields(req) {
  const body = req.body;
  if (!body || typeof body !== 'object') return;
  for (const key of FORBIDDEN_IDENTITY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      void logStudentQuestionSecurityEvent(req, {
        action: 'student.question.security.tampering',
        code: 'FORBIDDEN_FIELD',
        reason: `Client supplied forbidden field: ${key}`,
        metadata: { field: key },
      });
      throw new ApiError(422, 'Invalid question payload', {
        code: 'FORBIDDEN_FIELD',
        details: { field: key },
      });
    }
  }
}

function rejectLegacySubjectSlug(req) {
  if (req.body?.subject != null && req.body?.subjectId == null) {
    void logStudentQuestionSecurityEvent(req, {
      action: 'student.question.security.legacy_rejected',
      code: 'LEGACY_SUBJECT_REJECTED',
      reason: 'Legacy subject slug rejected; subjectId required',
    });
    throw new ApiError(422, 'subjectId is required. Legacy subject slugs are no longer accepted.', {
      code: 'LEGACY_SUBJECT_REJECTED',
    });
  }
}

export const getStudentQuestionThreads = asyncHandler(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const search = typeof req.query.search === 'string' ? req.query.search : '';
  const data = await listStudentQuestionThreads(req.user.id, { status, search });
  void logStudentQuestionListViewed(req, { count: data.items.length, view: 'threads' });
  sendSuccess(res, data);
});

export const getStudentQuestionThreadById = asyncHandler(async (req, res) => {
  const threadId = String(req.params.threadId || '').trim();
  if (!threadId) {
    throw new ApiError(404, 'Conversation not found', { code: 'THREAD_NOT_FOUND' });
  }

  const result = await openStudentQuestionThread(req.user.id, threadId);
  if (result.kind === 'invalid_id' || result.kind === 'access_denied') {
    void logStudentQuestionViewDenied(req, { threadId, reason: 'thread_not_owned' });
    throw new ApiError(404, 'Conversation not found', { code: 'THREAD_NOT_FOUND' });
  }

  void logStudentQuestionDetailViewed(req, {
    threadId,
    messageCount: result.thread.messages.length,
  });
  sendSuccess(res, result.thread);
});

export const getStudentQuestionThreadId = asyncHandler(async (req, res) => {
  const questionId = req.params.id;
  if (!parseStudentQuestionId(questionId)) {
    throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
  }

  const threadId = await resolveStudentThreadIdFromQuestion(req.user.id, questionId);
  if (!threadId) {
    void logStudentQuestionViewDenied(req, { questionId, reason: 'thread_resolve_denied' });
    throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
  }

  sendSuccess(res, { threadId });
});

export const getStudentQuestions = asyncHandler(async (req, res) => {
  const data = await listStudentQuestionsForStudent(req.user.id);
  void logStudentQuestionListViewed(req, { count: data.length });
  sendSuccess(res, data);
});

export const getStudentQuestionFormContextHandler = asyncHandler(async (req, res) => {
  const data = await getStudentQuestionFormContext(req.user.id);
  sendSuccess(res, data);
});

export const postStudentQuestion = asyncHandler(async (req, res) => {
  rejectTamperedIdentityFields(req);
  try {
    rejectClientTeacherRouting(req.body);
  } catch (error) {
    if (error instanceof ApiError) {
      void logStudentQuestionSecurityEvent(req, {
        action: 'student.question.security.tampering',
        code: error.code ?? 'TEACHER_ROUTING_FORBIDDEN',
        reason: 'Client attempted teacher routing override',
        metadata: { details: error.details ?? null },
      });
    }
    throw error;
  }
  rejectLegacySubjectSlug(req);

  const parsed = studentQuestionCreateBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid question payload', parsed.error.flatten());
  }

  const entitlement = resolveRequestEntitlement(req);
  if (!entitlement?.courseId) {
    throw new ApiError(403, 'Active course enrollment required', { code: 'ENTITLEMENT_REQUIRED' });
  }
  assertEntitlementGrantable(entitlement, {
    userId: Number(req.user.id),
    courseId: Number(entitlement.courseId),
  });

  const created = await createStudentQuestionSecure(
    req.user.id,
    {
      subjectId: parsed.data.subjectId,
      body: parsed.data.body,
      imageUrl: parsed.data.imageUrl ?? undefined,
      audioUrl: parsed.data.audioUrl ?? undefined,
    },
    {
      entitlement,
      req,
      authContext: {
        clientIp: getClientIp(req),
        userAgent: req.get('user-agent') || null,
      },
    }
  );
  const studentView = await getStudentQuestionDetailForStudent(req.user.id, created.id);
  if (!studentView) {
    throw new ApiError(500, 'Question was created but could not be loaded', { code: 'CREATE_LOAD_FAILED' });
  }
  sendSuccess(res, studentView, 201);
});

export const getStudentQuestionById = asyncHandler(async (req, res) => {
  const questionId = req.params.id;
  if (!parseStudentQuestionId(questionId)) {
    void logStudentQuestionViewDenied(req, { questionId, reason: 'invalid_id' });
    throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
  }
  const row = await getStudentQuestionDetailForStudent(req.user.id, questionId);
  if (!row) {
    void logStudentQuestionViewDenied(req, { questionId, reason: 'not_owned_or_missing' });
    throw new ApiError(404, 'Question not found', { code: 'QUESTION_NOT_FOUND' });
  }
  void logStudentQuestionDetailViewed(req, {
    questionId,
    status: row.status,
    hasReply: row.hasReply,
  });
  sendSuccess(res, row);
});
