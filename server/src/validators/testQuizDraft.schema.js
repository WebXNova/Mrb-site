import { z } from 'zod';
import { MAX_QUESTIONS_PER_TEST, parsePositiveTestId } from './testQuestionLimits.schema.js';
import { MIN_QUESTION_MARKS, MAX_QUESTION_MARKS } from './questionMarks.validation.js';
import { PUBLISHED_EDIT_CONTROL_KEYS } from '../services/publishedTestEdit.service.js';

export const QUIZ_DRAFT_SCHEMA_VERSION = 1;
export const QUIZ_DRAFT_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
export const QUIZ_DRAFT_MAX_CHOICES = 4;
export const QUIZ_DRAFT_MIN_CHOICES = 2;
export const QUIZ_DRAFT_MAX_POINTS = MAX_QUESTION_MARKS;
export const QUIZ_DRAFT_MIN_POINTS = MIN_QUESTION_MARKS;

export const QUIZ_DRAFT_QUESTION_TYPES = Object.freeze([
  'multiple_choice',
  'multiple_response',
  'true_false',
  'fill_in_blank',
  'matching',
  'ordering',
  'numeric',
  'short_answer',
  'essay',
  'file_upload',
]);

const choiceSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    text: z.string().max(50_000),
    isCorrect: z.boolean(),
    imageUrl: z.string().max(1000).nullable().optional(),
  })
  .strict();

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} keys
 */
function firstDefinedString(row, keys) {
  for (const key of keys) {
    if (row[key] != null) return String(row[key]);
  }
  return '';
}

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} keys
 */
function firstDefinedBoolean(row, keys) {
  for (const key of keys) {
    if (row[key] != null) return Boolean(row[key]);
  }
  return false;
}

/**
 * Map client aliases onto the persisted section shape.
 * @param {unknown} raw
 */
function normalizeSectionInput(raw) {
  if (!raw || typeof raw !== 'object' || /** @type {{ itemType?: string }} */ (raw).itemType !== 'section') {
    return raw;
  }
  const row = /** @type {Record<string, unknown>} */ (raw);
  const rawSubjectId = row.subjectId ?? row.subject_id;
  const subjectId = rawSubjectId == null || rawSubjectId === '' ? null : Number(rawSubjectId);
  return {
    id: row.id,
    itemType: 'section',
    subjectId: Number.isInteger(subjectId) && subjectId > 0 ? subjectId : null,
    subjectLabel: firstDefinedString(row, ['subjectLabel', 'label']),
    collapsed: Boolean(row.collapsed),
    showDividerContent: firstDefinedBoolean(row, ['showDividerContent', 'showDividerContent']),
    dividerContentHtml: firstDefinedString(row, [
      'dividerContentHtml',
      'dividerContentHtml',
      'dividerHtml',
    ]),
  };
}

const sectionSchema = z.preprocess(
  normalizeSectionInput,
  z.object({
    id: z.string().trim().min(1).max(64),
      itemType: z.literal('section'),
      subjectId: z.number().int().positive().nullable().optional(),
      subjectLabel: z.string().max(200),
    collapsed: z.boolean(),
    showDividerContent: z.boolean(),
    dividerContentHtml: z.string().max(100_000),
  })
);

const questionSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    title: z.string().max(500),
    questionText: z.string().max(100_000),
    questionImageUrl: z.string().max(1000).nullable().optional(),
    points: z.number().min(QUIZ_DRAFT_MIN_POINTS).max(QUIZ_DRAFT_MAX_POINTS),
    questionType: z.enum(QUIZ_DRAFT_QUESTION_TYPES),
    collapsed: z.boolean(),
    showExplanation: z.boolean(),
    explanation: z.string().max(10_000),
    showTip: z.boolean().optional().default(false),
    tip: z.string().max(10_000).optional().default(''),
    choices: z.array(choiceSchema).min(QUIZ_DRAFT_MIN_CHOICES).max(QUIZ_DRAFT_MAX_CHOICES),
  })
  .strict();

const draftItemSchema = z.union([sectionSchema, questionSchema]);

export { questionSchema, sectionSchema, draftItemSchema };

export const quizDraftPayloadSchema = z
  .object({
    version: z.literal(QUIZ_DRAFT_SCHEMA_VERSION),
    testId: z
      .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
      .transform((value) => Number(value)),
    storageKey: z.string().max(128).optional(),
    questions: z.array(draftItemSchema).max(MAX_QUESTIONS_PER_TEST),
    totalPoints: z.number().min(0).max(MAX_QUESTIONS_PER_TEST * QUIZ_DRAFT_MAX_POINTS),
    savedAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  })
  .strict();

export const upsertTestQuizDraftBodySchema = z
  .object({
    expectedVersion: z.number().int().min(1).nullable().optional(),
    draftPayload: quizDraftPayloadSchema,
    confirm_published_edit: z.boolean().optional(),
    expected_updated_at: z.string().datetime().or(z.string().min(1)).optional(),
  })
  .strict();

export { parsePositiveTestId };
