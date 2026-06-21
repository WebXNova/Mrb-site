import { useMemo, useReducer } from 'react';
import { readQuizDraft } from '../persistence/quizDraftStorage.js';
import { QUIZ_BUILDER_ACTIONS } from '../state/quizBuilderActions.js';
import { quizBuilderReducer } from '../state/quizBuilderReducer.js';

/**
 * @returns {{
 *   state: import('../types/quizBuilder.types.js').QuizBuilderState,
 *   actions: {
 *     addQuestion: () => void,
 *     insertQuestionAt: (index: number) => void,
 *     duplicateQuestion: (questionId: string) => void,
 *     deleteQuestion: (questionId: string) => void,
 *     reorderQuestions: (fromIndex: number, toIndex: number) => void,
 *     updateQuestion: (questionId: string, patch: Partial<import('../types/quizBuilder.types.js').QuizQuestion>) => void,
 *     toggleCollapsed: (questionId: string) => void,
 *     addChoice: (questionId: string) => void,
 *     updateChoice: (questionId: string, choiceId: string, patch: Partial<import('../types/quizBuilder.types.js').QuizChoice>) => void,
 *     deleteChoice: (questionId: string, choiceId: string) => void,
 *     setSingleCorrect: (questionId: string, choiceId: string) => void,
 *     toggleChoiceCorrect: (questionId: string, choiceId: string) => void,
 *     resetDirty: () => void,
 *     loadDraft: (questions: import('../types/quizBuilder.types.js').QuizQuestion[], options?: { markDirty?: boolean }) => void,
 *   },
 *   totalPoints: number,
 * }}
 */
/**
 * @param {string} storageKey
 * @param {{ skipLocalInit?: boolean }} [options]
 *   When true (test routes), wait for server hydration instead of showing localStorage first.
 */
export function useQuizBuilderState(storageKey, options = {}) {
  const { skipLocalInit = false } = options;

  const [state, dispatch] = useReducer(
    quizBuilderReducer,
    storageKey,
    (key) => (skipLocalInit ? readQuizDraft(null) : readQuizDraft(key))
  );

  const actions = useMemo(
    () => ({
      addQuestion: () => dispatch({ type: QUIZ_BUILDER_ACTIONS.ADD_QUESTION }),
      insertQuestionAt: (index) =>
        dispatch({ type: QUIZ_BUILDER_ACTIONS.INSERT_QUESTION_AT, payload: { index } }),
      duplicateQuestion: (questionId) =>
        dispatch({ type: QUIZ_BUILDER_ACTIONS.DUPLICATE_QUESTION, payload: { questionId } }),
      deleteQuestion: (questionId) =>
        dispatch({ type: QUIZ_BUILDER_ACTIONS.DELETE_QUESTION, payload: { questionId } }),
      reorderQuestions: (fromIndex, toIndex) =>
        dispatch({ type: QUIZ_BUILDER_ACTIONS.REORDER_QUESTIONS, payload: { fromIndex, toIndex } }),
      updateQuestion: (questionId, patch) =>
        dispatch({ type: QUIZ_BUILDER_ACTIONS.UPDATE_QUESTION, payload: { questionId, patch } }),
      toggleCollapsed: (questionId) =>
        dispatch({ type: QUIZ_BUILDER_ACTIONS.TOGGLE_COLLAPSED, payload: { questionId } }),
      addChoice: (questionId) =>
        dispatch({ type: QUIZ_BUILDER_ACTIONS.ADD_CHOICE, payload: { questionId } }),
      updateChoice: (questionId, choiceId, patch) =>
        dispatch({ type: QUIZ_BUILDER_ACTIONS.UPDATE_CHOICE, payload: { questionId, choiceId, patch } }),
      deleteChoice: (questionId, choiceId) =>
        dispatch({ type: QUIZ_BUILDER_ACTIONS.DELETE_CHOICE, payload: { questionId, choiceId } }),
      setSingleCorrect: (questionId, choiceId) =>
        dispatch({ type: QUIZ_BUILDER_ACTIONS.SET_SINGLE_CORRECT, payload: { questionId, choiceId } }),
      toggleChoiceCorrect: (questionId, choiceId) =>
        dispatch({ type: QUIZ_BUILDER_ACTIONS.TOGGLE_CHOICE_CORRECT, payload: { questionId, choiceId } }),
      resetDirty: () => dispatch({ type: QUIZ_BUILDER_ACTIONS.RESET_DIRTY }),
      loadDraft: (questions, options = {}) =>
        dispatch({
          type: QUIZ_BUILDER_ACTIONS.LOAD_DRAFT,
          payload: { questions, markDirty: Boolean(options.markDirty) },
        }),
    }),
    []
  );

  const totalPoints = useMemo(
    () => state.questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0),
    [state.questions]
  );

  return { state, actions, totalPoints };
}
