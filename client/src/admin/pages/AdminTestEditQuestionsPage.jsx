import { useEffect } from 'react';
import { adminRoute } from '../../config/adminPaths';
import { useNavigate, useParams } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';
import QuizBuilderView from '../../features/quiz-builder/components/QuizBuilderView.jsx';
import '../../features/quiz-builder/styles/quiz-builder.css';
import '../../features/create-question/workspace/workspace.css';

export default function AdminTestEditQuestionsPage() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const token = getAdminToken();

  useEffect(() => {
    let cancelled = false;

    adminApi
      .getTest(token, testId)
      .then((response) => {
        if (cancelled) return;
        const test = response?.data;
        if (!test) {
          navigate(adminRoute('tests'), { replace: true });
          return;
        }
        if (!isTestPublishedStatus(test.status)) {
          navigate(adminRoute(`tests/${testId}/questions`), { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) navigate(adminRoute('tests'), { replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, testId, token]);

  return (
    <section className="admin-page admin-page--tests admin-page--quiz-builder">
      <QuizBuilderView
        testId={testId}
        backTo={adminRoute(`tests/${testId}/edit`)}
        backLabel="Back to edit setup"
        showWizard
        editPublished
      />
    </section>
  );
}
