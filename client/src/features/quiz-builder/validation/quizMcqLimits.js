/**
 * Quiz MCQ limits — aligned with server mcqValidation.constants + testQuizDraft.schema.
 * UX hints only; server validation is authoritative.
 */
export const QUIZ_MCQ_MIN_OPTIONS = 2;
export const QUIZ_MCQ_MAX_OPTIONS = 4;
export const QUIZ_MCQ_MIN_POINTS = 0.5;
export const QUIZ_MCQ_MAX_POINTS = 1000;
export const QUIZ_MCQ_MAX_EXPLANATION_LENGTH = 10_000;
