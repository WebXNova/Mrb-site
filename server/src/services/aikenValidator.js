/**
 * Aiken question validation for question bank import.
 *
 * Pure function — validates parsed DTOs from parseAiken(); no I/O or side effects.
 *
 * @typedef {{ key: string, text: string }} AikenValidatorOption
 *
 * @typedef {{
 *   question_text: string,
 *   explanation: string | null,
 *   options: AikenValidatorOption[],
 *   correctAnswer: string,
 * }} AikenValidatorQuestion
 *
 * @typedef {{ index: number, code: string, message: string }} AikenValidationError
 *
 * @typedef {{
 *   validQuestions: AikenValidatorQuestion[],
 *   invalidQuestions: AikenValidationError[],
 * }} AikenValidationResult
 */

/** Required option labels in canonical order. */
export const AIKEN_REQUIRED_OPTION_KEYS = Object.freeze(['A', 'B', 'C', 'D']);

export const AIKEN_VALIDATION_LIMITS = Object.freeze({
  MIN_QUESTION_TEXT_LENGTH: 3,
  MAX_QUESTION_TEXT_LENGTH: 10_000,
  MAX_EXPLANATION_LENGTH: 10_000,
  MAX_QUESTIONS_PER_BATCH: 500,
  MAX_TOTAL_PAYLOAD_CHARS: 1_000_000,
});

export const AIKEN_VALIDATION_ERROR_CODES = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_QUESTION_SHAPE: 'INVALID_QUESTION_SHAPE',
  BATCH_TOO_LARGE: 'BATCH_TOO_LARGE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  MISSING_QUESTION_TEXT: 'MISSING_QUESTION_TEXT',
  EMPTY_QUESTION_TEXT: 'EMPTY_QUESTION_TEXT',
  QUESTION_TEXT_TOO_SHORT: 'QUESTION_TEXT_TOO_SHORT',
  QUESTION_TEXT_TOO_LONG: 'QUESTION_TEXT_TOO_LONG',
  INVALID_OPTION_COUNT: 'INVALID_OPTION_COUNT',
  MISSING_OPTION_LABEL: 'MISSING_OPTION_LABEL',
  INVALID_OPTION_LABEL: 'INVALID_OPTION_LABEL',
  EMPTY_OPTION_TEXT: 'EMPTY_OPTION_TEXT',
  DUPLICATE_OPTION_LABEL: 'DUPLICATE_OPTION_LABEL',
  DUPLICATE_OPTION_TEXT: 'DUPLICATE_OPTION_TEXT',
  MISSING_ANSWER: 'MISSING_ANSWER',
  INVALID_ANSWER: 'INVALID_ANSWER',
  ANSWER_NOT_IN_OPTIONS: 'ANSWER_NOT_IN_OPTIONS',
  EXPLANATION_TOO_LONG: 'EXPLANATION_TOO_LONG',
  NULL_BYTE_FORBIDDEN: 'NULL_BYTE_FORBIDDEN',
  CONTROL_CHARACTER_FORBIDDEN: 'CONTROL_CHARACTER_FORBIDDEN',
  MALFORMED_UNICODE: 'MALFORMED_UNICODE',
});

const INVISIBLE_UNICODE_PATTERN = /[\u00a0\u200b\u200c\u200d\u2060\ufeff]/g;
const LONE_SURROGATE_PATTERN = /[\uD800-\uDFFF]/;
const ALLOWED_CONTROL_CHARS = new Set([0x09, 0x0a, 0x0d]);

/**
 * @param {number} index
 * @param {string} code
 * @param {string} message
 * @returns {AikenValidationError}
 */
