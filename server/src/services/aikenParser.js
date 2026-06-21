/**
 * Aiken format parser for question bank import.
 *
 * Pure function — no I/O, no database, deterministic output.
 *
 * @typedef {{ key: 'A' | 'B' | 'C' | 'D', text: string }} AikenParsedOption
 *
 * @typedef {{
 *   question_text: string,
 *   explanation: string | null,
 *   options: [
 *     AikenParsedOption,
 *     AikenParsedOption,
 *     AikenParsedOption,
 *     AikenParsedOption,
 *   ],
 *   correctAnswer: 'A' | 'B' | 'C' | 'D',
 * }} AikenParsedQuestion
 *
 * @typedef {{
 *   questionNumber: number,
 *   lineNumber: number,
 *   code: string,
 *   message: string,
 * }} AikenBlockParseError
 *
 * @typedef {{
 *   ok: true,
 *   questionNumber: number,
 *   question: AikenParsedQuestion,
 * }} AikenBlockParseSuccess
 *
 * @typedef {{
 *   ok: false,
 *   questionNumber: number,
 *   lineNumber: number,
 *   code: string,
 *   message: string,
 * }} AikenBlockParseFailure
 *
 * @typedef {AikenBlockParseSuccess | AikenBlockParseFailure} AikenBlockParseResult
 *
 * @typedef {{
 *   totalBlocks: number,
 *   results: AikenBlockParseResult[],
 *   questions: AikenParsedQuestion[],
 *   parseErrors: AikenBlockParseError[],
 * }} AikenParseDocumentResult
 */

/** @typedef {'A' | 'B' | 'C' | 'D'} AikenOptionKey */

export const AIKEN_OPTION_KEYS = Object.freeze(['A', 'B', 'C', 'D']);

export const AIKEN_PARSE_ERROR_CODES = Object.freeze({
  MISSING_QUESTION_TEXT: 'MISSING_QUESTION_TEXT',
  MISSING_OPTION: 'MISSING_OPTION',
  DUPLICATE_OPTION: 'DUPLICATE_OPTION',
  MISSING_ANSWER: 'MISSING_ANSWER',
  DUPLICATE_ANSWER: 'DUPLICATE_ANSWER',
  INVALID_ANSWER: 'INVALID_ANSWER',
  UNEXPECTED_LINE: 'UNEXPECTED_LINE',
});

/** Supports A) A: A. A - (case-insensitive label). */
export const OPTION_LINE_PATTERN = /^([A-D])\s*(?:[):.]|\-)\s*(.*)$/i;

/** Matches ANSWER line and captures the answer token (validated later in parseQuestionBlock). */
export const ANSWER_LINE_PATTERN = /^ANSWER\s*:\s*(\S+)\s*$/i;

/** Supports EXPLANATION / Explanation / Exp / EXP (case-insensitive). */
export const EXPLANATION_LINE_PATTERN = /^(?:EXPLANATION|EXP)\s*:?\s*(.*)$/i;

/**
 * Structured parse failure for a single malformed question block.
 */
export class AikenParseError extends Error {
  /**
   * @param {{ line: number, code: string, message: string }} detail
   */
  constructor({ line, code, message }) {
    super(message);
    this.name = 'AikenParseError';
    this.line = line;
    this.code = code;
  }

