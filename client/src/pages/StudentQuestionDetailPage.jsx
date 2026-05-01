import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { mockStudentDashboard } from '../student/data/mockStudentData';

export default function StudentQuestionDetailPage() {
  const { id } = useParams();
  const question = useMemo(
    () => mockStudentDashboard.questions.find((item) => item.id === id) || mockStudentDashboard.questions[0],
    [id]
  );

  return (
    <section className="admin-card">
      <div className="admin-row-actions" style={{ justifyContent: 'space-between' }}>
        <h2 className="heading-3">Question Detail</h2>
        <Link to="/dashboard/questions" className="btn btn--secondary btn--sm">Back to My Questions</Link>
      </div>

      <p className="admin-stat-card__label" style={{ marginTop: '0.6rem' }}>
        Subject: {question.subject} • Status: {question.status}
      </p>

      <article className="admin-import-row" style={{ marginTop: '1rem' }}>
        <p className="heading-4">{question.title}</p>
        <p className="admin-stat-card__label" style={{ marginTop: '0.4rem' }}>
          {question.body}
        </p>
      </article>

      <article className="admin-import-row" style={{ marginTop: '0.75rem' }}>
        <p className="heading-4">Teacher Answer</p>
        <p className="admin-stat-card__label" style={{ marginTop: '0.4rem' }}>
          {question.answer || 'No answer yet. You will get a notification once your teacher responds.'}
        </p>
      </article>
    </section>
  );
}
