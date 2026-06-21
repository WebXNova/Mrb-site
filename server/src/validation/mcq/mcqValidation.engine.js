/**
 * Production MCQ validation engine — single source of truth.
 *
 * INTEGRATION POINTS:
 * - Autosave:     testQuizDraftValidation.service.js → validateMcqQuizDraftQuestion (context: autosave)
 * - Manual save:  questionOptions.validation.js + questionBankIntegrity.service.js (context: manual_save)
 * - Publish:      mcqPublishValidation.service.js (context: publish)
 *
 * No invalid MCQ may reach the database — callers must use assertValidMcq* before writes.
 */

import { sanitizeQuestionHtml } from '../../utils/questionHtmlSanitizer.js';
import { normalizeComparableHtmlText } from '../../utils/semanticHtmlContent.js';
import { normalizeOptionalQuestionImageUrl } from '../../utils/questionImageUrlValidation.js';
import {
  MCQ_ERROR_CODES,
  MCQ_MAX_OPTIONS,
  MCQ_MIN_OPTIONS,
  MCQ_OPTION_KEY_ALPHABET,
} from './mcqValidation.constants.js';
import { buildMcqValidationIssue } from './mcqValidation.messages.js';
import { McqValidationError } from './McqValidationError.js';

/**
 * @typedef {'question_bank' | 'quiz_draft'} McqInputFormat
 * @typedef {'autosave' | 'manual_save' | 'publish'} McqValidationContext
 *
 * @typedef {Object} McqValidationIssue
 * @property {string} code
 * @property {string} message
 * @property {string} [field]
 * @property {number} [optionIndex]
 * @property {string} [optionKey]
 *
 * @typedef {Object} McqValidationResult
 * @property {boolean} valid
 * @property {McqValidationIssue[]} errors
 * @property {object|null} normalized
 */

/**
 * @param {string} text
 * @param {boolean} stripHtml
 */
function normalizeComparableText(text, stripHtml) {
  if (stripHtml) {
    return normalizeComparableHtmlText(text, { sanitize: true });
  }
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * @param {string | null | undefined} rawUrl
 * @param {string} field
 * @param {string} errorCode
 * @param {McqValidationIssue[]} errors
 */
function validateImageUrl(rawUrl, field, errorCode, errors, allowArchivePaths = false) {
  if (rawUrl == null || String(rawUrl).trim() === '') {
    return null;
  }
  try {
    return normalizeOptionalQuestionImageUrl(rawUrl, field, { allowArchivePaths });
  } catch (error) {
    errors.push(
      buildMcqValidationIssue(errorCode, {
        field,
        imageCode: error.code || 'INVALID_IMAGE_URL',
      })
    );
    return null;
  }
}

/**
 * @param {unknown} raw
 * @param {number} index
 * @param {McqInputFormat} format
 */
function normalizeRawOption(raw, index, format) {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, index };
  }

  if (format === 'quiz_draft') {
    return {
      ok: true,
      row: {
        id: String(raw.id ?? `choice-${index}`),
        text: String(raw.text ?? ''),
        isCorrect: Boolean(raw.isCorrect ?? raw.is_correct),
        imageUrl: raw.imageUrl ?? raw.image_url ?? null,
      },
    };
  }

  const optionKey = String(raw.option_key ?? raw.key ?? MCQ_OPTION_KEY_ALPHABET[index] ?? '')
    .trim()
    .toUpperCase();
  return {
    ok: true,
    row: {
      option_key: optionKey,
      option_text: String(raw.option_text ?? raw.text ?? ''),
      is_correct: Boolean(raw.is_correct ?? raw.isCorrect),
      image_url: raw.image_url ?? raw.imageUrl ?? null,
      sort_order:
        raw.sort_order != null && Number.isFinite(Number(raw.sort_order))
          ? Number(raw.sort_order)
          : index,
    },
  };
}

/**
 * @param {unknown} options
 * @param {McqInputFormat} format
 * @param {boolean} stripHtml
 * @param {string} pathPrefix
 * @param {string|null} questionImageRaw
 * @param {McqValidationIssue[]} errors
 */
