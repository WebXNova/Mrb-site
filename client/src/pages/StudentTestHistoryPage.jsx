import { Link } from 'react-router-dom';
import { mockStudentDashboard } from '../student/data/mockStudentData';

export default function StudentTestHistoryPage() {
  return (
    <section className="admin-card">
      <h2 className="heading-3">Test History</h2>
      <div className="admin-table-wrap" style={{ marginTop: '0.75rem' }}>
        <table className="admin-table">
          <thead>
            <tr><th>Test</th><th>Score</th><th>Percent</th><th>Submitted</th><th>Review</th></tr>
          </thead>
          <tbody>
            {mockStudentDashboard.results.map((item) => (
              <tr key={item.attemptId}>
                <td>{item.testTitle}</td>
                <td>{item.score}/{item.maxScore}</td>
                <td>{item.percentage}%</td>
                <td>{new Date(item.submittedAt).toLocaleString()}</td>
                <td><Link to={`/dashboard/tests/${item.testId || 'test'}/results/${item.attemptId}`}>Open</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
