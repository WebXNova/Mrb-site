/**
 * JSON serialization for test exports — versioned, structured, extensible.
 */

import { TEST_EXPORT_JSON_VERSION } from '../constants/testRichContent.constants.js';

/**
 * @param {Record<string, unknown>} option
 */
function mapExportOption(option) {
  return {
    option_key: String(option.option_key),
    option_html: String(option.option_html ?? option.option_text ?? ''),
    option_text: String(option.option_html ?? option.option_text ?? ''),
    image_url: option.image_url ?? null,
    is_correct: Boolean(option.is_correct),
    sort_order: Number(option.sort_order ?? 0),
  };
}

/**
 * @param {Record<string, unknown>} question
 */
function mapExportQuestion(question) {
  const options = Array.isArray(question.options) ? question.options.map(mapExportOption) : [];
  const correctAnswer = options.find((o) => o.is_correct)?.option_key ?? null;

  return {
    display_order: Number(question.display_order ?? 0),
    marks_override: question.marks_override ?? null,
    topic: question.topic ?? null,
    difficulty: question.difficulty ?? null,
    question_type: String(question.question_type ?? 'mcq'),
    question_html: String(question.question_html ?? question.question_text ?? ''),
    question_text: String(question.question_html ?? question.question_text ?? ''),
    question_image_url: question.question_image_url ?? null,
    explanation_html: question.explanation_html ?? question.explanation ?? null,
    explanation: question.explanation_html ?? question.explanation ?? null,
    marks: Number(question.marks ?? 1),
    correct_answer: correctAnswer,
    options,
  };
}

/**
 * Build the canonical v1.0 export document.
 *
 * @param {{
 *   test_id: number,
 *   course_id: number,
 *   subject_ids: number[],
 *   test: Record<string, unknown>,
 *   questions: Array<Record<string, unknown>>,
 *   exported_at?: string,
 * }} input
 */
export function buildTestExportJsonDocument(input) {
  const questions = (input.questions ?? []).map(mapExportQuestion);

  return {
    version: TEST_EXPORT_JSON_VERSION,
    exported_at: input.exported_at ?? new Date().toISOString(),
    test_id: Number(input.test_id),
    course_id: Number(input.course_id),
    subject_ids: input.subject_ids ?? [],
    test: input.test ?? {},
    questions,
    meta: {
      question_count: questions.length,
      schema: 'mrb_test_export',
    },
  };
}

/**
 * @param {ReturnType<typeof buildTestExportJsonDocument>} document
 * @returns {string}
 */
export function serializeTestExportJson(document) {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * @param {ReturnType<typeof buildTestExportJsonDocument>} document
 * @returns {Buffer}
 */
export function serializeTestExportJsonBuffer(document) {
  return Buffer.from(serializeTestExportJson(document), 'utf8');
}

/**
 * Normalize v1.0 export JSON into legacy import package shape.
 *
 * @param {Record<string, unknown>} parsed
 */
export function normalizeExportJsonForImport(parsed) {
  if (!parsed || typeof parsed !== 'object') return parsed;

  const version = parsed.version ?? parsed.format_version;
  const isV1 = version === TEST_EXPORT_JSON_VERSION || version === '1.0' || version === 1;

  if (!isV1 && parsed.format === 'mrb_test_rich_v1') {
    return parsed;
  }

  if (!isV1) return parsed;

  return {
    format_version: 1,
    format: 'mrb_test_rich_v1',
    exported_at: parsed.exported_at ?? new Date().toISOString(),
    test: parsed.test ?? {},
    subject_ids: parsed.subject_ids ?? [],
    questions: (Array.isArray(parsed.questions) ? parsed.questions : []).map((q) => ({
      display_order: q.display_order ?? 0,
      marks_override: q.marks_override ?? null,
      topic: q.topic ?? null,
      difficulty: q.difficulty ?? null,
      question_type: q.question_type ?? 'mcq',
      question_html: q.question_html ?? q.question_text ?? '',
      question_text: q.question_html ?? q.question_text ?? '',
      question_image_url: q.question_image_url ?? null,
      explanation_html: q.explanation_html ?? q.explanation ?? null,
      explanation: q.explanation_html ?? q.explanation ?? null,
      marks: q.marks ?? 1,
      options: Array.isArray(q.options)
        ? q.options.map((o, index) => ({
            option_key: o.option_key ?? ['A', 'B', 'C', 'D'][index],
            option_html: o.option_html ?? o.option_text ?? o.text ?? '',
            option_text: o.option_html ?? o.option_text ?? o.text ?? '',
            image_url: o.image_url ?? null,
            is_correct: Boolean(o.is_correct),
            sort_order: Number(o.sort_order ?? index),
          }))
        : [],
    })),
  };
}
