/**
 * Pure marks-based grading — single calculation authority.
 *
 * Uses effective_marks per question (COALESCE(marks_override, bank.marks, 1)).
 * Score, max score, and percentage are always marks-weighted — never per-question counts.
 */

/**
 * @param {unknown} value
 * @returns {number}
 */
export function normalizeEffectiveMarks(value) {
  const marks = Number(value);
  if (!Number.isFinite(marks) || marks <= 0) {
    return 1;
  }
  return marks;
}

/**
 * Resolve effective marks from composed question rows or DB-shaped rows.
 *
 * @param {{ effectiveMarks?: unknown, effective_marks?: unknown, marks?: unknown }|null|undefined} question
 * @returns {number}
 */
export function resolveQuestionEffectiveMarks(question) {
  return normalizeEffectiveMarks(
    question?.effectiveMarks ?? question?.effective_marks ?? question?.marks
  );
}

/**
 * @param {number} value
 * @returns {number}
 */
export function roundMarksValue(value) {
  return Math.round(Number(value) * 100) / 100;
}

/**
 * @param {number} score
 * @param {number} maxScore
 * @returns {number}
 */
export function calculatePercentage(score, maxScore) {
  const max = Number(maxScore);
  if (!Number.isFinite(max) || max <= 0) {
    return 0;
  }
  return roundMarksValue((Number(score) / max) * 100);
}

/**
 * @typedef {object} GradingQuestionInput
 * @property {number} [questionId]
 * @property {number} [effectiveMarks]
 * @property {number|null} [selectedOptionId]
 * @property {number|null} [correctOptionId]
 */

/**
 * @typedef {object} GradingTestConfig
 * @property {number} [passingMarks]
 * @property {boolean} [negativeMarkingEnabled]
 * @property {number} [negativeMarkingValue]
 */

/**
 * @typedef {object} MarksBasedResult
 * @property {number} totalQuestions
 * @property {number} correctAnswers
 * @property {number} wrongAnswers
 * @property {number} unansweredAnswers
 * @property {number} score
 * @property {number} maxScore
 * @property {number} percentage
 * @property {'PASS'|'FAIL'} passStatus
 */

/**
 * @param {number|null|undefined} selectedOptionId
 * @param {number|null|undefined} correctOptionId
 * @returns {boolean}
 */
export function isAnswerCorrect(selectedOptionId, correctOptionId) {
  return (
    selectedOptionId != null &&
    correctOptionId != null &&
    Number(selectedOptionId) === Number(correctOptionId)
  );
}

/**
 * @param {{
 *   effectiveMarks: number,
 *   selectedOptionId: number|null,
 *   correctOptionId: number|null,
 *   negativeMarkingEnabled?: boolean,
 *   negativeMarkingValue?: number,
 * }} input
 * @returns {number}
 */
export function calculateQuestionMarksAwarded({
  effectiveMarks,
  selectedOptionId,
  correctOptionId,
  negativeMarkingEnabled = false,
  negativeMarkingValue = 0,
}) {
  const marks = normalizeEffectiveMarks(effectiveMarks);

  if (selectedOptionId == null) {
    return 0;
  }

  if (isAnswerCorrect(selectedOptionId, correctOptionId)) {
    return marks;
  }

  if (negativeMarkingEnabled && Number(negativeMarkingValue) > 0) {
    return -Number(negativeMarkingValue);
  }

  return 0;
}

/**
 * Pure marks-based grading — no I/O, no trust of client values.
 *
 * @param {{
 *   questions: GradingQuestionInput[],
 *   testConfig: GradingTestConfig,
 * }} input
 * @returns {MarksBasedResult}
 */
export function calculateMarksBasedResult({ questions, testConfig = {} }) {
  const passingMarks = Number(testConfig.passingMarks ?? 0);
  const negativeMarkingEnabled = Boolean(testConfig.negativeMarkingEnabled);
  const negativeMarkingValue = Number(testConfig.negativeMarkingValue ?? 0);

  let correctAnswers = 0;
  let wrongAnswers = 0;
  let unansweredAnswers = 0;
  let score = 0;
  let maxScore = 0;

  for (const question of questions) {
    const effectiveMarks = normalizeEffectiveMarks(question.effectiveMarks);
    maxScore += effectiveMarks;

    const selectedOptionId =
      question.selectedOptionId == null ? null : Number(question.selectedOptionId);
    const correctOptionId =
      question.correctOptionId == null ? null : Number(question.correctOptionId);

    if (selectedOptionId == null) {
      unansweredAnswers += 1;
      continue;
    }

    if (isAnswerCorrect(selectedOptionId, correctOptionId)) {
      correctAnswers += 1;
      score += effectiveMarks;
      continue;
    }

    wrongAnswers += 1;
    if (negativeMarkingEnabled && negativeMarkingValue > 0) {
      score -= negativeMarkingValue;
    }
  }

  const roundedScore = roundMarksValue(score);
  const roundedMaxScore = roundMarksValue(maxScore);
  const percentage = calculatePercentage(roundedScore, roundedMaxScore);
  const passStatus = roundedScore >= passingMarks ? 'PASS' : 'FAIL';

  return {
    totalQuestions: questions.length,
    correctAnswers,
    wrongAnswers,
    unansweredAnswers,
    score: roundedScore,
    maxScore: roundedMaxScore,
    percentage,
    passStatus,
  };
}
