import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { qaSubjectAvatarLetters, qaSubjectLabel } from '../constants/qaSubjects';
import '../student/styles/studentQaChat.css';

function formatWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

export default function StudentQuestionDetailPage() {
  const { id } = useParams();
  const [row, setRow] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await studentApi.questionDetail(id);
        if (mounted) setRow(response?.data || null);
      } catch (err) {
        if (mounted) setError(err.message || 'Could not load this chat.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="sqachat">
        <p className="admin-stat-card__label">Loading…</p>
      </div>
    );
  }

  if (error || !row) {
    return (
      <div className="sqachat">
        <p className="admin-error">{error || 'Not found.'}</p>
        <Link className="btn btn--secondary btn--sm" to="/dashboard/questions" style={{ marginTop: '0.75rem' }}>
          Back to my chats
        </Link>
      </div>
    );
  }

  const subjectLabel = qaSubjectLabel(row.subject);

  return (
    <div className="sqachat">
      <div className="sqachat__toolbar">
        <Link className="btn btn--secondary btn--sm" to="/dashboard/questions">
          ← All chats
        </Link>
      </div>
      <div className="sqachat__shell">
        <header className="sqachat__header">
          <div className="sqachat__avatar" aria-hidden>
            {qaSubjectAvatarLetters(row.subject)}
          </div>
          <div className="sqachat__header-text">
            <h2 className="sqachat__title">{row.title || 'Your question'}</h2>
            <p className="sqachat__subtitle">
              {subjectLabel} · {row.status === 'answered' ? 'Teacher replied' : 'Waiting for teacher'}
            </p>
          </div>
          <div className="sqachat__status">
            <span className={`sqachat__status-dot${row.status === 'answered' ? '' : ' sqachat__status-dot--queue'}`} aria-hidden />
            <span>{row.status === 'answered' ? 'Replied' : 'Queued'}</span>
          </div>
        </header>

        <div className="sqachat__body">
          <p className="sqachat__meta-pill">Conversation</p>

          <div className="sqachat__row sqachat__row--out">
            <div className="sqachat__bubble sqachat__bubble--out">
              {row.body}
              {row.attachmentUrl ? (
                <a
                  className="sqachat__attach-link"
                  href={row.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img className="sqachat__attach" src={row.attachmentUrl} alt="Attachment you sent with this question" />
                </a>
              ) : null}
              <div className="sqachat__time">{formatWhen(row.createdAt)}</div>
            </div>
          </div>

          {row.status === 'pending' && !row.answer ? (
            <>
              <div className="sqachat__row sqachat__row--in">
                <div className="sqachat__bubble sqachat__bubble--in">
                  <div className="sqachat__bubble-label">MRB support</div>
                  Thanks — your doubt is in the teacher queue. You&apos;ll see the reply here as soon as it&apos;s
                  posted (no bot involved).
                </div>
              </div>
              <div className="sqachat__typing" aria-label="Waiting for teacher">
                <span />
                <span />
                <span />
              </div>
            </>
          ) : null}

          {row.answer ? (
            <div className="sqachat__row sqachat__row--in">
              <div className="sqachat__bubble sqachat__bubble--in">
                <div className="sqachat__bubble-label">Teacher reply</div>
                {row.answer}
                <div className="sqachat__time">{formatWhen(row.answeredAt || row.updatedAt)}</div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
