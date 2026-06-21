/**
 * RFC 4180 CSV parser for test import (mirrors testExportCsv.serializer output).
 */

import { CSV_UTF8_BOM, TEST_EXPORT_CSV_HEADERS } from './testExportCsv.serializer.js';
import {
  TEST_EXPORT_CSV_VERSION,
  TEST_EXPORT_JSON_VERSION,
} from '../constants/testRichContent.constants.js';

const TESTMOZ_MARKERS = new Set(['HTML', 'GROUP']);
const TESTMOZ_QUESTION_TYPES = new Set(['one', 'multiple', 'mcq', 'multiple_choice']);
export const TESTMOZ_IMPORT_FORMAT = 'TESTMOZ_FORMAT';
export const MRB_NATIVE_CSV_FORMAT = 'MRB_NATIVE_CSV_FORMAT';

/**
 * Parse a CSV string into rows of fields (handles quoted fields, escaped quotes, newlines in quotes).
 *
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const input = String(text ?? '').replace(/^\uFEFF/, '');

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && next === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    } else if (char === '\n' || char === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

/**
 * @param {string[][]} rows
 */
function rowToRecord(headers, values) {
  /** @type {Record<string, string>} */
  const record = {};
  for (let i = 0; i < headers.length; i += 1) {
    record[headers[i]] = values[i] ?? '';
  }
  return record;
}

function parseJsonArray(value, fallback = []) {
  if (value == null || String(value).trim() === '') return fallback;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseBoolFlag(value, defaultValue = false) {
  if (value == null || String(value).trim() === '') return defaultValue;
  const v = String(value).trim();
  return v === '1' || v.toLowerCase() === 'true';
}

function buildOptionFromCsv(record, letter) {
  const lower = letter.toLowerCase();
  const html = record[`option_${lower}_html`] ?? '';
  const imageUrl = record[`option_${lower}_image_url`] ?? '';
  const isCorrect = parseBoolFlag(record[`option_${lower}_is_correct`], false);
  return {
    option_key: letter,
    option_html: html,
    option_text: html,
    image_url: imageUrl.trim() === '' ? null : imageUrl,
    is_correct: isCorrect,
    sort_order: ['A', 'B', 'C', 'D'].indexOf(letter),
  };
}

/**
 * Apply correct_answer_key if option flags are inconsistent.
 *
 * @param {Array<{ option_key: string, is_correct: boolean }>} options
 * @param {string} correctKey
 */
function applyCorrectAnswerKey(options, correctKey) {
  const key = String(correctKey ?? '').trim().toUpperCase();
  if (!key || !['A', 'B', 'C', 'D'].includes(key)) return options;
  return options.map((o) => ({
    ...o,
    is_correct: o.option_key === key,
  }));
}

function normalizeTestmozCell(value) {
  return String(value ?? '').trim();
}

function isTestmozMarkerRow(row) {
  const first = normalizeTestmozCell(row?.[0]).toUpperCase();
  return TESTMOZ_MARKERS.has(first);
}

function isLikelyHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value ?? ''));
}

function testmozQuestionType(value) {
  const type = normalizeTestmozCell(value).toLowerCase();
  return TESTMOZ_QUESTION_TYPES.has(type) ? type : '';
}

function isTestmozQuestionRow(row) {
  if (!Array.isArray(row) || row.length === 0 || isTestmozMarkerRow(row)) return false;
  const first = normalizeTestmozCell(row[0]);
  if (!first || first === '*') return false;
  const type = testmozQuestionType(row[2]);
  return Boolean(type || isLikelyHtml(first));
}

function buildTestmozOption(row, index) {
  const marker = normalizeTestmozCell(row?.[0]);
  const hasCorrectMarker = marker === '*';
  const optionHtml = hasCorrectMarker
    ? String(row?.[1] ?? '').trim()
    : String(row?.[1] ?? row?.[0] ?? '').trim();

  return {
    option_key: ['A', 'B', 'C', 'D'][index],
    option_html: optionHtml,
    option_text: optionHtml,
    image_url: null,
    is_correct: hasCorrectMarker,
    sort_order: index,
  };
}

