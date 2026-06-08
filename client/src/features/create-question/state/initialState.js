import { DEFAULT_QUESTION_MARKS, PHASE_1_QUESTION_TYPE } from '../../../admin/constants/questionBank.constants.js';
import { OPTION_KEYS } from '../utils/options/optionKeys.js';

/** @typedef {import('../types/createQuestion.types.js').McqOptionsMap} McqOptionsMap */

/**
 * @returns {McqOptionsMap}
 */
export function createDefaultOptions() {
  return OPTION_KEYS.reduce((acc, key) => {
    acc[key] = {
      text: '',
      image_url: '',
      is_correct: key === 'A',
    };
    return acc;
  }, /** @type {McqOptionsMap} */ ({}));
}

/** @returns {import('../types/createQuestion.types.js').CreateQuestionState} */
export function createInitialCreateQuestionState() {
  return {
    metadata: {
      courseId: '',
      subjectId: '',
      topic: '',
      difficulty: '',
      marks: DEFAULT_QUESTION_MARKS,
      questionType: PHASE_1_QUESTION_TYPE,
    },
    question: {
      textPlain: '',
      textHtmlDraft: '',
    },
    options: createDefaultOptions(),
    explanation: {
      textPlain: '',
      textHtmlDraft: '',
    },
    questionImage: {
      url: '',
      source: 'none',
    },
    ui: {
      loading: false,
      errors: {},
      isDirty: false,
      previewVisible: true,
    },
  };
}
