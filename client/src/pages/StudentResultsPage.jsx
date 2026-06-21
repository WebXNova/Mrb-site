import { mockStudentDashboard } from '../student/data/mockStudentData';
import { Link } from 'react-router-dom';

export default function StudentResultsPage() {
  const results = mockStudentDashboard.results;

  return (
    <section className="admin-card">
      <h2 className="heading-3">My Results</h2>

      <div className="admin-table-wrap student-table-desktop" style={{ marginTop: '0.75rem' }}>
        <table className="admin-table">
          <thead>
            <tr><th>Test</th><th>Score</th><th>Percent</th><th>Date</th><th>Review</th></tr>
          </thead>
          <tbody>
            {results.length ? results.map((result) => (
              <tr key={result.attemptId}>
                <td>{result.testTitle}</td>
                <td>{result.score}/{result.maxScore}</td>
                <td>{result.percentage}%</td>
                <td>{result.submittedAt ? new Date(result.submittedAt).toLocaleString() : '-'}</td>
                <td><Link to={`/dashboard/tests/${result.testId || 'test'}/results/${result.attemptId}`}>Review</Link></td>
              </tr>
            )) : <tr><td colSpan={5}>No attempts yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="student-mobile-list" style={{ marginTop: '0.75rem' }}>
        {results.length ? results.map((result) => (
          <article key={result.attemptId} className="student-mobile-card">
            <h3 className="student-mobile-card__title">{result.testTitle}</h3>
            <dl className="student-mobile-card__meta">
              <div>
                <dt>Score</dt>
                <dd>{result.score}/{result.maxScore}</dd>
              </div>
              <div>
                <dt>Percent</dt>
                <dd>{result.percentage}%</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{result.submittedAt ? new Date(result.submittedAt).toLocaleDateString() : '-'}</dd>
              </div>
            </dl>
            <div className="student-mobile-card__actions">
              <Link
                className="btn btn--primary btn--sm"
                to={`/dashboard/tests/${result.testId || 'test'}/results/${result.attemptId}`}
              >
                Review
              </Link>
            </div>
          </article>
        )) : (
          <p className="admin-stat-card__label">No attempts yet.</p>
        )}
      </div>
    </section>
  );
}
