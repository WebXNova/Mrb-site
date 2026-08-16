import { useCallback, useEffect, useMemo, useState } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { useAdminToast } from '../context/AdminToastContext';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import AdminLoadingButton from '../components/AdminLoadingButton';
import AdminSearchField from '../components/AdminSearchField';
import ManualPaymentCouponBadge, { ManualPaymentCouponDetail } from '../components/ManualPaymentCouponBadge';
import {
  getPaymentMethodLabel,
  getPaymentMethodLogoSrc,
} from '../utils/paymentMethodAssets';
import '../styles/admin-manual-payments.css';

const STATUS_TABS = [
  { key: 'pending_review', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatPkr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `PKR ${n.toLocaleString('en-PK')}`;
}

function statusLabel(status) {
  if (status === 'pending_review') return 'Pending';
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Rejected';
  return String(status || '');
}

function statusPillClass(status) {
  if (status === 'approved') return 'admin-status-pill admin-status-pill--approved';
  if (status === 'rejected') return 'admin-status-pill admin-status-pill--rejected';
  return 'admin-status-pill admin-status-pill--pending';
}

function MethodBadge({ method }) {
  return (
    <span className="mp-method">
      <img src={getPaymentMethodLogoSrc(method)} alt="" width="56" height="22" />
      <span>{getPaymentMethodLabel(method)}</span>
    </span>
  );
}

function RiskBadge({ level }) {
  const needsReview = String(level) === 'needs_review';
  return (
    <span className={`mp-risk ${needsReview ? 'mp-risk--review' : 'mp-risk--low'}`}>
      {needsReview ? 'Needs review' : 'Low risk'}
    </span>
  );
}

function StatTile({ label, value, tone = 'neutral', onClick, active = false }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`admin-reg-stat admin-reg-stat--${tone} ${active ? 'admin-reg-stat--active' : ''} ${
        onClick ? 'admin-reg-stat--clickable' : ''
      }`}
    >
      <span className="admin-reg-stat__value">{value}</span>
      <span className="admin-reg-stat__label">{label}</span>
    </Tag>
  );
}

