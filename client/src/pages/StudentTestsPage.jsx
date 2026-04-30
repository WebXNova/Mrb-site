import { Link } from 'react-router-dom';

export default function StudentTestsPage({ tests = [] }) {
  return (
    <section className="admin-card">
      <h2 className="heading-3">Available Tests</h2>
      <div className="admin-table-wrap" style={{ marginTop: '0.75rem' }}>
        <table className="admin-table">
          <thead>
            <tr><th>Title</th><th>Category</th><th>Duration</th><th>Action</th></tr>
          </thead>
          <tbody>
            {tests.length ? tests.map((test) => (
              <tr key={test.id}>
                <td>{test.title}</td>
                <td>{[test.category, test.subCategory].filter(Boolean).join(' / ') || test.subject}</td>
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
