/** Phase 1 — Question Bank supports single-choice MCQ only (no UI selector). */
export const PHASE_1_QUESTION_TYPE = 'single_choice_mcq';

export const QUESTION_DIFFICULTY_OPTIONS = Object.freeze([
  { value: '', label: 'Select difficulty (optional)' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]);

export const DEFAULT_QUESTION_MARKS = 1;
export const MIN_QUESTION_MARKS = 0.01;
export const MAX_QUESTION_TOPIC_LENGTH = 255;

/** Aligned with server questionWrite.schema MAX_QUESTION_EXPLANATION_LENGTH. */
export const MAX_QUESTION_EXPLANATION_LENGTH = 10_000;
