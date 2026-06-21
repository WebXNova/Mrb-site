/**
 * RFC 4180 CSV serialization for test exports.
 * Excel-compatible: UTF-8 BOM, quoted fields, escaped double quotes.
 */

import { TEST_EXPORT_CSV_VERSION } from '../constants/testRichContent.constants.js';

/** UTF-8 BOM for Excel recognition. */
export const CSV_UTF8_BOM = '\uFEFF';

/**
 * Escape a single CSV field per RFC 4180.
 * Preserves raw HTML — no stripping or entity encoding.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeCsvField(value) {
  if (value == null) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * @param {unknown[]} fields
 * @returns {string}
 */
export function formatCsvRow(fields) {
  return fields.map(escapeCsvField).join(',');
}

export const TEST_EXPORT_CSV_HEADERS = Object.freeze([
  'export_version',
  'exported_at',
  'test_id',
  'course_id',
  'subject_ids',
  'title',
  'description',
  'category',
  'test_type',
  'duration_minutes',
  'passing_marks',
  'max_attempts',
  'negative_marking',
  'shuffle_questions',
  'shuffle_options',
  'show_explanations',
  'show_result_immediately',
  'show_answers_after_submit',
  'allow_retake',
  'access_mode',
  'tags_json',
  'question_index',
  'display_order',
  'marks_override',
  'topic',
  'difficulty',
  'question_type',
  'question_html',
  'question_image_url',
  'explanation_html',
  'marks',
  'correct_answer_key',
  'option_a_html',
  'option_a_image_url',
  'option_a_is_correct',
  'option_b_html',
  'option_b_image_url',
  'option_b_is_correct',
  'option_c_html',
  'option_c_image_url',
  'option_c_is_correct',
  'option_d_html',
  'option_d_image_url',
  'option_d_is_correct',
]);

/**
 * @param {Record<string, unknown>} option
 */
function optionByKey(options, key) {
  return options.find((o) => String(o.option_key) === key) ?? null;
}

/**
 * Build CSV rows for a test export document (generator-friendly).
 *
 * @param {{
 *   version: string,
 *   exported_at: string,
 *   test_id: number,
 *   course_id: number,
 *   subject_ids: number[],
 *   test: Record<string, unknown>,
 *   questions: Array<Record<string, unknown>>,
 * }} document
 * @yields {string}
 */
export function* generateTestExportCsvRows(document) {
  yield formatCsvRow(TEST_EXPORT_CSV_HEADERS);

  const meta = document.test ?? {};
  const tagsJson = JSON.stringify(Array.isArray(meta.tags) ? meta.tags : []);
  const subjectIdsJson = JSON.stringify(document.subject_ids ?? []);

  const questions = Array.isArray(document.questions) ? document.questions : [];

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    const options = Array.isArray(question.options) ? question.options : [];
    const correct = options.find((o) => o.is_correct)?.option_key ?? '';

    const optA = optionByKey(options, 'A');
    const optB = optionByKey(options, 'B');
    const optC = optionByKey(options, 'C');
    const optD = optionByKey(options, 'D');

    yield formatCsvRow([
      TEST_EXPORT_CSV_VERSION,
      document.exported_at,
      document.test_id,
      document.course_id,
      subjectIdsJson,
      meta.title,
      meta.description ?? '',
      meta.category ?? 'MDCAT',
      meta.test_type ?? 'mixed_subject',
      meta.duration_minutes,
      meta.passing_marks,
      meta.max_attempts,
      meta.negative_marking ?? 0,
      meta.shuffle_questions ? 1 : 0,
      meta.shuffle_options ? 1 : 0,
      meta.show_explanations !== false ? 1 : 0,
      meta.show_result_immediately !== false ? 1 : 0,
      meta.show_answers_after_submit ? 1 : 0,
      meta.allow_retake ? 1 : 0,
      meta.access_mode ?? 'private',
      tagsJson,
      index + 1,
      question.display_order ?? index,
      question.marks_override ?? '',
      question.topic ?? '',
      question.difficulty ?? '',
      question.question_type ?? 'mcq',
      question.question_html ?? question.question_text ?? '',
      question.question_image_url ?? '',
      question.explanation_html ?? question.explanation ?? '',
      question.marks ?? 1,
      correct,
      optA?.option_html ?? optA?.option_text ?? '',
      optA?.image_url ?? '',
      optA?.is_correct ? 1 : 0,
      optB?.option_html ?? optB?.option_text ?? '',
      optB?.image_url ?? '',
      optB?.is_correct ? 1 : 0,
      optC?.option_html ?? optC?.option_text ?? '',
      optC?.image_url ?? '',
      optC?.is_correct ? 1 : 0,
      optD?.option_html ?? optD?.option_text ?? '',
      optD?.image_url ?? '',
      optD?.is_correct ? 1 : 0,
    ]);
  }
}

/**
 * Serialize full CSV string with UTF-8 BOM.
 *
 * @param {Parameters<typeof generateTestExportCsvRows>[0]} document
 * @returns {string}
 */
export function serializeTestExportCsv(document) {
  const rows = [];
  for (const row of generateTestExportCsvRows(document)) {
    rows.push(row);
  }
  return CSV_UTF8_BOM + rows.join('\r\n') + '\r\n';
}

/**
 * Stream-friendly buffer builder for large exports.
 *
 * @param {Parameters<typeof generateTestExportCsvRows>[0]} document
 * @param {{ chunkSize?: number }} [opts]
 * @returns {Buffer}
 */
export function serializeTestExportCsvBuffer(document, { chunkSize = 200 } = {}) {
  const parts = [CSV_UTF8_BOM];
  let batch = [];
  let rowCount = 0;

  for (const row of generateTestExportCsvRows(document)) {
    batch.push(row);
    rowCount += 1;
    if (batch.length >= chunkSize) {
      parts.push(`${batch.join('\r\n')}\r\n`);
      batch = [];
    }
  }

  if (batch.length) {
    parts.push(`${batch.join('\r\n')}\r\n`);
  }

  return Buffer.from(parts.join(''), 'utf8');
}
