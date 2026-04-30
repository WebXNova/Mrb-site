import { useState } from 'react';

export default function AdminQuestionsPage() {
  const [subject, setSubject] = useState('all');

  return (
    <section className="admin-page">
      <section className="admin-card">
        <h2 className="heading-3">Student Q&A (Manual Answers)</h2>
        <p className="admin-stat-card__label" style={{ marginTop: '0.5rem' }}>
          Teacher portal is not used. All question answers are handled manually from this single admin category.
        </p>
      </section>

      <section className="admin-card">
        <div className="admin-row-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="heading-4">Question Queue</h3>
          <select value={subject} onChange={(event) => setSubject(event.target.value)} style={{ maxWidth: '220px' }}>
            <option value="all">All Subjects</option>
            <option value="physics">Physics</option>
            <option value="chemistry">Chemistry</option>
            <option value="biology">Biology</option>
          </select>
        </div>

        <div className="admin-table-wrap" style={{ marginTop: '0.75rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Student Question</th>
                <th>Status</th>
                <th>Admin Action</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4}>
                  Q&A APIs are not wired yet. This page is now the single manual-answer category in admin panel.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
