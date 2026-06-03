import { z } from 'zod';
import { optionalQuestionDifficultySchema } from './questionList.schema.js';

export const MAX_MCQ_OPTIONS = 10;

/** Abuse-prevention field length caps (applied after trim on write APIs). */
export const MAX_QUESTION_TEXT_LENGTH = 10_000;
export const MAX_OPTION_TEXT_LENGTH = 1_000;
export const MAX_QUESTION_TOPIC_LENGTH = 255;
export const MAX_QUESTION_EXPLANATION_LENGTH = 10_000;

/** Phase 1 — Question Bank API accepts MCQ only. */
export const PHASE_1_QUESTION_TYPE = 'mcq';

/**
 * Future Phase 2+ types (not accepted by create/update until implemented):
 * - tf: true/false — add assertTfBusinessRules + option schema in service layer
 * - essay: free text — add assertEssayBusinessRules; options not required
 */
export const FUTURE_QUESTION_TYPES = Object.freeze(['tf', 'essay']);

/** All known types (documentation / import pipelines); API write paths use PHASE_1 only. */
export const QUESTION_TYPES = Object.freeze([PHASE_1_QUESTION_TYPE, ...FUTURE_QUESTION_TYPES]);

const UNSUPPORTED_QUESTION_TYPE_MESSAGE =
  'question_type must be "mcq" (Phase 1 supports MCQ only). Future types: tf, essay.';

function maxLengthMessage(field, max) {
  return `${field} must not exceed ${max} characters`;
}

const phase1QuestionTypeSchema = z.literal(PHASE_1_QUESTION_TYPE, {
  errorMap: () => ({ message: UNSUPPORTED_QUESTION_TYPE_MESSAGE }),
});

/** Normalize snake_case and camelCase request bodies to a single shape. */
function preprocessQuestionBody(raw) {
  const obj = typeof raw === 'object' && raw !== null ? { ...raw } : {};

  if (obj.courseId != null && obj.course_id == null) obj.course_id = obj.courseId;
  if (obj.subjectId != null && obj.subject_id == null) obj.subject_id = obj.subjectId;
  if (obj.questionText != null && obj.question_text == null) obj.question_text = obj.questionText;
  if (obj.questionType != null && obj.question_type == null) obj.question_type = obj.questionType;

  delete obj.courseId;
  delete obj.subjectId;
  delete obj.questionText;
  delete obj.questionType;

  if (Array.isArray(obj.options)) {
    obj.options = obj.options.map((opt) => {
      if (typeof opt !== 'object' || opt === null) return opt;
      const normalized = { ...opt };
      if (normalized.optionText != null && normalized.option_text == null) {
        normalized.option_text = normalized.optionText;
      }
      if (normalized.isCorrect != null && normalized.is_correct == null) {
        normalized.is_correct = normalized.isCorrect;
      }
      if (normalized.sortOrder != null && normalized.sort_order == null) {
        normalized.sort_order = normalized.sortOrder;
      }
      delete normalized.optionText;
      delete normalized.isCorrect;
      delete normalized.sortOrder;
      return normalized;
    });
  }

  return obj;
}

const optionalNullableTopicSchema = z.preprocess(
  (value) => (value == null || String(value).trim() === '' ? null : String(value).trim()),
  z.union([
    z.null(),
    z.string().max(MAX_QUESTION_TOPIC_LENGTH, maxLengthMessage('topic', MAX_QUESTION_TOPIC_LENGTH)),
  ]).optional()
);

const questionTextSchema = z
  .string()
  .trim()
  .min(1, 'question_text is required')
  .max(MAX_QUESTION_TEXT_LENGTH, maxLengthMessage('question_text', MAX_QUESTION_TEXT_LENGTH));

const explanationSchema = z.preprocess(
  (value) => (value == null || String(value).trim() === '' ? null : String(value).trim()),
  z.union([
    z.null(),
    z
      .string()
      .max(MAX_QUESTION_EXPLANATION_LENGTH, maxLengthMessage('explanation', MAX_QUESTION_EXPLANATION_LENGTH)),
  ]).optional()
);

const questionOptionSchema = z.object({
  option_text: z
    .string()
    .trim()
    .min(1, 'option_text is required')
    .max(MAX_OPTION_TEXT_LENGTH, maxLengthMessage('option_text', MAX_OPTION_TEXT_LENGTH)),
  is_correct: z.boolean(),
  sort_order: z.number().int().min(0).optional(),
});

function assertExactlyOneCorrectOption(
  options,
  ctx,
  path = ['options']
) {
  const correctCount = options.filter((opt) => opt.is_correct).length;
  if (correctCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Exactly one option must be marked as correct',
      path,
    });
  }
}

function assertMcqOptionsShape(options, ctx) {
  if (options.length < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least 2 options are required for mcq',
      path: ['options'],
    });
    return;
  }
  if (options.length > MAX_MCQ_OPTIONS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `At most ${MAX_MCQ_OPTIONS} options are allowed for mcq`,
      path: ['options'],
    });
    return;
  }
  assertExactlyOneCorrectOption(options, ctx);
}

const questionWriteFields = {
  course_id: z.number({ invalid_type_error: 'course_id must be a number' }).int().positive(),
  subject_id: z
    .number({ invalid_type_error: 'subject_id must be a number' })
    .int()
    .positive()
    .optional()
    .nullable(),
  topic: optionalNullableTopicSchema,
  difficulty: optionalQuestionDifficultySchema,
  question_text: questionTextSchema,
  marks: z.number({ invalid_type_error: 'marks must be a number' }).positive('marks must be greater than 0'),
  explanation: explanationSchema,
  options: z.array(questionOptionSchema).min(2, 'At least 2 options are required'),
};

export const createQuestionBodySchema = z.preprocess(
  preprocessQuestionBody,
  z
    .object({
      ...questionWriteFields,
      question_type: phase1QuestionTypeSchema.optional().default(PHASE_1_QUESTION_TYPE),
    })
    .strict()
    .superRefine((data, ctx) => {
      assertExactlyOneCorrectOption(data.options, ctx);
    })
);

export const updateQuestionBodySchema = z.preprocess(
  preprocessQuestionBody,
  z
    .object({
      ...questionWriteFields,
      question_type: phase1QuestionTypeSchema,
    })
    .strict()
    .superRefine((data, ctx) => {
      assertMcqOptionsShape(data.options, ctx);
    })
);
