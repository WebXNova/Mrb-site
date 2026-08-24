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
 * @property {string} [itemType]
 * @property {string} title
 * @property {string} questionText
 * @property {number} points
 * @property {QuestionTypeId} questionType
 * @property {boolean} collapsed
 * @property {boolean} showExplanation
 * @property {string} explanation
 * @property {boolean} [showTip]
 * @property {string} [tip]
 * @property {QuizChoice[]} choices
 */

/**
 * @typedef {Object} QuizSection
 * @property {string} id
 * @property {'section'} itemType
 * @property {number|null} [subjectId]
 * @property {string} subjectLabel
 * @property {boolean} collapsed
 * @property {boolean} showDividerContent
 * @property {string} dividerContentHtml
 */

/** @typedef {QuizQuestion | QuizSection} QuizDraftItem */

/**
 * @typedef {Object} QuizBuilderState
 * @property {QuizDraftItem[]} questions
 * @property {boolean} isDirty
 */

export {};
