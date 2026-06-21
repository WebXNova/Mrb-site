import { QUIZ_MCQ_MAX_OPTIONS } from '../validation/quizMcqLimits.js';
import { QUIZ_BUILDER_ACTIONS } from './quizBuilderActions.js';
import { cloneQuizQuestion, createChoice, createQuizQuestion } from './quizQuestionFactory.js';

/** @typedef {import('../types/quizBuilder.types.js').QuizQuestion} QuizQuestion */

/** @type {import('../types/quizBuilder.types.js').QuizBuilderState} */
export const initialQuizBuilderState = {
  questions: [createQuizQuestion()],
  isDirty: false,
};

/**
 * @param {import('../types/quizBuilder.types.js').QuizQuestion[]} questions
 */
function withDirty(questions) {
  return { questions, isDirty: true };
}

/**
 * @param {import('../types/quizBuilder.types.js').QuizBuilderState} state
 * @param {{ type: string, payload?: unknown }} action
 */
export function quizBuilderReducer(state, action) {
  switch (action.type) {
    case QUIZ_BUILDER_ACTIONS.ADD_QUESTION:
      return withDirty([...state.questions, createQuizQuestion()]);

    case QUIZ_BUILDER_ACTIONS.INSERT_QUESTION_AT: {
      const index = Number(/** @type {{ index?: number }} */ (action.payload)?.index);
      const safeIndex = Number.isFinite(index)
        ? Math.max(0, Math.min(Math.trunc(index), state.questions.length))
        : state.questions.length;
      const next = [...state.questions];
      next.splice(safeIndex, 0, createQuizQuestion());
      return withDirty(next);
    }

    case QUIZ_BUILDER_ACTIONS.DUPLICATE_QUESTION: {
      const questionId = /** @type {string} */ (action.payload?.questionId);
      const index = state.questions.findIndex((q) => q.id === questionId);
      if (index === -1) return state;
      const clone = cloneQuizQuestion(state.questions[index]);
      const next = [...state.questions];
      next.splice(index + 1, 0, clone);
      return withDirty(next);
    }

    case QUIZ_BUILDER_ACTIONS.DELETE_QUESTION: {
      const questionId = /** @type {string} */ (action.payload?.questionId);
      if (state.questions.length <= 1) {
        return withDirty([createQuizQuestion()]);
      }
      return withDirty(state.questions.filter((q) => q.id !== questionId));
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
        state.questions.map((q) => (q.id === questionId ? { ...q, ...patch } : q))
      );
    }

    case QUIZ_BUILDER_ACTIONS.TOGGLE_COLLAPSED: {
      const questionId = /** @type {string} */ (action.payload?.questionId);
      return withDirty(
        state.questions.map((q) =>
          q.id === questionId ? { ...q, collapsed: !q.collapsed } : q
        )
      );
    }

    case QUIZ_BUILDER_ACTIONS.ADD_CHOICE: {
      const questionId = /** @type {string} */ (action.payload?.questionId);
      return withDirty(
        state.questions.map((q) => {
          if (q.id !== questionId) return q;
          if (q.choices.length >= QUIZ_MCQ_MAX_OPTIONS) return q;
          const index = q.choices.length + 1;
          return {
            ...q,
            choices: [...q.choices, createChoice(`Choice ${index}`, false)],
          };
        })
      );
    }

    case QUIZ_BUILDER_ACTIONS.UPDATE_CHOICE: {
      const { questionId, choiceId, patch } = /** @type {{ questionId: string, choiceId: string, patch: Partial<import('../types/quizBuilder.types.js').QuizChoice> }} */ (
        action.payload
      );
      return withDirty(
        state.questions.map((q) => {
          if (q.id !== questionId) return q;
          return {
            ...q,
            choices: q.choices.map((c) => (c.id === choiceId ? { ...c, ...patch } : c)),
          };
        })
      );
    }

    case QUIZ_BUILDER_ACTIONS.DELETE_CHOICE: {
      const { questionId, choiceId } = /** @type {{ questionId: string, choiceId: string }} */ (action.payload);
      return withDirty(
        state.questions.map((q) => {
          if (q.id !== questionId) return q;
          if (q.choices.length <= 2) return q;
          return {
            ...q,
            choices: q.choices.filter((c) => c.id !== choiceId),
          };
        })
      );
    }

    case QUIZ_BUILDER_ACTIONS.SET_SINGLE_CORRECT: {
      const { questionId, choiceId } = /** @type {{ questionId: string, choiceId: string }} */ (action.payload);
      return withDirty(
        state.questions.map((q) => {
          if (q.id !== questionId) return q;
          return {
            ...q,
            choices: q.choices.map((c) => ({ ...c, isCorrect: c.id === choiceId })),
          };
        })
      );
    }

    case QUIZ_BUILDER_ACTIONS.TOGGLE_CHOICE_CORRECT: {
      const { questionId, choiceId } = /** @type {{ questionId: string, choiceId: string }} */ (action.payload);
      return withDirty(
        state.questions.map((q) => {
          if (q.id !== questionId) return q;
          return {
            ...q,
            choices: q.choices.map((c) =>
              c.id === choiceId ? { ...c, isCorrect: !c.isCorrect } : c
            ),
          };
        })
      );
    }

    case QUIZ_BUILDER_ACTIONS.RESET_DIRTY:
      return { ...state, isDirty: false };

    case QUIZ_BUILDER_ACTIONS.LOAD_DRAFT: {
      const payload = /** @type {{ questions?: import('../types/quizBuilder.types.js').QuizQuestion[], markDirty?: boolean }} */ (
        action.payload
      );
      const questions = payload?.questions;
      if (!Array.isArray(questions) || questions.length === 0) return state;
      return { questions, isDirty: Boolean(payload?.markDirty) };
    }

    default:
      return state;
  }
}