export default function AdminManualPaymentsPage() {
  const token = getAdminToken();
  const toast = useAdminToast();

  const [status, setStatus] = useState('pending_review');
  const [riskLevel, setRiskLevel] = useState('all');
  const [courseId, setCourseId] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [courses, setCourses] = useState([]);
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({ pending: 0, needsReview: 0, approvedToday: 0, rejectedToday: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [shotUrl, setShotUrl] = useState('');
  const [lightbox, setLightbox] = useState(false);

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 280);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.paymentSubmissions(token, {
        status,
        riskLevel,
        courseId,
        search: debouncedSearch,
        limit: 100,
      });
      setItems(res?.data?.items || []);
      setStats(res?.data?.stats || { pending: 0, needsReview: 0, approvedToday: 0, rejectedToday: 0 });
    } catch (err) {
      const msg = err?.message || 'Failed to load admissions';
      setError(msg);
      toast.error(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, status, riskLevel, courseId, debouncedSearch]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    adminApi
      .courses(token)
      .then((res) => setCourses(res?.data || []))
      .catch(() => setCourses([]));
  }, [token]);

  const openDetail = useCallback(
    async (id) => {
      setSelectedId(id);
      setDetail(null);
      setDetailLoading(true);
      setShotUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return '';
      });
      try {
        const res = await adminApi.paymentSubmission(token, id);
        const submission = res?.data?.submission || null;
        setDetail(submission);
        if (submission?.hasScreenshot) {
          const blob = await adminApi.paymentSubmissionScreenshot(token, id);
          setShotUrl(URL.createObjectURL(blob));
        }
      } catch (err) {
        toast.error(err?.message || 'Could not load admission');
        setSelectedId(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [token, toast]
  );

  useEffect(() => {
    return () => {
      if (shotUrl) URL.revokeObjectURL(shotUrl);
    };
  }, [shotUrl]);

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
    setApproveOpen(false);
    setRejectOpen(false);
    setRejectReason('');
    setRejectError('');
    setLightbox(false);
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    setShotUrl('');
  }

  function handleDrawerBackdropClick() {
    if (approveOpen || rejectOpen) return;
    closeDetail();
  }

  async function handleApprove() {
    if (!selectedId) return;
    setActionBusy(true);
    try {
      await adminApi.approvePaymentSubmission(token, selectedId);
      toast.success('Admission approved. Course access granted.');
      setApproveOpen(false);
      closeDetail();
      await loadList();
    } catch (err) {
      toast.error(err?.message || 'Approve failed');
    } finally {
      setActionBusy(false);
    }
  }

  async function handleReject() {
    if (!selectedId || actionBusy) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      const msg = 'A rejection reason is required (at least 3 characters).';
      setRejectError(msg);
      toast.error(msg);
      return;
    }
    setRejectError('');
    setActionBusy(true);
    try {
      await adminApi.rejectPaymentSubmission(token, selectedId, reason);
      toast.success('Admission rejected. Student can resubmit.');
      setRejectOpen(false);
      closeDetail();
      await loadList();
    } catch (err) {
      const msg = err?.message || 'Reject failed. Please try again.';
      setRejectError(msg);
      toast.error(msg);
    } finally {
      setActionBusy(false);
    }
  }

  const courseOptions = useMemo(
    () => courses.map((c) => ({ id: c.id, title: c.title || c.name || `Course ${c.id}` })),
    [courses]
  );

  const canDecide = detail?.status === 'pending_review';

  return (
    <section className="admin-page admin-page--manual-payments">
      <header className="mp-hero">
        <div>
          <h2 className="heading-3 mp-title">New Admissions</h2>
          <p className="mp-subtitle">Review new admission requests and payment proofs. Approving grants course access.</p>
        </div>
      </header>

      <div className="admin-reg-stat-grid mp-stats">
        <StatTile
          label="Pending"
          value={stats.pending}
          tone="warning"
          active={status === 'pending_review'}
          onClick={() => setStatus('pending_review')}
        />
        <StatTile
          label="Needs review"
          value={stats.needsReview}
          tone="primary"
          active={riskLevel === 'needs_review'}
          onClick={() => {
            setStatus('pending_review');
            setRiskLevel('needs_review');
          }}
        />
        <StatTile label="Approved today" value={stats.approvedToday} tone="success" />
        <StatTile label="Rejected today" value={stats.rejectedToday} tone="danger" />
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      <section className="admin-card mp-main">
        <div className="mp-toolbar">
          <div className="admin-status-filters" role="tablist" aria-label="Filter by status">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={status === tab.key}
                className={`admin-tag-chip ${status === tab.key ? 'admin-tag-chip--active' : ''}`}
                onClick={() => setStatus(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="mp-toolbar__filters">
            <label className="mp-filter">
              <span>Risk</span>
              <select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}>
                <option value="all">All risk levels</option>
                <option value="needs_review">Needs review</option>
                <option value="low">Low risk</option>
              </select>
            </label>
            <label className="mp-filter">
              <span>Course</span>
              <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                <option value="all">All courses</option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
            <AdminSearchField
              id="mp-search"
              label="Search"
              placeholder="Transaction ID or student name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch('')}
            />
          </div>
        </div>

        {loading ? (
          <div className="mp-loading">
            <span className="admin-spinner" aria-hidden />
            Loading admissions…
          </div>
        ) : items.length === 0 ? (
          <div className="mp-empty">No admissions match these filters.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table mp-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Course</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Transaction ID</th>
                  <th>Risk</th>
                  <th>Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.id}
                    className={`mp-row ${row.riskLevel === 'needs_review' ? 'mp-row--risk' : ''} ${
                      selectedId === row.id ? 'mp-row--open' : ''
                    }`}
                    onClick={() => openDetail(row.id)}
                  >
                    <td>
                      <strong>{row.studentName || '—'}</strong>
                    </td>
                    <td title={row.courseName}>{row.courseName || '—'}</td>
                    <td>
                      <MethodBadge method={row.paymentMethod} />
                    </td>
                    <td>
                      <span className={row.amountMismatch ? 'mp-amount-mismatch' : ''}>
                        {formatPkr(row.amountClaimed)}
                        {row.amountMismatch ? ` / ${formatPkr(row.amountExpected)}` : ''}
                      </span>
                      <ManualPaymentCouponBadge submission={row} />
                    </td>
                    <td>
                      <code className="mp-trx">{row.transactionId}</code>
                    </td>
                    <td>
                      <RiskBadge level={row.riskLevel} />
                    </td>
                    <td>{formatWhen(row.createdAt)}</td>
                    <td>
                      <span className={statusPillClass(row.status)}>{statusLabel(row.status)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedId ? (
        <div className="mp-drawer-backdrop" role="presentation" onClick={handleDrawerBackdropClick}>
          <aside
            className="mp-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mp-drawer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mp-drawer__head">
              <div>
                <p className="mp-drawer__kicker">Admission #{selectedId}</p>
                <h3 id="mp-drawer-title" className="mp-drawer__title">
                  {detail?.studentName || 'New admission'}
                </h3>
              </div>
              <button type="button" className="mp-icon-btn" aria-label="Close" onClick={closeDetail}>
                <CloseIcon fontSize="small" />
              </button>
            </header>

            {detailLoading || !detail ? (
              <div className="mp-loading">
                <span className="admin-spinner" aria-hidden />
                Loading admission details…
              </div>
            ) : (
              <div className="mp-drawer__body">
                <div className="mp-shot">
                  {shotUrl ? (
                    <button type="button" className="mp-shot__btn" onClick={() => setLightbox(true)}>
                      <img src={shotUrl} alt="Admission payment proof" />
                      <span>Click to enlarge</span>
                    </button>
                  ) : (
                    <p className="admin-muted">No screenshot on file.</p>
                  )}
                </div>

                <dl className="mp-facts">
                  <div>
                    <dt>Course</dt>
                    <dd>{detail.courseName}</dd>
                  </div>
                  <div>
                    <dt>Method</dt>
                    <dd>
                      <MethodBadge method={detail.paymentMethod} />
                    </dd>
                  </div>
                  <div>
                    <dt>Sender phone</dt>
                    <dd>{detail.senderPhoneNumber}</dd>
                  </div>
                  <div>
                    <dt>Sender name</dt>
                    <dd>{detail.senderAccountTitle}</dd>
                  </div>
                  <div>
                    <dt>Transaction ID</dt>
                    <dd>
                      <code className="mp-trx">{detail.transactionId}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd className="mp-amount-block">
                      <span className={detail.amountMismatch ? 'mp-amount-mismatch' : ''}>
                        Claimed {formatPkr(detail.amountClaimed)} · expected {formatPkr(detail.amountExpected)}
                      </span>
                      <ManualPaymentCouponDetail submission={detail} />
                    </dd>
                  </div>
                  <div>
                    <dt>Reference</dt>
                    <dd>{detail.referenceCode || '—'}</dd>
                  </div>
                  <div>
                    <dt>Submitted</dt>
                    <dd>{formatWhen(detail.createdAt)}</dd>
                  </div>
                </dl>

                {detail.riskFlagLabels?.length ? (
                  <section className="mp-flags" aria-label="Risk flags">
                    <h4>Risk signals</h4>
                    <ul>
                      {detail.riskFlagLabels.map((flag) => (
                        <li key={flag.code}>⚠ {flag.label}</li>
                      ))}
                    </ul>
                  </section>
                ) : (
                  <p className="mp-flags-empty">No risk flags on this admission.</p>
                )}

                {detail.history?.length ? (
                  <section className="mp-history">
                    <h4>Prior admissions for this order</h4>
                    <ol>
                      {detail.history.map((item) => (
                        <li key={item.id}>
                          <span className={statusPillClass(item.status)}>{statusLabel(item.status)}</span>
                          <span>{formatWhen(item.createdAt)}</span>
                          {item.adminNote ? <p>{item.adminNote}</p> : null}
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}

                {canDecide ? (
                  <div className="mp-drawer__actions">
                    <AdminLoadingButton
                      className="btn btn--secondary"
                      onClick={() => {
                        setRejectReason('');
                        setRejectError('');
                        setRejectOpen(true);
                      }}
                    >
                      Reject
                    </AdminLoadingButton>
                    <AdminLoadingButton className="btn btn--primary" onClick={() => setApproveOpen(true)}>
                      Approve & grant access
                    </AdminLoadingButton>
                  </div>
                ) : (
                  <p className="mp-processed">
                    Already {statusLabel(detail.status).toLowerCase()}
                    {detail.reviewerName ? ` by ${detail.reviewerName}` : ''}
                    {detail.reviewedAt ? ` · ${formatWhen(detail.reviewedAt)}` : ''}.
                    {detail.adminNote ? ` Reason: ${detail.adminNote}` : ''}
                  </p>
                )}
              </div>
            )}
          </aside>
        </div>
      ) : null}

      {lightbox && shotUrl ? (
        <div className="mp-lightbox" role="presentation" onClick={() => setLightbox(false)}>
          <img src={shotUrl} alt="Admission payment proof enlarged" />
        </div>
      ) : null}

      <AdminConfirmDialog
        open={approveOpen}
        title="Approve this admission?"
        message="This marks the order paid and grants the student course access. This cannot be undone from the admissions queue."
        confirmLabel="Approve & grant access"
        busy={actionBusy}
        onConfirm={handleApprove}
        onCancel={() => setApproveOpen(false)}
      />

      <AdminConfirmDialog
        open={rejectOpen}
        title="Reject this admission?"
        danger
        busy={actionBusy}
        confirmLabel="Reject"
        message={
          <div className="admin-field">
            <label htmlFor="mp-reject-reason" className="admin-confirm-dialog__note-label">
              Reason (required, shown to the student)
            </label>
            <textarea
              id="mp-reject-reason"
              className="admin-confirm-dialog__note"
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                if (rejectError) setRejectError('');
              }}
              maxLength={1000}
              rows={4}
              disabled={actionBusy}
            />
            {rejectError ? (
              <p className="admin-confirm-dialog__error" role="alert">
                {rejectError}
              </p>
            ) : null}
          </div>
        }
        onConfirm={handleReject}
        onCancel={() => {
          if (actionBusy) return;
          setRejectOpen(false);
          setRejectError('');
        }}
      />
    </section>
  );
}
