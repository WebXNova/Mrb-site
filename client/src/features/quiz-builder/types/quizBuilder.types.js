/**
 * @typedef {'multiple_choice' | 'multiple_response' | 'true_false' | 'fill_in_blank' | 'matching' | 'ordering' | 'numeric' | 'short_answer' | 'essay' | 'file_upload'} QuestionTypeId
 */

/**
 * @typedef {Object} QuizChoice
 * @property {string} id
 * @property {string} text
 * @property {boolean} isCorrect
 */

/**
 * @typedef {Object} QuizQuestion
 * @property {string} id
 * @property {string} title
 * @property {string} questionText
 * @property {number} points
 * @property {QuestionTypeId} questionType
 * @property {boolean} collapsed
 * @property {boolean} showExplanation
 * @property {string} explanation
 * @property {QuizChoice[]} choices
 */

/**
 * @typedef {Object} QuizBuilderState
 * @property {QuizQuestion[]} questions
 * @property {boolean} isDirty
 */

export {};
