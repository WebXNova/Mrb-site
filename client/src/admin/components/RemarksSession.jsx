import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import '../styles/admin-remarks.css';

const CLAMP_CHARS = 180;

function PostedBadge({ posted }) {
  if (!posted) return <span className="remarks-session__pill remarks-session__pill--neutral">Not posted</span>;
  return <span className="remarks-session__pill remarks-session__pill--posted">On homepage</span>;
}

function StatusBadge({ status }) {
  const isNew = status === 'new';
  return (
    <span className={`remarks-session__status remarks-session__status--${isNew ? 'new' : 'read'}`}>
      {isNew ? 'New' : 'Read'}
    </span>
  );
}

function formatReceived(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' };
  return {
    date: d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
}

function RemarkMessagePreview({ message, onViewFull }) {
  const text = String(message || '').trim();
  const needsClamp = text.length > CLAMP_CHARS || text.split('\n').length > 3;

  if (!text) return <span className="remarks-session__muted">—</span>;

  return (
    <div className="remarks-session__message">
      <p className="remarks-session__message-text">{text}</p>
      {needsClamp ? (
        <button className="remarks-session__message-toggle" type="button" onClick={onViewFull}>
          View full remark
        </button>
      ) : null}
    </div>
  );
}

function RemarkRowActions({ remark, busyId, onAction, onView, layout = 'inline', showView = true }) {
  const busy = busyId === remark.id;
  const actionClass =
    layout === 'stacked' ? 'remarks-session__actions remarks-session__actions--stacked' : 'remarks-session__actions';

  return (
    <div className={actionClass}>
      {showView ? (
        <button
          className="remarks-session__btn remarks-session__btn--ghost"
          type="button"
          disabled={busy}
          onClick={onView}
        >
          View
        </button>
      ) : null}
      {remark.status === 'new' ? (
        <button
          className="remarks-session__btn remarks-session__btn--read"
          type="button"
          disabled={busy}
          onClick={() => onAction('read', remark.id)}
        >
          Read
        </button>
      ) : null}
      {!remark.posted ? (
        <button
          className="remarks-session__btn remarks-session__btn--primary"
          type="button"
          disabled={busy}
          onClick={() => onAction('post', remark.id)}
        >
          Post remark
        </button>
      ) : (
        <button
          className="remarks-session__btn remarks-session__btn--ghost"
          type="button"
          disabled={busy}
          onClick={() => onAction('unpost', remark.id)}
        >
          Remove
        </button>
      )}
    </div>
  );
}

function RemarkDetailModal({ remark, busyId, onClose, onAction }) {
  if (!remark) return null;

  const { date, time } = formatReceived(remark.createdAt);

  return (
    <div
      className="remarks-session-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="remark-modal-title"
      onClick={onClose}
    >
      <div className="remarks-session-modal__panel" onClick={(event) => event.stopPropagation()}>
        <div className="remarks-session-modal__header">
          <div>
            <h3 className="remarks-session-modal__title" id="remark-modal-title">
              {remark.name || 'Contact remark'}
            </h3>
            <div className="remarks-session-modal__badges">
              <StatusBadge status={remark.status} />
              <PostedBadge posted={remark.posted} />
            </div>
          </div>
          <button className="remarks-session-modal__close" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="remarks-session-modal__grid">
          <div className="remarks-session-modal__field">
            <label>WhatsApp</label>
            <p>{remark.whatsapp || '—'}</p>
          </div>
          <div className="remarks-session-modal__field">
            <label>Email</label>
            <p>{remark.email || '—'}</p>
          </div>
          <div className="remarks-session-modal__field">
            <label>Received</label>
            <p>
              {date}
              {time ? ` · ${time}` : ''}
            </p>
          </div>
          <div className="remarks-session-modal__field">
            <label>Page</label>
            <p>{remark.pageUrl || '/contact'}</p>
          </div>
        </div>

        <label className="remarks-session-modal__field">
          <span className="remarks-session-modal__field-label">Remark</span>
        </label>
        <div className="remarks-session-modal__message">{remark.message}</div>

        <RemarkRowActions
          remark={remark}
          busyId={busyId}
          onAction={onAction}
          onView={onClose}
          layout="stacked"
          showView={false}
        />
      </div>
    </div>
  );
}

function RemarkRow({ remark, busyId, onAction, onView }) {
  const { date, time } = formatReceived(remark.createdAt);

  return (
    <article className="remarks-session__row">
      <div className="remarks-session__cell remarks-session__cell--status" data-label="Status">
        <StatusBadge status={remark.status} />
      </div>

      <div className="remarks-session__cell remarks-session__cell--homepage" data-label="Homepage">
        <PostedBadge posted={remark.posted} />
      </div>

      <div className="remarks-session__cell remarks-session__cell--contact" data-label="Contact">
        <div className="remarks-session__contact">
          <span className="remarks-session__contact-name">{remark.name || '—'}</span>
          {remark.whatsapp ? (
            <a className="remarks-session__contact-meta" href={`tel:${remark.whatsapp}`}>
              {remark.whatsapp}
            </a>
          ) : null}
          {remark.email ? (
            <a className="remarks-session__contact-meta" href={`mailto:${remark.email}`}>
              {remark.email}
            </a>
          ) : null}
        </div>
      </div>

      <div className="remarks-session__cell remarks-session__cell--remark" data-label="Remark">
        <RemarkMessagePreview message={remark.message} onViewFull={() => onView(remark)} />
      </div>

      <div className="remarks-session__cell remarks-session__cell--date" data-label="Received">
        <span className="remarks-session__date">
          {date}
          {time ? <span className="remarks-session__date-time">{time}</span> : null}
        </span>
      </div>

      <div className="remarks-session__cell remarks-session__cell--actions" data-label="Actions">
        <RemarkRowActions
          remark={remark}
          busyId={busyId}
          onAction={onAction}
          onView={() => onView(remark)}
          layout="stacked"
        />
      </div>
    </article>
  );
}

export default function RemarksSession() {
  const token = getAdminToken();
  const [remarks, setRemarks] = useState([]);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [selectedRemark, setSelectedRemark] = useState(null);

  async function loadRemarks() {
    setIsBusy(true);
    setError('');
    try {
      const response = await adminApi.remarks(token);
      setRemarks(response?.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load remarks');
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    loadRemarks();
  }, []);

  const stats = useMemo(
    () => ({
      total: remarks.length,
      newCount: remarks.filter((r) => r.status === 'new').length,
      posted: remarks.filter((r) => r.posted).length,
    }),
    [remarks]
  );

  const filteredRemarks = useMemo(() => {
    if (filter === 'new') return remarks.filter((r) => r.status === 'new');
    if (filter === 'posted') return remarks.filter((r) => r.posted);
    return remarks;
  }, [remarks, filter]);

  async function runAction(action, remarkId) {
    setBusyId(remarkId);
    setError('');
    try {
      if (action === 'read') await adminApi.markRemarkRead(token, remarkId);
      if (action === 'post') await adminApi.postRemark(token, remarkId);
      if (action === 'unpost') await adminApi.unpostRemark(token, remarkId);
      await loadRemarks();
      if (action === 'post') setFeedback('Remark posted on homepage.');
      if (action === 'unpost') setFeedback('Remark removed from homepage.');
      if (action === 'read') setFeedback('Remark marked as read.');
      window.setTimeout(() => setFeedback(''), 3000);

      setSelectedRemark((prev) => {
        if (!prev || prev.id !== remarkId) return prev;
        if (action === 'read') return { ...prev, status: 'read' };
        if (action === 'post') return { ...prev, posted: true, status: 'read' };
        if (action === 'unpost') return { ...prev, posted: false };
        return prev;
      });
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="remarks-session">
      <header className="remarks-session__header">
        <div className="remarks-session__header-copy">
          <h2 className="remarks-session__title">Admin / Remarks</h2>
          <p className="remarks-session__subtitle">
            Remarks and message are shown publicly on the homepage when posted.
          </p>
        </div>
        <button
          className="remarks-session__btn remarks-session__btn--ghost remarks-session__refresh"
          type="button"
          disabled={isBusy}
          onClick={loadRemarks}
        >
          {isBusy ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <div className="remarks-session__stats">
        <button
          type="button"
          className={`remarks-session__stat ${filter === 'all' ? 'remarks-session__stat--active' : ''}`}
          onClick={() => setFilter('all')}
        >
          <span className="remarks-session__stat-value">{stats.total}</span>
          <span className="remarks-session__stat-label">All</span>
        </button>
        <button
          type="button"
          className={`remarks-session__stat remarks-session__stat--new ${filter === 'new' ? 'remarks-session__stat--active' : ''}`}
          onClick={() => setFilter('new')}
        >
          <span className="remarks-session__stat-value">{stats.newCount}</span>
          <span className="remarks-session__stat-label">New</span>
        </button>
        <button
          type="button"
          className={`remarks-session__stat remarks-session__stat--posted ${filter === 'posted' ? 'remarks-session__stat--active' : ''}`}
          onClick={() => setFilter('posted')}
        >
          <span className="remarks-session__stat-value">{stats.posted}</span>
          <span className="remarks-session__stat-label">On homepage</span>
        </button>
      </div>

      {feedback ? <p className="remarks-session__feedback">{feedback}</p> : null}
      {error ? <p className="remarks-session__error">{error}</p> : null}

      <div className="remarks-session__table" role="table" aria-label="Contact remarks">
        <div className="remarks-session__thead" role="rowgroup">
          <div className="remarks-session__head-row" role="row">
            <span className="remarks-session__th" role="columnheader">
              Status
            </span>
            <span className="remarks-session__th" role="columnheader">
              Homepage
            </span>
            <span className="remarks-session__th" role="columnheader">
              Contact
            </span>
            <span className="remarks-session__th" role="columnheader">
              Remark
            </span>
            <span className="remarks-session__th" role="columnheader">
              Received
            </span>
            <span className="remarks-session__th" role="columnheader">
              Actions
            </span>
          </div>
        </div>

        <div className="remarks-session__tbody" role="rowgroup">
          {filteredRemarks.length ? (
            filteredRemarks.map((remark) => (
              <RemarkRow
                key={remark.id}
                remark={remark}
                busyId={busyId}
                onAction={runAction}
                onView={setSelectedRemark}
              />
            ))
          ) : (
            <p className="remarks-session__empty">
              {isBusy ? 'Loading remarks…' : filter === 'all' ? 'No remarks yet.' : 'No remarks in this filter.'}
            </p>
          )}
        </div>
      </div>

      {selectedRemark ? (
        <RemarkDetailModal
          remark={selectedRemark}
          busyId={busyId}
          onClose={() => setSelectedRemark(null)}
          onAction={runAction}
        />
      ) : null}
    </div>
  );
}
