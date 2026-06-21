import { sanitizeRichHtml } from '../utils/htmlSanitizer.js';
import {
  resolveExplanationHtml,
  resolveOptionHtml,
  resolveQuestionHtml,
} from '../utils/richHtmlContent.js';

/** @param {Record<string, unknown>} row */
function toIsoTimestamp(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const d = new Date(typeof value === 'string' || typeof value === 'number' ? value : String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * @param {Record<string, unknown>} optionRow
 */
export function toTestQuestionOptionAdminDto(optionRow) {
  return {
    optionId: Number(optionRow.id),
    optionText: sanitizeRichHtml(resolveOptionHtml(optionRow)),
    isCorrect: Boolean(Number(optionRow.is_correct)),
    sortOrder: Number(optionRow.sort_order ?? 0),
  };
}

/**
 * @param {Record<string, unknown>} optionRow
 */
export function toTestQuestionOptionStudentDto(optionRow) {
  return {
    optionId: Number(optionRow.id),
    optionText: sanitizeRichHtml(resolveOptionHtml(optionRow)),
    sortOrder: Number(optionRow.sort_order ?? 0),
  };
}

/**
 * @param {Record<string, unknown>} linkRow
 * @param {Array<Record<string, unknown>>} optionRows
 */
export function toLinkedTestQuestionAdminDto(linkRow, optionRows = []) {
  const bankMarks = Number(linkRow.marks ?? 1);
  const marksOverride = linkRow.marks_override == null ? null : Number(linkRow.marks_override);
  return {
    linkId: Number(linkRow.link_id),
    testId: Number(linkRow.test_id),
    questionId: Number(linkRow.question_id),
    displayOrder: Number(linkRow.display_order ?? 0),
    marksOverride,
    effectiveMarks: marksOverride ?? bankMarks,
    questionText: sanitizeRichHtml(resolveQuestionHtml(linkRow)),
    explanation:
      resolveExplanationHtml(linkRow) == null
        ? null
        : sanitizeRichHtml(resolveExplanationHtml(linkRow)),
    marks: bankMarks,
    difficulty: linkRow.difficulty == null ? null : String(linkRow.difficulty),
    topic: linkRow.topic == null ? null : String(linkRow.topic),
    subjectId: linkRow.subject_id == null ? null : Number(linkRow.subject_id),
    questionType: String(linkRow.question_type ?? 'mcq'),
    options: optionRows.map(toTestQuestionOptionAdminDto),
    linkedAt: toIsoTimestamp(linkRow.created_at),
    updatedAt: toIsoTimestamp(linkRow.updated_at),
  };
}

/**
 * @param {Record<string, unknown>} linkRow
 * @param {Array<Record<string, unknown>>} optionRows
 */
export function toLinkedTestQuestionStudentDto(linkRow, optionRows = []) {
  const bankMarks = Number(linkRow.marks ?? 1);
  const marksOverride = linkRow.marks_override == null ? null : Number(linkRow.marks_override);
  const effectiveMarks = marksOverride ?? bankMarks;
  return {
    questionId: Number(linkRow.question_id),
    displayOrder: Number(linkRow.display_order ?? 0),
    marks: effectiveMarks,
    effectiveMarks,
    questionText: sanitizeRichHtml(resolveQuestionHtml(linkRow)),
    options: optionRows.map(toTestQuestionOptionStudentDto),
  };
}

/**
 * @param {Record<string, unknown>} row
 */
export function toAvailableQuestionPickerDto(row) {
  return {
    questionId: Number(row.id ?? row.question_id),
    questionText: String(row.question_text ?? ''),
    difficulty: row.difficulty == null ? null : String(row.difficulty),
    topic: row.topic == null ? null : String(row.topic),
    subjectId: row.subject_id == null ? null : Number(row.subject_id),
    questionType: String(row.question_type ?? 'mcq'),
    marks: Number(row.marks ?? 1),
    courseId: Number(row.course_id),
  };
}

/**
 * @param {Record<string, unknown>} linkRow
 * @param {Array<Record<string, unknown>>} optionRows
 */
export function toTestQuestionLinkResultDto(linkRow, optionRows = []) {
  return toLinkedTestQuestionAdminDto(linkRow, optionRows);
}
