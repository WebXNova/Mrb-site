import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../api/studentApi';

export default function StudentQuestionsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await studentApi.questions();
        if (mounted) setItems(response?.data || []);
      } catch (err) {
        if (mounted) setError(err.message || 'Failed to load questions');
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
        <h2 className="heading-3">My Questions</h2>
        <Link className="btn btn--primary btn--sm" to="/dashboard/questions/ask">Ask Question</Link>
      </div>
      {error ? <p className="admin-error" style={{ marginTop: '0.75rem' }}>{error}</p> : null}
      <div className="admin-table-wrap" style={{ marginTop: '0.75rem' }}>
        <table className="admin-table">
          <thead>
            <tr><th>Subject</th><th>Question</th><th>Status</th><th>Updated</th></tr>
          </thead>
          <tbody>
            {items.length ? items.map((item) => (
              <tr key={item.id}>
                <td>{item.subject || '-'}</td>
                <td>{item.title || item.body || '-'}</td>
                <td>{item.status || 'pending'}</td>
                <td>{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '-'}</td>
              </tr>
            )) : <tr><td colSpan={4}>No questions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
