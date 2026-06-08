import { useCallback, useMemo } from 'react';
import { sanitizeEditorOutput } from '../utils/sanitizeEditorOutput.js';
import { sanitizeBeforeSubmit } from '../utils/sanitizeBeforeSubmit.js';
import { sanitizeExplanationHtml } from '../utils/sanitizeExplanationHtml.js';
import { prepareForPreview } from '../utils/prepareForPreview.js';
import { validateImageUrl } from '../utils/image/validateImageUrl.js';
import {
  normalizeOptionsForAPI,
  validateOptionsBeforeSubmit,
} from '../utils/options/mcqOptionsCorrectness.js';
import { validateExplanation } from '../utils/validateExplanation.js';
import {
  buildExplanationSubmitSlice,
  deriveExplanationAnalytics,
  toExplanationApiField,
} from '../types/explanation.contract.js';

/**
 * Sanitization pipeline for Create Question.
 *
 * Data flow (strict):
 *   CKEditor Input → sanitizeEditorOutput() → local state (textHtmlDraft)
 *   textHtmlDraft → prepareForPreview() → LivePreview (plain text only)
 *   textHtmlDraft → sanitizeBeforeSubmit() → future API
 *
 * CKEditor output is NEVER trusted.
 * All HTML must pass sanitization before preview/render.
 * Backend will re-validate content again.
 */
export function useSanitizationPipeline() {
  const sanitizeForPreview = useCallback((raw) => {
    const cleanHtml = sanitizeEditorOutput(raw);
    return prepareForPreview(cleanHtml);
  }, []);

  const sanitizeExplanationForPreview = useCallback((raw) => {
    const safeHtml = sanitizeExplanationHtml(raw);
    return prepareForPreview(safeHtml);
  }, []);

  const sanitizeForSubmit = useCallback((state) => {
    const questionHtml = sanitizeBeforeSubmit(
      state.question.textHtmlDraft || state.question.textPlain
    );
    const explanationRaw =
      state.explanation.textHtmlDraft || state.explanation.textPlain || null;
    const explanationValidation = validateExplanation(explanationRaw);
    const explanationHtml = explanationValidation.ok
      ? explanationValidation.sanitizedHtml ?? ''
      : '';
    const explanationPlain = prepareForPreview(explanationHtml);
    const explanationSlice = explanationValidation.ok
      ? buildExplanationSubmitSlice(
          explanationValidation.isEmpty ? null : explanationValidation.sanitizedHtml,
          explanationPlain,
          explanationValidation.isEmpty
        )
      : buildExplanationSubmitSlice(null, '', true);

    let questionImageUrl = null;
    if (state.questionImage?.url) {
      const imageCheck = validateImageUrl(state.questionImage.url);
      questionImageUrl = imageCheck.ok ? imageCheck.url : null;
    }

    return {
      metadata: { ...state.metadata },
      question: {
        textHtml: questionHtml,
        textPlain: prepareForPreview(questionHtml),
        imageUrl: questionImageUrl,
        imageSource: state.questionImage?.source ?? 'none',
      },
      options: normalizeOptionsForAPI(state.options),
      optionsValidation: validateOptionsBeforeSubmit(state.options),
      explanation: explanationSlice,
      explanationApiField: toExplanationApiField(
        explanationValidation.ok ? explanationValidation : null
      ),
      explanationValidation,
      explanationAnalytics: deriveExplanationAnalytics(explanationSlice.html),
    };
  }, []);

  return useMemo(
    () => ({
      sanitizeForPreview,
      sanitizeExplanationForPreview,
      sanitizeForSubmit,
      sanitizeEditorOutput,
      sanitizeBeforeSubmit,
      sanitizeExplanationHtml,
      validateExplanation,
      prepareForPreview,
      isEnabled: true,
    }),
    [sanitizeForPreview, sanitizeExplanationForPreview, sanitizeForSubmit]
  );
}
