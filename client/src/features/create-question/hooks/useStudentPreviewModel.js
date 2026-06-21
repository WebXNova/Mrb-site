import { useMemo } from 'react';
import { buildStudentPreviewModel } from '../preview/buildStudentPreviewModel.js';

/**
 * Real-time student preview model — re-derived on every authoring state change.
 *
 * Synchronization: React useMemo keyed on content slices (not ui flags).
 * Performance: pure builder; subcomponents should memo on model sections.
 *
 * @param {import('../types/createQuestion.types.js').CreateQuestionState} state
 */
export function useStudentPreviewModel(state) {
  return useMemo(
    () =>
      buildStudentPreviewModel({
        question: state.question,
        options: state.options,
        explanation: state.explanation,
      }),
    [
      state.question.textHtmlDraft,
      state.question.textPlain,
      state.options,
      state.explanation.textHtmlDraft,
      state.explanation.textPlain,
    ]
  );
}
