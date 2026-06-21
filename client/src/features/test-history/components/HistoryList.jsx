import { Link } from 'react-router-dom';
import {
  formatHistoryPercentage,
  formatHistoryScore,
  formatSubmittedDate,
} from '../utils/formatDisplay';

function StatusBadge({ status, available }) {
  if (!available) {
    return <span className="th-badge th-badge--pending">Pending</span>;
  }
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PASS') return <span className="th-badge th-badge--pass">PASS</span>;
  if (normalized === 'FAIL') return <span className="th-badge th-badge--fail">FAIL</span>;
  return <span className="th-badge">{normalized || '—'}</span>;
}

function HistoryRow({ item }) {
  const detailPath = `/dashboard/tests/${item.testId}/results/${item.attemptId}`;
  const isDark = Boolean(item.resultAvailable);

  return (
    <tr className={isDark ? 'th-table__row th-table__row--dark' : 'th-table__row'}>
      <td data-label="Test">{item.testTitle}</td>
      <td data-label="Subject">{item.subjectLabel || '—'}</td>
      <td data-label="Score">{formatHistoryScore(item.score, item.maxScore)}</td>
      <td data-label="Percentage">{formatHistoryPercentage(item.percentage)}</td>
      <td data-label="Result">
        <StatusBadge status={item.status} available={item.resultAvailable} />
      </td>
      <td data-label="Submitted">{formatSubmittedDate(item.submittedAt)}</td>
      <td data-label="Actions">
        {item.resultAvailable ? (
          <Link className="th-table__action" to={detailPath}>
            View details
          </Link>
        ) : (
          <span className="th-muted">Not released</span>
        )}
      </td>
    </tr>
  );
}

function HistoryCard({ item }) {
  const detailPath = `/dashboard/tests/${item.testId}/results/${item.attemptId}`;
  const isDark = Boolean(item.resultAvailable);

  return (
    <article className={`th-card ${isDark ? 'th-card--dark' : ''}`.trim()}>
      <header className="th-card__header">
        <h3 className="th-card__title">{item.testTitle}</h3>
        <StatusBadge status={item.status} available={item.resultAvailable} />
      </header>
      <dl className="th-card__meta">
        <div>
          <dt>Subject</dt>
          <dd>{item.subjectLabel || '—'}</dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd>{formatHistoryScore(item.score, item.maxScore)}</dd>
        </div>
        <div>
          <dt>Percentage</dt>
          <dd>{formatHistoryPercentage(item.percentage)}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{formatSubmittedDate(item.submittedAt)}</dd>
        </div>
      </dl>
      {item.resultAvailable ? (
        <Link className="th-card__action" to={detailPath}>
          View details
        </Link>
      ) : (
        <p className="th-muted th-card__pending">Results not released yet</p>
      )}
    </article>
  );
}

export default function HistoryList({ items }) {
  if (!items?.length) return null;

  return (
    <>
      <div className="th-table-wrap th-table-wrap--dark" role="region" aria-label="Results table">
        <table className="th-table th-table--dark">
          <thead>
            <tr>
              <th scope="col">Test</th>
              <th scope="col">Subject</th>
              <th scope="col">Score</th>
              <th scope="col">Percentage</th>
              <th scope="col">Result</th>
              <th scope="col">Submitted</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <HistoryRow key={item.attemptId} item={item} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="th-cards" aria-label="Results cards">
        {items.map((item) => (
          <HistoryCard key={item.attemptId} item={item} />
        ))}
      </div>
    </>
  );
}
