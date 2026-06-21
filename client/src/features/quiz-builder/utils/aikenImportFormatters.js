export const IMPORT_ERROR_LABELS = Object.freeze({

  MISSING_ANSWER: 'Missing ANSWER',

  MISSING_QUESTION_TEXT: 'Missing question text',

  EMPTY_QUESTION_TEXT: 'Empty question text',

  QUESTION_TEXT_TOO_SHORT: 'Question text too short',

  QUESTION_TEXT_TOO_LONG: 'Question text too long',

  INVALID_QUESTION_TEXT_LENGTH: 'Question text too long',

  INVALID_OPTION_LENGTH: 'Option text too long',

  INVALID_EXPLANATION_LENGTH: 'Explanation too long',

  INVALID_TOPIC_LENGTH: 'Topic too long',

  INVALID_OPTION_COUNT: 'Invalid option count',

  MISSING_OPTION_LABEL: 'Missing option label',

  INVALID_OPTION_LABEL: 'Invalid option label',

  EMPTY_OPTION_TEXT: 'Empty option text',

  DUPLICATE_OPTION_LABEL: 'Duplicate option label',

  DUPLICATE_OPTION_TEXT: 'Duplicate option text',

  INVALID_ANSWER: 'Invalid answer',

  ANSWER_NOT_IN_OPTIONS: 'Answer not in options',

  INVALID_CORRECT_OPTION: 'Invalid correct answer',

  INVALID_PAYLOAD: 'Invalid question payload',

  IMPORT_PERSIST_FAILED: 'Save to question bank failed',

  COURSE_NOT_FOUND: 'Course not found',

  SUBJECT_NOT_FOUND: 'Subject not found for course',

  UNEXPECTED_LINE: 'Unexpected line in file',

  MISSING_OPTION: 'Missing option',

  DUPLICATE_OPTION: 'Duplicate option',

  DUPLICATE_ANSWER: 'Duplicate answer',

  DUPLICATE_EXACT_BANK: 'Exact duplicate in question bank',

  DUPLICATE_EXACT_IN_FILE: 'Exact duplicate in file',

  DUPLICATE_NEAR_BANK: 'Near duplicate in question bank',

  DUPLICATE_NEAR_IN_FILE: 'Near duplicate in file',

});



export const IMPORT_VALIDATION_LAYER_LABELS = Object.freeze({

  aiken_parse: 'File format',

  aiken_validation: 'Aiken rules',

  schema: 'Field limits',

  security: 'Content security',

  business_rules: 'Business rules',

  mcq_integrity: 'MCQ validation',

  persistence: 'Database save',

  duplicate_detection: 'Duplicate detection',

});



/**

 * @param {unknown} code

 */

export function formatImportErrorReason(code) {

  const key = String(code ?? '').trim();

  if (!key) return 'Validation error';

  if (IMPORT_ERROR_LABELS[key]) return IMPORT_ERROR_LABELS[key];

  return key

    .replace(/_/g, ' ')

    .toLowerCase()

    .replace(/\b\w/g, (char) => char.toUpperCase());

}



/**

 * @param {unknown} layer

 */

export function formatImportValidationLayer(layer) {

  const key = String(layer ?? '').trim();

  if (!key) return 'Validation';

  return IMPORT_VALIDATION_LAYER_LABELS[key] || formatImportErrorReason(key);

}



/**

 * @param {unknown} value

 * @returns {string}

 */

export function safeDisplayText(value) {

  return String(value ?? '').trim();

}



/**

 * @param {{

 *   questionNumber?: number,

 *   questionTitle?: string,

 *   errorCode?: string,

 *   reason?: string,

 *   message?: string,

 *   validationLayer?: string,

 * }} entry

 * @param {number} [fallbackIndex]

 */

export function formatStructuredImportError(entry, fallbackIndex = 0) {

  const questionNumber = Number(entry?.questionNumber);

  const num =

    Number.isFinite(questionNumber) && questionNumber > 0 ? questionNumber : fallbackIndex + 1;

  const title = safeDisplayText(entry?.questionTitle) || '(untitled)';

  const code = safeDisplayText(entry?.errorCode || entry?.reason) || 'VALIDATION_ERROR';

  const message = safeDisplayText(entry?.message) || formatImportErrorReason(code);

  const layer = formatImportValidationLayer(entry?.validationLayer);



  return {

    headline: `Question ${num}: ${title}`,

    errorCode: code,

    message,

    validationLayer: layer,

    summary: `Q${num} · ${code} · ${message}`,

  };

}


