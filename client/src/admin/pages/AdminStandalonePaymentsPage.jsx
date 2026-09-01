import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CloseIcon from '@mui/icons-material/Close';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { useAdminToast } from '../context/AdminToastContext';
import AdminConfirmDialog from '../components/AdminConfirmDialog';
import AdminLoadingButton from '../components/AdminLoadingButton';
import AdminSearchField from '../components/AdminSearchField';
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

function seatLabel(status) {
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'held') return 'Held';
  if (status === 'released') return 'Released';
  return String(status || '—');
}

export default function AdminStandalonePaymentsPage() {
  const token = getAdminToken();
  const toast = useAdminToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const testIdFilter = Number(searchParams.get('testId') || 0);

  const [status, setStatus] = useState('pending_review');
  const [riskLevel, setRiskLevel] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [shotUrl, setShotUrl] = useState('');
  const [lightbox, setLightbox] = useState(false);

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectNote] = useState('');
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
      const res = await adminApi.standaloneTestPayments(token, { status, limit: 100 });
      setItems(res?.data?.items || []);
    } catch (err) {
      const msg = err?.message || 'Could not load paid test payments.';
      setError(msg);
      toast.error(msg);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [status, token]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const visibleItems = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return items.filter((row) => {
      if (testIdFilter > 0 && Number(row.testId) !== testIdFilter) return false;
      if (riskLevel !== 'all' && String(row.riskLevel) !== riskLevel) return false;
      if (!q) return true;
      return [row.studentName, row.testTitle, row.transactionId, row.referenceCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [debouncedSearch, items, riskLevel, testIdFilter]);

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
        const res = await adminApi.standaloneTestPayment(token, id);
        const submission = res?.data?.submission || items.find((row) => Number(row.id) === Number(id)) || null;
        setDetail(submission);
        if (submission?.hasScreenshot !== false) {
          try {
            const blob = await adminApi.standaloneTestPaymentScreenshot(token, id);
            setShotUrl(URL.createObjectURL(blob));
          } catch {
            setShotUrl('');
          }
        }
      } catch (err) {
        toast.error(err?.message || 'Could not load payment details.');
        setSelectedId(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [items, token, toast]
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
    setRejectNote('');
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
      await adminApi.approveStandaloneTestPayment(token, selectedId);
      toast.success('Payment approved. Seat confirmed. The exam is not opened by this action.');
      setApproveOpen(false);
      closeDetail();
      await loadList();
    } catch (err) {
      toast.error(err?.message || 'Approve failed. The payment was not changed.');
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
      await adminApi.rejectStandaloneTestPayment(token, selectedId, reason);
      toast.success('Payment rejected.');
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

  const canDecide = detail?.status === 'pending_review';
  const riskFlags = detail?.riskFlags || detail?.riskFlagLabels || [];

  return (
    <section className="admin-page admin-page--manual-payments">
      <header className="mp-hero">
        <div>
          <h1 className="heading-3 mp-title">Paid test payments</h1>
          <p className="mp-subtitle">
            Approval confirms a seat for a paid standalone test. It does not open the exam. Students can
            start only when the test is published, set to Open, and inside the availability window.
          </p>
          {testIdFilter > 0 ? (
            <p className="mp-subtitle">
              Showing payments for test #{testIdFilter}.{' '}
              <button
                type="button"
                className="mp-clear-test-filter"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete('testId');
                  setSearchParams(next, { replace: true });
                }}
              >
                Show all tests
              </button>
            </p>
          ) : null}
        </div>
      </header>

      {error ? <p className="admin-error">{error}</p> : null}

      <section className="admin-card mp-main">
        <div className="mp-toolbar">
          <div className="admin-status-filters" role="tablist" aria-label="Filter by payment status">
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
            <AdminSearchField
              id="stp-search"
              label="Search"
              placeholder="Student, test, or transaction ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClear={() => setSearch('')}
            />
          </div>
        </div>

        {loading ? (
          <div className="mp-loading">
            <span className="admin-spinner" aria-hidden />
            Loading payments…
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="mp-empty">No paid test payments match these filters.</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table mp-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Test</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Transaction ID</th>
                  <th>Risk</th>
                  <th>Seat</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((row) => {
                  const mismatch = Number(row.amountClaimed) !== Number(row.amountExpected);
                  return (
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
                      <td title={row.testTitle}>{row.testTitle || '—'}</td>
                      <td>
                        <MethodBadge method={row.paymentMethod} />
                      </td>
                      <td>
                        <span className={mismatch ? 'mp-amount-mismatch' : ''}>
                          {formatPkr(row.amountClaimed)}
                          {mismatch ? ` / ${formatPkr(row.amountExpected)}` : ''}
                        </span>
                      </td>
                      <td>
                        <code className="mp-trx">{row.transactionId}</code>
                      </td>
                      <td>
                        <RiskBadge level={row.riskLevel} />
                      </td>
                      <td>{seatLabel(row.seatStatus)}</td>
                      <td>
                        <span className={statusPillClass(row.status)}>{statusLabel(row.status)}</span>
                      </td>
                    </tr>
                  );
                })}
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
            aria-labelledby="stp-drawer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mp-drawer__head">
              <div>
                <p className="mp-drawer__kicker">Payment #{selectedId}</p>
                <h3 id="stp-drawer-title" className="mp-drawer__title">
                  {detail?.studentName || 'Paid test payment'}
                </h3>
              </div>
              <button type="button" className="mp-icon-btn" aria-label="Close" onClick={closeDetail}>
                <CloseIcon fontSize="small" />
              </button>
            </header>

            {detailLoading || !detail ? (
              <div className="mp-loading">
                <span className="admin-spinner" aria-hidden />
                Loading payment details…
              </div>
            ) : (
              <div className="mp-drawer__body">
                <div className="mp-shot">
                  {shotUrl ? (
                    <button type="button" className="mp-shot__btn" onClick={() => setLightbox(true)}>
                      <img src={shotUrl} alt="Payment proof" />
                      <span>Click to enlarge</span>
                    </button>
                  ) : (
                    <p className="admin-muted">No screenshot on file.</p>
                  )}
                </div>

                <dl className="mp-facts">
                  <div>
                    <dt>Test</dt>
                    <dd>{detail.testTitle}</dd>
                  </div>
                  <div>
                    <dt>Method</dt>
                    <dd>
                      <MethodBadge method={detail.paymentMethod} />
                    </dd>
                  </div>
                  <div>
                    <dt>Sender phone</dt>
                    <dd>{detail.senderPhoneNumber || '—'}</dd>
                  </div>
                  <div>
                    <dt>Sender name</dt>
                    <dd>{detail.senderAccountTitle || '—'}</dd>
                  </div>
                  <div>
                    <dt>Transaction ID</dt>
                    <dd>
                      <code className="mp-trx">{detail.transactionId}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Amount</dt>
                    <dd>
                      Claimed {formatPkr(detail.amountClaimed)} · expected {formatPkr(detail.amountExpected)}
                    </dd>
                  </div>
                  <div>
                    <dt>Registration</dt>
                    <dd>{detail.referenceCode || `Order #${detail.orderId}`}</dd>
                  </div>
                  <div>
                    <dt>Payment status</dt>
                    <dd>
                      <span className={statusPillClass(detail.status)}>{statusLabel(detail.status)}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Seat</dt>
                    <dd>{seatLabel(detail.seatStatus)}</dd>
                  </div>
                  <div>
                    <dt>Submitted</dt>
                    <dd>{formatWhen(detail.submittedAt)}</dd>
                  </div>
                </dl>

                {riskFlags.length ? (
                  <section className="mp-flags" aria-label="Risk flags">
                    <h4>Risk signals</h4>
                    <ul>
                      {riskFlags.map((flag) => (
                        <li key={flag.code || flag}>{`⚠ ${flag.label || flag}`}</li>
                      ))}
                    </ul>
                  </section>
                ) : (
                  <p className="mp-flags-empty">No risk flags on this payment.</p>
                )}

                {canDecide ? (
                  <div className="mp-drawer__actions">
                    <AdminLoadingButton
                      className="btn btn--secondary"
                      onClick={() => {
                        setRejectNote('');
                        setRejectError('');
                        setRejectOpen(true);
                      }}
                    >
                      Reject
                    </AdminLoadingButton>
                    <AdminLoadingButton className="btn btn--primary" onClick={() => setApproveOpen(true)}>
                      Approve seat
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
          <img src={shotUrl} alt="Payment proof enlarged" />
        </div>
      ) : null}

      <AdminConfirmDialog
        open={approveOpen}
        title="Approve this payment?"
        message="This confirms a seat for the student. It does not open the exam. The student can start only when the test is published, set to Open, and inside the availability window. This cannot be undone from this queue."
        confirmLabel="Approve seat"
        busy={actionBusy}
        onConfirm={handleApprove}
        onCancel={() => setApproveOpen(false)}
      />

      <AdminConfirmDialog
        open={rejectOpen}
        title="Reject this payment?"
        danger
        busy={actionBusy}
        confirmLabel="Reject"
        message={
          <div className="admin-field">
            <label htmlFor="stp-reject-reason" className="admin-confirm-dialog__note-label">
              Reason (required)
            </label>
            <textarea
              id="stp-reject-reason"
              className="admin-confirm-dialog__note"
              value={rejectReason}
              onChange={(e) => {
                setRejectNote(e.target.value);
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
