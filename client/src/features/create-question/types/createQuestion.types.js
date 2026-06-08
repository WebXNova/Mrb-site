/**

 * @file JSDoc type definitions for the Create Question feature.

 */



/**

 * @typedef {'single_choice_mcq'} QuestionType

 */



/**

 * @typedef {'' | 'easy' | 'medium' | 'hard'} DifficultyLevel

 */



/**

 * @typedef {Object} QuestionMetadata

 * @property {string} courseId

 * @property {string} subjectId

 * @property {string} topic

 * @property {DifficultyLevel} difficulty

 * @property {number} marks

 * @property {QuestionType} questionType

 */



/**

 * @typedef {Object} QuestionBody

 * @property {string} textPlain

 * @property {string} textHtmlDraft

 */



/**

 * @typedef {'A' | 'B' | 'C' | 'D'} OptionKey

 */



/**

 * Only validated image_url values are stored.

 *

 * @typedef {Object} McqOptionValue

 * @property {string} text

 * @property {string} image_url

 * @property {boolean} is_correct

 */



/**

 * Fixed A–D MCQ options map.

 * Only one correct option is allowed by design.

 *

 * @typedef {Record<OptionKey, McqOptionValue>} McqOptionsMap

 */



/** @typedef {import('./explanation.contract.js').ExplanationAuthoringState} ExplanationField */


/**

 * @typedef {'none' | 'upload' | 'url'} QuestionImageSource

 */



/**

 * @typedef {Object} QuestionImageState

 * @property {string} url

 * @property {QuestionImageSource} source

 */



/**

 * @typedef {Object} CreateQuestionUiState

 * @property {boolean} loading

 * @property {Record<string, string>} errors

 * @property {boolean} isDirty

 * @property {boolean} previewVisible

 */



/**

 * @typedef {Object} CreateQuestionState

 * @property {QuestionMetadata} metadata

 * @property {QuestionBody} question

 * @property {McqOptionsMap} options

 * @property {ExplanationField} explanation

 * @property {QuestionImageState} questionImage

 * @property {CreateQuestionUiState} ui

 */



export {};


