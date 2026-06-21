import { createHash } from 'node:crypto';
import { normalizeComparableHtmlText } from '../utils/semanticHtmlContent.js';
import { MCQ_OPTION_KEYS } from '../validation/mcq/mcqValidation.constants.js';

/**
 * @param {unknown} text
 */
export function normalizeImportComparableText(text) {
  return normalizeComparableHtmlText(text, { sanitize: true });
}

/**
 * @param {Array<{ key?: string, option_key?: string, text?: string, option_text?: string }>} options
 * @param {string} key
 */
function optionTextForKey(options, key) {
  const normalizedKey = String(key).toUpperCase();
  const match = options.find((option) => {
    const optionKey = String(option.key ?? option.option_key ?? '').toUpperCase();
    return optionKey === normalizedKey;
  });
  return normalizeImportComparableText(match?.text ?? match?.option_text ?? '');
}

/**
 * Canonical MCQ fingerprint: normalized stem + A–D option texts + correct answer key.
 *
 * @param {{
 *   questionText: unknown,
 *   options: Array<{ key?: string, option_key?: string, text?: string, option_text?: string, is_correct?: boolean }>,
 *   correctAnswerKey?: string,
 * }} input
 */
export function buildMcqImportFingerprint(input) {
  const stem = normalizeImportComparableText(input.questionText);
  const correctKey = resolveCorrectAnswerKey(input.options, input.correctAnswerKey);
  const options = MCQ_OPTION_KEYS.map((key) => ({
    key,
    text: optionTextForKey(input.options, key),
  }));

  return hashCanonical({ type: 'exact', stem, correctKey, options });
}

/**
 * Near-duplicate fingerprint: same stem + correct answer (options may differ).
 *
 * @param {{
 *   questionText: unknown,
 *   correctAnswerKey?: string,
 *   options?: Array<{ is_correct?: boolean, option_key?: string, key?: string }>,
 * }} input
 */
export function buildMcqStemFingerprint(input) {
  const stem = normalizeImportComparableText(input.questionText);
  const correctKey = resolveCorrectAnswerKey(input.options ?? [], input.correctAnswerKey);
  return hashCanonical({ type: 'stem', stem, correctKey });
}

/**
 * @param {Array<{ is_correct?: boolean, option_key?: string, key?: string }>} options
 * @param {string} [explicitKey]
 */
function resolveCorrectAnswerKey(options, explicitKey) {
  if (explicitKey) {
    return String(explicitKey).trim().toUpperCase();
  }
  const fromOptions = options.find((option) => option.is_correct);
  if (fromOptions) {
    return String(fromOptions.key ?? fromOptions.option_key ?? '').trim().toUpperCase();
  }
  return '';
}

/**
 * @param {unknown} value
 */
function hashCanonical(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * @param {{
 *   writePayload: { question_text: string, options: Array<Record<string, unknown>> },
 *   aikenQuestion: { correctAnswer: string },
 * }} readyItem
 */
export function buildFingerprintsFromReadyItem(readyItem) {
  const options = readyItem.writePayload.options;
  const correctAnswerKey =
    options.find((option) => option.is_correct)?.option_key ?? readyItem.aikenQuestion.correctAnswer;

  const base = {
    questionText: readyItem.writePayload.question_text,
    options,
    correctAnswerKey,
  };

  return {
    exactFingerprint: buildMcqImportFingerprint(base),
    stemFingerprint: buildMcqStemFingerprint(base),
  };
}
