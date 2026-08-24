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
      addSection: blocked,
      insertQuestionAt: blocked,
      insertSectionAt: blocked,
      deleteQuestion: blocked,
      deleteSection: blocked,
      duplicateQuestion: blocked,
      duplicateSection: blocked,
      reorderQuestions: blocked,
      updateQuestion: (questionId, patch) => {
        const keys = Object.keys(patch || {});
        const collapseOnly =
          keys.length > 0 &&
          keys.every((key) => key === 'collapsed' || key === 'showExplanation' || key === 'showTip');
        if (collapseOnly) {
          actions.updateQuestion(questionId, patch);
        }
      },
      updateSection: (sectionId, patch) => {
        const keys = Object.keys(patch || {});
        if (keys.length === 1 && keys[0] === 'collapsed') {
          actions.updateSection(sectionId, patch);
        }
      },
    };
  }, [actions, readOnly]);
}