function testmozQuestionTitle(questionHtml) {
  return String(questionHtml ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

function logTestmozQuestionDebug(current, questionNumber, line) {
  if (!current) return;
  const correctFound = current.options.some((option) => option.is_correct);
  console.log(`[TestmozImportParser] Question ${questionNumber}`);
  console.log(`[TestmozImportParser] Title: ${testmozQuestionTitle(current.question_html) || '(empty)'}`);
  console.log(`[TestmozImportParser] Options Found: ${current.options.length}`);
  console.log(`[TestmozImportParser] Correct Answer Found: ${correctFound ? 'Yes' : 'No'}`);
  console.log(`[TestmozImportParser] Question Type: ${current.sourceQuestionType || '(empty)'}`);
  console.log(`[TestmozImportParser] Flush Line: ${line}`);
  console.log('[TestmozImportParser] Raw lines used to build question:', current.rawRows);
}

function logTestmozValidationFailure(current, questionNumber, line, code) {
  console.error(`[TestmozImportParser] Validation failed: ${code}`);
  console.error(`[TestmozImportParser] Question index: ${questionNumber}`);
  console.error('[TestmozImportParser] Parsed question object:', {
    display_order: questionNumber - 1,
    marks_override: current?.marks,
    topic: current?.topic,
    difficulty: null,
    question_type: 'mcq',
    source_question_type: current?.sourceQuestionType,
    question_html: current?.question_html,
    question_text: current?.question_html,
    question_image_url: null,
    explanation_html: current?.explanation_html,
    explanation: current?.explanation_html,
    marks: current?.marks ?? 1,
  });
  console.error('[TestmozImportParser] Parsed options array:', current?.options ?? []);
  console.error('[TestmozImportParser] Raw CSV rows involved:', current?.rawRows ?? []);
  console.error(`[TestmozImportParser] Failure line: ${line}`);
}

/**
 * Parser for Testmoz-style CSV exports.
 *
 * Shape observed:
 * HTML
 * "<p>Question</p>",1,one,"<p>Explanation</p>"
 * *,Correct Option
 * ,Option B
 */
export class TestmozImportParser {
  constructor(rows) {
    this.rows = Array.isArray(rows) ? rows : [];
  }

  static detect(rows) {
    return (Array.isArray(rows) ? rows : [])
      .slice(0, 20)
      .some((row) => isTestmozMarkerRow(row));
  }

  parse() {
    if (!this.rows.length) {
      return { ok: false, code: 'CSV_EMPTY', message: 'CSV file is empty.' };
    }

    const questions = [];
    let current = null;
    let activeGroup = null;

    const flush = (line) => {
      if (!current) return;
      const questionNumber = questions.length + 1;

      logTestmozQuestionDebug(current, questionNumber, line);

      if (!normalizeTestmozCell(current.question_html)) {
        logTestmozValidationFailure(current, questionNumber, line, 'TESTMOZ_MISSING_QUESTION');
        throw Object.assign(new Error('Question text is required.'), {
          code: 'TESTMOZ_MISSING_QUESTION',
          line,
        });
      }

      if (current.options.length < 2) {
        logTestmozValidationFailure(current, questionNumber, line, 'TESTMOZ_OPTION_COUNT');
        throw Object.assign(new Error('At least two options are required.'), {
          code: 'TESTMOZ_OPTION_COUNT',
          line,
        });
      }

      if (!current.options.some((option) => option.is_correct)) {
        logTestmozValidationFailure(current, questionNumber, line, 'TESTMOZ_CORRECT_ANSWER_MISSING');
        throw Object.assign(new Error('A correct answer marked with * is required.'), {
          code: 'TESTMOZ_CORRECT_ANSWER_MISSING',
          line,
        });
      }

      if (current.options.length > 4) {
        logTestmozValidationFailure(current, questionNumber, line, 'TESTMOZ_OPTION_COUNT');
        throw Object.assign(new Error('Only four MCQ options (A-D) are supported by this importer.'), {
          code: 'TESTMOZ_OPTION_COUNT',
          line,
        });
      }

      questions.push({
        display_order: questions.length,
        marks_override: current.marks,
        topic: current.topic,
        difficulty: null,
        question_type: 'mcq',
        question_html: current.question_html,
        question_text: current.question_html,
        question_image_url: null,
        explanation_html: current.explanation_html,
        explanation: current.explanation_html,
        marks: current.marks ?? 1,
        options: current.options,
      });
      current = null;
    };

    try {
      for (let rowIndex = 0; rowIndex < this.rows.length; rowIndex += 1) {
        const row = this.rows[rowIndex];
        if (!Array.isArray(row) || row.every((cell) => normalizeTestmozCell(cell) === '')) {
          continue;
        }

        const first = normalizeTestmozCell(row[0]);
        const firstUpper = first.toUpperCase();

        if (firstUpper === 'HTML') {
          console.log(`[TestmozImportParser] Row ${rowIndex + 1}: HTML marker ignored`, row);
          continue;
        }

        if (firstUpper === 'GROUP') {
          flush(rowIndex + 1);
          activeGroup = normalizeTestmozCell(row[1]) || null;
          console.log(`[TestmozImportParser] Row ${rowIndex + 1}: GROUP marker applied`, {
            group: activeGroup,
            row,
          });
          continue;
        }

        if (isTestmozQuestionRow(row)) {
          flush(rowIndex + 1);
          const marks = Number(row[1]);
          const explanation = normalizeTestmozCell(row[3]);
          const sourceQuestionType = normalizeTestmozCell(row[2]);
          console.log(`[TestmozImportParser] Row ${rowIndex + 1}: question row started`, {
            sourceQuestionType,
            row,
          });
          current = {
            question_html: String(row[0] ?? '').trim(),
            explanation_html: explanation === '' ? null : explanation,
            marks: Number.isFinite(marks) && marks > 0 ? marks : 1,
            topic: activeGroup,
            options: [],
            sourceQuestionType,
            rawRows: [{ line: rowIndex + 1, row }],
          };
          continue;
        }

        if (current) {
          const option = buildTestmozOption(row, current.options.length);
          console.log(`[TestmozImportParser] Row ${rowIndex + 1}: option row candidate`, {
            beginsWithComma: normalizeTestmozCell(row[0]) === '',
            beginsWithStar: normalizeTestmozCell(row[0]) === '*',
            optionAccepted: Boolean(option.option_html),
            option,
            row,
          });
          if (option.option_html) {
            current.options.push(option);
            current.rawRows.push({ line: rowIndex + 1, row });
          }
        }
      }

      flush(this.rows.length);
    } catch (error) {
      return {
        ok: false,
        code: error?.code || 'TESTMOZ_PARSE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to parse Testmoz CSV file.',
        line: error?.line,
      };
    }

    if (!questions.length) {
      return {
        ok: false,
        code: 'TESTMOZ_NO_QUESTIONS',
        message: 'Testmoz CSV file contains no question rows.',
      };
    }

    return {
      ok: true,
      package: {
        version: TEST_EXPORT_JSON_VERSION,
        format_version: 1,
        format: 'mrb_test_rich_v1',
        exported_at: new Date().toISOString(),
        test: {
          title: 'Imported Testmoz Test',
          description: null,
          category: 'MDCAT',
          test_type: 'mixed_subject',
          duration_minutes: 60,
          passing_marks: 0,
          max_attempts: 1,
          negative_marking: 0,
          shuffle_questions: false,
          shuffle_options: false,
          show_explanations: true,
          show_result_immediately: true,
          show_answers_after_submit: false,
          allow_retake: false,
          access_mode: 'private',
          tags: ['testmoz'],
        },
        subject_ids: [],
        questions,
      },
    };
  }
}

export function detectCsvImportFormat(rows) {
  return TestmozImportParser.detect(rows) ? TESTMOZ_IMPORT_FORMAT : MRB_NATIVE_CSV_FORMAT;
}

/**
 * Convert parsed CSV rows to import package shape.
 *
 * @param {string[][]} rows
 * @returns {{ ok: true, package: Record<string, unknown> } | { ok: false, code: string, message: string, line?: number }}
 */
export function csvRowsToImportPackage(rows) {
  if (!rows.length) {
    return { ok: false, code: 'CSV_EMPTY', message: 'CSV file is empty.' };
  }

  const headers = rows[0].map((h) => String(h).trim());
  const expected = [...TEST_EXPORT_CSV_HEADERS];

  if (headers.length < expected.length || headers[0] !== 'export_version') {
    return {
      ok: false,
      code: 'CSV_INVALID_HEADER',
      message: 'CSV header row does not match the expected test export format.',
    };
  }

  const dataRows = rows.slice(1);
  if (!dataRows.length) {
    return { ok: false, code: 'CSV_NO_QUESTIONS', message: 'CSV file contains no question rows.' };
  }

  const firstRecord = rowToRecord(headers, dataRows[0]);
  const exportVersion = String(firstRecord.export_version ?? '').trim();

  if (exportVersion !== TEST_EXPORT_CSV_VERSION) {
    return {
      ok: false,
      code: 'UNSUPPORTED_SCHEMA_VERSION',
      message: `Unsupported CSV export version "${exportVersion}". Expected ${TEST_EXPORT_CSV_VERSION}.`,
    };
  }

  const subjectIds = parseJsonArray(firstRecord.subject_ids, []).map(Number).filter((n) => n > 0);
  const tags = parseJsonArray(firstRecord.tags_json, []);

  /** @type {Array<Record<string, unknown>>} */
  const questions = [];

  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
    const record = rowToRecord(headers, dataRows[rowIndex]);
    let options = ['A', 'B', 'C', 'D'].map((letter) => buildOptionFromCsv(record, letter));
    options = applyCorrectAnswerKey(options, record.correct_answer_key);

    const marksOverrideRaw = record.marks_override;
    const marksOverride =
      marksOverrideRaw == null || String(marksOverrideRaw).trim() === ''
        ? null
        : Number(marksOverrideRaw);

    questions.push({
      display_order: Number(record.display_order ?? rowIndex),
      marks_override: Number.isFinite(marksOverride) && marksOverride > 0 ? marksOverride : null,
      topic: record.topic?.trim() === '' ? null : record.topic ?? null,
      difficulty: record.difficulty?.trim() === '' ? null : record.difficulty ?? null,
      question_type: record.question_type?.trim() === '' ? 'mcq' : record.question_type ?? 'mcq',
      question_html: record.question_html ?? '',
      question_text: record.question_html ?? '',
      question_image_url: record.question_image_url?.trim() === '' ? null : record.question_image_url ?? null,
      explanation_html: record.explanation_html?.trim() === '' ? null : record.explanation_html ?? null,
      explanation: record.explanation_html?.trim() === '' ? null : record.explanation_html ?? null,
      marks: Number(record.marks ?? 1) || 1,
      options,
    });
  }

  const pkg = {
    version: TEST_EXPORT_JSON_VERSION,
    format_version: 1,
    format: 'mrb_test_rich_v1',
    exported_at: firstRecord.exported_at || new Date().toISOString(),
    test: {
      title: firstRecord.title ?? 'Imported Test',
      description: firstRecord.description?.trim() === '' ? null : firstRecord.description ?? null,
      category: firstRecord.category?.trim() === '' ? 'MDCAT' : firstRecord.category ?? 'MDCAT',
      test_type: firstRecord.test_type?.trim() === '' ? 'mixed_subject' : firstRecord.test_type ?? 'mixed_subject',
      duration_minutes: Number(firstRecord.duration_minutes) || 60,
      passing_marks: Number(firstRecord.passing_marks ?? 0),
      max_attempts: Number(firstRecord.max_attempts) || 1,
      negative_marking: Number(firstRecord.negative_marking ?? 0),
      shuffle_questions: parseBoolFlag(firstRecord.shuffle_questions, false),
      shuffle_options: parseBoolFlag(firstRecord.shuffle_options, false),
      show_explanations: parseBoolFlag(firstRecord.show_explanations, true),
      show_result_immediately: parseBoolFlag(firstRecord.show_result_immediately, true),
      show_answers_after_submit: parseBoolFlag(firstRecord.show_answers_after_submit, false),
      allow_retake: parseBoolFlag(firstRecord.allow_retake, false),
      access_mode: firstRecord.access_mode?.trim() === '' ? 'private' : firstRecord.access_mode ?? 'private',
      tags,
    },
    subject_ids: subjectIds,
    questions,
  };

  return { ok: true, package: pkg };
}

/**
 * @param {string} csvText
 * @returns {{ ok: true, package: Record<string, unknown> } | { ok: false, code: string, message: string }}
 */
export function parseTestImportCsv(csvText) {
  try {
    const rows = parseCsvRows(csvText);
    if (detectCsvImportFormat(rows) === TESTMOZ_IMPORT_FORMAT) {
      return new TestmozImportParser(rows).parse();
    }
    return csvRowsToImportPackage(rows);
  } catch (error) {
    return {
      ok: false,
      code: 'CSV_PARSE_FAILED',
      message: error instanceof Error ? error.message : 'Failed to parse CSV file.',
    };
  }
}

/**
 * Detect file format from content.
 *
 * @param {string} content
 * @returns {'json'|'csv'|null}
 */
export function detectTestImportFormat(content) {
  const trimmed = String(content ?? '').replace(CSV_UTF8_BOM, '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  try {
    if (TestmozImportParser.detect(parseCsvRows(trimmed))) return 'csv';
  } catch {
    // Fall through to native CSV detection.
  }
  if (trimmed.startsWith('export_version') || trimmed.includes('question_html')) return 'csv';
  return null;
}
