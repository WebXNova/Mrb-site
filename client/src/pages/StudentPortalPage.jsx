import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { mockStudentDashboard } from '../student/data/mockStudentData';
import { normaliseStudentDashboard } from '../student/utils/normaliseStudentDashboard';

export default function StudentPortalPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const latestResult = useMemo(() => data?.results?.[0] || null, [data]);
  const latestTest = useMemo(() => data?.tests?.[0] || null, [data]);

  useEffect(() => {
    async function load() {
      try {
        const response = await studentApi.dashboard();
        setData(normaliseStudentDashboard(response?.data || mockStudentDashboard));
      } catch (err) {
        setError(err.message || '');
        setData(normaliseStudentDashboard(mockStudentDashboard));
      }
    }
    load();
  }, []);

  if (error) {
    // Keep the frontend workflow usable before backend integration.
  }
  if (!data) {
    return (
      <section className="section"><div className="container"><p>Loading portal...</p></div></section>
    );
  }

  return (
    <section className="student-dashboard-grid">
      <article className="student-progress-card">
        <h2 className="heading-3">Your Progress</h2>
        <div className="student-progress-card__track">
          <div
            className="student-progress-card__fill"
            style={{ width: `${Math.min(100, Math.max(0, data.progressPercent || 0))}%` }}
          />
        </div>
        <p className="admin-stat-card__label" style={{ marginTop: '0.6rem' }}>
          {data.progressPercent || 0}% Complete
        </p>
        <p className="admin-stat-card__label">
          {data.testsCompleted || data.results?.length || 0} Tests Completed •{' '}
          {data.questionsAsked || data.questions?.length || 0} Questions Asked
        </p>
        {error ? (
          <p className="admin-stat-card__label" style={{ marginTop: '0.4rem' }}>
            Showing frontend preview data until backend is connected.
          </p>
        ) : null}
      </article>

      <section className="student-feature-grid">
        <Link className="student-feature-card" to="/dashboard/lectures">
          <p className="student-feature-card__label">Learning</p>
          <p className="student-feature-card__title">Lectures ({data.lectures.length})</p>
        </Link>
        <Link className="student-feature-card" to="/dashboard/tests">
          <p className="student-feature-card__label">Practice</p>
          <p className="student-feature-card__title">Tests ({data.tests.length})</p>
        </Link>
        <Link className="student-feature-card" to="/dashboard/questions/ask">
          <p className="student-feature-card__label">Support</p>
          <p className="student-feature-card__title">Ask Doubt</p>
        </Link>
      </section>

      <section className="admin-card">
        <h3 className="heading-4">Recent Activity</h3>
        <ul className="student-activity-list">
          {(data.recentActivity || []).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="admin-grid">
        <article className="admin-card">
          <h3 className="heading-4">Latest Result</h3>
          {latestResult ? (
            <>
              <p style={{ marginTop: '0.5rem' }}>{latestResult.testTitle}</p>
              <p className="admin-stat-card__label">
                Score: {latestResult.score}/{latestResult.maxScore} ({latestResult.percentage}%)
              </p>
              <Link to={`/dashboard/tests/${latestResult.testId || 'test'}/results/${latestResult.attemptId}`}>
                View detail
              </Link>
            </>
          ) : (
            <p className="admin-stat-card__label" style={{ marginTop: '0.5rem' }}>No attempts yet.</p>
          )}
        </article>

        <article className="admin-card">
          <h3 className="heading-4">Recommended Next Test</h3>
          {latestTest ? (
            <>
              <p style={{ marginTop: '0.5rem' }}>{latestTest.title}</p>
              <p className="admin-stat-card__label">
                {latestTest.subject} {latestTest.durationMinutes ? `- ${latestTest.durationMinutes} min` : ''}
              </p>
              <Link to="/dashboard/tests">Go to tests</Link>
            </>
          ) : (
            <p className="admin-stat-card__label" style={{ marginTop: '0.5rem' }}>No published tests yet.</p>
          )}
        </article>
      </section>
    </section>
  );
}
