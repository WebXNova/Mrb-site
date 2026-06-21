import { validateQuestionImageUrl } from '../../../admin/utils/questionImageUrlValidation.js';
import {
  QUIZ_MCQ_MAX_EXPLANATION_LENGTH,
  QUIZ_MCQ_MAX_OPTIONS,
  QUIZ_MCQ_MIN_OPTIONS,
  QUIZ_MCQ_MIN_POINTS,
} from './quizMcqLimits.js';

/**
 * @typedef {{ code: string, field: string, message: string, optionIndex?: number }} QuizMcqClientIssue
 */

/**
 * @typedef {{ valid: boolean, issues: QuizMcqClientIssue[] }} QuizMcqClientValidationResult
 */

const INVISIBLE_CHARS = /[\u00a0\u200b\u200c\u200d\u2060\ufeff]/g;
const NBSP_ENTITIES = /&nbsp;|&#160;|&#x0*a0;/gi;

/**
 * Plain-text probe for required fields (UX only — server sanitizes authoritatively).
 * @param {string} html
 */
function plainTextLength(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(NBSP_ENTITIES, ' ')
    .replace(INVISIBLE_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

/**
 * @param {string} html
 */
function comparableChoiceText(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(NBSP_ENTITIES, ' ')
    .replace(INVISIBLE_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * UX-only MCQ validation for quiz builder cards.
 * Mirrors server mcqValidation.engine rules without duplicating its implementation.
 *
 * @param {import('../types/quizBuilder.types.js').QuizQuestion} question
 * @param {number} [index=0]
 * @returns {QuizMcqClientValidationResult}
 */
export function validateQuizMcqQuestionClient(question, index = 0) {
  /** @type {QuizMcqClientIssue[]} */
  const issues = [];
  const prefix = `questions[${index}]`;

  if (question.questionType !== 'multiple_choice' && question.questionType !== 'true_false') {
    return { valid: true, issues: [] };
  }

  if (plainTextLength(question.questionText) === 0) {
    issues.push({
      code: 'MCQ_QUESTION_TEXT_REQUIRED',
      field: `${prefix}.questionText`,
      message: 'Question text is required.',
    });
  }

  const points = Number(question.points);
  if (!Number.isFinite(points) || points < QUIZ_MCQ_MIN_POINTS) {
    issues.push({
      code: 'INVALID_QUESTION_POINTS',
      field: `${prefix}.points`,
      message: `Points must be at least ${QUIZ_MCQ_MIN_POINTS}.`,
    });
  }

  const choices = Array.isArray(question.choices) ? question.choices : [];
  if (choices.length < QUIZ_MCQ_MIN_OPTIONS || choices.length > QUIZ_MCQ_MAX_OPTIONS) {
    issues.push({
      code: 'MCQ_INVALID_OPTION_COUNT',
      field: `${prefix}.choices`,
      message: `Each question must have ${QUIZ_MCQ_MIN_OPTIONS}–${QUIZ_MCQ_MAX_OPTIONS} answer choices.`,
    });
  }

  const textSeen = new Map();
  let correctCount = 0;

  choices.forEach((choice, choiceIndex) => {
    const comparable = comparableChoiceText(choice.text);
    if (!comparable) {
      issues.push({
        code: 'MCQ_EMPTY_OPTION_TEXT',
        field: `${prefix}.choices[${choiceIndex}].text`,
        message: `Choice ${choiceIndex + 1} text cannot be empty.`,
        optionIndex: choiceIndex,
      });
    } else if (textSeen.has(comparable)) {
      issues.push({
        code: 'MCQ_DUPLICATE_OPTION_TEXT',
        field: `${prefix}.choices[${choiceIndex}].text`,
        message: `Choice ${choiceIndex + 1} duplicates another choice.`,
        optionIndex: choiceIndex,
      });
    } else {
      textSeen.set(comparable, choiceIndex);
    }

    if (choice.isCorrect) {
      correctCount += 1;
    }

    const imageUrl = choice.imageUrl;
    if (imageUrl != null && String(imageUrl).trim()) {
      const imageCheck = validateQuestionImageUrl(String(imageUrl));
      if (!imageCheck.ok) {
        issues.push({
          code: 'MCQ_INVALID_OPTION_IMAGE_URL',
          field: `${prefix}.choices[${choiceIndex}].imageUrl`,
          message: imageCheck.message,
          optionIndex: choiceIndex,
        });
      }
    }
  });

  if (choices.length >= QUIZ_MCQ_MIN_OPTIONS) {
    if (correctCount === 0) {
      issues.push({
        code: 'MCQ_NO_CORRECT_OPTION',
        field: `${prefix}.choices`,
        message: 'Select exactly one correct answer.',
      });
    } else if (correctCount > 1) {
      issues.push({
        code: 'MCQ_MULTIPLE_CORRECT_OPTIONS',
        field: `${prefix}.choices`,
        message: 'Only one choice may be marked correct.',
      });
    }
  }

  if (question.questionImageUrl != null && String(question.questionImageUrl).trim()) {
    const imageCheck = validateQuestionImageUrl(String(question.questionImageUrl));
    if (!imageCheck.ok) {
      issues.push({
        code: 'MCQ_INVALID_QUESTION_IMAGE_URL',
        field: `${prefix}.questionImageUrl`,
        message: imageCheck.message,
      });
    }
  }

  if (question.explanation && plainTextLength(question.explanation) > QUIZ_MCQ_MAX_EXPLANATION_LENGTH) {
    issues.push({
      code: 'EXPLANATION_TOO_LONG',
      field: `${prefix}.explanation`,
      message: `Explanation must not exceed ${QUIZ_MCQ_MAX_EXPLANATION_LENGTH} characters.`,
    });
  }

  return { valid: issues.length === 0, issues };
}

/**
 * @param {import('../types/quizBuilder.types.js').QuizQuestion} question
 */
export function isPersistableQuizQuestion(question) {
  return validateQuizMcqQuestionClient(question, 0).valid;
}

/**
 * Questions complete enough to persist to the server (excludes empty placeholders).
 * @param {import('../types/quizBuilder.types.js').QuizQuestion[]} questions
 */
export function filterPersistableQuizDraftQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  return questions.filter((question) => isPersistableQuizQuestion(question));
}

/**
 * @param {import('../types/quizBuilder.types.js').QuizQuestion[]} questions
 */
export function validateQuizDraftQuestionsClient(questions) {
  const persistable = filterPersistableQuizDraftQuestions(questions);
  if (!persistable.length) {
    return {
      valid: false,
      issues: [
        {
          code: 'NO_PERSISTABLE_QUESTIONS',
          field: 'questions',
          message: 'Add at least one complete question (text + one correct answer).',
        },
      ],
    };
  }

  /** @type {QuizMcqClientIssue[]} */
  const issues = [];
  persistable.forEach((question, index) => {
    const result = validateQuizMcqQuestionClient(question, index);
    issues.push(...result.issues);
  });
  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * @param {QuizMcqClientIssue[]} issues
 */
export function primaryClientValidationMessage(issues) {
  return issues[0]?.message || 'Fix validation errors before saving.';
}
