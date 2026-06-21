/** @param {unknown} v */
function toIsoTimestamp(v) {
  if (v == null) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const d = new Date(typeof v === 'string' || typeof v === 'number' ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

import {
  resolveQuestionHtml,
  resolveExplanationHtml,
  resolveOptionHtml,
} from '../utils/richHtmlContent.js';

/** @param {Record<string, unknown>} row */
export function toQuestionOptionDto(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    option_key: row.option_key == null ? null : String(row.option_key),
    option_text: resolveOptionHtml(row),
    option_html: resolveOptionHtml(row),
    image_url: row.image_url == null ? null : String(row.image_url),
    is_correct: Boolean(Number(row.is_correct)),
    sort_order: Number(row.sort_order ?? 0),
    created_at: toIsoTimestamp(row.created_at),
    updated_at: toIsoTimestamp(row.updated_at),
  };
}

/** @param {Record<string, unknown>} row @param {Array<Record<string, unknown>>} [options] */
export function toQuestionBankDto(row, options = []) {
  if (!row) return null;
  return {
    question_id: Number(row.id),
    course_id: Number(row.course_id),
    subject_id: row.subject_id == null ? null : Number(row.subject_id),
    topic: row.topic == null ? null : String(row.topic),
    difficulty: row.difficulty == null ? null : String(row.difficulty),
    question_type: String(row.question_type ?? 'mcq'),
    question_text: resolveQuestionHtml(row),
    question_html: resolveQuestionHtml(row),
    question_image_url: row.question_image_url == null ? null : String(row.question_image_url),
    explanation: resolveExplanationHtml(row),
    explanation_html: resolveExplanationHtml(row),
    marks: Number(row.marks),
    created_by: Number(row.created_by),
    created_at: toIsoTimestamp(row.created_at),
    updated_at: toIsoTimestamp(row.updated_at),
    deleted_at: row.deleted_at == null ? null : toIsoTimestamp(row.deleted_at),
    deleted_by: row.deleted_by == null ? null : Number(row.deleted_by),
    options: options.map(toQuestionOptionDto),
  };
}

/** @param {Record<string, unknown>} row */
export function toQuestionSoftDeleteResultDto(row) {
  if (!row) return null;
  return {
    question_id: Number(row.id),
    deleted_at: toIsoTimestamp(row.deleted_at),
    deleted_by: row.deleted_by == null ? null : Number(row.deleted_by),
  };
}
