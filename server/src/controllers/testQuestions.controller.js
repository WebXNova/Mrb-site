import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from '../services/activityLog.service.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import {
  linkQuestionToTest,
  linkQuestionsToTestBulk,
  listAvailableQuestionsForTest,
  listLinkedTestQuestionsAdmin,
  reorderTestQuestions,
  unlinkQuestionFromTest,
  unlinkQuestionsFromTestBulk,
} from '../services/testQuestionLink.service.js';
import {
  assertBulkLinkWhitelist,
  assertBulkUnlinkWhitelist,
  availableTestQuestionsQuerySchema,
  bulkLinkQuestionsBodySchema,
  bulkUnlinkQuestionsBodySchema,
  linkQuestionToTestBodySchema,
  parsePositiveQuestionIdParam,
  parsePositiveTestId,
  reorderTestQuestionsBodySchema,
} from '../validators/testQuestionLink.schema.js';

function parseTestIdParam(params) {
  const parsed = parsePositiveTestId(params.testId);
  if (!parsed.ok) {
    throw new ApiError(400, 'Invalid test id', parsed.error);
  }
  return parsed.id;
}

function parseQuestionIdParam(params) {
  const parsed = parsePositiveQuestionIdParam(params.questionId);
  if (!parsed.ok) {
    throw new ApiError(400, 'Invalid question id', parsed.error);
  }
  return parsed.id;
}

export const getLinkedTestQuestions = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  const questions = await listLinkedTestQuestionsAdmin(testId);
  sendSuccess(res, { testId, questions, total: questions.length });
});

export const getAvailableTestQuestions = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  const parsed = availableTestQuestionsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid available questions query', parsed.error.flatten());
  }
  const result = await listAvailableQuestionsForTest(testId, parsed.data);
  sendSuccess(res, result);
});

export const postLinkTestQuestion = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);

  if (req.body && typeof req.body === 'object' && Array.isArray(req.body.question_ids)) {
    const whitelist = assertBulkLinkWhitelist(req.body);
    if (!whitelist.ok) {
      throw new ApiError(422, whitelist.error, { code: 'VALIDATION_ERROR', unknownKeys: whitelist.unknownKeys });
    }

    const parsed = bulkLinkQuestionsBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(422, 'Invalid bulk link payload', parsed.error.flatten());
    }

    const result = await linkQuestionsToTestBulk(testId, parsed.data.question_ids);

    await logActivity({
      userId: req.user?.id,
      role: req.user?.role,
      action: 'admin.test.questions.link_bulk',
      entityType: 'test',
      entityId: String(testId),
      metadata: {
        testId,
        added: result.added,
        skippedDuplicates: result.skipped_duplicates,
        questionIds: result.linkedQuestionIds,
      },
    });

    sendSuccess(res, result, 201);
    return;
  }

  const parsed = linkQuestionToTestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid link question payload', parsed.error.flatten());
  }

  const linked = await linkQuestionToTest(testId, parsed.data);

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.question.link',
    entityType: 'test_question',
    entityId: String(linked.linkId),
    metadata: {
      testId,
      questionId: linked.questionId,
      displayOrder: linked.displayOrder,
    },
  });

  sendSuccess(res, linked, 201);
});

export const deleteBulkUnlinkTestQuestions = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);

  const whitelist = assertBulkUnlinkWhitelist(req.body);
  if (!whitelist.ok) {
    throw new ApiError(422, whitelist.error, { code: 'VALIDATION_ERROR', unknownKeys: whitelist.unknownKeys });
  }

  const parsed = bulkUnlinkQuestionsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid bulk unlink payload', parsed.error.flatten());
  }

  const result = await unlinkQuestionsFromTestBulk(testId, parsed.data.question_ids);

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.questions.unlink_bulk',
    entityType: 'test',
    entityId: String(testId),
    metadata: {
      testId,
      removed: result.removed,
      questionIds: result.questionIds,
    },
  });

  sendSuccess(res, result);
});

export const deleteUnlinkTestQuestion = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  const questionId = parseQuestionIdParam(req.params);

  const result = await unlinkQuestionFromTest(testId, questionId);

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.question.unlink',
    entityType: 'test_question',
    entityId: String(questionId),
    metadata: { testId, questionId },
  });

  sendSuccess(res, result);
});

export const putReorderTestQuestions = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  const parsed = reorderTestQuestionsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(422, 'Invalid reorder payload', parsed.error.flatten());
  }

  const questions = await reorderTestQuestions(testId, parsed.data);

  await logActivity({
    userId: req.user?.id,
    role: req.user?.role,
    action: 'admin.test.question.reorder',
    entityType: 'test',
    entityId: String(testId),
    metadata: { testId, count: questions.length },
  });

  sendSuccess(res, { testId, questions, total: questions.length });
});
