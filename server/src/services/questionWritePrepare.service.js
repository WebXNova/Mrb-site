import { applyQuestionWriteSecurity } from '../security/questionContentSecurity.js';
import { createQuestionBodySchema, PHASE_1_QUESTION_TYPE, MAX_OPTION_TEXT_LENGTH, MAX_QUESTION_TEXT_LENGTH, MAX_QUESTION_EXPLANATION_LENGTH } from '../validators/questionWrite.schema.js';
import {
  assertPhase1QuestionTypeSupported,
  assertQuestionWriteBusinessRules,
} from './questionWriteRules.js';
import { validateQuestionIntegrity } from './questionBankIntegrity.service.js';
import { MCQ_OPTION_KEYS } from '../validation/mcq/mcqValidation.constants.js';
import { ApiError } from '../utils/apiError.js';
import {
  AIKEN_IMPORT_VALIDATION_LAYERS,
  extractQuestionWriteValidationFailure,
  normalizeImportErrorCode,
} from './aikenImportDiagnostics.js';

/**
 * @param {import('zod').ZodIssue} issue
 * @returns {{ code: string, message: string }}
 */
function mapZodIssueToImportFailure(issue) {
  const path = Array.isArray(issue.path) ? issue.path : [];
  const msg = String(issue.message ?? 'Question payload is invalid.');
  const pathKey = path.map(String).join('.');

  if (path[0] === 'options' && path[2] === 'option_text' && /exceed|maximum|max/i.test(msg)) {
    const optionIndex = Number(path[1]);
    const optionKey = MCQ_OPTION_KEYS[optionIndex] || `option ${optionIndex + 1}`;
    return {
      code: 'INVALID_OPTION_LENGTH',
      message: `Option ${optionKey} exceeds maximum length (${MAX_OPTION_TEXT_LENGTH} characters).`,
    };
  }

  if (path[0] === 'question_text' && /exceed|maximum|max/i.test(msg)) {
    return {
      code: 'INVALID_QUESTION_TEXT_LENGTH',
      message: `Question text exceeds maximum length (${MAX_QUESTION_TEXT_LENGTH} characters).`,
    };
  }

  if (path[0] === 'explanation' && /exceed|maximum|max/i.test(msg)) {
    return {
      code: 'INVALID_EXPLANATION_LENGTH',
      message: `Explanation exceeds maximum length (${MAX_QUESTION_EXPLANATION_LENGTH} characters).`,
    };
  }

  if (path[0] === 'topic' && /exceed|maximum|max/i.test(msg)) {
    return {
      code: 'INVALID_TOPIC_LENGTH',
      message: 'Topic exceeds maximum length.',
    };
  }

  if (path[0] === 'marks') {
    return {
      code: 'INVALID_MARKS',
      message: 'Marks must be greater than 0.',
    };
  }

  if (path[0] === 'options' && /exactly|required/i.test(msg)) {
    return {
      code: 'INVALID_OPTION_COUNT',
      message: 'Exactly 4 options (A–D) are required.',
    };
  }

  if (pathKey.includes('options') && /correct/i.test(msg)) {
    return {
      code: 'INVALID_CORRECT_OPTION',
      message: 'Exactly one option must be marked as correct.',
    };
  }

  if (path[0] === 'question_text' && /required/i.test(msg)) {
    return {
      code: 'MISSING_QUESTION_TEXT',
      message: 'Question text is required.',
    };
  }

  if (path[0] === 'options' && path[2] === 'option_text' && /required/i.test(msg)) {
    const optionIndex = Number(path[1]);
    const optionKey = MCQ_OPTION_KEYS[optionIndex] || `option ${optionIndex + 1}`;
    return {
      code: 'EMPTY_OPTION_TEXT',
      message: `Option ${optionKey} text is required.`,
    };
  }

  return {
    code: 'INVALID_PAYLOAD',
    message: msg,
  };
}

/**
 * @param {import('zod').SafeParseReturnType<unknown, unknown>} parsed
 * @returns {{ code: string, message: string }}
 */
function mapZodSchemaFailure(parsed) {
  if (parsed.success) {
    return { code: 'INVALID_PAYLOAD', message: 'Question payload is invalid.' };
  }

  const issues = parsed.error?.issues ?? [];
  if (issues.length > 0) {
    return mapZodIssueToImportFailure(issues[0]);
  }

  const flattened = parsed.error.flatten();
  const fieldMessages = Object.values(flattened.fieldErrors ?? {}).flat();
  if (fieldMessages.length > 0) {
    return { code: 'INVALID_PAYLOAD', message: String(fieldMessages[0]) };
  }

  const formMessages = flattened.formErrors ?? [];
  if (formMessages.length > 0) {
    return { code: 'INVALID_PAYLOAD', message: String(formMessages[0]) };
  }

  return { code: 'INVALID_PAYLOAD', message: 'Question payload is invalid.' };
}

export { extractQuestionWriteValidationFailure } from './aikenImportDiagnostics.js';

/**
 * Shared write validation pipeline used by manual create, Aiken import, and preview.
 *
 * @param {unknown} payload
 * @returns {{
 *   ok: true,
 *   payload: Record<string, unknown>,
 *   normalizedOptions: Array<Record<string, unknown>>,
 * } | {
 *   ok: false,
 *   code: string,
 *   message: string,
 *   validationLayer: string,
 * }}
 */
export function validateQuestionWritePayload(payload, options = {}) {
  const schemaResult = createQuestionBodySchema.safeParse(payload);
  if (!schemaResult.success) {
    const failure = mapZodSchemaFailure(schemaResult);
    return {
      ok: false,
      code: normalizeImportErrorCode(failure.code),
      message: failure.message,
      validationLayer: AIKEN_IMPORT_VALIDATION_LAYERS.SCHEMA,
    };
  }

  let secured;
  try {
    secured = applyQuestionWriteSecurity(schemaResult.data, options);
  } catch (error) {
    const failure = extractQuestionWriteValidationFailure(error);
    return {
      ok: false,
      ...failure,
      validationLayer: AIKEN_IMPORT_VALIDATION_LAYERS.SECURITY,
    };
  }

  try {
    assertPhase1QuestionTypeSupported(secured.question_type);
    assertQuestionWriteBusinessRules({ ...secured, question_type: PHASE_1_QUESTION_TYPE });
  } catch (error) {
    const failure = extractQuestionWriteValidationFailure(error);
    return {
      ok: false,
      ...failure,
      validationLayer: AIKEN_IMPORT_VALIDATION_LAYERS.BUSINESS_RULES,
    };
  }

  try {
    const { options: normalizedOptions } = validateQuestionIntegrity(secured, secured.options, {
      operation: 'create',
      allowArchivePaths: Boolean(options.allowArchivePaths),
    });

    return {
      ok: true,
      payload: { ...secured, options: normalizedOptions },
      normalizedOptions,
    };
  } catch (error) {
    const failure = extractQuestionWriteValidationFailure(error);
    return {
      ok: false,
      ...failure,
      validationLayer: AIKEN_IMPORT_VALIDATION_LAYERS.MCQ_INTEGRITY,
    };
  }
}

/**
 * @param {unknown} payload
 * @throws {ApiError}
 */
export function assertQuestionWritePayloadValid(payload) {
  const result = validateQuestionWritePayload(payload);
  if (!result.ok) {
    throw new ApiError(422, result.message, { code: result.code });
  }
  return result;
}
