import { useOutletContext } from 'react-router-dom';
import { adminRoute } from '../../../config/adminPaths';
import '../../create-question/workspace/workspace.css';
import QuizBuilderView from '../components/QuizBuilderView.jsx';
import '../styles/quiz-builder.css';

export default function QuizBuilderPage() {
  const { testId, isPublished = false } = useOutletContext();

  return (
    <div className="admin-page--quiz-builder-embedded">
      <QuizBuilderView
        testId={testId}
        backTo={adminRoute(`tests/${testId}/dashboard`)}
        backLabel={null}
        showWizard={false}
        editPublished={Boolean(isPublished)}
      />
    </div>
  );
}
