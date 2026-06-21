import { adminRoute } from '../../../config/adminPaths';
import { useParams } from 'react-router-dom';
import '../../create-question/workspace/workspace.css';
import QuizBuilderView from '../components/QuizBuilderView.jsx';
import '../styles/quiz-builder.css';

export default function QuizBuilderPage() {
  const { testId } = useParams();

  return (
    <section className="admin-page admin-page--tests admin-page--quiz-builder">
      <QuizBuilderView
        testId={testId}
        backTo={adminRoute('tests')}
        backLabel="Back to Tests"
        showWizard
      />
    </section>
  );
}
