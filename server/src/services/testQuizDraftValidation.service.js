import { AppError } from '../errors/base/AppError.js';
import {
  PAYLOAD_TOO_LARGE,
  VALIDATION_ERROR,
} from '../errors/codes/ErrorCodes.js';
import { McqValidationError } from '../validation/mcq/McqValidationError.js';
import { validateMcqQuizDraftQuestion } from '../validation/mcq/mcqValidation.engine.js';
import { sanitizeQuestionHtml } from '../utils/questionHtmlSanitizer.js';
import { isSemanticallyEmptyHtml } from '../utils/semanticHtmlContent.js';
import {
  QUIZ_DRAFT_MAX_PAYLOAD_BYTES,
  QUIZ_DRAFT_MIN_POINTS,
  quizDraftPayloadSchema,
  upsertTestQuizDraftBodySchema,
} from '../validators/testQuizDraft.schema.js';
import { isQuizDraftSection } from '../utils/quizDraftItems.js';

function validationError(message, metadata = {}) {
  return new AppError({
    message,
    errorCode: VALIDATION_ERROR,
    httpStatus: 422,
    isOperational: true,
    metadata,
  });
}

/**
 * @param {unknown} rawBody
 */
export function parseUpsertTestQuizDraftBody(rawBody) {
  const parsed = upsertTestQuizDraftBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    throw validationError('Invalid quiz draft payload.', { issues: parsed.error.flatten() });
  }
  return parsed.data;
}

/**
 * @param {number} testId
 * @param {import('zod').infer<typeof quizDraftPayloadSchema>} draftPayload
 */
export function assertDraftPayloadMatchesTest(testId, draftPayload) {
  if (Number(draftPayload.testId) !== Number(testId)) {
    throw validationError('draftPayload.testId must match the test id in the URL.', {
      testId,
      payloadTestId: draftPayload.testId,
    });
  }
}

/**
 * @param {string} text
 */
function sanitizeDraftHtml(text) {
  const sanitized = sanitizeQuestionHtml(text);
  return sanitized ?? '';
}

/**
 * @param {number} points
 * @param {string} prefix
 */
function assertPositiveQuestionPoints(points, prefix) {
  const value = Number(points);
  if (!Number.isFinite(value) || value < QUIZ_DRAFT_MIN_POINTS) {
    throw validationError(`${prefix}: points must be at least ${QUIZ_DRAFT_MIN_POINTS}.`, {
      field: `${prefix}.points`,
      points: value,
    });
  }
}

/**
 * @param {import('zod').infer<typeof quizDraftPayloadSchema>['questions'][number]} item
 * @param {number} index
 * @param {'autosave' | 'manual_save'} context
 */
function sanitizeDraftItem(item, index, context) {
  if (isQuizDraftSection(item)) {
    return {
      ...item,
      itemType: 'section',
      subjectId: Number.isInteger(Number(item.subjectId)) && Number(item.subjectId) > 0
        ? Number(item.subjectId)
        : null,
      subjectLabel: String(item.subjectLabel ?? item.label ?? '').trim().slice(0, 200),
      collapsed: Boolean(item.collapsed),
      showDividerContent: Boolean(item.showDividerContent ?? item.showDividerContent),
      dividerContentHtml: sanitizeDraftHtml(
        String(item.dividerContentHtml ?? item.dividerContentHtml ?? '')
      ),
    };
  }

  validateQuestionSemantics(item, index, context);

  if (item.questionType === 'multiple_choice' || item.questionType === 'true_false') {
    const mcqResult = validateMcqQuizDraftQuestion(item, index, { context });
    const normalized = mcqResult.normalized;
    return {
      ...item,
      title: sanitizeDraftHtml(item.title),
      questionText: normalized?.questionText ?? sanitizeDraftHtml(item.questionText),
      explanation: sanitizeDraftHtml(item.explanation),
      tip: sanitizeDraftHtml(String(item.tip ?? '')),
      questionImageUrl: normalized?.questionImageUrl ?? item.questionImageUrl ?? null,
      choices: (normalized?.choices ?? item.choices).map((choice) => ({
        ...choice,
        text: choice.text,
      })),
    };
  }

  return {
    ...item,
    title: sanitizeDraftHtml(item.title),
    questionText: sanitizeDraftHtml(item.questionText),
    explanation: sanitizeDraftHtml(item.explanation),
    tip: sanitizeDraftHtml(String(item.tip ?? '')),
    choices: item.choices.map((choice) => ({
      ...choice,
      text: sanitizeDraftHtml(choice.text),
    })),
  };
}

