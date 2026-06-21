import { ApiError } from '../utils/apiError.js';
import { McqValidationError } from '../validation/mcq/McqValidationError.js';
import { AppError } from '../errors/base/AppError.js';
import { MCQ_ERROR_CODES, MCQ_OPTION_KEYS } from '../validation/mcq/mcqValidation.constants.js';

/** Validation layers surfaced to teachers/admins. */
export const AIKEN_IMPORT_VALIDATION_LAYERS = Object.freeze({
  AIKEN_PARSE: 'aiken_parse',
  AIKEN_VALIDATION: 'aiken_validation',
  SCHEMA: 'schema',
  SECURITY: 'security',
  BUSINESS_RULES: 'business_rules',
  MCQ_INTEGRITY: 'mcq_integrity',
  PERSISTENCE: 'persistence',
  DUPLICATE_DETECTION: 'duplicate_detection',
});

/** Client-safe persistence error codes (no SQL internals). */
export const AIKEN_IMPORT_PERSISTENCE_CODES = Object.freeze({
  COURSE_NOT_FOUND: 'COURSE_NOT_FOUND',
  SUBJECT_NOT_FOUND: 'SUBJECT_NOT_FOUND',
  IMPORT_PERSIST_FAILED: 'IMPORT_PERSIST_FAILED',
  CORRECT_OPTION_INTEGRITY_FAILED: 'CORRECT_OPTION_INTEGRITY_FAILED',
  QUESTION_INSERT_FAILED: 'QUESTION_INSERT_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
});

const QUESTION_TITLE_MAX_LENGTH = 80;

const MYSQL_ERROR_PREFIX = /^ER_/;

/**
 * @param {unknown} text
 * @param {number} [maxLength]
 */
export function truncateQuestionTitle(text, maxLength = QUESTION_TITLE_MAX_LENGTH) {
  const trimmed = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!trimmed) {
    return '(untitled)';
  }
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

/**
 * Normalize MCQ engine codes to import-facing codes (e.g. MCQ_DUPLICATE_OPTION_TEXT → DUPLICATE_OPTION_TEXT).
 * @param {unknown} code
 */
export function normalizeImportErrorCode(code) {
  const raw = String(code ?? '').trim();
  if (!raw) {
    return 'INVALID_PAYLOAD';
  }
  if (raw.startsWith('MCQ_')) {
    return raw.slice(4);
  }
  return raw;
}

/**
 * @param {unknown} error
 * @returns {string|null}
 */
function formatMcqImportMessage(error) {
  if (!(error instanceof McqValidationError)) {
    return null;
  }

  const issue = error.issues?.[0];
  if (!issue) {
    return null;
  }

  const optionKey =
    issue.optionKey ||
    (issue.optionIndex != null ? MCQ_OPTION_KEYS[issue.optionIndex] : null);
  const duplicateKey =
    issue.duplicateIndex != null ? MCQ_OPTION_KEYS[issue.duplicateIndex] : null;

  switch (issue.code) {
    case MCQ_ERROR_CODES.DUPLICATE_OPTION_TEXT:
      if (duplicateKey && optionKey) {
        return `Options ${duplicateKey} and ${optionKey} are identical.`;
      }
      break;
    case MCQ_ERROR_CODES.EMPTY_OPTION_TEXT:
      if (optionKey) {
        return `Option ${optionKey} text cannot be empty.`;
      }
      break;
    case MCQ_ERROR_CODES.DUPLICATE_OPTION_KEY:
      if (optionKey) {
        return `Option label ${optionKey} is duplicated.`;
      }
      break;
    case MCQ_ERROR_CODES.INVALID_OPTION_KEY:
      if (optionKey) {
        return `Option ${optionKey} has an invalid label.`;
      }
      break;
    case MCQ_ERROR_CODES.NO_CORRECT_OPTION:
      return 'No correct answer is marked.';
    case MCQ_ERROR_CODES.MULTIPLE_CORRECT_OPTIONS:
      return 'More than one option is marked as correct.';
    default:
      break;
  }

  return issue.message || error.message;
}

