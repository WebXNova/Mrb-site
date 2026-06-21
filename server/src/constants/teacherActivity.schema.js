/**
 * Canonical teacher activity action types for Q&A monitoring.
 */

export const TEACHER_ACTIVITY_ACTIONS = Object.freeze({
  QUESTION_VIEWED: 'QUESTION_VIEWED',
  QUESTION_ANSWERED: 'QUESTION_ANSWERED',
  ANSWER_UPDATED: 'ANSWER_UPDATED',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
});

/** @type {Set<string>} */
export const TEACHER_ACTIVITY_ACTION_SET = new Set(Object.values(TEACHER_ACTIVITY_ACTIONS));

/**
 * Weighted score per action for teacher activity ranking.
 * @type {Record<string, number>}
 */
export const TEACHER_ACTIVITY_SCORE_WEIGHTS = Object.freeze({
  QUESTION_ANSWERED: 10,
  ANSWER_UPDATED: 5,
  QUESTION_VIEWED: 1,
  LOGIN: 2,
  LOGOUT: 0,
});

/**
 * @param {string} actionType
 */
export function isValidTeacherActivityAction(actionType) {
  return TEACHER_ACTIVITY_ACTION_SET.has(String(actionType || '').toUpperCase());
}
