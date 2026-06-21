import { useEffect, useState } from 'react';
import { adminRoute } from '../../../config/adminPaths';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../create-question.css';
import '../workspace/workspace.css';
import '../preview/student-preview.css';
import CreateQuestionErrorBoundary from './CreateQuestionErrorBoundary.jsx';
import TopActionBar from './TopActionBar.jsx';
import QuestionAuthoringWorkspace from '../workspace/QuestionAuthoringWorkspace.jsx';
import StudentPreviewModal from '../preview/StudentPreviewModal.jsx';
import { EditorRibbonProvider } from '../ribbon/EditorRibbonProvider.jsx';
import EditorRibbon from '../ribbon/EditorRibbon.jsx';
import { useCreateQuestionState } from '../hooks/useCreateQuestionState.js';
import { useStudentPreviewModel } from '../hooks/useStudentPreviewModel.js';

function extractTestIdFromReturnTo(returnTo) {
  const match = String(returnTo).match(/\/tests\/([^/]+)\/(?:questions|quiz-builder)/);
  return match?.[1] || null;
}

export default function CreateQuestionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawReturnTo = searchParams.get('returnTo') || '';
  const returnTo =
    rawReturnTo.startsWith(adminRoute()) && !rawReturnTo.startsWith('//') ? rawReturnTo : adminRoute();
  const courseIdFromQuery = searchParams.get('courseId') || '';
  const testIdFromReturn = extractTestIdFromReturnTo(returnTo);

  const { state, actions } = useCreateQuestionState();
  const previewModel = useStudentPreviewModel(state);
  const [studentViewOpen, setStudentViewOpen] = useState(false);

  useEffect(() => {
    if (testIdFromReturn) {
      const target = adminRoute(`tests/${testIdFromReturn}/questions`);
      const query = courseIdFromQuery ? `?courseId=${encodeURIComponent(courseIdFromQuery)}` : '';
      navigate(`${target}${query}`, { replace: true });
    }
  }, [courseIdFromQuery, navigate, testIdFromReturn]);

  useEffect(() => {
    if (!courseIdFromQuery || state.metadata.courseId) return;
    actions.setMetadataField('courseId', courseIdFromQuery);
  }, [courseIdFromQuery, state.metadata.courseId, actions]);

  if (testIdFromReturn) {
    return null;
  }

  const backLabel = 'Back';

  return (
    <CreateQuestionErrorBoundary>
      <EditorRibbonProvider
        disabled={state.ui.loading}
        onOptionImageCommit={actions.updateOptionImage}
      >
        <div className="admin-page cq-page qaw-page">
          <div className="qaw-chrome">
            <div className="qaw-header-slot">
              <TopActionBar
                isDirty={state.ui.isDirty}
                canSave={false}
                onSave={() => {}}
                onSaveDraft={() => {}}
                onReset={actions.resetForm}
                onOpenStudentView={() => setStudentViewOpen(true)}
                disabled={state.ui.loading}
                backTo={returnTo}
                backLabel={backLabel}
                saveImplemented={false}
              />
            </div>
            <div className="qaw-ribbon-slot">
              <EditorRibbon />
            </div>
          </div>

          <div className="qaw-shell">
            <QuestionAuthoringWorkspace
              question={state.question}
              options={state.options}
              explanation={state.explanation}
              errors={state.ui.errors}
              actions={actions}
              disabled={state.ui.loading}
            />
          </div>

          <StudentPreviewModal
            open={studentViewOpen}
            onClose={() => setStudentViewOpen(false)}
            previewModel={previewModel}
          />
        </div>
      </EditorRibbonProvider>
    </CreateQuestionErrorBoundary>
  );
}
