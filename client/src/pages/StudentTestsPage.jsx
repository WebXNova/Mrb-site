import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { mockStudentDashboard } from '../student/data/mockStudentData';

export default function StudentTestsPage() {
  const [tests, setTests] = useState(mockStudentDashboard.tests);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await studentApi.dashboard();
        if (mounted && response?.data?.tests?.length) {
          setTests(response.data.tests);
        }
      } catch {
        // Preview mode with frontend data.
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="admin-card">
      <div className="admin-row-actions" style={{ justifyContent: 'space-between' }}>
        <h2 className="heading-3">Available Tests</h2>
        <Link className="btn btn--secondary btn--sm" to="/dashboard/tests/history">Results</Link>
      </div>
      <div className="admin-table-wrap" style={{ marginTop: '0.75rem' }}>
        <table className="admin-table">
          <thead>
            <tr><th>Title</th><th>Category</th><th>Duration</th><th>Action</th></tr>
          </thead>
          <tbody>
            {tests.length ? tests.map((test) => (
              <tr key={test.id}>
                <td>{test.title}</td>
                <td>{test.category || 'MDCAT'}</td>
                <td>{test.durationMinutes} min</td>
                <td><Link to={`/tests/${test.slug}`}>Open Test</Link></td>
              </tr>
            )) : <tr><td colSpan={4}>No published tests yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
