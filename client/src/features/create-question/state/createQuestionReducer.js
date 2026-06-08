import { CREATE_QUESTION_ACTIONS } from './createQuestionActions.js';
import { createInitialCreateQuestionState } from './initialState.js';
import { validateImageUrl } from '../utils/image/validateImageUrl.js';
import { validateOptionImageUrl } from '../utils/image/validateOptionImageUrl.js';
import { coerceOptionsIntegrity, setCorrectAnswer } from '../utils/options/mcqOptionsCorrectness.js';
import { isOptionKey } from '../utils/options/optionKeys.js';
import { createDefaultOptions } from './initialState.js';

/** @typedef {import('../types/createQuestion.types.js').CreateQuestionState} CreateQuestionState */

/**
 * Immutable reducer — all mutations flow through dispatched actions.
 * User Input → Local State → (future sanitization) → Preview → (future API)
 *
 * @param {CreateQuestionState} state
 * @param {{ type: string, payload?: unknown }} action
 * @returns {CreateQuestionState}
 */
export function createQuestionReducer(state, action) {
  switch (action.type) {
    case CREATE_QUESTION_ACTIONS.SET_METADATA_FIELD: {
      const { field, value } = /** @type {{ field: string, value: unknown }} */ (action.payload);
      return {
        ...state,
        metadata: { ...state.metadata, [field]: value },
        ui: { ...state.ui, isDirty: true },
      };
    }

    case CREATE_QUESTION_ACTIONS.SET_QUESTION_TEXT: {
      const { textPlain, textHtmlDraft } = /** @type {{ textPlain: string, textHtmlDraft?: string }} */ (
        action.payload
      );
      return {
        ...state,
        question: {
          textPlain,
          textHtmlDraft: textHtmlDraft ?? textPlain,
        },
        ui: { ...state.ui, isDirty: true },
      };
    }

    case CREATE_QUESTION_ACTIONS.UPDATE_OPTION_TEXT: {
      const { optionKey, text } = /** @type {{ optionKey: string, text: string }} */ (action.payload);
      if (!isOptionKey(optionKey)) return state;
      const nextErrors = { ...state.ui.errors };
      delete nextErrors[`option_${optionKey}_text`];
      return {
        ...state,
        options: {
          ...state.options,
          [optionKey]: { ...state.options[optionKey], text: String(text ?? '') },
        },
        ui: { ...state.ui, isDirty: true, errors: nextErrors },
      };
    }

    case CREATE_QUESTION_ACTIONS.UPDATE_OPTION_IMAGE: {
      const { optionKey, imageUrl } = /** @type {{ optionKey: string, imageUrl: string }} */ (
        action.payload
      );
      if (!isOptionKey(optionKey)) return state;

      const trimmed = String(imageUrl ?? '').trim();
      const nextErrors = { ...state.ui.errors };
      delete nextErrors[`option_${optionKey}_image`];

      if (!trimmed) {
        return {
          ...state,
          options: {
            ...state.options,
            [optionKey]: { ...state.options[optionKey], image_url: '' },
          },
          ui: { ...state.ui, isDirty: true, errors: nextErrors },
        };
      }

      const check = validateOptionImageUrl(trimmed);
      if (!check.ok) {
        return {
          ...state,
          ui: {
            ...state.ui,
            errors: { ...nextErrors, [`option_${optionKey}_image`]: check.message },
          },
        };
      }

      return {
        ...state,
        options: {
          ...state.options,
          [optionKey]: { ...state.options[optionKey], image_url: check.url },
        },
        ui: { ...state.ui, isDirty: true, errors: nextErrors },
      };
    }

    case CREATE_QUESTION_ACTIONS.SET_CORRECT_OPTION: {
      const { optionKey } = /** @type {{ optionKey: string }} */ (action.payload);
      if (!isOptionKey(optionKey)) return state;
      return {
        ...state,
        options: setCorrectAnswer(state.options, optionKey),
        ui: { ...state.ui, isDirty: true },
      };
    }

    case CREATE_QUESTION_ACTIONS.RESET_OPTIONS: {
      const nextErrors = { ...state.ui.errors };
      for (const key of ['A', 'B', 'C', 'D']) {
        delete nextErrors[`option_${key}_text`];
        delete nextErrors[`option_${key}_image`];
      }
      delete nextErrors.options;
      return {
        ...state,
        options: coerceOptionsIntegrity(createDefaultOptions()),
        ui: { ...state.ui, isDirty: true, errors: nextErrors },
      };
    }

    case CREATE_QUESTION_ACTIONS.SET_EXPLANATION_TEXT: {
      const { textPlain, textHtmlDraft } = /** @type {{ textPlain: string, textHtmlDraft?: string }} */ (
        action.payload
      );
      return {
        ...state,
        explanation: {
          textPlain,
          textHtmlDraft: textHtmlDraft ?? textPlain,
        },
        ui: { ...state.ui, isDirty: true },
      };
    }

    case CREATE_QUESTION_ACTIONS.SET_QUESTION_IMAGE: {
      const { url, source } = /** @type {{ url: string, source: 'upload' | 'url' }} */ (action.payload);
      const check = validateImageUrl(url);
      if (!check.ok) {
        return {
          ...state,
          ui: {
            ...state.ui,
            errors: { ...state.ui.errors, questionImage: check.message },
          },
        };
      }
      const nextErrors = { ...state.ui.errors };
      delete nextErrors.questionImage;
      return {
        ...state,
        questionImage: { url: check.url, source },
        ui: { ...state.ui, isDirty: true, errors: nextErrors },
      };
    }

    case CREATE_QUESTION_ACTIONS.REMOVE_QUESTION_IMAGE: {
      const nextErrors = { ...state.ui.errors };
      delete nextErrors.questionImage;
      return {
        ...state,
        questionImage: { url: '', source: 'none' },
        ui: { ...state.ui, isDirty: true, errors: nextErrors },
      };
    }

    case CREATE_QUESTION_ACTIONS.SET_UI_LOADING: {
      const loading = Boolean(action.payload);
      return { ...state, ui: { ...state.ui, loading } };
    }

    case CREATE_QUESTION_ACTIONS.SET_FIELD_ERRORS: {
      const errors = /** @type {Record<string, string>} */ (action.payload);
      return { ...state, ui: { ...state.ui, errors: { ...errors } } };
    }

    case CREATE_QUESTION_ACTIONS.CLEAR_FIELD_ERROR: {
      const field = String(action.payload);
      if (!state.ui.errors[field]) return state;
      const nextErrors = { ...state.ui.errors };
      delete nextErrors[field];
      return { ...state, ui: { ...state.ui, errors: nextErrors } };
    }

    case CREATE_QUESTION_ACTIONS.SET_PREVIEW_VISIBLE: {
      const previewVisible = Boolean(action.payload);
      return { ...state, ui: { ...state.ui, previewVisible } };
    }

    case CREATE_QUESTION_ACTIONS.RESET_FORM:
      return createInitialCreateQuestionState();

    default:
      return state;
  }
}