function buildError(index, code, message) {
  return { index, code, message };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toStringValue(value) {
  if (value == null) {
    return '';
  }
  return String(value);
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeUnicode(value) {
  return toStringValue(value).normalize('NFC').replace(INVISIBLE_UNICODE_PATTERN, ' ');
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeSingleLine(value) {
  return normalizeUnicode(value).trim();
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeMultiline(value) {
  return normalizeUnicode(value)
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function containsNullByte(value) {
  return value.includes('\0');
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function containsForbiddenControlCharacters(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x7f) {
      return true;
    }
    if (code < 0x20 && !ALLOWED_CONTROL_CHARS.has(code)) {
      return true;
    }
  }
  return false;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function containsMalformedUnicode(value) {
  return value.includes('\uFFFD') || LONE_SURROGATE_PATTERN.test(value);
}

/**
 * @param {string} value
 * @param {string} fieldLabel
 * @returns {AikenValidationError | null}
 */
function validateSecurityString(value, fieldLabel) {
  const raw = toStringValue(value);

  if (containsNullByte(raw)) {
    return buildError(
      -1,
      AIKEN_VALIDATION_ERROR_CODES.NULL_BYTE_FORBIDDEN,
      `${fieldLabel} contains null bytes`
    );
  }

  if (containsForbiddenControlCharacters(raw)) {
    return buildError(
      -1,
      AIKEN_VALIDATION_ERROR_CODES.CONTROL_CHARACTER_FORBIDDEN,
      `${fieldLabel} contains forbidden control characters`
    );
  }

  if (containsMalformedUnicode(raw)) {
    return buildError(
      -1,
      AIKEN_VALIDATION_ERROR_CODES.MALFORMED_UNICODE,
      `${fieldLabel} contains malformed Unicode`
    );
  }

  return null;
}

/**
 * @param {unknown} question
 * @returns {number}
 */
function estimateQuestionPayloadSize(question) {
  if (typeof question !== 'object' || question === null) {
    return 0;
  }

  let size = 0;
  size += toStringValue(question.question_text).length;
  size += toStringValue(question.explanation).length;
  size += toStringValue(question.correctAnswer).length;

  if (Array.isArray(question.options)) {
    for (const option of question.options) {
      if (typeof option === 'object' && option !== null) {
        size += toStringValue(option.key).length;
        size += toStringValue(option.text).length;
      }
    }
  }

  return size;
}

/**
 * @param {string} value
 * @returns {string}
 */
function comparableOptionText(value) {
  return normalizeSingleLine(value).toLowerCase();
}

/**
 * Validate one parsed Aiken question and return normalized DTO or first blocking error.
 *
 * @param {unknown} question
 * @param {number} index
 * @returns {{ ok: true, value: AikenValidatorQuestion } | { ok: false, error: AikenValidationError }}
 */
function validateSingleQuestion(question, index) {
  if (typeof question !== 'object' || question === null) {
    return {
      ok: false,
      error: buildError(
        index,
        AIKEN_VALIDATION_ERROR_CODES.INVALID_QUESTION_SHAPE,
        'Question must be an object'
      ),
    };
  }

  const securityFields = [
    ['question_text', 'Question text'],
    ['explanation', 'Explanation'],
    ['correctAnswer', 'Answer'],
  ];

  for (const [field, label] of securityFields) {
    const securityError = validateSecurityString(question[field], label);
    if (securityError) {
      return {
        ok: false,
        error: buildError(index, securityError.code, securityError.message),
      };
    }
  }

  if (question.question_text == null) {
    return {
      ok: false,
      error: buildError(
        index,
        AIKEN_VALIDATION_ERROR_CODES.MISSING_QUESTION_TEXT,
        'Question text is required'
      ),
    };
  }

  const questionText = normalizeMultiline(question.question_text);
  if (!questionText) {
    return {
      ok: false,
      error: buildError(
        index,
        AIKEN_VALIDATION_ERROR_CODES.EMPTY_QUESTION_TEXT,
        'Question text cannot be empty'
      ),
    };
  }

  if (questionText.length < AIKEN_VALIDATION_LIMITS.MIN_QUESTION_TEXT_LENGTH) {
    return {
      ok: false,
      error: buildError(
        index,
        AIKEN_VALIDATION_ERROR_CODES.QUESTION_TEXT_TOO_SHORT,
        `Question text must be at least ${AIKEN_VALIDATION_LIMITS.MIN_QUESTION_TEXT_LENGTH} characters`
      ),
    };
  }

  if (questionText.length > AIKEN_VALIDATION_LIMITS.MAX_QUESTION_TEXT_LENGTH) {
    return {
      ok: false,
      error: buildError(
        index,
        AIKEN_VALIDATION_ERROR_CODES.QUESTION_TEXT_TOO_LONG,
        `Question text must not exceed ${AIKEN_VALIDATION_LIMITS.MAX_QUESTION_TEXT_LENGTH} characters`
      ),
    };
  }

  if (!Array.isArray(question.options)) {
    return {
      ok: false,
      error: buildError(
        index,
        AIKEN_VALIDATION_ERROR_CODES.INVALID_OPTION_COUNT,
        'Exactly 4 options are required'
      ),
    };
  }

  if (question.options.length !== AIKEN_REQUIRED_OPTION_KEYS.length) {
    return {
      ok: false,
      error: buildError(
        index,
        AIKEN_VALIDATION_ERROR_CODES.INVALID_OPTION_COUNT,
        'Exactly 4 options are required'
      ),
    };
  }

  /** @type {Map<string, AikenValidatorOption>} */
  const optionsByKey = new Map();
  /** @type {Map<string, number>} */
  const textSeen = new Map();

  for (let optionIndex = 0; optionIndex < question.options.length; optionIndex += 1) {
    const rawOption = question.options[optionIndex];

    if (typeof rawOption !== 'object' || rawOption === null) {
      return {
        ok: false,
        error: buildError(
          index,
          AIKEN_VALIDATION_ERROR_CODES.INVALID_QUESTION_SHAPE,
          `Option ${optionIndex + 1} must be an object`
        ),
      };
    }

    const optionSecurityErrors = [
      validateSecurityString(rawOption.key, `Option ${optionIndex + 1} label`),
      validateSecurityString(rawOption.text, `Option ${optionIndex + 1} text`),
    ].filter(Boolean);

    if (optionSecurityErrors.length > 0) {
      const first = optionSecurityErrors[0];
      return {
        ok: false,
        error: buildError(index, first.code, first.message),
      };
    }

    const key = normalizeSingleLine(rawOption.key).toUpperCase();
    const text = normalizeSingleLine(rawOption.text);

    if (!key) {
      return {
        ok: false,
        error: buildError(
          index,
          AIKEN_VALIDATION_ERROR_CODES.MISSING_OPTION_LABEL,
          `Option ${optionIndex + 1} label is required`
        ),
      };
    }

    if (!AIKEN_REQUIRED_OPTION_KEYS.includes(key)) {
      return {
        ok: false,
        error: buildError(
          index,
          AIKEN_VALIDATION_ERROR_CODES.INVALID_OPTION_LABEL,
          `Option label must be A, B, C or D`
        ),
      };
    }

    if (optionsByKey.has(key)) {
      return {
        ok: false,
        error: buildError(
          index,
          AIKEN_VALIDATION_ERROR_CODES.DUPLICATE_OPTION_LABEL,
          `Duplicate option label "${key}"`
        ),
      };
    }

    if (!text) {
      return {
        ok: false,
        error: buildError(
          index,
          AIKEN_VALIDATION_ERROR_CODES.EMPTY_OPTION_TEXT,
          `Option "${key}" text cannot be empty`
        ),
      };
    }

    const comparableText = comparableOptionText(text);
    if (textSeen.has(comparableText)) {
      return {
        ok: false,
        error: buildError(
          index,
          AIKEN_VALIDATION_ERROR_CODES.DUPLICATE_OPTION_TEXT,
          `Duplicate option text detected for options "${textSeen.get(comparableText)}" and "${key}"`
        ),
      };
    }

    textSeen.set(comparableText, key);
    optionsByKey.set(key, { key, text });
  }

  for (const requiredKey of AIKEN_REQUIRED_OPTION_KEYS) {
    if (!optionsByKey.has(requiredKey)) {
      return {
        ok: false,
        error: buildError(
          index,
          AIKEN_VALIDATION_ERROR_CODES.MISSING_OPTION_LABEL,
          `Missing option label "${requiredKey}"`
        ),
      };
    }
  }

  if (question.correctAnswer == null || normalizeSingleLine(question.correctAnswer) === '') {
    return {
      ok: false,
      error: buildError(
        index,
        AIKEN_VALIDATION_ERROR_CODES.MISSING_ANSWER,
        'Question is missing ANSWER declaration'
      ),
    };
  }

  const correctAnswer = normalizeSingleLine(question.correctAnswer).toUpperCase();
  if (!AIKEN_REQUIRED_OPTION_KEYS.includes(correctAnswer)) {
    return {
      ok: false,
      error: buildError(
        index,
        AIKEN_VALIDATION_ERROR_CODES.INVALID_ANSWER,
        'Answer must be A, B, C or D'
      ),
    };
  }

  if (!optionsByKey.has(correctAnswer)) {
    return {
      ok: false,
      error: buildError(
        index,
        AIKEN_VALIDATION_ERROR_CODES.ANSWER_NOT_IN_OPTIONS,
        `Answer "${correctAnswer}" does not match any option`
      ),
    };
  }

  let explanation = null;
  if (question.explanation != null && normalizeMultiline(question.explanation) !== '') {
    explanation = normalizeMultiline(question.explanation);
    if (explanation.length > AIKEN_VALIDATION_LIMITS.MAX_EXPLANATION_LENGTH) {
      return {
        ok: false,
        error: buildError(
          index,
          AIKEN_VALIDATION_ERROR_CODES.EXPLANATION_TOO_LONG,
          `Explanation must not exceed ${AIKEN_VALIDATION_LIMITS.MAX_EXPLANATION_LENGTH} characters`
        ),
      };
    }
  }

  return {
    ok: true,
    value: {
      question_text: questionText,
      explanation,
      options: AIKEN_REQUIRED_OPTION_KEYS.map((key) => optionsByKey.get(key)),
      correctAnswer,
    },
  };
}

/**
 * Validate parsed Aiken questions and partition into valid / invalid buckets.
 *
 * Never throws — always returns complete validation results.
 *
 * @param {unknown} questions Parsed output from parseAiken()
 * @returns {AikenValidationResult}
 */
export function validateAikenQuestions(questions) {
  /** @type {AikenValidatorQuestion[]} */
  const validQuestions = [];
  /** @type {AikenValidationError[]} */
  const invalidQuestions = [];

  if (!Array.isArray(questions)) {
    return {
      validQuestions,
      invalidQuestions: [
        buildError(
          0,
          AIKEN_VALIDATION_ERROR_CODES.INVALID_INPUT,
          'Parsed questions must be an array'
        ),
      ],
    };
  }

  const totalPayloadSize = questions.reduce(
    (total, question) => total + estimateQuestionPayloadSize(question),
    0
  );

  if (totalPayloadSize > AIKEN_VALIDATION_LIMITS.MAX_TOTAL_PAYLOAD_CHARS) {
    return {
      validQuestions,
      invalidQuestions: questions.map((_, index) =>
        buildError(
          index,
          AIKEN_VALIDATION_ERROR_CODES.PAYLOAD_TOO_LARGE,
          `Import payload exceeds ${AIKEN_VALIDATION_LIMITS.MAX_TOTAL_PAYLOAD_CHARS} characters`
        )
      ),
    };
  }

  for (let index = 0; index < questions.length; index += 1) {
    if (index >= AIKEN_VALIDATION_LIMITS.MAX_QUESTIONS_PER_BATCH) {
      invalidQuestions.push(
        buildError(
          index,
          AIKEN_VALIDATION_ERROR_CODES.BATCH_TOO_LARGE,
          `Import exceeds maximum of ${AIKEN_VALIDATION_LIMITS.MAX_QUESTIONS_PER_BATCH} questions`
        )
      );
      continue;
    }

    const result = validateSingleQuestion(questions[index], index);
    if (result.ok) {
      validQuestions.push(result.value);
    } else {
      invalidQuestions.push(result.error);
    }
  }

  return {
    validQuestions,
    invalidQuestions,
  };
}
