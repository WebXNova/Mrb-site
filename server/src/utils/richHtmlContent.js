/**
 * Rich HTML content resolution — backward compatible reads across legacy and html columns.
 */

/** @param {{ question_html?: string|null, question_text?: string|null }|null|undefined} row */
export function resolveQuestionHtml(row) {
  if (!row) return '';
  const html = row.question_html ?? row.question_text ?? '';
  return String(html).trim();
}

/** @param {{ explanation_html?: string|null, explanation?: string|null }|null|undefined} row */
export function resolveExplanationHtml(row) {
  if (!row) return null;
  const raw = row.explanation_html ?? row.explanation;
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed === '' ? null : trimmed;
}

/** @param {{ option_html?: string|null, option_text?: string|null }|null|undefined} row */
export function resolveOptionHtml(row) {
  if (!row) return '';
  const html = row.option_html ?? row.option_text ?? '';
  return String(html).trim();
}

/**
 * Mirror sanitized write fields into rich HTML columns (same content, preserved formatting).
 *
 * @param {{
 *   question_text: string,
 *   explanation?: string|null,
 *   options?: Array<{ option_text: string, [key: string]: unknown }>,
 *   [key: string]: unknown,
 * }} secured
 */
export function attachRichHtmlMirrorFields(secured) {
  const options = Array.isArray(secured.options)
    ? secured.options.map((option) => ({
        ...option,
        option_html: option.option_text,
      }))
    : secured.options;

  return {
    ...secured,
    question_html: secured.question_text,
    explanation_html: secured.explanation ?? null,
    options,
  };
}

/**
 * Normalize import question fields — prefer *_html keys, fall back to legacy keys.
 *
 * @param {Record<string, unknown>} question
 */
export function normalizeImportQuestionRichFields(question) {
  const questionHtml =
    question.question_html ?? question.questionHtml ?? question.question_text ?? question.questionText ?? '';
  const explanationRaw =
    question.explanation_html ??
    question.explanationHtml ??
    question.explanation ??
    null;

  const options = Array.isArray(question.options)
    ? question.options.map((option, index) => {
        const optionHtml =
          option.option_html ??
          option.optionHtml ??
          option.option_text ??
          option.text ??
          option.optionText ??
          '';
        return {
          ...option,
          option_key: option.option_key ?? option.optionKey ?? ['A', 'B', 'C', 'D'][index],
          option_text: String(optionHtml),
          option_html: String(optionHtml),
          is_correct: Boolean(option.is_correct ?? option.isCorrect),
          sort_order: Number(option.sort_order ?? option.sortOrder ?? index),
          image_url: option.image_url ?? option.imageUrl ?? null,
        };
      })
    : [];

  return {
    ...question,
    question_text: String(questionHtml),
    question_html: String(questionHtml),
    explanation:
      explanationRaw == null || String(explanationRaw).trim() === '' ? null : String(explanationRaw),
    explanation_html:
      explanationRaw == null || String(explanationRaw).trim() === '' ? null : String(explanationRaw),
    question_image_url: question.question_image_url ?? question.questionImageUrl ?? null,
    options,
  };
}
