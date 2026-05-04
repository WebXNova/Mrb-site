import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { qaSubjectEmoji, qaSubjectIconModifier } from '../constants/qaSubjects';
import '../student/styles/studentQaChat.css';

function subjectIconClass(subject) {
  const mod = qaSubjectIconModifier(subject);
  const base = 'sqachat-list__icon';
  return mod ? `${base} sqachat-list__icon--${mod}` : base;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function StudentQuestionsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await studentApi.questions();
        if (mounted) setItems(Array.isArray(response?.data) ? response.data : []);
      } catch (err) {
        if (mounted) setError(err.message || '');
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="sqachat sqachat-list">
      <div className="sqachat-list__top">
        <div>
          <h2 className="heading-3" style={{ margin: 0 }}>
            My chats
          </h2>
          <p className="admin-stat-card__label" style={{ marginTop: '0.35rem' }}>
            Manual answers from MRB teachers — not an AI chatbot.
          </p>
        </div>
        <Link className="btn btn--primary btn--sm" to="/dashboard/questions/ask">
          New message
        </Link>
      </div>
      {error ? <p className="admin-error">{error}</p> : null}
      <div className="sqachat-list__items">
        {items.length ? (
          items.map((item) => (
            <Link key={item.id} className="sqachat-list__item" to={`/dashboard/questions/${item.id}`}>
              <div className={subjectIconClass(item.subject)} aria-hidden>
                {qaSubjectEmoji(item.subject)}
              </div>
              <div className="sqachat-list__main">
                <p className="sqachat-list__title">
                  {item.attachmentUrl ? <span className="sqachat-list__clip" title="Includes a photo">📎 </span> : null}
                  {item.title || item.body || 'Question'}
                </p>
                <p className="sqachat-list__preview">{item.body || ''}</p>
              </div>
              <div className="sqachat-list__meta">
                <span
                  className={`sqachat-badge sqachat-badge--${item.status === 'answered' ? 'answered' : 'pending'}`}
                >
                  {item.status === 'answered' ? 'Replied' : 'Pending'}
                </span>
                <span className="sqachat-list__time">{formatTime(item.updatedAt)}</span>
              </div>
            </Link>
          ))
        ) : (
          <section className="admin-card" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <p className="admin-stat-card__label" style={{ marginBottom: '1rem' }}>
              No conversations yet. Start one — a teacher will reply manually.
            </p>
            <Link className="btn btn--primary btn--sm" to="/dashboard/questions/ask">
              Ask a doubt
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