/**
 * @param {import('zod').infer<typeof quizDraftPayloadSchema>['questions'][number]} question
 * @param {number} index
 * @param {'autosave' | 'manual_save'} context
 */
function validateQuestionSemantics(question, index, context) {
  const prefix = `questions[${index}]`;
  assertPositiveQuestionPoints(question.points, prefix);

  if (question.questionType === 'multiple_choice' || question.questionType === 'true_false') {
    const mcqResult = validateMcqQuizDraftQuestion(question, index, { context });
    if (!mcqResult.skipped && !mcqResult.valid) {
      throw new McqValidationError(mcqResult.errors, {
        context,
        pathPrefix: prefix,
      });
    }
    return;
  }

  if (question.questionType === 'multiple_response') {
    const correctCount = question.choices.filter((choice) => choice.isCorrect).length;
    if (correctCount < 1) {
      throw validationError(`${prefix}: multiple_response requires at least one correct choice.`);
    }
  }

  const choiceIds = new Set();
  for (const [choiceIndex, choice] of question.choices.entries()) {
    if (choiceIds.has(choice.id)) {
      throw validationError(`${prefix}.choices[${choiceIndex}]: duplicate choice id.`, {
        choiceId: choice.id,
      });
    }
    choiceIds.add(choice.id);

    const sanitizedText = sanitizeDraftHtml(choice.text);
    if (isSemanticallyEmptyHtml(sanitizedText, { sanitize: false })) {
      throw validationError(`${prefix}.choices[${choiceIndex}]: choice text is required.`);
    }
  }

  const sanitizedQuestionText = sanitizeDraftHtml(question.questionText);
  if (isSemanticallyEmptyHtml(sanitizedQuestionText, { sanitize: false })) {
    throw validationError(`${prefix}: questionText is required.`);
  }
}

/**
 * Sanitize HTML fields and enforce MCQ engine rules before persistence (autosave).
 *
 * @param {number} testId
 * @param {import('zod').infer<typeof quizDraftPayloadSchema>} draftPayload
 * @param {{ context?: 'autosave' | 'manual_save' }} [options]
 */
export function validateAndSanitizeQuizDraftPayload(testId, draftPayload, options = {}) {
  const context = options.context ?? 'autosave';
  assertDraftPayloadMatchesTest(testId, draftPayload);

  const serialized = JSON.stringify(draftPayload);
  if (Buffer.byteLength(serialized, 'utf8') > QUIZ_DRAFT_MAX_PAYLOAD_BYTES) {
    throw new AppError({
      message: 'Quiz draft payload is too large.',
      errorCode: PAYLOAD_TOO_LARGE,
      httpStatus: 413,
      isOperational: true,
      metadata: { maxBytes: QUIZ_DRAFT_MAX_PAYLOAD_BYTES },
    });
  }

  const seenQuestionIds = new Set();
  const questions = draftPayload.questions.map((item, index) => {
    if (seenQuestionIds.has(item.id)) {
      throw validationError(`questions[${index}]: duplicate item id.`, { itemId: item.id });
    }
    seenQuestionIds.add(item.id);
    return sanitizeDraftItem(item, index, context);
  });

  const totalPoints = questions.reduce(
    (sum, item) => sum + (isQuizDraftSection(item) ? 0 : Number(item.points)),
    0
  );
  const savedAt = new Date().toISOString();

  return {
    version: draftPayload.version,
    testId: Number(testId),
    storageKey: draftPayload.storageKey ?? String(testId),
    questions,
    totalPoints,
    savedAt,
  };
}
