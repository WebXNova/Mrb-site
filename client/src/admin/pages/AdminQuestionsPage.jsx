import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { qaSubjectLabel } from '../../constants/qaSubjects';

function formatWhen(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
}

export default function AdminQuestionsPage() {
  const token = getAdminToken();
  const [subject, setSubject] = useState('all');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [draftAnswer, setDraftAnswer] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await adminApi.studentQuestions(token, subject);
    setItems(Array.isArray(response?.data) ? response.data : []);
  }, [token, subject]);

  useEffect(() => {
    setError('');
    load().catch((err) => setError(err.message || 'Failed to load queue'));
  }, [load]);

  const selected = items.find((q) => Number(q.id) === Number(selectedId)) || null;

  useEffect(() => {
    if (selected) {
      setDraftAnswer(selected.answer || '');
    } else {
      setDraftAnswer('');
    }
  }, [selected]);

  async function submitAnswer() {
    if (!selectedId) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await adminApi.answerStudentQuestion(token, selectedId, { answer: draftAnswer });
      setSuccess('Reply saved. Student will see it in their portal.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to save reply');
    } finally {
      setSaving(false);
    }
  }

  async function removeQuestion(questionId) {
    if (!questionId) return;
    if (!window.confirm('Delete this question from admin queue? This cannot be undone.')) return;
    setError('');
    setSuccess('');
    try {
      await adminApi.deleteStudentQuestion(token, questionId);
      if (Number(selectedId) === Number(questionId)) {
        setSelectedId(null);
      }
      setSuccess('Question deleted from queue.');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to delete question');
    }
  }

  return (
    <section className="admin-page">
      <section className="admin-card">
        <h2 className="heading-3">Student Q&A (manual answers)</h2>
        <p className="admin-stat-card__label" style={{ marginTop: '0.5rem' }}>
          This is not an AI chatbot. Students send doubts by subject; you write replies here. Pending items are sorted
          first.
        </p>
      </section>

      <section className="admin-card">
        <div className="admin-row-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="heading-4">Question queue</h3>
          <select value={subject} onChange={(e) => setSubject(e.target.value)} style={{ maxWidth: '220px' }}>
            <option value="all">All subjects</option>
            <option value="physics">Physics</option>
            <option value="chemistry">Chemistry</option>
            <option value="biology">Biology</option>
            <option value="english">English</option>
            <option value="logical_reasoning">Logical reasoning</option>
          </select>
        </div>
        {error ? <p className="admin-error" style={{ marginTop: '0.75rem' }}>{error}</p> : null}
        {success ? <p className="admin-stat-card__label" style={{ marginTop: '0.75rem', color: 'var(--color-success, #15803d)' }}>{success}</p> : null}

        <div className="admin-table-wrap" style={{ marginTop: '0.75rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Student</th>
                <th>Question / photo</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((q) => (
                  <tr
                    key={q.id}
                    style={Number(selectedId) === Number(q.id) ? { background: 'rgba(37, 99, 235, 0.06)' } : undefined}
                  >
                    <td>{qaSubjectLabel(q.subject)}</td>
                    <td>
                      <div>{q.studentName || '—'}</div>
                      <div className="admin-stat-card__label">{q.studentEmail || ''}</div>
                    </td>
                    <td className="admin-qa-question-cell">
                      <strong>{q.title}</strong>
                      <div className="admin-stat-card__label" style={{ marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>
                        {q.body}
                      </div>
                      {q.attachmentUrl ? (
                        <div className="admin-qa-attach">
                          <a href={q.attachmentUrl} target="_blank" rel="noopener noreferrer">
                            Open full image
                          </a>
                          <img src={q.attachmentUrl} alt="" className="admin-qa-thumb" />
                        </div>
                      ) : null}
                    </td>
                    <td>{q.status}</td>
                    <td>{formatWhen(q.updatedAt)}</td>
                    <td>
                      <div className="admin-qa-row-actions">
                        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setSelectedId(q.id)}>
                          {Number(selectedId) === Number(q.id) ? 'Selected' : 'Reply'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => removeQuestion(q.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No questions in this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selected ? (
          <div className="admin-card" style={{ marginTop: '1rem', border: '1px solid var(--color-ink-100, #e5e7eb)' }}>
            <h4 className="heading-4">Write reply (ID {selected.id})</h4>
            <p className="admin-stat-card__label" style={{ marginTop: '0.35rem' }}>
              Student sees this text in their chat thread. You can update the answer anytime.
            </p>
            <div className="admin-qa-thread-preview">
              <p className="heading-4" style={{ fontSize: '0.95rem', marginBottom: '0.35rem' }}>
                Student message
              </p>
              <p className="admin-stat-card__label" style={{ whiteSpace: 'pre-wrap' }}>
                {selected.body}
              </p>
              {selected.attachmentUrl ? (
                <div className="admin-qa-attach admin-qa-attach--large">
                  <a href={selected.attachmentUrl} target="_blank" rel="noopener noreferrer">
                    Open attachment in new tab
                  </a>
                  <img src={selected.attachmentUrl} alt="Student attachment" />
                </div>
              ) : null}
            </div>
            <div className="admin-field" style={{ marginTop: '0.75rem' }}>
              <label htmlFor="admin-qa-answer">Answer</label>
              <textarea
                id="admin-qa-answer"
                rows={8}
                value={draftAnswer}
                onChange={(e) => setDraftAnswer(e.target.value)}
                style={{ width: '100%', fontFamily: 'inherit' }}
              />
            </div>
            <div className="admin-actions" style={{ marginTop: '0.75rem' }}>
              <button type="button" className="btn btn--primary btn--sm" disabled={saving} onClick={submitAnswer}>
                {saving ? 'Saving…' : 'Post reply to student'}
              </button>
              <button type="button" className="btn btn--secondary btn--sm" onClick={() => setSelectedId(null)}>
                Close
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </section>
  );
}
