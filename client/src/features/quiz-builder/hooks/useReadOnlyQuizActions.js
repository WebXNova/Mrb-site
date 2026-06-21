import { useMemo } from 'react';

/**
 * Defense-in-depth: no-op question mutation actions when test is published.
 * View actions (collapse toggle) remain available.
 *
 * @param {Record<string, Function>} actions
 * @param {boolean} readOnly
 */
export function useReadOnlyQuizActions(actions, readOnly) {
  return useMemo(() => {
    if (!readOnly) return actions;

    const blocked = () => {};

    return {
      ...actions,
      addQuestion: blocked,
      insertQuestionAt: blocked,
      deleteQuestion: blocked,
      duplicateQuestion: blocked,
      reorderQuestions: blocked,
      updateQuestion: (questionId, patch) => {
        const keys = Object.keys(patch || {});
        const collapseOnly =
          keys.length > 0 && keys.every((key) => key === 'collapsed' || key === 'showExplanation');
        if (collapseOnly) {
          actions.updateQuestion(questionId, patch);
        }
      },
    };
  }, [actions, readOnly]);
}
