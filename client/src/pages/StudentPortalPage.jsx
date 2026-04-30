import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { studentApi } from '../api/studentApi';

export default function StudentPortalPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('student_access_token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    async function load() {
      try {
        const response = await studentApi.dashboard();
        setData(response?.data || null);
      } catch (err) {
        setError(err.message || 'Failed to load student portal');
      }
    }
    load();
  }, [navigate]);

  if (error) {
    return (
      <section className="section"><div className="container"><p>{error}</p></div></section>
    );
  }
  if (!data) {
    return (
      <section className="section"><div className="container"><p>Loading portal...</p></div></section>
    );
  }

  const latestResult = useMemo(() => data.results?.[0] || null, [data.results]);
  const latestTest = useMemo(() => data.tests?.[0] || null, [data.tests]);

  return (
    <section className="admin-page">
      <section className="admin-grid">
        <article className="admin-stat-card">
          <p className="admin-stat-card__label">Available Tests</p>
          <p className="admin-stat-card__value">{data.tests.length}</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-card__label">Lectures</p>
          <p className="admin-stat-card__value">{data.lectures.length}</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-card__label">Completed Attempts</p>
          <p className="admin-stat-card__value">{data.results.length}</p>
        </article>
      </section>

      <section className="admin-card">
        <h2 className="heading-3">Quick Actions</h2>
        <div className="admin-actions" style={{ marginTop: '0.75rem' }}>
          <Link className="btn btn--primary btn--sm" to="/dashboard/lectures">Open Lectures</Link>
          <Link className="btn btn--secondary btn--sm" to="/dashboard/tests">Take Test</Link>
          <Link className="btn btn--secondary btn--sm" to="/dashboard/questions/ask">Ask Question</Link>
        </div>
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
              <Link to={`/dashboard/results/${latestResult.attemptId}`}>View detail</Link>
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