function validateOptionsList(options, format, stripHtml, pathPrefix, questionImageRaw, errors, allowArchivePaths = false) {
  if (!Array.isArray(options)) {
    errors.push(
      buildMcqValidationIssue(MCQ_ERROR_CODES.OPTIONS_NOT_ARRAY, {
        field: `${pathPrefix}.options`,
      })
    );
    return null;
  }

  if (options.length < MCQ_MIN_OPTIONS || options.length > MCQ_MAX_OPTIONS) {
    errors.push(
      buildMcqValidationIssue(MCQ_ERROR_CODES.INVALID_OPTION_COUNT, {
        field: `${pathPrefix}.options`,
        optionCount: options.length,
        min: MCQ_MIN_OPTIONS,
        max: MCQ_MAX_OPTIONS,
      })
    );
    return null;
  }

  const normalized = [];
  const textSeen = new Map();
  const keySeen = new Set();

  for (let index = 0; index < options.length; index += 1) {
    const parsed = normalizeRawOption(options[index], index, format);
    if (!parsed.ok) {
      errors.push(
        buildMcqValidationIssue(MCQ_ERROR_CODES.INVALID_OPTION_SHAPE, {
          field: `${pathPrefix}.options[${index}]`,
          optionIndex: index,
        })
      );
      continue;
    }

    const row = parsed.row;
    const optionFieldBase =
      format === 'quiz_draft'
        ? `${pathPrefix}.choices[${index}]`
        : `${pathPrefix}.options[${index}]`;

    const displayText = format === 'quiz_draft' ? row.text : row.option_text;
    const comparable = normalizeComparableText(displayText, stripHtml);
    if (!comparable) {
      errors.push(
        buildMcqValidationIssue(MCQ_ERROR_CODES.EMPTY_OPTION_TEXT, {
          field: `${optionFieldBase}.text`,
          optionIndex: index,
          optionKey: row.option_key,
        })
      );
    } else if (textSeen.has(comparable)) {
      errors.push(
        buildMcqValidationIssue(MCQ_ERROR_CODES.DUPLICATE_OPTION_TEXT, {
          field: `${optionFieldBase}.text`,
          optionIndex: index,
          optionKey: row.option_key,
          duplicateIndex: textSeen.get(comparable),
        })
      );
    } else {
      textSeen.set(comparable, index);
    }

    if (format === 'question_bank') {
      if (!MCQ_OPTION_KEY_ALPHABET.includes(row.option_key)) {
        errors.push(
          buildMcqValidationIssue(MCQ_ERROR_CODES.INVALID_OPTION_KEY, {
            field: `${optionFieldBase}.option_key`,
            optionIndex: index,
            optionKey: row.option_key,
          })
        );
      } else if (keySeen.has(row.option_key)) {
        errors.push(
          buildMcqValidationIssue(MCQ_ERROR_CODES.DUPLICATE_OPTION_KEY, {
            field: `${optionFieldBase}.option_key`,
            optionIndex: index,
            optionKey: row.option_key,
          })
        );
      } else {
        keySeen.add(row.option_key);
      }
    }

    const imageField =
      format === 'quiz_draft' ? `${optionFieldBase}.imageUrl` : `${optionFieldBase}.image_url`;
    const imageRaw = format === 'quiz_draft' ? row.imageUrl : row.image_url;
    const validatedImage = validateImageUrl(
      imageRaw,
      imageField,
      MCQ_ERROR_CODES.INVALID_OPTION_IMAGE_URL,
      errors,
      allowArchivePaths
    );

    if (format === 'quiz_draft') {
      normalized.push({
        ...row,
        text: stripHtml ? sanitizeQuestionHtml(row.text) : row.text.trim(),
        imageUrl: validatedImage,
      });
    } else {
      normalized.push({
        option_key: row.option_key || MCQ_OPTION_KEY_ALPHABET[index],
        option_text: stripHtml ? sanitizeQuestionHtml(row.option_text) : row.option_text.trim(),
        is_correct: row.is_correct,
        image_url: validatedImage,
        sort_order: row.sort_order,
      });
    }
  }

  const correctCount = normalized.filter((row) =>
    format === 'quiz_draft' ? row.isCorrect : row.is_correct
  ).length;

  if (correctCount === 0) {
    errors.push(
      buildMcqValidationIssue(MCQ_ERROR_CODES.NO_CORRECT_OPTION, {
        field: `${pathPrefix}.options`,
      })
    );
  } else if (correctCount > 1) {
    errors.push(
      buildMcqValidationIssue(MCQ_ERROR_CODES.MULTIPLE_CORRECT_OPTIONS, {
        field: `${pathPrefix}.options`,
        correctCount,
      })
    );
  }

  if (format === 'question_bank' && normalized.length > 0) {
    return normalized.map((row, index) => ({
      option_key: MCQ_OPTION_KEY_ALPHABET[index],
      option_text: row.option_text,
      image_url: row.image_url,
      is_correct: row.is_correct,
      sort_order: index,
    }));
  }

  return normalized;
}

/**
 * Validate a full MCQ question (text + options + images).
 *
 * @param {unknown} input
 * @param {{
 *   format?: McqInputFormat,
 *   context?: McqValidationContext,
 *   pathPrefix?: string,
 *   stripHtml?: boolean,
 *   requireQuestionText?: boolean,
 *   questionId?: number|null,
 * }} [options]
 * @returns {McqValidationResult}
 */
