import { mockStudentDashboard } from '../student/data/mockStudentData';
import { Link } from 'react-router-dom';

export default function StudentResultsPage() {
  const results = mockStudentDashboard.results;

  return (
    <section className="admin-card">
      <h2 className="heading-3">My Results</h2>
      <div className="admin-table-wrap" style={{ marginTop: '0.75rem' }}>
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
    </section>
  );
}