/**
 * @param {unknown} error
 * @returns {{ code: string, message: string }}
 */
export function extractQuestionWriteValidationFailure(error) {
  const mcqMessage = formatMcqImportMessage(error);
  if (mcqMessage && error instanceof McqValidationError) {
    const primary = error.issues?.[0];
    return {
      code: normalizeImportErrorCode(primary?.code || error.errorCode),
      message: mcqMessage,
    };
  }

  if (error instanceof ApiError) {
    return {
      code: normalizeImportErrorCode(error.code || 'INVALID_PAYLOAD'),
      message: error.message,
    };
  }

  if (error instanceof AppError) {
    return {
      code: normalizeImportErrorCode(error.errorCode || 'INVALID_PAYLOAD'),
      message: error.message,
    };
  }

  if (error && typeof error === 'object' && 'code' in error && error.code) {
    return {
      code: normalizeImportErrorCode(String(error.code)),
      message: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    code: 'INVALID_PAYLOAD',
    message: 'Question validation failed.',
  };
}

/**
 * Map DB/persistence failures to safe client messages (no stack traces or SQL).
 * @param {unknown} error
 */
export function sanitizePersistenceImportFailure(error) {
  if (error instanceof ApiError && error.code) {
    const code = normalizeImportErrorCode(error.code);
    if (Object.values(AIKEN_IMPORT_PERSISTENCE_CODES).includes(code)) {
      return { code, message: error.message };
    }
    return {
      code: AIKEN_IMPORT_PERSISTENCE_CODES.IMPORT_PERSIST_FAILED,
      message: error.message,
    };
  }

  if (error instanceof AppError && error.isOperational) {
    return {
      code: normalizeImportErrorCode(error.errorCode),
      message: error.message,
    };
  }

  const errno = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (MYSQL_ERROR_PREFIX.test(errno)) {
    return {
      code: AIKEN_IMPORT_PERSISTENCE_CODES.IMPORT_PERSIST_FAILED,
      message: 'Could not save this question to the question bank.',
    };
  }

  return {
    code: AIKEN_IMPORT_PERSISTENCE_CODES.IMPORT_PERSIST_FAILED,
    message: 'Could not save this question to the question bank.',
  };
}

/**
 * @param {{
 *   questionNumber: number,
 *   lineNumber?: number | null,
 *   questionTitle?: string | null,
 *   errorCode: string,
 *   message: string,
 *   validationLayer: string,
 * }} input
 */
export function buildAikenImportDiagnostic({
  questionNumber,
  lineNumber = null,
  questionTitle = null,
  errorCode,
  message,
  validationLayer,
}) {
  const normalizedCode = normalizeImportErrorCode(errorCode);
  const safeMessage = String(message ?? '').trim() || 'Validation failed.';
  const normalizedLine =
    lineNumber != null && Number.isFinite(Number(lineNumber)) && Number(lineNumber) > 0
      ? Number(lineNumber)
      : null;

  return {
    questionNumber,
    lineNumber: normalizedLine,
    questionTitle: truncateQuestionTitle(questionTitle),
    errorCode: normalizedCode,
    message: safeMessage,
    validationLayer,
    /** @deprecated Use errorCode — kept for existing clients */
    reason: normalizedCode,
  };
}

/**
 * API-facing error shape for import responses.
 *
 * @param {ReturnType<typeof buildAikenImportDiagnostic>} diagnostic
 */
export function mapDiagnosticToStructuredError(diagnostic) {
  return {
    index: Number(diagnostic.questionNumber) || 0,
    lineNumber: diagnostic.lineNumber ?? null,
    message: diagnostic.message,
    type: diagnostic.errorCode || diagnostic.validationLayer || 'validation',
  };
}

/**
 * @param {ReturnType<typeof buildAikenImportDiagnostic>[]} diagnostics
 */
export function mapDiagnosticsToStructuredErrors(diagnostics) {
  return diagnostics.map(mapDiagnosticToStructuredError);
}