export function validateMcqQuestion(input, options = {}) {
  const format = options.format ?? 'question_bank';
  const context = options.context ?? 'manual_save';
  const pathPrefix = options.pathPrefix ?? 'question';
  const stripHtml = options.stripHtml ?? format === 'quiz_draft';
  const requireQuestionText = options.requireQuestionText ?? true;
  const allowArchivePaths = Boolean(options.allowArchivePaths);
  /** @type {McqValidationIssue[]} */
  const errors = [];

  if (typeof input !== 'object' || input === null) {
    errors.push(
      buildMcqValidationIssue(MCQ_ERROR_CODES.INVALID_OPTION_SHAPE, {
        field: pathPrefix,
      })
    );
    return { valid: false, errors, normalized: null };
  }

  const questionText = String(
    input.question_text ?? input.questionText ?? input.question_text_html ?? ''
  );
  const comparableQuestion = normalizeComparableText(questionText, stripHtml);
  if (requireQuestionText && !comparableQuestion) {
    errors.push(
      buildMcqValidationIssue(MCQ_ERROR_CODES.QUESTION_TEXT_REQUIRED, {
        field: format === 'quiz_draft' ? `${pathPrefix}.questionText` : `${pathPrefix}.question_text`,
      })
    );
  }

  const questionImageRaw =
    input.question_image_url ?? input.questionImageUrl ?? input.question_image ?? null;
  const optionsRaw = format === 'quiz_draft' ? input.choices ?? input.options : input.options;

  const normalizedOptions = validateOptionsList(
    optionsRaw,
    format,
    stripHtml,
    pathPrefix,
    questionImageRaw,
    errors,
    allowArchivePaths
  );

  const questionImageUrl = validateImageUrl(
    questionImageRaw,
    format === 'quiz_draft' ? `${pathPrefix}.questionImageUrl` : `${pathPrefix}.question_image_url`,
    MCQ_ERROR_CODES.INVALID_QUESTION_IMAGE_URL,
    errors,
    allowArchivePaths
  );

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      normalized: null,
      meta: { context, format, questionId: options.questionId ?? null },
    };
  }

  const sanitizedQuestionText = stripHtml
    ? sanitizeQuestionHtml(questionText)
    : questionText.trim();

  if (format === 'quiz_draft') {
    return {
      valid: true,
      errors: [],
      normalized: {
        questionText: sanitizedQuestionText,
        questionImageUrl,
        choices: normalizedOptions,
      },
      meta: { context, format, questionId: options.questionId ?? null },
    };
  }

  return {
    valid: true,
    errors: [],
    normalized: {
      question_text: sanitizedQuestionText,
      question_image_url: questionImageUrl,
      options: normalizedOptions,
    },
    meta: { context, format, questionId: options.questionId ?? null },
  };
}

/**
 * Validate options array only (question bank path).
 *
 * @param {unknown} options
 * @param {{ context?: McqValidationContext, pathPrefix?: string, stripHtml?: boolean }} [optionsConfig]
 */
export function validateMcqOptions(options, optionsConfig = {}) {
  return validateMcqQuestion(
    {
      question_text: 'options-only-validation',
      options,
    },
    {
      format: 'question_bank',
      context: optionsConfig.context ?? 'manual_save',
      pathPrefix: optionsConfig.pathPrefix ?? 'question',
      stripHtml: optionsConfig.stripHtml ?? false,
    }
  );
}

/**
 * Quiz Builder draft question adapter.
 *
 * @param {unknown} question
 * @param {number} index
 * @param {{ context?: McqValidationContext }} [options]
 */
export function validateMcqQuizDraftQuestion(question, index, options = {}) {
  if (!question || typeof question !== 'object') {
    return {
      valid: false,
      errors: [
        buildMcqValidationIssue(MCQ_ERROR_CODES.INVALID_OPTION_SHAPE, {
          field: `questions[${index}]`,
        }),
      ],
      normalized: null,
    };
  }

  const q = /** @type {Record<string, unknown>} */ (question);
  if (q.questionType !== 'multiple_choice' && q.questionType !== 'true_false') {
    return { valid: true, errors: [], normalized: null, skipped: true };
  }

  return validateMcqQuestion(question, {
    format: 'quiz_draft',
    context: options.context ?? 'autosave',
    pathPrefix: `questions[${index}]`,
    stripHtml: true,
  });
}

/**
 * @param {McqValidationResult} result
 * @param {{ context?: string, pathPrefix?: string, questionId?: number|null }} [meta]
 */
export function assertMcqValidationResult(result, meta = {}) {
  if (result.valid) {
    return result.normalized;
  }
  throw new McqValidationError(result.errors, {
    context: result.meta?.context ?? meta.context,
    pathPrefix: meta.pathPrefix,
    questionId: meta.questionId ?? result.meta?.questionId ?? null,
  });
}

/**
 * @param {unknown} input
 * @param {Parameters<typeof validateMcqQuestion>[1]} [options]
 */
export function assertValidMcqQuestion(input, options = {}) {
  return assertMcqValidationResult(validateMcqQuestion(input, options), options);
}

/**
 * @param {unknown} options
 * @param {Parameters<typeof validateMcqOptions>[1]} [optionsConfig]
 */
export function assertValidMcqOptions(options, optionsConfig = {}) {
  return assertMcqValidationResult(validateMcqOptions(options, optionsConfig), optionsConfig);
}
