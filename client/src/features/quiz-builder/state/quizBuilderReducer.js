import { QUIZ_MCQ_MAX_OPTIONS } from '../validation/quizMcqLimits.js';
import { QUIZ_BUILDER_ACTIONS } from './quizBuilderActions.js';
import {
  cloneQuizQuestion,
  cloneQuizSection,
  createChoice,
  createQuizQuestion,
  createQuizSection,
} from './quizQuestionFactory.js';
import { filterQuizQuestions, isQuizQuestion, isQuizSection } from '../utils/quizDraftItems.js';
import { normalizeQuizSection } from '../utils/normalizeQuizSection.js';

/** @typedef {import('../types/quizBuilder.types.js').QuizDraftItem} QuizDraftItem */

/** @type {import('../types/quizBuilder.types.js').QuizBuilderState} */
export const initialQuizBuilderState = {
  questions: [createQuizQuestion()],
  isDirty: false,
};

/**
 * @param {QuizDraftItem[]} questions
 */
function withDirty(questions) {
  return { questions, isDirty: true };
}

/**
 * @param {QuizDraftItem[]} items
 */
function ensureMinimumDraftItems(items) {
  if (items.length === 0) {
    return [createQuizQuestion()];
  }
  if (filterQuizQuestions(items).length === 0) {
    return items;
  }
  return items;
}

/**
 * @param {import('../types/quizBuilder.types.js').QuizBuilderState} state
 * @param {{ type: string, payload?: unknown }} action
 */
