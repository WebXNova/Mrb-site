import { ApiError } from '../utils/apiError.js';
import { PHASE_1_QUESTION_TYPE } from '../validators/questionWrite.schema.js';
import { normalizeMcqOptionsForInsert } from '../validators/questionOptions.validation.js';

function invalidMcqPayload(message, code) {
  return new ApiError(422, message, { code });
}

/**
 * Server-side MCQ integrity checks — never trust client validation alone.
 * Frontend correctness is not trusted; validateOptions enforces A–D + single correct.
 */
export function assertMcqBusinessRules(payload) {
  if (!payload.question_text || String(payload.question_text).trim() === '') {
    throw invalidMcqPayload('question_text is required', 'INVALID_QUESTION_TEXT');
  }

  if (!Number.isFinite(payload.marks) || payload.marks <= 0) {
    throw invalidMcqPayload('marks must be greater than 0', 'INVALID_MARKS');
  }

  normalizeMcqOptionsForInsert(payload.options ?? []);
}

export function assertPhase1QuestionTypeSupported(questionType) {
  const normalized = String(questionType ?? PHASE_1_QUESTION_TYPE).trim().toLowerCase();
  if (normalized !== PHASE_1_QUESTION_TYPE) {
    throw invalidMcqPayload(
      'Phase 1 supports MCQ questions only. question_type must be "mcq".',
      'UNSUPPORTED_QUESTION_TYPE'
    );
  }
}

export function assertQuestionWriteBusinessRules(payload) {
  assertPhase1QuestionTypeSupported(payload.question_type);
  assertMcqBusinessRules({ ...payload, question_type: PHASE_1_QUESTION_TYPE, options: payload.options ?? [] });
}
