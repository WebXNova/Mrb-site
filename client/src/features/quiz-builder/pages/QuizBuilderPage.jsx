import { useOutletContext } from 'react-router-dom';
import { adminRoute } from '../../../config/adminPaths';
import '../../create-question/workspace/workspace.css';
import QuizBuilderView from '../components/QuizBuilderView.jsx';
import '../styles/quiz-builder.css';

export default function QuizBuilderPage() {
  const { testId } = useOutletContext();

  return (
    <div className="admin-page--quiz-builder-embedded">
      <h2 className="heading-4" style={{ marginTop: 0 }}>
        Questions
      </h2>
      <QuizBuilderView
        testId={testId}
        backTo={adminRoute(`tests/${testId}/dashboard`)}
        backLabel={null}
        showWizard={false}
      />
    </div>
  );
}