  /** @returns {{ line: number, code: string, message: string }} */
  toJSON() {
    return {
      line: this.line,
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * @param {number} line
 * @param {string} code
 * @param {string} message
 * @returns {never}
 */
function throwParseError(line, code, message) {
  throw new AikenParseError({ line, code, message });
}

/**
 * @param {AikenOptionKey} key
 */
function missingOptionMessage(key) {
  return `Option ${key} missing`;
}

/**
 * Normalize UTF-8 text and line endings for deterministic parsing.
 *
 * @param {unknown} content
 * @returns {string}
 */
function normalizeContent(content) {
  return String(content ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * Split document into question blocks.
 *
 * Blank lines separate completed questions (after ANSWER / optional EXPLANATION),
 * but blank lines before options or between ANSWER and EXPLANATION are kept inside
 * the same question block.
 *
 * @param {string} content
 * @returns {Array<{ lines: Array<{ text: string, lineNumber: number }> }>}
 */
function splitQuestionBlocks(content) {
  const rawLines = content.split('\n');
  /** @type {Array<Array<{ text: string, lineNumber: number }>>} */
  const blocks = [];
  /** @type {Array<{ text: string, lineNumber: number }>} */
  let current = [];
  let hasAnswer = false;
  let hasOptions = false;
  let explanationStarted = false;

  const finalizeBlock = () => {
    if (current.length > 0) {
      blocks.push({ lines: current });
    }
    current = [];
    hasAnswer = false;
    hasOptions = false;
    explanationStarted = false;
  };

  const nextNonBlankIndex = (startIndex) => {
    for (let index = startIndex; index < rawLines.length; index += 1) {
      if (rawLines[index].trim() !== '') {
        return index;
      }
    }
    return -1;
  };

  /**
   * Detect a new question stem when the next non-blank line begins options (A–D).
   * Used after EXPLANATION bodies that are not followed by a blank separator line.
   *
   * @param {number} lineIndex
   */
  const looksLikeNewQuestionStem = (lineIndex) => {
    const trimmed = rawLines[lineIndex].trim();
    if (!trimmed) return false;
    if (OPTION_LINE_PATTERN.test(trimmed)) return false;
    if (ANSWER_LINE_PATTERN.test(trimmed)) return false;
    if (EXPLANATION_LINE_PATTERN.test(trimmed)) return false;

    const nextIndex = nextNonBlankIndex(lineIndex + 1);
    if (nextIndex === -1) return false;
    return OPTION_LINE_PATTERN.test(rawLines[nextIndex].trim());
  };

  for (let index = 0; index < rawLines.length; index += 1) {
    const text = rawLines[index];
    const lineNumber = index + 1;
    const trimmed = text.trim();

    if (trimmed === '') {
      if (!hasAnswer) {
        continue;
      }

      const nextIndex = nextNonBlankIndex(index + 1);
      if (nextIndex === -1) {
        finalizeBlock();
        break;
      }

      const nextTrimmed = rawLines[nextIndex].trim();
      if (!explanationStarted && EXPLANATION_LINE_PATTERN.test(nextTrimmed)) {
        continue;
      }

      finalizeBlock();
      continue;
    }

    const isAnswerLine = ANSWER_LINE_PATTERN.test(trimmed);
    const isExplanationHeader = EXPLANATION_LINE_PATTERN.test(trimmed);
    const isOptionLine = OPTION_LINE_PATTERN.test(trimmed);

    const startsNextQuestion =
      (hasAnswer && !explanationStarted && isOptionLine) ||
      (hasAnswer &&
        !explanationStarted &&
        !isAnswerLine &&
        !isExplanationHeader &&
        !isOptionLine) ||
      (explanationStarted && isOptionLine) ||
      (explanationStarted && looksLikeNewQuestionStem(index)) ||
      (hasOptions && !hasAnswer && looksLikeNewQuestionStem(index));

    if (startsNextQuestion) {
      finalizeBlock();
    }

    if (isAnswerLine) {
      hasAnswer = true;
    }

    if (isOptionLine) {
      hasOptions = true;
    }

    if (isExplanationHeader) {
      explanationStarted = true;
    } else if (explanationStarted && !isOptionLine && !isAnswerLine) {
      explanationStarted = true;
    }

    current.push({ text, lineNumber });
  }

  if (current.length > 0) {
    blocks.push({ lines: current });
  }

  return blocks;
}

/**
 * @param {Array<{ text: string, lineNumber: number }>} blockLines
 * @returns {AikenParsedQuestion}
 */
function parseQuestionBlock(blockLines) {
  /** @type {string[]} */
  const stemLines = [];
  /** @type {Map<AikenOptionKey, { text: string, lineNumber: number }>} */
  const optionsByKey = new Map();
  /** @type {string | null} */
  let correctAnswer = null;
  /** @type {number | null} */
  let answerLineNumber = null;
  /** @type {string[]} */
  const explanationLines = [];
  let phase = 'stem';

  for (const { text, lineNumber } of blockLines) {
    const trimmed = text.trim();
    if (!trimmed) {
      continue;
    }

    const answerMatch = trimmed.match(ANSWER_LINE_PATTERN);
    if (answerMatch) {
      if (phase === 'explanation') {
        throwParseError(
          lineNumber,
          AIKEN_PARSE_ERROR_CODES.UNEXPECTED_LINE,
          'ANSWER must appear before EXPLANATION'
        );
      }

      if (correctAnswer != null) {
        throwParseError(
          lineNumber,
          AIKEN_PARSE_ERROR_CODES.DUPLICATE_ANSWER,
          'Multiple ANSWER lines are not allowed'
        );
      }

      const answerToken = answerMatch[1].toUpperCase();
      if (!AIKEN_OPTION_KEYS.includes(answerToken)) {
        throwParseError(
          lineNumber,
          AIKEN_PARSE_ERROR_CODES.INVALID_ANSWER,
          'Answer must be A, B, C or D'
        );
      }

      correctAnswer = answerToken;
      answerLineNumber = lineNumber;
      phase = 'answer';
      continue;
    }

    const explanationMatch = trimmed.match(EXPLANATION_LINE_PATTERN);
    if (explanationMatch) {
      phase = 'explanation';
      const inlineExplanation = explanationMatch[1]?.trim() ?? '';
      if (inlineExplanation) {
        explanationLines.push(inlineExplanation);
      }
      continue;
    }

    if (phase === 'explanation') {
      explanationLines.push(trimmed);
      continue;
    }

    const optionMatch = trimmed.match(OPTION_LINE_PATTERN);
    if (optionMatch) {
      phase = 'options';
      const key = optionMatch[1].toUpperCase();
      const optionText = optionMatch[2].trim();

      if (optionsByKey.has(key)) {
        throwParseError(
          lineNumber,
          AIKEN_PARSE_ERROR_CODES.DUPLICATE_OPTION,
          `Duplicate option label "${key}"`
        );
      }

      optionsByKey.set(key, { text: optionText, lineNumber });
      continue;
    }

    if (phase === 'options' || phase === 'answer') {
      throwParseError(
        lineNumber,
        AIKEN_PARSE_ERROR_CODES.UNEXPECTED_LINE,
        'Unexpected line after options; expected ANSWER or EXPLANATION'
      );
    }

    stemLines.push(trimmed);
  }

  const questionText = stemLines.join('\n').trim();
  if (!questionText) {
    const line = blockLines[0]?.lineNumber ?? 1;
    throwParseError(
      line,
      AIKEN_PARSE_ERROR_CODES.MISSING_QUESTION_TEXT,
      'Question text is required'
    );
  }

  for (const key of AIKEN_OPTION_KEYS) {
    if (!optionsByKey.has(key)) {
      throwParseError(
        blockLines[blockLines.length - 1]?.lineNumber ?? 1,
        AIKEN_PARSE_ERROR_CODES.MISSING_OPTION,
        missingOptionMessage(key)
      );
    }

    const option = optionsByKey.get(key);
    if (!option.text) {
      throwParseError(
        option.lineNumber,
        AIKEN_PARSE_ERROR_CODES.MISSING_OPTION,
        `Option ${key} text is required`
      );
    }
  }

  if (correctAnswer == null) {
    throwParseError(
      blockLines[blockLines.length - 1]?.lineNumber ?? 1,
      AIKEN_PARSE_ERROR_CODES.MISSING_ANSWER,
      'ANSWER line is required (format: ANSWER: A)'
    );
  }

  if (!AIKEN_OPTION_KEYS.includes(correctAnswer)) {
    throwParseError(
      answerLineNumber ?? blockLines[blockLines.length - 1]?.lineNumber ?? 1,
      AIKEN_PARSE_ERROR_CODES.INVALID_ANSWER,
      'Answer must be A, B, C or D'
    );
  }

  if (!optionsByKey.has(correctAnswer)) {
    throwParseError(
      answerLineNumber ?? blockLines[blockLines.length - 1]?.lineNumber ?? 1,
      AIKEN_PARSE_ERROR_CODES.INVALID_ANSWER,
      `Answer "${correctAnswer}" does not match any option`
    );
  }

  const explanation = explanationLines.length > 0 ? explanationLines.join('\n').trim() : null;

  return {
    question_text: questionText,
    explanation,
    options: AIKEN_OPTION_KEYS.map((key) => ({
      key,
      text: optionsByKey.get(key).text,
    })),
    correctAnswer,
  };
}

/**
 * Parse every question block independently. Malformed blocks are reported without
 * aborting the rest of the document.
 *
 * @param {unknown} content UTF-8 Aiken document
 * @returns {AikenParseDocumentResult}
 */
export function parseAikenDocument(content) {
  const normalized = normalizeContent(content);
  if (normalized.trim() === '') {
    return {
      totalBlocks: 0,
      results: [],
      questions: [],
      parseErrors: [],
    };
  }

  const blocks = splitQuestionBlocks(normalized);
  /** @type {AikenBlockParseResult[]} */
  const results = [];
  /** @type {AikenParsedQuestion[]} */
  const questions = [];
  /** @type {AikenBlockParseError[]} */
  const parseErrors = [];

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const questionNumber = blockIndex + 1;
    const block = blocks[blockIndex];

    try {
      const question = parseQuestionBlock(block.lines);
      const success = { ok: /** @type {const} */ (true), questionNumber, question };
      results.push(success);
      questions.push(question);
    } catch (error) {
      if (!(error instanceof AikenParseError)) {
        throw error;
      }

      const failure = {
        ok: /** @type {const} */ (false),
        questionNumber,
        lineNumber: error.line,
        code: error.code,
        message: error.message,
      };
      results.push(failure);
      parseErrors.push({
        questionNumber,
        lineNumber: error.line,
        code: error.code,
        message: error.message,
      });
    }
  }

  return {
    totalBlocks: blocks.length,
    results,
    questions,
    parseErrors,
  };
}

/**
 * Parse Aiken-formatted content into normalized question DTOs (successful blocks only).
 * Never throws for per-block parse failures — use parseAikenDocument() for full diagnostics.
 *
 * @param {unknown} content UTF-8 Aiken document
 * @returns {AikenParsedQuestion[]}
 */
export function parseAiken(content) {
  return parseAikenDocument(content).questions;
}
