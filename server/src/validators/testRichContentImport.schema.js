import { z } from 'zod';
import {
  MAX_OPTION_TEXT_LENGTH,
  MAX_QUESTION_EXPLANATION_LENGTH,
  MAX_QUESTION_TEXT_LENGTH,
  MAX_QUESTION_TOPIC_LENGTH,
} from './questionWrite.schema.js';
import { MAX_TEST_EXPORT_QUESTIONS, RICH_CONTENT_FORMAT, RICH_CONTENT_FORMAT_VERSION } from '../constants/testRichContent.constants.js';
import { optionalQuestionDifficultySchema } from './questionList.schema.js';
import { TEST_CATEGORY_VALUES, TEST_TYPE_VALUES } from '../constants/testMetadata.constants.js';

const richContentOptionSchema = z.object({
  option_key: z.enum(['A', 'B', 'C', 'D']),
  option_html: z.string().min(1).max(MAX_OPTION_TEXT_LENGTH),
  option_text: z.string().max(MAX_OPTION_TEXT_LENGTH).optional(),
  image_url: z.string().max(1000).nullable().optional(),
  is_correct: z.boolean(),
  sort_order: z.number().int().min(0).max(10).optional(),
});

const richContentQuestionSchema = z.object({
  display_order: z.number().int().min(0).max(MAX_TEST_EXPORT_QUESTIONS),
  marks_override: z.number().positive().nullable().optional(),
  topic: z.string().max(MAX_QUESTION_TOPIC_LENGTH).nullable().optional(),
  difficulty: optionalQuestionDifficultySchema,
  question_type: z.literal('mcq').optional(),
  question_html: z.string().min(1).max(MAX_QUESTION_TEXT_LENGTH),
  question_text: z.string().max(MAX_QUESTION_TEXT_LENGTH).optional(),
  question_image_url: z.string().max(1000).nullable().optional(),
  explanation_html: z.string().max(MAX_QUESTION_EXPLANATION_LENGTH).nullable().optional(),
  explanation: z.string().max(MAX_QUESTION_EXPLANATION_LENGTH).nullable().optional(),
  marks: z.number().positive(),
  options: z.array(richContentOptionSchema).min(2).max(4),
});

const richContentTestMetadataSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  category: z.enum(TEST_CATEGORY_VALUES).optional(),
  test_type: z.enum(TEST_TYPE_VALUES).optional(),
  duration_minutes: z.number().int().positive(),
  passing_marks: z.number().min(0),
  max_attempts: z.number().int().positive(),
  negative_marking: z.number().min(0).optional(),
  shuffle_questions: z.boolean().optional(),
  shuffle_options: z.boolean().optional(),
  show_explanations: z.boolean().optional(),
  show_result_immediately: z.boolean().optional(),
  show_answers_after_submit: z.boolean().optional(),
  allow_retake: z.boolean().optional(),
  access_mode: z.enum(['private', 'public']).optional(),
  tags: z.array(z.string().max(80)).max(50).optional(),
});

export const richContentExportPackageSchema = z.object({
  format_version: z.literal(RICH_CONTENT_FORMAT_VERSION),
  format: z.literal(RICH_CONTENT_FORMAT),
  exported_at: z.string().datetime(),
  test: richContentTestMetadataSchema,
  subject_ids: z.array(z.number().int().positive()).max(50),
  questions: z.array(richContentQuestionSchema).min(1).max(MAX_TEST_EXPORT_QUESTIONS),
});

/** @param {unknown} body */
export function preprocessRichContentImportBody(body) {
  const obj = typeof body === 'object' && body !== null ? { ...body } : {};
  if (obj.courseId != null && obj.course_id == null) obj.course_id = obj.courseId;
  if (obj.fileName != null && obj.file_name == null) obj.file_name = obj.fileName;
  if (obj.package != null && obj.content == null) obj.content = obj.package;
  delete obj.courseId;
  delete obj.fileName;
  delete obj.package;
  return obj;
}

export const richContentImportRequestSchema = z.preprocess(
  preprocessRichContentImportBody,
  z.object({
    course_id: z.number().int().positive(),
    file_name: z.string().max(255).nullable().optional(),
    content: richContentExportPackageSchema,
  })
);

export { richContentQuestionSchema, richContentTestMetadataSchema };
