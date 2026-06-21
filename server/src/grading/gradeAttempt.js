/**
 * Public grading entry point — consumed by Submit module and other callers.
 */
export { gradeAttempt, calculateResult, createResult } from './grading.service.js';
export { calculateMarksBasedResult, normalizeEffectiveMarks } from './gradingCalculation.js';
