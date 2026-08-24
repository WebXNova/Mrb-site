import { Fragment, useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';

function formatDateTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function formatScore(score, maxScore) {
  if (score == null) return '—';
  if (maxScore == null) return String(score);
  return `${score}/${maxScore}`;
}

function ViolationList({ violations }) {
  if (!Array.isArray(violations) || !violations.length) {
    return <p className="admin-field__hint">No violation details recorded.</p>;
  }

  return (
    <ul className="admin-results-violations">
      {violations.map((item) => (
        <li key={`${item.violation_number}-${item.violation_type}`}>
          <strong>#{item.violation_number}</strong> {item.violation_type}
          {item.occurred_at ? ` — ${formatDateTime(item.occurred_at)}` : ''}
        </li>
      ))}
    </ul>
  );
}

export default function AdminTestResultsAttemptsTable({ testId }) {
  const token = getAdminToken();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  const loadAttempts = useCallback(async () => {
    if (!testId) return;
    setLoading(true);
    setError('');
    try {
      const response = await adminApi.getTestResults(token, testId);
      setAttempts(Array.isArray(response?.data?.attempts) ? response.data.attempts : []);
    } catch (err) {
      setAttempts([]);
      setError(err.message || 'Failed to load attempts.');
    } finally {
      setLoading(false);
    }
  }, [testId, token]);

  useEffect(() => {
    loadAttempts();
  }, [loadAttempts]);

  const toggleExpanded = (attemptId) => {
    setExpandedId((current) => (current === attemptId ? null : attemptId));
  };

  if (!testId) return null;

  return (
    <section className="admin-results-attempts" aria-labelledby="admin-results-attempts-heading">
      <header className="admin-results-attempts__header">
        <h3 id="admin-results-attempts-heading" className="heading-5" style={{ margin: 0 }}>
          Student attempts
        </h3>
        <button type="button" className="btn btn--ghost btn--sm" onClick={loadAttempts} disabled={loading}>
          Refresh
        </button>
      </header>

      {error ? <p className="admin-error">{error}</p> : null}

      {loading && !attempts.length ? (
        <p className="admin-field__hint">Loading attempts…</p>
      ) : !attempts.length ? (
        <p className="admin-field__hint">No submitted attempts yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-results-attempts__table">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Submitted</th>
                <th scope="col">Score</th>
                <th scope="col">Status</th>
                <th scope="col">Integrity</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => {
                const attemptId = attempt.attempt_id;
                const flagged = Boolean(attempt.is_flagged_cheating);
                const expanded = expandedId === attemptId;

                return (
                  <Fragment key={attemptId}>
                    <tr>
                      <td>{attempt.student_name || 'Student'}</td>
                      <td>{formatDateTime(attempt.submitted_at)}</td>
                      <td>{formatScore(attempt.score, attempt.max_score)}</td>
                      <td>{attempt.pass_status || '—'}</td>
                      <td>
                        {flagged ? (
                          <button
                            type="button"
                            className="admin-results-cheating-badge"
                            onClick={() => toggleExpanded(attemptId)}
                            aria-expanded={expanded}
                            aria-controls={`attempt-violations-${attemptId}`}
                          >
                            <span aria-hidden="true">🚩</span> Cheating Detected
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {flagged && expanded ? (
                      <tr className="admin-results-attempts__detail-row">
                        <td colSpan={5} id={`attempt-violations-${attemptId}`}>
                          <ViolationList violations={attempt.violations} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
