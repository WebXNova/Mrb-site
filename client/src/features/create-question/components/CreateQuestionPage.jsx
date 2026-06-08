import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import '../create-question.css';
import TopActionBar from './TopActionBar.jsx';
import LeftEditorPanel from './LeftEditorPanel.jsx';
import RightPreviewPanel from './RightPreviewPanel.jsx';
import { useCreateQuestionState } from '../hooks/useCreateQuestionState.js';
import { useSanitizationPipeline } from '../hooks/useSanitizationPipeline.js';
import { optionsToPreviewList } from '../utils/options/optionsPreview.js';
import { useSaveFlow } from '../hooks/useSaveFlow.js';

/**
 * Create Question page — Phase 1 foundational architecture.
 *
 * Architecture decisions:
 * - useReducer centralizes all form state (no uncontrolled mutations)
 * - Components are presentational; state lives in hooks/reducer
 * - Preview uses plain text only (no dangerouslySetInnerHTML)
 * - CKEditor output sanitized via sanitizeEditorOutput before state
 *
 * Data flow:
 *   CKEditor → sanitizeEditorOutput → state → prepareForPreview → Preview → sanitizeBeforeSubmit → API
 */
export default function CreateQuestionPage() {
  const [searchParams] = useSearchParams();
  const rawReturnTo = searchParams.get('returnTo') || '';
  const returnTo =
    rawReturnTo.startsWith('/admin') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/admin';
  const courseIdFromQuery = searchParams.get('courseId') || '';

  const { state, actions } = useCreateQuestionState();
  const { sanitizeForPreview, sanitizeExplanationForPreview, sanitizeForSubmit } =
    useSanitizationPipeline();
  const { canSave, save, saveDraft } = useSaveFlow({
    state,
    sanitizeForSubmit,
    setFieldErrors: actions.setFieldErrors,
  });

  useEffect(() => {
    if (!courseIdFromQuery || state.metadata.courseId) return;
    actions.setMetadataField('courseId', courseIdFromQuery);
  }, [courseIdFromQuery, state.metadata.courseId, actions]);

  const questionPreviewText = useMemo(
    () => sanitizeForPreview(state.question.textHtmlDraft || state.question.textPlain),
    [sanitizeForPreview, state.question.textHtmlDraft, state.question.textPlain]
  );

  const explanationPreviewText = useMemo(
    () =>
      sanitizeExplanationForPreview(
        state.explanation.textHtmlDraft || state.explanation.textPlain
      ),
    [
      sanitizeExplanationForPreview,
      state.explanation.textHtmlDraft,
      state.explanation.textPlain,
    ]
  );

  const previewOptions = useMemo(
    () => optionsToPreviewList(state.options),
    [state.options]
  );

  return (
    <div className="admin-page cq-page">
      <TopActionBar
        isDirty={state.ui.isDirty}
        canSave={canSave}
        onSave={save}
        onSaveDraft={saveDraft}
        onReset={actions.resetForm}
        disabled={state.ui.loading}
        backTo={returnTo}
        backLabel={returnTo.includes('/tests/') && returnTo.includes('/questions') ? 'Back to test questions' : 'Back'}
      />

      <div className="cq-layout">
        <LeftEditorPanel
          metadata={state.metadata}
          question={state.question}
          questionImage={state.questionImage}
          options={state.options}
          explanation={state.explanation}
          errors={state.ui.errors}
          actions={actions}
          disabled={state.ui.loading}
        />

        <RightPreviewPanel
          visible={state.ui.previewVisible}
          metadata={state.metadata}
          questionPreviewText={questionPreviewText}
          questionImage={state.questionImage}
          options={previewOptions}
          explanationPreviewText={explanationPreviewText}
          onToggleVisible={actions.setPreviewVisible}
        />
      </div>
    </div>
  );
}
