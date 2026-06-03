import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { logActivity } from '../services/activityLog.service.js';
import { createMcqQuestion, deleteQuestion as deleteQuestionService, getQuestionById, listQuestions, updateQuestion } from '../services/questions.service.js';
import { createQuestionBodySchema, updateQuestionBodySchema } from '../validators/questionWrite.schema.js';
import { questionListQuerySchema } from '../validators/questionList.schema.js';
import { parseQuestionIdParam } from '../validators/questionParams.schema.js';

const LOG_PREFIX = '[question-bank]';

function parseQuestionId(req) {
  const parsed = parseQuestionIdParam(req.params);
  if (!parsed.ok) {
    throw new ApiError(400, 'Invalid question id', { code: 'INVALID_QUESTION_ID', ...parsed.error });
  }
  return parsed.id;
}

export const postQuestion = asyncHandler(async (req, res) => {
  console.info(`${LOG_PREFIX} POST request received`, {
    path: req.originalUrl,
    course_id: req.body?.course_id ?? req.body?.courseId,
  });

  const parsed = createQuestionBodySchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn(`${LOG_PREFIX} POST validation failed`, parsed.error.flatten());
    throw new ApiError(422, 'Invalid question payload', parsed.error.flatten());
  }

  const createdBy = Number(req.user?.id);
  if (!Number.isFinite(createdBy) || createdBy <= 0) {
    throw new ApiError(401, 'Authenticated admin required', { code: 'UNAUTHORIZED' });
  }

  const created = await createMcqQuestion(parsed.data, createdBy);

  try {
    await logActivity({
      userId: createdBy,
      role: req.user?.role,
      action: 'admin.question.create',
      entityType: 'question_bank',
      entityId: String(created.question_id),
      metadata: {
        courseId: created.course_id,
        subjectId: created.subject_id,
        questionType: created.question_type,
      },
    });
  } catch (activityError) {
    console.error(`${LOG_PREFIX} activity log failed after successful create`, {
      question_id: created.question_id,
      message: activityError instanceof Error ? activityError.message : String(activityError),
      stack: activityError instanceof Error ? activityError.stack : undefined,
    });
  }

  console.info(`${LOG_PREFIX} POST completed`, { question_id: created.question_id });

  sendSuccess(
    res,
    {
      question_id: created.question_id,
      question: created,
    },
    201
  );
});

export const getQuestions = asyncHandler(async (req, res) => {
  console.info(`${LOG_PREFIX} GET list request received`, { path: req.originalUrl });

  const parsed = questionListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    console.warn(`${LOG_PREFIX} GET list validation failed`, parsed.error.flatten());
    throw new ApiError(422, 'Invalid question list query', parsed.error.flatten());
  }

  const data = await listQuestions(parsed.data);

  console.info(`${LOG_PREFIX} GET list completed`, {
    page: data.pagination.page,
    total: data.pagination.total,
    returned: data.items.length,
  });

  sendSuccess(res, data);
});

export const putQuestion = asyncHandler(async (req, res) => {
  const questionId = parseQuestionId(req);

  console.info(`${LOG_PREFIX} PUT request received`, {
    path: req.originalUrl,
    question_id: questionId,
  });

  const parsed = updateQuestionBodySchema.safeParse(req.body);
  if (!parsed.success) {
    console.warn(`${LOG_PREFIX} PUT validation failed`, parsed.error.flatten());
    throw new ApiError(422, 'Invalid question update payload', parsed.error.flatten());
  }

  const adminId = Number(req.user?.id);
  if (!Number.isFinite(adminId) || adminId <= 0) {
    throw new ApiError(401, 'Authenticated admin required', { code: 'UNAUTHORIZED' });
  }

  const question = await updateQuestion(questionId, parsed.data, adminId, req.user?.role);

  console.info(`${LOG_PREFIX} PUT completed`, { question_id: question.question_id });

  sendSuccess(res, { question });
});

export const getQuestion = asyncHandler(async (req, res) => {
  const questionId = parseQuestionId(req);

  console.info(`${LOG_PREFIX} GET request received`, {
    path: req.originalUrl,
    id: questionId,
  });

  const question = await getQuestionById(questionId);

  console.info(`${LOG_PREFIX} GET completed`, { question_id: question.question_id });

  sendSuccess(res, { question });
});

export const deleteQuestion = asyncHandler(async (req, res) => {
  const questionId = parseQuestionId(req);

  console.info(`${LOG_PREFIX} DELETE request received`, {
    path: req.originalUrl,
    question_id: questionId,
  });

  const adminId = Number(req.user?.id);
  if (!Number.isFinite(adminId) || adminId <= 0) {
    throw new ApiError(401, 'Authenticated admin required', { code: 'UNAUTHORIZED' });
  }

  const result = await deleteQuestionService(questionId, adminId);

  try {
    await logActivity({
      userId: adminId,
      role: req.user?.role,
      action: 'admin.question.delete',
      entityType: 'question_bank',
      entityId: String(result.question_id),
      metadata: {
        event: 'QUESTION_DELETED',
        questionId: result.question_id,
        adminId,
        deletedAt: result.deleted_at,
        deletedBy: result.deleted_by,
      },
    });
  } catch (activityError) {
    console.error(`${LOG_PREFIX} activity log failed after successful delete`, {
      question_id: result.question_id,
      message: activityError instanceof Error ? activityError.message : String(activityError),
      stack: activityError instanceof Error ? activityError.stack : undefined,
    });
  }

  console.info(`${LOG_PREFIX} DELETE completed`, { question_id: result.question_id });

  sendSuccess(res, {
    question_id: result.question_id,
    deleted: true,
  });
});