export function quizBuilderReducer(state, action) {
  switch (action.type) {
    case QUIZ_BUILDER_ACTIONS.ADD_QUESTION:
      return withDirty([...state.questions, createQuizQuestion()]);

    case QUIZ_BUILDER_ACTIONS.ADD_SECTION:
      return withDirty([...state.questions, createQuizSection()]);

    case QUIZ_BUILDER_ACTIONS.INSERT_QUESTION_AT: {
      const index = Number(/** @type {{ index?: number }} */ (action.payload)?.index);
      const safeIndex = Number.isFinite(index)
        ? Math.max(0, Math.min(Math.trunc(index), state.questions.length))
        : state.questions.length;
      const next = [...state.questions];
      next.splice(safeIndex, 0, createQuizQuestion());
      return withDirty(next);
    }

    case QUIZ_BUILDER_ACTIONS.INSERT_SECTION_AT: {
      const index = Number(/** @type {{ index?: number }} */ (action.payload)?.index);
      const safeIndex = Number.isFinite(index)
        ? Math.max(0, Math.min(Math.trunc(index), state.questions.length))
        : state.questions.length;
      const next = [...state.questions];
      next.splice(safeIndex, 0, createQuizSection());
      return withDirty(next);
    }

    case QUIZ_BUILDER_ACTIONS.DUPLICATE_QUESTION: {
      const questionId = /** @type {string} */ (action.payload?.questionId);
      const index = state.questions.findIndex((item) => item.id === questionId && isQuizQuestion(item));
      if (index === -1) return state;
      const clone = cloneQuizQuestion(/** @type {import('../types/quizBuilder.types.js').QuizQuestion} */ (state.questions[index]));
      const next = [...state.questions];
      next.splice(index + 1, 0, clone);
      return withDirty(next);
    }

    case QUIZ_BUILDER_ACTIONS.DUPLICATE_SECTION: {
      const sectionId = /** @type {string} */ (action.payload?.sectionId);
      const index = state.questions.findIndex((item) => item.id === sectionId && isQuizSection(item));
      if (index === -1) return state;
      const clone = cloneQuizSection(/** @type {import('../types/quizBuilder.types.js').QuizSection} */ (state.questions[index]));
      const next = [...state.questions];
      next.splice(index + 1, 0, clone);
      return withDirty(next);
    }

    case QUIZ_BUILDER_ACTIONS.DELETE_QUESTION: {
      const questionId = /** @type {string} */ (action.payload?.questionId);
      const next = state.questions.filter((item) => !(item.id === questionId && isQuizQuestion(item)));
      if (next.length === state.questions.length) return state;
      return withDirty(ensureMinimumDraftItems(next));
    }

    case QUIZ_BUILDER_ACTIONS.DELETE_SECTION: {
      const sectionId = /** @type {string} */ (action.payload?.sectionId);
      const next = state.questions.filter((item) => !(item.id === sectionId && isQuizSection(item)));
      if (next.length === state.questions.length) return state;
      return withDirty(ensureMinimumDraftItems(next));
    }

    case QUIZ_BUILDER_ACTIONS.REORDER_QUESTIONS: {
      const { fromIndex, toIndex } = /** @type {{ fromIndex: number, toIndex: number }} */ (action.payload);
      if (fromIndex === toIndex) return state;
      const next = [...state.questions];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return withDirty(next);
    }

    case QUIZ_BUILDER_ACTIONS.UPDATE_QUESTION: {
      const { questionId, patch } = /** @type {{ questionId: string, patch: Partial<import('../types/quizBuilder.types.js').QuizQuestion> }} */ (
        action.payload
      );
      return withDirty(
        state.questions.map((item) =>
          item.id === questionId && isQuizQuestion(item) ? { ...item, ...patch } : item
        )
      );
    }

    case QUIZ_BUILDER_ACTIONS.UPDATE_SECTION: {
      const { sectionId, patch } = /** @type {{ sectionId: string, patch: Partial<import('../types/quizBuilder.types.js').QuizSection> }} */ (
        action.payload
      );
      return withDirty(
        state.questions.map((item) =>
          item.id === sectionId && isQuizSection(item) ? { ...item, ...patch } : item
        )
      );
    }

    case QUIZ_BUILDER_ACTIONS.TOGGLE_COLLAPSED: {
      const questionId = /** @type {string} */ (action.payload?.questionId);
      return withDirty(
        state.questions.map((item) =>
          item.id === questionId && isQuizQuestion(item) ? { ...item, collapsed: !item.collapsed } : item
        )
      );
    }

    case QUIZ_BUILDER_ACTIONS.TOGGLE_SECTION_COLLAPSED: {
      const sectionId = /** @type {string} */ (action.payload?.sectionId);
      return withDirty(
        state.questions.map((item) =>
          item.id === sectionId && isQuizSection(item) ? { ...item, collapsed: !item.collapsed } : item
        )
      );
    }

    case QUIZ_BUILDER_ACTIONS.ADD_CHOICE: {
      const questionId = /** @type {string} */ (action.payload?.questionId);
      return withDirty(
        state.questions.map((item) => {
          if (item.id !== questionId || !isQuizQuestion(item)) return item;
          if (item.choices.length >= QUIZ_MCQ_MAX_OPTIONS) return item;
          const index = item.choices.length + 1;
          return {
            ...item,
            choices: [...item.choices, createChoice(`Choice ${index}`, false)],
          };
        })
      );
    }

    case QUIZ_BUILDER_ACTIONS.UPDATE_CHOICE: {
      const { questionId, choiceId, patch } = /** @type {{ questionId: string, choiceId: string, patch: Partial<import('../types/quizBuilder.types.js').QuizChoice> }} */ (
        action.payload
      );
      return withDirty(
        state.questions.map((item) => {
          if (item.id !== questionId || !isQuizQuestion(item)) return item;
          return {
            ...item,
            choices: item.choices.map((c) => (c.id === choiceId ? { ...c, ...patch } : c)),
          };
        })
      );
    }

    case QUIZ_BUILDER_ACTIONS.DELETE_CHOICE: {
      const { questionId, choiceId } = /** @type {{ questionId: string, choiceId: string }} */ (action.payload);
      return withDirty(
        state.questions.map((item) => {
          if (item.id !== questionId || !isQuizQuestion(item)) return item;
          if (item.choices.length <= 2) return item;
          return {
            ...item,
            choices: item.choices.filter((c) => c.id !== choiceId),
          };
        })
      );
    }

    case QUIZ_BUILDER_ACTIONS.SET_SINGLE_CORRECT: {
      const { questionId, choiceId } = /** @type {{ questionId: string, choiceId: string }} */ (action.payload);
      return withDirty(
        state.questions.map((item) => {
          if (item.id !== questionId || !isQuizQuestion(item)) return item;
          return {
            ...item,
            choices: item.choices.map((c) => ({ ...c, isCorrect: c.id === choiceId })),
          };
        })
      );
    }

    case QUIZ_BUILDER_ACTIONS.TOGGLE_CHOICE_CORRECT: {
      const { questionId, choiceId } = /** @type {{ questionId: string, choiceId: string }} */ (action.payload);
      return withDirty(
        state.questions.map((item) => {
          if (item.id !== questionId || !isQuizQuestion(item)) return item;
          return {
            ...item,
            choices: item.choices.map((c) =>
              c.id === choiceId ? { ...c, isCorrect: !c.isCorrect } : c
            ),
          };
        })
      );
    }

    case QUIZ_BUILDER_ACTIONS.RESET_DIRTY:
      return { ...state, isDirty: false };

    case QUIZ_BUILDER_ACTIONS.LOAD_DRAFT: {
      const payload = /** @type {{ questions?: QuizDraftItem[], markDirty?: boolean }} */ (action.payload);
      const questions = payload?.questions;
      if (!Array.isArray(questions) || questions.length === 0) return state;
      const normalized = questions.map((item) =>
        isQuizSection(item) ? normalizeQuizSection(item) ?? item : item
      );
      return { questions: normalized, isDirty: Boolean(payload?.markDirty) };
    }

    default:
      return state;
  }
}
