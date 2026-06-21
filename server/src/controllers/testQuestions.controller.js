import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';
import { sendSuccess } from '../utils/httpEnvelope.js';
import { listComposedTestQuestionsAdmin } from '../services/testQuestionComposition.service.js';
import { assertTestReadAccess } from '../services/testMutationAccess.service.js';
import { parsePositiveTestIdParam } from '../validators/testRules.schema.js';

function parseTestIdParam(params) {
  const parsed = parsePositiveTestIdParam(params.testId);
  if (!parsed.ok) {
    throw new ApiError(400, 'Invalid test id', parsed.error);
  }
  return parsed.id;
}

/** Read-only — runtime composed questions for admin preview/details. */
export const getLinkedTestQuestions = asyncHandler(async (req, res) => {
  const testId = parseTestIdParam(req.params);
  await assertTestReadAccess(testId, req.user?.id, req.user?.role);
  const questions = await listComposedTestQuestionsAdmin(testId);
  sendSuccess(res, { testId, questions, total: questions.length });
});
