/**
 * Question palette status for exam navigation.
 * @typedef {'current' | 'answered' | 'visited' | 'unvisited'} QuestionStatus
 */

/** @param {{ questionId: string, currentId: string|null, answers: Record<string, string|null>, visited: Set<string> }} params */
export function getQuestionStatus({ questionId, currentId, answers, visited }) {
  if (questionId === currentId) return 'current';
  if (answers[questionId] != null && answers[questionId] !== '') return 'answered';
  if (visited.has(questionId)) return 'visited';
  return 'unvisited';
}

/** @param {QuestionStatus} status */
export function getQuestionStatusLabel(status) {
  switch (status) {
    case 'current':
      return 'Current question';
    case 'answered':
      return 'Answered';
    case 'visited':
      return 'Visited, not answered';
    default:
      return 'Not visited';
  }
}

/**
 * @param {string[]} questionIds
 * @param {Record<string, string|null>} answers
 */
export function countAnswered(questionIds, answers) {
  return questionIds.reduce((count, id) => (answers[id] != null && answers[id] !== '' ? count + 1 : count), 0);
}
